/**
 * Embedded HTTP API Server with Rate Limiter for sqlite2pg
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { convert, introspect } from './index.js';
import { ConversionOptions, TargetDialect } from './types.js';
import { executeLiveMigration } from './migrate.js';
import { RateLimiter } from './rate-limiter.js';

export interface ServerConfig {
  port?: number;
  host?: string;
  rateLimit?: number; // max requests per window (default: 60)
  rateWindowMs?: number; // window size in ms (default: 60,000ms = 1 min)
  apiKey?: string; // optional API key requirement
  verbose?: boolean;
}

export function startApiServer(config: ServerConfig = {}): Server {
  const port = config.port || 3000;
  const host = config.host || '0.0.0.0';
  const limiter = new RateLimiter({
    maxRequests: config.rateLimit || 60,
    windowMs: config.rateWindowMs || 60_000,
  });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Target, X-Schema, X-Batch-Size, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Rate Limiting Check
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown-client';
    const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
    const rateLimitKey = typeof authHeader === 'string' ? authHeader : clientIp;

    const rateStatus = limiter.check(rateLimitKey);
    res.setHeader('X-RateLimit-Limit', rateStatus.totalLimit.toString());
    res.setHeader('X-RateLimit-Remaining', rateStatus.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateStatus.resetTime / 1000).toString());

    if (!rateStatus.allowed) {
      res.setHeader('Retry-After', (rateStatus.retryAfterSeconds || 60).toString());
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${rateStatus.retryAfterSeconds} seconds.`,
          retryAfter: rateStatus.retryAfterSeconds,
        })
      );
      return;
    }

    // API Key Auth check (if configured)
    if (config.apiKey) {
      const providedKey = req.headers['x-api-key'] || (typeof authHeader === 'string' && authHeader.replace(/^Bearer\s+/i, ''));
      if (providedKey !== config.apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing API key' }));
        return;
      }
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      // 1. Health Check
      if (req.method === 'GET' && (pathname === '/health' || pathname === '/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            service: 'sqlite2pg',
            version: '1.0.0',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            rateLimit: {
              remaining: rateStatus.remaining,
              limit: rateStatus.totalLimit,
            },
          })
        );
        return;
      }

      // 2. Convert Endpoint: POST /api/convert
      if (req.method === 'POST' && pathname === '/api/convert') {
        const bodyBuffer = await readRequestBody(req);
        const contentType = req.headers['content-type'] || '';

        let dbBuffer: Buffer;
        let options: ConversionOptions = {};

        if (contentType.includes('application/json')) {
          const json = JSON.parse(bodyBuffer.toString('utf-8'));
          if (!json.dbBase64 && !json.dbBuffer) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing dbBase64 property in JSON payload' }));
            return;
          }
          dbBuffer = Buffer.from(json.dbBase64 || json.dbBuffer, 'base64');
          options = json.options || {};
        } else {
          // Raw binary database stream
          dbBuffer = bodyBuffer;
          options = {
            target: (req.headers['x-target'] as TargetDialect) || 'postgres',
            schema: (req.headers['x-schema'] as string) || 'public',
            batchSize: req.headers['x-batch-size'] ? parseInt(req.headers['x-batch-size'] as string, 10) : 1000,
          };
        }

        const tempFile = join(tmpdir(), `sqlite2pg_${randomBytes(8).toString('hex')}.db`);
        writeFileSync(tempFile, dbBuffer);

        try {
          const result = convert(tempFile, options);
          const accept = req.headers['accept'] || '';

          if (accept.includes('text/plain') || accept.includes('application/sql')) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(result.sql);
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, sql: result.sql, stats: result.stats }));
          }
        } finally {
          try {
            unlinkSync(tempFile);
          } catch {
            // ignore
          }
        }
        return;
      }

      // 3. Introspect Endpoint: POST /api/introspect
      if (req.method === 'POST' && pathname === '/api/introspect') {
        const bodyBuffer = await readRequestBody(req);
        const json = JSON.parse(bodyBuffer.toString('utf-8'));
        if (!json.dbBase64) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing dbBase64 property in JSON payload' }));
          return;
        }

        const dbBuffer = Buffer.from(json.dbBase64, 'base64');
        const tempFile = join(tmpdir(), `sqlite2pg_${randomBytes(8).toString('hex')}.db`);
        writeFileSync(tempFile, dbBuffer);

        try {
          const schemaInfo = introspect(tempFile, json.options || {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, schema: schemaInfo }));
        } finally {
          try {
            unlinkSync(tempFile);
          } catch {
            // ignore
          }
        }
        return;
      }

      // 4. Live Migration Endpoint: POST /api/migrate
      if (req.method === 'POST' && pathname === '/api/migrate') {
        const bodyBuffer = await readRequestBody(req);
        const json = JSON.parse(bodyBuffer.toString('utf-8'));
        if (!json.dbBase64 || !json.connectionString) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing dbBase64 or connectionString' }));
          return;
        }

        const dbBuffer = Buffer.from(json.dbBase64, 'base64');
        const tempFile = join(tmpdir(), `sqlite2pg_${randomBytes(8).toString('hex')}.db`);
        writeFileSync(tempFile, dbBuffer);

        try {
          const result = convert(tempFile, json.options || {});
          const migration = await executeLiveMigration(json.connectionString, result, json.options || {});

          if (!migration.success) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: migration.error?.message }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, stats: result.stats }));
        } finally {
          try {
            unlinkSync(tempFile);
          } catch {
            // ignore
          }
        }
        return;
      }

      // Not Found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found', path: pathname }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: err?.message || String(err) }));
    }
  });

  server.listen(port, host, () => {
    if (config.verbose) {
      console.log(`[sqlite2pg-api] Server running on http://${host}:${port} (Rate limit: ${config.rateLimit || 60} req/min)`);
    }
  });

  return server;
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}
