import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RateLimiter } from '../dist/rate-limiter.js';
import { startApiServer } from '../dist/server.js';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Rate Limiter & API Server Tests', () => {
  it('should enforce rate limits and return remaining quota', () => {
    const limiter = new RateLimiter({
      windowMs: 5000,
      maxRequests: 3,
    });

    const check1 = limiter.check('client-1');
    assert.strictEqual(check1.allowed, true);
    assert.strictEqual(check1.remaining, 2);

    const check2 = limiter.check('client-1');
    assert.strictEqual(check2.allowed, true);
    assert.strictEqual(check2.remaining, 1);

    const check3 = limiter.check('client-1');
    assert.strictEqual(check3.allowed, true);
    assert.strictEqual(check3.remaining, 0);

    // 4th request should be blocked
    const check4 = limiter.check('client-1');
    assert.strictEqual(check4.allowed, false);
    assert.strictEqual(check4.remaining, 0);
    assert.ok(check4.retryAfterSeconds! > 0);

    // Different client should still be allowed
    const checkOther = limiter.check('client-2');
    assert.strictEqual(checkOther.allowed, true);

    limiter.destroy();
  });

  it('should run HTTP server and respond to /health and /api/convert with rate limit headers', async () => {
    const server = startApiServer({
      port: 3912,
      host: '127.0.0.1',
      rateLimit: 10,
    });

    try {
      // 1. Health check
      const resHealth = await fetch('http://127.0.0.1:3912/health');
      assert.strictEqual(resHealth.status, 200);
      assert.ok(resHealth.headers.get('x-ratelimit-limit'));
      const healthData = await resHealth.json();
      assert.strictEqual(healthData.status, 'ok');

      // 2. Create in-memory DB and get base64
      const tempDbPath = join(tmpdir(), `test_api_${Date.now()}.db`);
      const db = new DatabaseSync(tempDbPath);
      db.exec(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          price NUMERIC(10, 2)
        );
        INSERT INTO products (name, price) VALUES ('Widget A', 29.99), ('Widget B', 9.99);
      `);
      db.close();

      const dbBuffer = readFileSync(tempDbPath);
      unlinkSync(tempDbPath);

      // 3. Convert endpoint
      const resConvert = await fetch('http://127.0.0.1:3912/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dbBase64: dbBuffer.toString('base64'),
          options: {
            target: 'supabase',
          },
        }),
      });

      assert.strictEqual(resConvert.status, 200);
      const convertData = await resConvert.json();
      assert.strictEqual(convertData.success, true);
      assert.ok(convertData.sql.includes('CREATE TABLE IF NOT EXISTS "public"."products"'));
      assert.ok(convertData.sql.includes('ENABLE ROW LEVEL SECURITY'));
      assert.strictEqual(convertData.stats.tableCount, 1);
      assert.strictEqual(convertData.stats.rowCount, 2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
