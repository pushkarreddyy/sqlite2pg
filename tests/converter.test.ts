import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { convert, introspect } from '../dist/index.js';

describe('sqlite2pg Conversion Tests', () => {
  it('should introspect tables, columns, constraints and types correctly', () => {
    const db = new DatabaseSync(':memory:');

    // Create schema
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email VARCHAR(255) UNIQUE,
        is_active BOOLEAN DEFAULT 1,
        profile_blob BLOB,
        metadata JSON,
        score REAL DEFAULT 0.0,
        balance NUMERIC(10, 2) DEFAULT 100.50,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE "orders" (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        total REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        ordered_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE order_items (
        order_id INTEGER,
        item_id INTEGER,
        quantity INTEGER DEFAULT 1,
        PRIMARY KEY (order_id, item_id),
        FOREIGN KEY (order_id) REFERENCES "orders"(id)
      );

      CREATE INDEX idx_orders_user ON "orders"(user_id);
      CREATE INDEX idx_users_created ON users(created_at DESC);
    `);

    // Insert test data
    db.exec(`
      INSERT INTO users (username, email, is_active, metadata, score, created_at)
      VALUES 
        ('alice', 'alice@example.com', 1, '{"role": "admin", "theme": "dark"}', 98.5, '2024-01-15 10:30:00'),
        ('bob', 'bob@example.com', 0, '{"role": "user"}', 42.0, '2024-02-20 14:45:00'),
        ('charlie_o''connor', 'charlie@example.com', 1, '{"tags": ["vip", "early-adopter"]}', 0.0, '2024-03-01T08:00:00Z');

      INSERT INTO "orders" (user_id, total, status, ordered_at)
      VALUES 
        (1, 150.75, 'completed', '2024-01-16 12:00:00'),
        (1, 49.99, 'shipped', '2024-02-01 09:15:00'),
        (3, 300.00, 'processing', '2024-03-02 11:20:00');

      INSERT INTO order_items (order_id, item_id, quantity)
      VALUES (1, 101, 2), (1, 102, 1), (2, 103, 5);
    `);

    const intro = introspect(db);
    assert.strictEqual(intro.tables.length, 3);
    assert.strictEqual(intro.totalRows, 9);

    const userTable = intro.tables.find((t) => t.name === 'users');
    assert.ok(userTable);
    assert.strictEqual(userTable.primaryKeys.length, 1);
    assert.strictEqual(userTable.primaryKeys[0], 'id');
    assert.strictEqual(userTable.rowCount, 3);

    const orderItemsTable = intro.tables.find((t) => t.name === 'order_items');
    assert.ok(orderItemsTable);
    assert.strictEqual(orderItemsTable.primaryKeys.length, 2);

    // Convert to Postgres SQL
    const result = convert(db, {
      target: 'postgres',
      schema: 'public',
      batchSize: 2,
    });

    const sql = result.sql;

    // Assert DDL
    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS "public"."users" (`), 'Contains CREATE TABLE users');
    assert.ok(sql.includes(`"id" BIGSERIAL PRIMARY KEY`), 'Maps INTEGER PRIMARY KEY to BIGSERIAL PRIMARY KEY');
    assert.ok(sql.includes(`"is_active" BOOLEAN`), 'Maps is_active to BOOLEAN');
    assert.ok(sql.includes(`"profile_blob" BYTEA`), 'Maps BLOB to BYTEA');
    assert.ok(sql.includes(`"metadata" JSONB`), 'Maps JSON to JSONB');
    assert.ok(sql.includes(`"score" DOUBLE PRECISION`), 'Maps REAL to DOUBLE PRECISION');
    assert.ok(sql.includes(`"created_at" TIMESTAMPTZ`), 'Maps DATETIME to TIMESTAMPTZ');

    // Assert Composite Primary Key
    assert.ok(sql.includes(`CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_id", "item_id")`), 'Creates composite PK');

    // Assert Data Transformations
    assert.ok(sql.includes(`'charlie_o''connor'`), 'Properly escapes single quotes');
    assert.ok(sql.includes(`TRUE`), 'Transforms boolean 1 to TRUE');
    assert.ok(sql.includes(`FALSE`), 'Transforms boolean 0 to FALSE');
    assert.ok(sql.includes(`'{"role": "admin", "theme": "dark"}'::jsonb`), 'Transforms JSON to ::jsonb');

    // Assert Deferred Foreign Keys
    assert.ok(sql.includes(`ALTER TABLE "public"."orders" ADD CONSTRAINT`), 'Creates deferred FK constraint');
    assert.ok(sql.includes(`REFERENCES "public"."users" ("id") ON DELETE CASCADE`), 'Preserves ON DELETE CASCADE');

    // Assert Sequence Synchronization
    assert.ok(sql.includes(`PERFORM setval(pg_get_serial_sequence('public.users', 'id')`), 'Generates sequence setval');

    // Assert Indexes
    assert.ok(sql.includes(`CREATE INDEX IF NOT EXISTS "idx_orders_idx_orders_user"`), 'Creates index');

    db.close();
  });

  it('should support target=supabase and enable RLS', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE documents (
        id INTEGER PRIMARY KEY,
        title TEXT
      );
      INSERT INTO documents (title) VALUES ('Confidential Doc');
    `);

    const result = convert(db, {
      target: 'supabase',
      schema: 'public',
    });

    assert.ok(result.sql.includes(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`));
    assert.ok(result.sql.includes(`ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;`));

    db.close();
  });

  it('should handle SQL standard identity columns with --identity flag', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT
      );
      INSERT INTO items (name) VALUES ('Test');
    `);

    const result = convert(db, {
      identity: true,
    });

    assert.ok(result.sql.includes(`"id" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`));

    db.close();
  });

  it('should handle table filters (include/exclude)', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE keep_me (id INT);
      CREATE TABLE ignore_me (id INT);
    `);

    const result = convert(db, {
      includeTables: ['keep_me'],
    });

    assert.ok(result.sql.includes('keep_me'));
    assert.ok(!result.sql.includes('ignore_me'));

    db.close();
  });

  it('should correctly format complex edge case values and types', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE test_types (
        id INTEGER PRIMARY KEY,
        bool_0 INT,
        bool_1 INT,
        bool_str_t TEXT,
        bool_str_f TEXT,
        iso_time TEXT,
        sqlite_time TEXT,
        epoch_sec INT,
        epoch_ms INT,
        json_data JSON,
        raw_blob BLOB,
        quoted_str TEXT,
        null_byte_str TEXT
      );
    `);

    const insertStmt = db.prepare(`
      INSERT INTO test_types VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    insertStmt.run(
      1,
      0,
      1,
      'true',
      'false',
      '2024-05-01T12:00:00.000Z',
      '2024-05-01 12:00:00',
      1714564800,
      1714564800000,
      '{"nested": {"count": 42, "items": ["a", "b"]}}',
      Buffer.from([0xde, 0xad, 0xbe, 0xef]),
      'It\'s a "complex" \'string\' with \\ slashes & emojis 🚀',
      'Hello\0World'
    );

    const result = convert(db);
    const sql = result.sql;

    // Check value conversions
    assert.ok(sql.includes(`'\\xdeadbeef'::bytea`) || sql.includes(`'\\xDEADBEEF'::bytea`));
    assert.ok(sql.includes(`'It''s a "complex" ''string'' with \\ slashes & emojis 🚀'`));
    assert.ok(sql.includes(`'HelloWorld'`)); // null byte stripped
    assert.ok(sql.includes(`'{"nested": {"count": 42, "items": ["a", "b"]}}'::jsonb`));

    db.close();
  });

  it('should properly quote SQL reserved keywords in table and column names', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE "user" (
        "id" INTEGER PRIMARY KEY,
        "order" INTEGER,
        "group" TEXT,
        "select" TEXT,
        "limit" INTEGER,
        "offset" INTEGER,
        "table" TEXT
      );
      INSERT INTO "user" ("order", "group", "select", "limit", "offset", "table")
      VALUES (1, 'admins', 'all', 10, 0, 'metadata');
    `);

    const result = convert(db, { schema: 'public' });
    const sql = result.sql;

    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS "public"."user"`));
    assert.ok(sql.includes(`"order"`));
    assert.ok(sql.includes(`"group"`));
    assert.ok(sql.includes(`"select"`));
    assert.ok(sql.includes(`"limit"`));
    assert.ok(sql.includes(`"offset"`));
    assert.ok(sql.includes(`"table"`));

    db.close();
  });

  it('should sanitize SQLite default value expressions', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE defaults_test (
        id INTEGER PRIMARY KEY,
        created_at DATETIME DEFAULT (datetime('now')),
        epoch_created BIGINT DEFAULT (strftime('%s', 'now')),
        is_active BOOLEAN DEFAULT (1),
        is_deleted BOOLEAN DEFAULT (0),
        status TEXT DEFAULT ('active'),
        guid TEXT DEFAULT (lower(hex(randomblob(16))))
      );
    `);

    const result = convert(db);
    const sql = result.sql;

    assert.ok(sql.includes(`"created_at" TIMESTAMPTZ DEFAULT NOW()`));
    assert.ok(sql.includes(`"epoch_created" BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT`));
    assert.ok(sql.includes(`"is_active" BOOLEAN DEFAULT TRUE`));
    assert.ok(sql.includes(`"is_deleted" BOOLEAN DEFAULT FALSE`));
    assert.ok(sql.includes(`"status" TEXT DEFAULT 'active'`));
    assert.ok(sql.includes(`"guid" TEXT DEFAULT gen_random_uuid()`));

    db.close();
  });
});
