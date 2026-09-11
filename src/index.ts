/**
 * sqlite2pg - Modern Zero-Config SQLite to PostgreSQL / Supabase Exporter
 */

import { DatabaseSync } from 'node:sqlite';
import { ConversionOptions, ConversionResult, IntrospectionResult } from './types.js';
import { introspectDatabase } from './introspect.js';
import { generateMigrationSql } from './generator.js';
import { executeLiveMigration } from './migrate.js';

export * from './types.js';
export * from './type-mapper.js';
export * from './transform.js';
export * from './introspect.js';
export * from './generator.js';
export * from './migrate.js';

/**
 * Converts an SQLite database file or instance into PostgreSQL / Supabase migration SQL.
 */
export function convert(
  dbSource: string | DatabaseSync,
  options: ConversionOptions = {}
): ConversionResult {
  let db: DatabaseSync;
  let shouldClose = false;

  if (typeof dbSource === 'string') {
    db = new DatabaseSync(dbSource, { open: true, readOnly: true });
    shouldClose = true;
  } else {
    db = dbSource;
  }

  try {
    const introspection = introspectDatabase(db, options);
    const result = generateMigrationSql(db, introspection, options);
    return result;
  } finally {
    if (shouldClose) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Introspects and returns structured schema details from an SQLite database.
 */
export function introspect(
  dbSource: string | DatabaseSync,
  options: ConversionOptions = {}
): IntrospectionResult {
  let db: DatabaseSync;
  let shouldClose = false;

  if (typeof dbSource === 'string') {
    db = new DatabaseSync(dbSource, { open: true, readOnly: true });
    shouldClose = true;
  } else {
    db = dbSource;
  }

  try {
    return introspectDatabase(db, options);
  } finally {
    if (shouldClose) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  }
}
