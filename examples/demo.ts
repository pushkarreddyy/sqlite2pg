/**
 * Example: Using sqlite2pg programmatically in TypeScript / Node.js
 */

import { DatabaseSync } from 'node:sqlite';
import { convert, introspect } from '../dist/index.js';

// 1. Create a sample in-memory SQLite database
const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT 0,
    tags JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE posts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  INSERT INTO users (email, is_admin, tags) 
  VALUES ('alice@example.com', 1, '["founder", "early-adopter"]');

  INSERT INTO posts (user_id, title, content) 
  VALUES (1, 'Hello World', 'Welcome to our platform!');
`);

// 2. Introspect schema structure
const schema = introspect(db);
console.log('--- Introspection Summary ---');
console.log(`Tables detected: ${schema.tables.length}`);
console.log(`Total rows: ${schema.totalRows}`);

// 3. Convert to Supabase-ready PostgreSQL migration
const migration = convert(db, {
  target: 'supabase',
  schema: 'public',
  batchSize: 500,
});

console.log('\n--- Generated PostgreSQL Migration SQL ---');
console.log(migration.sql);

db.close();
