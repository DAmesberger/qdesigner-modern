# ADR 0010 — FORCE ROW LEVEL SECURITY on protected tables

**Status:** Accepted (2026-05-15). Companion to [ADR 0001](0001-rls.md) Phase 5
work.

## Decision

In Phase 5, after every authenticated handler has been refactored onto the
per-request transaction path that sets `app.user_id` via `set_config`, a
final migration (`00017_rls_force.sql`) issues
`ALTER TABLE … FORCE ROW LEVEL SECURITY` on every table that already carries
an `ENABLE ROW LEVEL SECURITY` clause in `00014_rls_policies.sql`:

- `users`
- `organizations`
- `organization_members`
- `projects`
- `project_members`
- `questionnaire_definitions`
- `sessions`
- `responses`
- `interaction_events`
- `session_variables`
- `media_assets`

## Why

`DATABASE_URL` connects the application as `qdesigner`, which is the table
owner (migrations create the schema under this role). PostgreSQL grants the
table owner an implicit RLS bypass under `ENABLE`. So even after the
connection-pinning refactor, RLS policies do **not** filter rows seen by
application traffic — the owner short-circuits them.

`FORCE ROW LEVEL SECURITY` is the documented PostgreSQL switch that makes
RLS apply to table owners as well. With FORCE on, the policies authored in
`00014_rls_policies.sql` (which key off `current_app_user_id()`) finally
bite on the connection the handlers use, because that connection's
transaction has `app.user_id` set to the authenticated user's UUID and
*nothing* else.

## Alternatives considered

### Switch to a non-owner application role

Create `qdesigner_app` with `SELECT, INSERT, UPDATE, DELETE` on every
table; migrations run as `qdesigner`, the application connects as
`qdesigner_app`. RLS applies because the role isn't the owner.

**Rejected** because: changes `DATABASE_URL` shape, requires a parallel
docker-compose service definition or an init SQL block to provision the
role, breaks every test fixture that assumes the `qdesigner` DSN, and
introduces two roles to keep in sync going forward. The benefit over FORCE
is marginal: both deny the same set of rows; FORCE additionally constrains
the migrator role's day-to-day queries, which is a small extra safety win.

### Leave it un-FORCED

The original ADR 0001 stops short of declaring how the owner-bypass is
resolved. Leaving it un-FORCED means connection-pinning is structurally
in place but enforces nothing — defense-in-depth on paper, no-op in
practice.

**Rejected** because: this is the actual Phase 5 goal. Without FORCE the
new integration test in P5.3 cannot prove enforcement, and the CLAUDE.md
"Phase 5 complete" claim would not be operationally true.

## Consequences

- New migration `00017_rls_force.sql` lands in the same commit as
  `tests/rls_enforcement.rs` (P5.3). Sequencing matters: FORCE must
  *not* land before P5.2 completes — any handler still on `&PgPool`
  would lose its rows the moment FORCE is applied. The rls_enforcement
  test passes only with FORCE on, which is the operational proof.
- Superusers continue to bypass RLS (PostgreSQL never applies RLS to
  superusers, FORCE or not). Out of scope: we already trust `psql` and
  `pg_dump` admin sessions, and our threat model is application-layer.
- Migrations themselves run as the table owner. FORCE on the owner means
  future migrations that need to touch row data across tenants must
  either (a) `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` inside the
  migration, do the work, FORCE back on; or (b) run as a superuser. Add
  this constraint to the migration-authoring checklist when Phase 5
  closes.
- `cargo test` integration suites that bootstrap data must either set
  `app.user_id` before INSERTing rows they later need to read, or
  temporarily disable FORCE for the setup block.
