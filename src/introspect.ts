/**
 * SQLite Database Introspection Engine
 */

import { DatabaseSync } from 'node:sqlite';
import {
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  IndexInfo,
  IndexColumnInfo,
  ViewInfo,
  TriggerInfo,
  IntrospectionResult,
  ConversionOptions,
} from './types.js';

const SYSTEM_TABLES = new Set([
  'sqlite_sequence',
  'sqlite_stat1',
  'sqlite_stat2',
  'sqlite_stat3',
  'sqlite_stat4',
  'sqlite_parameters',
  '_litestream_seq',
  '_litestream_lock',
]);

/**
 * Introspects an SQLite database file using Node.js built-in node:sqlite.
 */
export function introspectDatabase(
  db: DatabaseSync,
  options: ConversionOptions = {}
): IntrospectionResult {
  // Query all master tables and views
  const masterStmt = db.prepare(`
    SELECT type, name, tbl_name, sql 
    FROM sqlite_master 
    WHERE name NOT LIKE 'sqlite_%' 
    ORDER BY type, name;
  `);
  const masterRows = masterStmt.all() as Array<{
    type: string;
    name: string;
    tbl_name: string;
    sql: string | null;
  }>;

  const tableNames: string[] = [];
  const views: ViewInfo[] = [];
  const triggers: TriggerInfo[] = [];
  const tableSqlMap = new Map<string, string>();

  for (const row of masterRows) {
    if (SYSTEM_TABLES.has(row.name)) continue;

    if (row.type === 'table') {
      // Filter included/excluded tables if specified
      if (options.includeTables && options.includeTables.length > 0) {
        if (!options.includeTables.includes(row.name)) continue;
      }
      if (options.excludeTables && options.excludeTables.includes(row.name)) {
        continue;
      }

      tableNames.push(row.name);
      if (row.sql) {
        tableSqlMap.set(row.name, row.sql);
      }
    } else if (row.type === 'view') {
      if (row.sql) {
        views.push({ name: row.name, sql: row.sql });
      }
    } else if (row.type === 'trigger') {
      if (row.sql) {
        triggers.push({ name: row.name, tblName: row.tbl_name, sql: row.sql });
      }
    }
  }

  const tables: TableInfo[] = [];
  let totalRows = 0;

  for (const tableName of tableNames) {
    const rawSql = tableSqlMap.get(tableName) || '';

    // 1. Column Info via PRAGMA table_info
    const colStmt = db.prepare(`PRAGMA table_info("${tableName.replace(/"/g, '""')}");`);
    const rawCols = colStmt.all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    // Check if table DDL has AUTOINCREMENT
    const isTableAutoincrement = /AUTOINCREMENT/i.test(rawSql);

    const primaryKeys: string[] = [];
    const columns: ColumnInfo[] = [];

    // Count how many PKs there are
    const pkCols = rawCols.filter((c) => c.pk > 0);

    for (const c of rawCols) {
      const isPk = c.pk > 0;
      if (isPk) {
        primaryKeys.push(c.name);
      }

      // Check if this specific column is autoincrement
      let isColAutoincrement = false;
      if (isPk && pkCols.length === 1) {
        if (isTableAutoincrement) {
          isColAutoincrement = true;
        } else if (c.type.toUpperCase() === 'INTEGER') {
          // In SQLite, an INTEGER PRIMARY KEY is automatically an alias for rowid / autoincrementing
          isColAutoincrement = true;
        }
      }

      columns.push({
        cid: c.cid,
        name: c.name,
        sqliteType: c.type || '',
        notNull: c.notnull === 1,
        defaultValue: c.dflt_value,
        isPk,
        pkIndex: c.pk,
        isAutoincrement: isColAutoincrement,
      });
    }

    // Heuristic type sampling for untyped columns
    for (const col of columns) {
      if (!col.sqliteType || col.sqliteType.trim() === '') {
        col.inferredPostgresType = inferColumnTypeFromData(db, tableName, col.name);
      }
    }

    // 2. Foreign Keys via PRAGMA foreign_key_list
    const fkStmt = db.prepare(`PRAGMA foreign_key_list("${tableName.replace(/"/g, '""')}");`);
    const rawFks = fkStmt.all() as Array<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
      match: string;
    }>;

    const foreignKeys: ForeignKeyInfo[] = rawFks.map((fk) => ({
      id: fk.id,
      seq: fk.seq,
      table: fk.table,
      from: fk.from,
      to: fk.to,
      onUpdate: fk.on_update,
      onDelete: fk.on_delete,
      match: fk.match,
    }));

    // 3. Indexes via PRAGMA index_list & PRAGMA index_info
    const idxStmt = db.prepare(`PRAGMA index_list("${tableName.replace(/"/g, '""')}");`);
    const rawIndexes = idxStmt.all() as Array<{
      seq: number;
      name: string;
      unique: number;
      origin: string; // 'c' = create index, 'u' = unique constraint, 'pk' = primary key
      partial: number;
    }>;

    const indexes: IndexInfo[] = [];

    for (const idx of rawIndexes) {
      // Skip auto indexes created for primary keys (Postgres automatically creates PK unique index)
      if (idx.origin === 'pk' || idx.name.startsWith('sqlite_autoindex_')) {
        continue;
      }

      const idxInfoStmt = db.prepare(`PRAGMA index_info("${idx.name.replace(/"/g, '""')}");`);
      const rawIdxCols = idxInfoStmt.all() as Array<{
        seqno: number;
        cid: number;
        name: string;
        desc?: number;
      }>;

      const idxCols: IndexColumnInfo[] = rawIdxCols.map((ic) => ({
        seqno: ic.seqno,
        cid: ic.cid,
        name: ic.name,
        desc: ic.desc === 1,
      }));

      // Find raw index SQL if any
      const idxSqlRow = masterRows.find((m) => m.type === 'index' && m.name === idx.name);

      indexes.push({
        name: idx.name,
        unique: idx.unique === 1,
        origin: idx.origin,
        partial: idx.partial === 1,
        columns: idxCols,
        sql: idxSqlRow?.sql || undefined,
      });
    }

    // Row count
    let rowCount = 0;
    try {
      const countStmt = db.prepare(`SELECT COUNT(*) as count FROM "${tableName.replace(/"/g, '""')}";`);
      const countResult = countStmt.get() as { count: number | bigint };
      rowCount = Number(countResult.count);
      totalRows += rowCount;
    } catch {
      rowCount = 0;
    }

    tables.push({
      name: tableName,
      columns,
      primaryKeys,
      foreignKeys,
      indexes,
      rawSql,
      rowCount,
    });
  }

  return {
    tables,
    views,
    triggers,
    totalRows,
  };
}

/**
 * Inspects a few sample rows when column type is unspecified in SQLite schema
 */
function inferColumnTypeFromData(db: DatabaseSync, tableName: string, colName: string): string {
  try {
    const sampleStmt = db.prepare(
      `SELECT "${colName.replace(/"/g, '""')}" as val FROM "${tableName.replace(/"/g, '""')}" WHERE "${colName.replace(/"/g, '""')}" IS NOT NULL LIMIT 20;`
    );
    const rows = sampleStmt.all() as Array<{ val: unknown }>;
    if (rows.length === 0) return 'TEXT';

    let allInts = true;
    let allNumbers = true;
    let allBooleans = true;
    let allJson = true;

    for (const r of rows) {
      const val = r.val;
      if (typeof val === 'number') {
        if (!Number.isInteger(val)) allInts = false;
        allBooleans = false;
        allJson = false;
      } else if (typeof val === 'boolean') {
        allInts = false;
        allNumbers = false;
        allJson = false;
      } else if (typeof val === 'string') {
        if (!/^-?\d+$/.test(val)) allInts = false;
        if (Number.isNaN(Number(val))) allNumbers = false;
        if (!/^(true|false|0|1)$/i.test(val)) allBooleans = false;
        try {
          JSON.parse(val);
        } catch {
          allJson = false;
        }
      } else {
        allInts = false;
        allNumbers = false;
        allBooleans = false;
        allJson = false;
      }
    }

    if (allBooleans) return 'BOOLEAN';
    if (allInts) return 'BIGINT';
    if (allNumbers) return 'DOUBLE PRECISION';
    if (allJson) return 'JSONB';
  } catch {
    // fallback
  }
  return 'TEXT';
}
