# ADR 0011 — Phase 5 ships RLS infrastructure; enforcement deferred

**Status:** Accepted (2026-05-15). Closes Phase 5. Supersedes
[ADR 0010](0010-rls-force.md). Partially supersedes
[ADR 0001](0001-rls.md) — its connection-pinning clause is delivered
here; its enforcement clause is deferred to a future phase.

**Forward references (deferred-work scope refined in Phase 6):** the
three "What's deferred" bullets below are addressed by
[ADR 0012](0012-fillout-dual-path-rls.md) (fillout-path strategy),
[ADR 0013](0013-admin-mutation-permissive.md) (mutation-policy
approach), and [ADR 0014](0014-qdesigner-app-role.md) (app role).
This ADR will be superseded in Phase 6 closeout once enforcement
lands.

## Decision

Phase 5's deliverable is the **per-request transaction infrastructure**
that authenticated handlers run inside, with `app.user_id` (and
`app.user_role`) set as transaction-local GUCs that the
`current_app_user_id()` helper from migration 00014 can read.
Specifically:

- `middleware::rls_context::set_rls_context` acquires a connection from
  the pool per authenticated request, begins a transaction, sets the
  GUCs via `SELECT set_config(..., true)`, stashes the live
  `Transaction<'static, Postgres>` in an `Arc<Mutex<Option<…>>>` in
  request extensions, runs the downstream handler, then commits on
  2xx/3xx or rolls back otherwise.
- `middleware::tx::Tx` is the custom extractor that hands the
  transaction slot to handlers; the handler shape is
  `(AuthenticatedUser, Tx, …)` followed by `let mut g = tx.lock().await;
  let tx = g.as_mut().expect(…); query.fetch_*(&mut **tx)`.
- `tower_http::catch_panic::CatchPanicLayer` is mounted inside
  `set_rls_context` on every protected router group so a panicking
  handler synthesises a 500 that the middleware observes and rolls back
  via the explicit branch.
- Every authenticated handler in `api/{users, comments, media,
  templates, projects, questionnaires, organizations, sessions}.rs`
  uses this pattern. Anonymous (`OptionalUser`, no-user) handlers
  remain on `&state.pool` — they don't have a Tx in extensions because
  the middleware passes anonymous requests through without opening one.

ADR 0010's "partial FORCE" plan, the `00017_rls_force.sql` migration,
and the `tests/rls_enforcement.rs` enforcement test are **not part of
Phase 5**. None of them ships.

## Why enforcement is deferred

Empirically verified in P5.2 mid-phase (commits `694c1b1`, `d410dc5`,
this ADR):

1. The application connects as `qdesigner`, the bootstrap user the
   `postgres:18-alpine` image creates from `POSTGRES_USER`. That role
   has `SUPERUSER` and `BYPASSRLS`. Per PostgreSQL docs, both flags
   bypass RLS unconditionally — `FORCE ROW LEVEL SECURITY` does not
   override them. So flipping FORCE on the 6 admin tables (the ADR 0010
   plan) achieves nothing for application traffic until the connection
   role changes.
2. Switching to a non-superuser application role makes the existing
   `00014_rls_policies.sql` SELECT policies bind. But `00014` declares
   `FOR SELECT` only — no `FOR INSERT WITH CHECK (...)`,
   `FOR UPDATE USING (...)`, `FOR DELETE USING (...)`. PostgreSQL's
   default-deny applies: every INSERT/UPDATE/DELETE against the
   protected tables would be blocked outright. The handlers can't even
   create a user row at registration.
3. The 5 fillout-path tables (`questionnaire_definitions`, `sessions`,
   `responses`, `interaction_events`, `session_variables`) are read
   from anonymous fillout endpoints that have no `app.user_id` to set.
   Their existing SELECT policies reduce to `user_id = NULL` for those
   requests; without policy redesign (Option C from earlier ADR 0010
   drafts), anonymous fillout breaks under any non-bypass role.

Resolving (2) and (3) is real authorization design work — picking a
threat model, deciding whether mutation policies re-encode
`api/access::*` rules or stay permissive, and either disabling RLS on
fillout-path tables (loss of the "defense-in-depth against ad-hoc DB
sessions" claim) or designing a session-token GUC (Option C, new
middleware + new policy surface). None of these has a clean answer
under Phase 5's budget.

## What's delivered

- Per-request transaction infrastructure on all authenticated routes.
- `app.user_id` GUC set per authenticated request, readable via
  `current_app_user_id()` from inside the handler's queries.
- Custom `Tx` extractor for ergonomic handler signatures.
- Panic-safe commit/rollback via `CatchPanicLayer`.
- One integration test (`tests/rls_context.rs`) asserting the GUC
  contract end-to-end through the same SQL the middleware emits.

The GUC is set even though no policy currently uses it for enforcement.
Future work can add audit logging keyed off `current_app_user_id()`
(no code change needed in handlers) or land enforcement on top of
this base.

## What's deferred (future Phase scope)

- `ALTER ROLE` / role-switch to a non-superuser non-BYPASSRLS app role
  (e.g., `qdesigner_app`). Includes `docker-compose.yml` /
  `.env.development` updates; migrations continue to run as
  `qdesigner`.
- INSERT/UPDATE/DELETE policies on the tables Phase 5 wants enforced.
  Either permissive `WITH CHECK (true)` (Option B from the P5.0
  history) or rule-encoding to match `api/access::*`. Decision needs
  an ADR.
- Fillout-path strategy: drop RLS from fillout-path tables, OR design
  a session-token GUC (Option C), OR carve out a third connection role
  with broader access. Decision needs an ADR.
- `tests/rls_enforcement.rs` covering cross-tenant SELECT denial under
  the chosen role + policy surface.

## Other Phase 5 artifacts shipped

- `?panic=1` debug-only flag on `/api/users/me`: present during P5.1
  spike + P5.2 to keep the panic-rollback path empirically
  reproducible. **Removed in the same P5.4 commit as this ADR.**
- `RbacManager` was reshaped from a stateful struct holding the pool to
  a stateless namespace whose methods take `executor: impl PgExecutor`.
  Dead `has_org_permission` / `has_project_permission` methods deleted
  in P5.2 batch 1 (had `#[allow(dead_code)]`, no callers).
- `api/access::*` helpers similarly take `executor: impl PgExecutor` so
  the same call site can pass either `&PgPool` or `&mut **tx`.

## Status note for ADR 0001

ADR 0001's status header updates to:

> Infrastructure clause complete (Phase 5, this ADR). Enforcement
> clause deferred to a future phase per ADR 0011. Connection-pinning
> trades per-query connection checkout for per-request checkout;
> monitor pool saturation in production.

## Status note for ADR 0010

ADR 0010 status header updates to:

> Superseded by ADR 0011. The partial-FORCE plan (and its
> earlier full-FORCE wording) doesn't enforce anything while the
> application connects as the postgres bootstrap superuser. Enforcement
> design is deferred; this ADR is retained for historical context on
> the path that wasn't taken.
