# sqlite2pg

<div align="center">

**Zero-config SQLite to PostgreSQL & Supabase Exporter and Migrator.**

[![CI](https://github.com/pushkarreddyy/sqlite2pg/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/pushkarreddyy/sqlite2pg/actions)
[![Node Version](https://img.shields.io/badge/node-%3E%3D22.5.0-339933.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](tests)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Migrates local SQLite, LibSQL, and Turso databases directly to Supabase, Neon, AWS RDS, or standard PostgreSQL instances with strict types, transaction wrapping, and sequence synchronization.

```
 ┌─────────────────┐       sqlite2pg       ┌──────────────────────────────┐
 │  Local SQLite   │ ────────────────────► │  PostgreSQL / Supabase       │
 │  (app.db)       │      Fast DDL & Data  │  (Strict Types, RLS, setval) │
 └─────────────────┘                       └──────────────────────────────┘
```

</div>

---

## Quick Start

### 1. Generate SQL migration

```bash
npx sqlite2pg ./app.db -o migration.sql
```

For Supabase targets (automatically configures Row Level Security and UUID extensions):

```bash
npx sqlite2pg ./app.db -o migration.sql --target supabase
```

### 2. Apply to PostgreSQL

```bash
psql "$DATABASE_URL" < migration.sql
```

Or paste `migration.sql` directly into the Supabase / Neon SQL Editor.

### Live Migration (Direct Stream)

To stream directly into a running database without creating an intermediate `.sql` file:

```bash
npx sqlite2pg ./app.db --conn "postgres://postgres:password@db.supabase.co:5432/postgres"
```

---

## Comparison

| Feature / Issue | Standard `sqlite3 .dump` | `pgloader` | `sqlite2pg` |
| :--- | :---: | :---: | :---: |
| **`AUTOINCREMENT` Syntax** | Fails in Postgres | Requires custom config | **Maps to `BIGSERIAL` / `IDENTITY`** |
| **Foreign Key Load Order** | Fails on insert order | Complex setup | **Defers constraints after data load** |
| **Sequence Synchronization** | Fails on next app insert | Inconsistent | **Auto-generates `setval` for all tables** |
| **Boolean Values (`0`/`1`)** | Type mismatch error | Partial | **Normalizes to strict `TRUE`/`FALSE`** |
| **Timestamp & Epoch Parsing** | Format errors | Inconsistent | **Normalizes to valid `TIMESTAMPTZ`** |
| **Binary BLOBs** | Fails on `X'...'` syntax | Memory heavy | **Encodes as `'\x...'::bytea`** |
| **Reserved SQL Keywords** | Fails on `user`, `order`, etc. | Needs mapping rules | **ANSI double-quotes all identifiers** |
| **Supabase RLS & Extensions** | Not supported | Not supported | **Built-in with `--target supabase`** |
| **Runtime & Dependencies** | Shell-dependent | Common Lisp / sbcl | **Zero-dependency Node.js native engine** |

---

## Type Conversions

`sqlite2pg` inspects SQLite table declarations and sampled data to construct strict PostgreSQL schemas:

| SQLite Declaration | PostgreSQL Type | Handling Notes |
| :--- | :--- | :--- |
| `INTEGER PRIMARY KEY` (rowid) | `BIGSERIAL PRIMARY KEY` | Uses `BIGINT GENERATED ... AS IDENTITY` when `--identity` is set |
| `INTEGER`, `INT`, `INT4` | `INTEGER` | Standard 32-bit integer |
| `BIGINT`, `INT8`, `UNSIGNED BIG INT` | `BIGINT` | 64-bit integer |
| `BOOLEAN`, `BOOL`, `TINYINT(1)` | `BOOLEAN` | `0`/`1`, `'true'`/`'false'` normalized to boolean literals |
| `DATETIME`, `TIMESTAMP` | `TIMESTAMPTZ` | Normalized to ISO-8601 with timezone |
| `REAL`, `FLOAT`, `DOUBLE` | `DOUBLE PRECISION` | Handles numbers, `NaN`, and `Infinity` |
| `NUMERIC(p, s)`, `DECIMAL(p, s)` | `NUMERIC(p, s)` | Preserves exact precision and scale |
| `TEXT`, `VARCHAR(n)`, `CLOB` | `TEXT` / `VARCHAR(n)` | Single quotes escaped, null bytes (`\0`) stripped |
| `BLOB`, `BINARY` | `BYTEA` | Encoded as `'\x...'::bytea` |
| `JSON`, `JSONB` | `JSONB` | Validated and serialized with `::jsonb` cast |
| `UUID`, `GUID` | `UUID` | Validated UUID string |
| *(untyped column)* | *Inferred* or `TEXT` | Sampled against data rows to infer best matching PostgreSQL type |

---

## CLI Options

```text
Usage: sqlite2pg [options] <sqlite-db>

Arguments:
  <sqlite-db>                  Path to SQLite database file (.db, .sqlite, .sqlite3)

Options:
  -o, --output <file>          Output SQL file (defaults to stdout)
  -t, --target <dialect>       Target dialect: "postgres" or "supabase" (default: "postgres")
  -s, --schema <name>          PostgreSQL schema name (default: "public")
  -c, --conn <url>             Direct PostgreSQL / Supabase connection URL
  -b, --batch-size <number>    Number of rows per INSERT statement (default: 1000)
  --schema-only                Export table schema DDL only (no data)
  --data-only                  Export INSERT statements only (no DDL)
  --drop-tables                Include DROP TABLE IF EXISTS before creation
  --identity                   Use standard GENERATED BY DEFAULT AS IDENTITY instead of BIGSERIAL
  --no-defer-fks               Do not defer foreign key constraints
  --include <tables>           Comma-separated list of tables to include
  --exclude <tables>           Comma-separated list of tables to exclude
  --dry-run                    Inspect schema and table stats without exporting
  --json                       Output results in JSON format
  --verbose                    Enable verbose logging
  -v, --version                Output version number
  -h, --help                   Display help
```

---

## Programmatic API

`sqlite2pg` can be used directly in TypeScript or Node.js scripts:

```typescript
import { convert, introspect } from 'sqlite2pg';

// 1. Inspect SQLite schema details
const schemaInfo = introspect('./app.db');
console.log(`Found ${schemaInfo.tables.length} tables with ${schemaInfo.totalRows} total rows.`);

// 2. Generate migration SQL
const { sql, stats } = convert('./app.db', {
  target: 'supabase',
  schema: 'public',
  batchSize: 1000,
});

console.log(`Exported ${stats.tableCount} tables and ${stats.rowCount} rows in ${stats.durationMs}ms`);
```

---

## Common Recipes

### Inspect schema without exporting

```bash
npx sqlite2pg ./app.db --dry-run
```

### Export specific tables

```bash
npx sqlite2pg ./app.db --include users,orders,products -o subset.sql
```

### Export schema DDL only

```bash
npx sqlite2pg ./app.db --schema-only -o schema.sql
```

### Use SQL-standard identity columns

```bash
npx sqlite2pg ./app.db --identity -o migration.sql
```

---

## Development & Testing

```bash
# Clone repository
git clone https://github.com/pushkarreddyy/sqlite2pg.git
cd sqlite2pg

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run test suite
npm test
```

---

## Author & Attribution

Created and maintained by **[Pushkar Reddy](https://github.com/pushkarreddyy)** ([@pushkarreddyy](https://github.com/pushkarreddyy)).

If you use `sqlite2pg` in your projects, tutorials, or tooling, please consider giving the repository a star on GitHub:

[![Star on GitHub](https://img.shields.io/github/stars/pushkarreddyy/sqlite2pg?style=social)](https://github.com/pushkarreddyy/sqlite2pg)

---

## License

MIT © 2026 [Pushkar Reddy](https://github.com/pushkarreddyy)
