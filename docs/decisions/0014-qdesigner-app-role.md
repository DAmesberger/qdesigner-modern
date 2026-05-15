# ADR 0014 — Application role `qdesigner_app` (non-superuser, non-BYPASSRLS)

**Status:** Accepted (2026-05-15). Records decisions D3 (app role) and
D4 (test role strategy) of the Phase 6 plan
([PHASE_6_PLAN.md](PHASE_6_PLAN.md)). Refines the deferred-work scope
in [ADR 0011](0011-rls-infra-only.md) §"What's deferred"
("`ALTER ROLE` / role-switch to a non-superuser non-BYPASSRLS app
role").

## Decision

A second PostgreSQL role, `qdesigner_app`, is introduced for the
application's runtime database connection. Properties:

- `NOSUPERUSER NOBYPASSRLS LOGIN`.
- Granted `SELECT, INSERT, UPDATE, DELETE` on all tables in `public`,
  `USAGE` on the schema, and `USAGE, SELECT` on all sequences.
- Default privileges on future tables/sequences mirror the above so
  later migrations don't have to remember to grant.
- Dev/test password literal documented in `.env.development` and
  `.env.test`. Production hardening (env-driven password / cert auth)
  is out of scope for Phase 6 and is logged as deferred.

The bootstrap superuser `qdesigner` is kept as-is. It is used for:

1. Migrations (`sqlx::migrate!` continues to run as `qdesigner`).
2. Test setup paths that need to bypass RLS (separately-acquired
   connection in test code, not the default DSN).

The application's `DATABASE_URL` switches to `qdesigner_app`.

## Why two roles, not one

Phase 5 left a comment in ADR 0011 §"Why enforcement is deferred":
`qdesigner` is the bootstrap superuser the `postgres:18-alpine` image
creates from `POSTGRES_USER`. It carries `SUPERUSER` and `BYPASSRLS`,
both of which override RLS regardless of `FORCE`. Without a role
switch, no amount of policy authoring binds on application traffic.

Two options were on the table during planning:

- **Strip `BYPASSRLS` from `qdesigner`.** Single role, less moving
  parts. Rejected because the migration role *must* be able to bypass
  RLS during DDL (e.g., a future `UPDATE` to backfill a column across
  tenants), and the postgres image's bootstrap role-creation runs at
  container start, before any application-controlled SQL — we'd be
  fighting the image to demote it. Even if we won, future
  migration-time data fixups would need a careful `ALTER ROLE … BYPASSRLS;
  … ALTER ROLE … NOBYPASSRLS;` dance that's easy to leave half-done.
- **Two roles.** Migrations stay on `qdesigner` (privileged, owns
  schema). Application connects as `qdesigner_app` (un-privileged
  enough that RLS binds). Tests inherit the application DSN per D4.

D3 picks the two-role model. It's the convention in every RLS
deployment I've seen in the wild for the same reason: schema
operations and application operations have legitimately different
authorization needs.

## Why D4 (tests use the app DSN)

Tests reflect production. Running tests as `qdesigner_app` exercises
the same authorization surface as the running server. Running tests
as `qdesigner` (superuser) would make the policies invisible to the
test suite — exactly the failure mode Phase 5 closed with
`tests/rls_context.rs`.

A test that needs to bypass RLS (e.g., setting up cross-tenant
fixtures) acquires a separate superuser `PgConnection` ad-hoc via
`PgConnectOptions::new().username("qdesigner")…`. This stays
the exception, not the rule, and the explicit out-of-band connection
makes the bypass visible at the call site rather than hidden in the
default pool.

A third "test bypass" role was considered and rejected — `qdesigner`
already exists as a superuser; introducing `qdesigner_test_super`
duplicates without adding isolation.

## Consequences

### Migration

```sql
-- 00018_app_role.sql (runs as qdesigner)
CREATE ROLE qdesigner_app WITH NOSUPERUSER NOBYPASSRLS NOLOGIN;
GRANT USAGE ON SCHEMA public TO qdesigner_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qdesigner_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO qdesigner_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qdesigner_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO qdesigner_app;
ALTER ROLE qdesigner_app WITH LOGIN PASSWORD '<dev-only-literal>';
```

The `NOLOGIN` → `LOGIN` flip at the end is intentional: the role is
unusable until the password is set, which prevents a half-applied
migration from leaving a passwordless login role.

### Configuration

- `.env.development` `DATABASE_URL`: `postgresql://qdesigner_app:…@localhost:15434/qdesigner`.
- `.env.test` same.
- `docker-compose.yml` continues to bootstrap with `POSTGRES_USER=qdesigner`; the application service consumes the app DSN above.
- Migration-running code paths (sqlx CLI invocations, integration test
  setup) keep using the `qdesigner` DSN — distinct env var
  `DATABASE_URL_MIGRATIONS` or hand-supplied at the call site, TBD
  during P6.1 implementation.

### Operational

- Every developer needs to re-bootstrap their local DB after P6.1
  lands (the role is created by migration but the existing DSN won't
  work until they update their env). Loud commit-body warning per
  PHASE_6_PLAN.md §Risks #4.
- Production rollout: the migration creates the role, then a config
  rollout flips the DSN. Sequence is migration → deploy. Doing both
  in the same release without sequencing risks the app starting
  before the role exists.

### Deferred

- **Password management.** The literal in `.env.development` is
  acceptable for dev/test; production needs env-sourced or
  cert-auth. Tracked as out-of-scope for Phase 6.
- **Read-replica/analyst role.** ADR 0014 doesn't address it. The
  defense-in-depth claim in ADR 0001 for ad-hoc DB sessions still
  rests on the policies binding for *any* non-bypass role, which a
  future `qdesigner_analyst` would inherit by default if granted only
  `SELECT`.

## Empirical claim to verify during P6.1

The plan flags one in PHASE_6_PLAN.md §P6.5: "because `qdesigner_app`
is non-owner, ENABLE on tables owned by `qdesigner` already binds for
`qdesigner_app` without FORCE." Verify during P6.1 (when `qdesigner_app`
exists but no FORCE has been added yet) by running a known-cross-tenant
SELECT as `qdesigner_app` with `app.user_id` set to a non-member: the
result should already be empty pre-FORCE if the claim holds. Note in
P6.1 commit body. P6.5 confirms or contradicts.
