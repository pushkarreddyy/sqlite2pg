/**
 * Types and interfaces for sqlite2pg
 */

export type TargetDialect = 'postgres' | 'supabase';

export interface ColumnInfo {
  cid: number;
  name: string;
  sqliteType: string;
  notNull: boolean;
  defaultValue: string | null;
  isPk: boolean;
  pkIndex?: number;
  isAutoincrement?: boolean;
  inferredPostgresType?: string;
  hasDefaultExpr?: boolean;
}

export interface ForeignKeyInfo {
  id: number;
  seq: number;
  table: string; // Target table
  from: string;  // Column in current table
  to: string;    // Column in target table
  onUpdate: string;
  onDelete: string;
  match: string;
}

export interface IndexColumnInfo {
  seqno: number;
  cid: number;
  name: string;
  desc?: boolean;
}

export interface IndexInfo {
  name: string;
  unique: boolean;
  origin: string;
  partial: boolean;
  columns: IndexColumnInfo[];
  sql?: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
  rawSql?: string;
  rowCount?: number;
}

export interface ViewInfo {
  name: string;
  sql: string;
}

export interface TriggerInfo {
  name: string;
  tblName: string;
  sql: string;
}

export interface IntrospectionResult {
  tables: TableInfo[];
  views: ViewInfo[];
  triggers: TriggerInfo[];
  totalRows: number;
}

export interface ConversionOptions {
  target?: TargetDialect;
  schema?: string;
  batchSize?: number;
  schemaOnly?: boolean;
  dataOnly?: boolean;
  dropTables?: boolean;
  identity?: boolean;
  deferForeignKeys?: boolean;
  includeTables?: string[];
  excludeTables?: string[];
  enableRls?: boolean;
  quoteIdentifiers?: boolean;
  disableTriggers?: boolean;
  verbose?: boolean;
}

export interface ConversionResult {
  sql: string;
  stats: MigrationStats;
}

export interface MigrationStats {
  tableCount: number;
  viewCount: number;
  rowCount: number;
  foreignKeyCount: number;
  indexCount: number;
  sequenceCount: number;
  durationMs: number;
}
