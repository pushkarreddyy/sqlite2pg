# Launch & Promotion Guide for sqlite2pg

Use these ready-to-post templates to announce `sqlite2pg` and drive organic developer discovery across major platforms.

---

## 1. Reddit (r/Supabase, r/node, r/selfhosted, r/webdev)

**Title:**
> I built `sqlite2pg`: A zero-config CLI to migrate local SQLite/LibSQL databases to Supabase & PostgreSQL (fixing AUTOINCREMENT, FK order, and sequence desyncs)

**Body:**
> Hey everyone!
>
> When building MVPs locally with SQLite/LibSQL/Turso and moving to Supabase or Neon PostgreSQL for production, standard `sqlite3 .dump` or `pgloader` constantly breaks due to:
> - `AUTOINCREMENT` syntax errors (invalid in Postgres)
> - Foreign key constraint violations during insert ordering
> - Sequence desynchronization (next app insert fails with duplicate primary key errors)
> - Boolean `0/1` type rejections and datetime formatting issues
>
> I built **`sqlite2pg`** — a zero-config, single-command CLI in Node (using Node's native SQLite engine):
>
> ```bash
> npx sqlite2pg ./app.db -o migration.sql --target supabase
> ```
>
> It parses your tables, maps dynamic types to strict Postgres types (`BIGSERIAL`, `TIMESTAMPTZ`, `JSONB`), defers foreign keys until after data load, and automatically includes sequence resets (`setval`).
>
> GitHub: https://github.com/pushkarreddyy/sqlite2pg
>
> Feedback and PRs welcome! If you find it useful, I'd appreciate a star on GitHub ⭐

---

## 2. Hacker News (Show HN)

**Title:**
> Show HN: sqlite2pg – Zero-config SQLite to PostgreSQL and Supabase migrator

**Link / Text:**
> https://github.com/pushkarreddyy/sqlite2pg
>
> Modern lightweight CLI that dumps SQLite databases into clean, PostgreSQL-compatible SQL migrations without pgloader memory crashes or sqlite3 syntax errors.

---

## 3. Twitter / X Post

> 🚀 Just open-sourced `sqlite2pg`!
>
> A zero-config CLI to migrate SQLite / LibSQL databases to PostgreSQL & Supabase with strict types, deferred FKs, and sequence syncs.
>
> Run it instantly with npx:
> `npx sqlite2pg ./app.db -o migration.sql --target supabase`
>
> ⭐️ Star on GitHub: https://github.com/pushkarreddyy/sqlite2pg
>
> #sqlite #postgresql #supabase #nodejs #typescript #opensource

---

## 4. GitHub SEO Topics to Keep Active:
- `sqlite`
- `postgresql`
- `postgres`
- `supabase`
- `neon`
- `sqlite-to-postgres`
- `sqlite2pg`
- `sqlite-converter`
- `database-migration`
- `pgloader-alternative`
- `turso`
- `libsql`
