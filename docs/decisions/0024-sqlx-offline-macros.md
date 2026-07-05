# ADR 0024 — sqlx compile-time query macros (offline mode) on the sessions hot path

- **Status:** Accepted
- **Date:** 2026-07-05
- **Context arc:** Phase 5 remediation, unit P5-T9 (resolves F079, F084, F086). Runs after
  P5-T8, which split the monolithic `api/sessions.rs` into the `api/sessions/` module
  (`crud.rs`, `ingestion.rs`, `sync.rs`, `filter.rs`, `models.rs`, …).

## Context

Every SQL query in the backend used the sqlx **runtime** API (`sqlx::query(...)` /
`sqlx::query_as::<_, T>(...)` with chained `.bind(...)`). That API is unverified at compile
time: a typo'd column, a dropped column, a wrong bind type, or a nullability mismatch only
surfaces at runtime as a 500 or a deserialization panic. The sessions modules carry the
highest-churn, highest-traffic queries (create/read/ingest/sync of participant data), so they
are where compile-time verification pays off most.

sqlx 0.8 ships the `query!` / `query_as!` / `query_scalar!` macros (enabled by default — the
crate does **not** set `default-features = false`). At macro-expansion time they connect to a
live database (`DATABASE_URL`) to typecheck the SQL and infer column types/nullability. To keep
`cargo check` working with the database down — and to keep CI from depending on a schema-loaded
database at compile time — sqlx supports an **offline** mode: a committed `.sqlx/` cache of
per-query metadata is consulted whenever `SQLX_OFFLINE=true` or `DATABASE_URL` is unset.

## Decision

**Adopt the compile-time macros incrementally, starting with the static-SQL, highest-churn
queries in `api/sessions/`, and ship the offline `.sqlx` cache.**

Converted to macros (14 queries):

- `crud.rs` — `create_session` `INSERT … RETURNING` (`query_as!(Session, …)`); the
  `get_session` / `get_responses` (both branches) / `get_events` / `get_variables` SELECTs.
- `ingestion.rs` — the `submit_events` `INSERT`.
- `sync.rs` — the two per-row `INSERT … ON CONFLICT (client_id) DO NOTHING` writes (responses,
  interaction_events).
- `models.rs` (shared helpers the sessions handlers call) — `insert_response`
  (`INSERT … RETURNING`), `persist_session_variable` (the `session_variables` upsert and the
  `session_variable_index` projection upsert), and the `ensure_session_active` /
  `ensure_session_exists` probes (`query_scalar!`).

**Explicitly left on the runtime API** (dynamic SQL the macros cannot verify because the query
string is assembled at runtime): `list_sessions` (optional `WHERE` parts), `update_session`
(COALESCE-style dynamic `SET`), and all of `filter_sessions` (dynamic `WHERE` groups + typed
bind loop). These keep `sqlx::query(...)` / `.bind(...)` and rely on the `FromRow` derives that
stay on `Session` / `ResponseRecord` / `InteractionEventRecord` / `SessionVariableRecord`.

### Notes on the conversion

- **Nullability overrides.** The macros infer nullability from the schema. Columns that are
  schema-nullable but modelled as non-`Option` (`sessions.status`, `sessions.metadata`,
  `responses.metadata`) get a `col as "col!"` force-non-null override; columns that are
  schema-`NOT NULL` but modelled as `Option` (`interaction_events.metadata`,
  `session_variables.variable_value`/`created_at`/`updated_at`) get a `col as "col?"`
  force-nullable override. `SELECT EXISTS(...)` gets `as "exists!"`.
- **Typed timestamp binds in `sync.rs`.** The sync response `INSERT` receives `presented_at` /
  `answered_at` as RFC3339 **strings** (`Option<String>`). Under the macros a bare
  `$5::timestamptz` makes Postgres infer the *parameter* as `timestamptz` (so the macro would
  demand a `DateTime<Utc>` bind). Writing `$5::text::timestamptz` makes Postgres infer the
  parameter as `text`, matching the `String` bind, while still parsing to `timestamptz`. This
  is behaviour-preserving.

## Regenerating the `.sqlx` cache

Whenever a converted query's SQL changes, or the schema under it changes, regenerate the cache
against the **schema-bearing** role (`qdesigner`, i.e. `DATABASE_URL_MIGRATIONS`) — the app
role `qdesigner_app` is RLS-bound and non-owner, so it is not a reliable introspection source:

```bash
cd apps/server
DATABASE_URL="$DATABASE_URL_MIGRATIONS" cargo sqlx prepare -- --tests
# commit the regenerated apps/server/.sqlx/ directory
```

`-- --tests` includes queries compiled only under `cfg(test)`. `cargo sqlx prepare` must be
invoked through cargo so the `CARGO` env var is set. `pkgs.sqlx-cli` is pinned in `flake.nix`
so the tool is available in the dev shell.

## CI wiring

The backend job in `.github/workflows/ci.yml` sets `SQLX_OFFLINE: "true"`. CI's global
`DATABASE_URL` points at a bare `postgres` container whose schema only exists after migrations
run at test time; it must **not** be consulted at macro-expansion time. With `SQLX_OFFLINE`
set, `cargo fmt`/`clippy`/`build` all expand the macros from the committed `.sqlx` cache. The
runtime tests still connect to that database as before.

## Consequences

- A typo'd column or wrong bind type in a converted query is now a **compile error**, verified
  in CI without a schema-loaded database.
- Contributors must regenerate and commit `.sqlx` when they change a converted query's SQL. A
  stale cache fails `cargo check` under `SQLX_OFFLINE` with a "no cached data for this query"
  error, which is a clear signal to re-run `cargo sqlx prepare`.
- The conversion is incremental by design; the remaining ~180 runtime-API call sites elsewhere
  in `api/` are untouched and can be migrated opportunistically in later units.
