# sqlite2pg ⚡

> **Modern, Zero-Config SQLite to PostgreSQL & Supabase Exporter, Migrator & API Microservice.**

Migrate local SQLite / LibSQL / Turso databases to PostgreSQL, Supabase, Neon, or AWS RDS without syntax errors, missing types, or memory issues.

---

## ⚡ 2-Step Migration (Zero Friction)

### Step 1: Export your SQLite database
```bash
npx sqlite2pg ./local.db -o migration.sql --target supabase
```
*(Or for standard PostgreSQL / Neon / RDS: `npx sqlite2pg ./local.db -o migration.sql`)*

### Step 2: Apply to PostgreSQL / Supabase
- **In Supabase / Neon Dashboard:** Paste and run `migration.sql` in the **SQL Editor**.
- **Via Terminal:**
  ```bash
  psql "$DATABASE_URL" < migration.sql
  ```

---

### 🔥 Or 1-Step Direct Live Migration
Stream and migrate directly over the wire to your database instance:
```bash
npx sqlite2pg ./local.db --conn "postgres://postgres:password@db.supabase.co:5432/postgres"
```

---

## 🌐 HTTP API Server & Microservice (with Rate Limiting)

`sqlite2pg` includes a built-in, lightweight HTTP REST API server with a sliding window **Rate Limiter** for use as a backend service or SaaS migration microservice.

### Start the Server:
```bash
npx sqlite2pg serve --port 3000 --rate-limit 60
```

### Rate Limiter Features:
- **Rate Limit Window:** 60 requests/minute per client IP / API Key (configurable via `--rate-limit` and `--rate-window`).
- **Standard HTTP Headers:**
  - `X-RateLimit-Limit: 60`
  - `X-RateLimit-Remaining: 59`
  - `X-RateLimit-Reset: 1714564860`
- **Rate Limit Exceeded:** Returns HTTP `429 Too Many Requests` with `Retry-After` header and structured JSON error.

### API Endpoints:

#### 1. `GET /health`
Returns system status, memory usage, uptime, and rate limit quota:
```bash
curl http://localhost:3000/health
```

#### 2. `POST /api/convert`
Convert SQLite database to PostgreSQL / Supabase SQL.

**Option A: Uploading base64 payload (JSON):**
```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "dbBase64": "<BASE64_ENCODED_SQLITE_DB>",
    "options": { "target": "supabase", "schema": "public" }
  }'
```

**Option B: Streaming raw binary SQLite database:**
```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/octet-stream" \
  -H "X-Target: supabase" \
  --data-binary "@./local.db"
```

#### 3. `POST /api/introspect`
Inspect SQLite schema, tables, row counts, foreign keys, and indexes as JSON:
```bash
curl -X POST http://localhost:3000/api/introspect \
  -H "Content-Type: application/json" \
  -d '{ "dbBase64": "<BASE64_ENCODED_SQLITE_DB>" }'
```

---

## 🛑 What Pain Points `sqlite2pg` Solves

| GitHub / Developer Pain Point | Standard `sqlite3 .dump` or `pgloader` | `sqlite2pg` Solution |
| :--- | :--- | :--- |
| **`AUTOINCREMENT` Syntax Errors** | Fails in Postgres (`AUTOINCREMENT` is invalid syntax) | Maps `INTEGER PRIMARY KEY` to `BIGSERIAL` or SQL-standard `IDENTITY`. |
| **Foreign Key Load Order Violations** | Fails on circular/alphabetical table inserts | Defers all `FOREIGN KEY` constraints until **after** all data is loaded. |
| **Silent Sequence Desync Bug** | Subsequent app `INSERT`s throw duplicate key error on IDs | Automatically generates `SELECT setval(...)` for every table sequence. |
| **Boolean `0` / `1` Type Errors** | Fails with `ERROR: column is of type boolean but expression is integer` | Automatically normalizes `0/1`, `'0'/'1'`, `'true'/'false'` to `TRUE`/`FALSE`. |
| **Timestamp Incompatibilities** | Fails on SQLite strftime / unix timestamps | Normalizes ISO strings, `YYYY-MM-DD HH:MM:SS`, and epoch integers to `TIMESTAMPTZ`. |
| **Binary & BLOB Encoding** | SQLite `X'...'` format fails in Postgres | Formats binary data as valid `'\x...'::bytea` hex literals. |
| **Reserved SQL Keywords** | Fails on tables/columns named `user`, `order`, `group`, `select`, `limit` | Automatically escapes identifiers with Postgres double quotes (`"user"`). |
| **Supabase RLS & Extensions** | Manual configuration required after migration | `--target supabase` automatically configures Row Level Security (RLS) & UUID extensions. |
| **Apple Silicon / Docker Memory Errors** | Common Lisp / pgloader crashes | Pure, lightweight Node.js native engine with zero native toolchain dependencies. |

---

## 📦 Installation & Usage

### Running via `npx` (No Install Required)
```bash
npx sqlite2pg <path-to-sqlite-db> [options]
```

### Global CLI Installation
```bash
npm install -g sqlite2pg
sqlite2pg ./app.db -o migration.sql
```

### Programmatic API (Use in Node / TypeScript Projects)
```typescript
import { convert, introspect } from 'sqlite2pg';

// Generate SQL string
const result = convert('./local.db', {
  target: 'supabase',
  schema: 'public',
  batchSize: 1000,
});

console.log(result.sql);
console.log(`Converted ${result.stats.tableCount} tables, ${result.stats.rowCount} rows in ${result.stats.durationMs}ms`);
```

---

## 🛠️ CLI Options Reference

```
Usage: sqlite2pg [command] [options] [sqlite-db]

Commands:
  serve                        Start the HTTP REST API server with rate limiting

Arguments:
  sqlite-db                    Path to SQLite database file (.db, .sqlite, .sqlite3)

Options:
  -o, --output <file>          Output SQL file (writes to stdout if omitted)
  -t, --target <dialect>       Target dialect: "postgres" or "supabase" (default: "postgres")
  -s, --schema <name>          PostgreSQL schema name (default: "public")
  -c, --conn <url>             Direct PostgreSQL / Supabase connection URL for live migration
  -b, --batch-size <number>    Batch size for INSERT statements (default: 1000)
  --schema-only                Export schema only (no data)
  --data-only                  Export data only (no DDL)
  --drop-tables                Include DROP TABLE IF EXISTS before table creation
  --identity                   Use SQL standard GENERATED BY DEFAULT AS IDENTITY instead of BIGSERIAL
  --no-defer-fks               Do not defer foreign key constraints to end of script
  --include <tables>           Comma-separated list of tables to include
  --exclude <tables>           Comma-separated list of tables to exclude
  --dry-run                    Inspect database and display schema summary without exporting
  --json                       Output schema or stats in JSON format
  --verbose                    Enable verbose logging
  -v, --version                Output the version number
  -h, --help                   Display help for command
```

---

## 🧪 Testing

Run test suite:
```bash
npm test
```

---

## 📄 License

MIT © 2026
