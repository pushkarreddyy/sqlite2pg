# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-11

### Added
- Zero-config SQLite database introspection via Node.js native `node:sqlite`.
- Strict PostgreSQL type mapping engine (`INTEGER PRIMARY KEY` $\rightarrow$ `BIGSERIAL`, `DATETIME` $\rightarrow$ `TIMESTAMPTZ`, etc.).
- Value transformer for boolean `0/1` normalization, ISO/Unix timestamp parsing, binary hex blobs (`\x...::bytea`), and JSONB casting.
- Deferred foreign key generation to eliminate table insertion order violations and circular reference issues.
- Sequence synchronization (`SELECT setval(...)`) generation for all autoincrementing / identity primary keys.
- Supabase target support (`--target supabase`) with automatic Row Level Security (RLS) activation.
- Direct live database migration option (`--conn "postgres://..."`).
- Comprehensive CLI interface with `--dry-run`, table filtering (`--include`/`--exclude`), and JSON output.
