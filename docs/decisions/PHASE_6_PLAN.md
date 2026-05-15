# Phase 6 — RLS Enforcement: Implementation Plan

**Status:** Approved (2026-05-15). Authoritative plan for Phase 6.
**Phase 5 closed:** main @ 303ecff (RLS infrastructure shipped; enforcement deferred per ADR 0011).
**This plan supersedes:** the Phase 6 mission text in ADR 0011.

## Mission

Land actual RLS enforcement on application traffic. End state:

- Admin-table cross-tenant SELECTs denied at the DB regardless of `api/access::*` correctness.
- Fillout-path traffic (both authenticated and anonymous) gets DB-level isolation between sessions.
- Application connects as a non-superuser role; the `app.user_id` GUC set by Phase 5's middleware actually binds.

## Decisions (recorded; ADRs written in P6.0)

- **D1 — Fillout-path strategy:** Option C with dual-path support. Fillout supports both **authenticated users** (identity tracked on session) and **anonymous** users (session-token-driven). Policies admit either path. ADR 0012.
- **D2 — Admin-table mutation policies:** D2a, permissive `WITH CHECK (true)` / `USING (true)`. `api/access::*` remains the sole authorization point for mutations; RLS handles cross-tenant SELECT denial. ADR 0013.
- **D3 — App role:** `qdesigner_app` (non-superuser, non-BYPASSRLS, LOGIN). Grants `SELECT/INSERT/UPDATE/DELETE` on app tables + `USAGE` on schema/sequences. Migrations continue as `qdesigner`. ADR 0014.
- **D4 — Test role strategy:** tests inherit `DATABASE_URL` (use `qdesigner_app`). Reflects production. If a specific test needs to bypass for setup, it uses a separately-acquired superuser connection. No third role.

## Architecture

### Dual-GUC model

Middleware sets two GUCs per request:

- `app.user_id` (UUID or NULL) — from JWT if authenticated
- `app.session_id` (UUID or NULL) — extracted from the fillout context if present

Both can be set simultaneously (authenticated user filling out their own questionnaire). Policies use OR semantics.

Helper functions in `00021_fillout_dual_policies.sql`:

- `current_app_user_id() returns UUID` — already exists from `00014`
- `current_app_session_id() returns UUID` — new

### Schema change

`sessions` table gets a new column:

```sql
ALTER TABLE sessions ADD COLUMN user_id UUID NULL REFERENCES users(id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id) WHERE user_id IS NOT NULL;
```

Existing rows retain NULL `user_id` (historical anonymous sessions). New sessions created by authenticated handlers populate `user_id` from the JWT.

### Policy structure

**Admin tables** (users, organizations, organization_members, projects, project_members, media_assets):

- SELECT: existing `current_app_user_id()`-based policies from `00014` (unchanged).
- INSERT/UPDATE/DELETE: new permissive policies — `WITH CHECK (true)` / `USING (true)`. `api/access::*` is the authorization.

**Fillout-path tables with dual policies** (sessions, responses, interaction_events, session_variables):

```sql
-- sessions SELECT (template)
CREATE POLICY sessions_select_dual ON sessions FOR SELECT USING (
  (current_app_user_id() IS NOT NULL AND user_id = current_app_user_id())
  OR
  (current_app_session_id() IS NOT NULL AND id = current_app_session_id())
);
```

`responses`, `interaction_events`, `session_variables` use the same shape but join through `sessions` (`session_id IN (SELECT id FROM sessions WHERE …same dual clause…)`).

INSERT/UPDATE/DELETE on these tables use parallel `WITH CHECK` clauses ensuring the row being mutated belongs to the bound user or session.

**`questionnaire_definitions`:** `DISABLE ROW LEVEL SECURITY`. Rationale: anonymous read-by-code is intentional product behavior (`GET /api/questionnaires/by-code/{code}` is public); admin-side reads go through `projects` ownership which is admin-enforced. RLS adds nothing here.

### Middleware flow

For authenticated routes (existing `set_rls_context` from Phase 5):

- Set `app.user_id` from JWT.
- Leave `app.session_id` NULL.

For fillout routes (`OptionalUser` handlers) — new path:

- Extract optional JWT → `app.user_id` if present.
- Extract `session_id` from request (URL path for sync, body for create/update/submit) → `app.session_id`.
- Both run in a transaction; both commit at response time.

Recommendation: separate layer `set_fillout_rls_context` rather than branching inside `set_rls_context`. Cleaner, easier to verify, easier to remove if the fillout architecture changes.

OptionalUser handlers stop using `&state.pool` directly; they take `Tx` like authenticated handlers. The middleware decides what GUCs to set based on what's in the request.

## Phase decomposition

Each step is a checkpoint with its own verification gate. Per-step commits. Standing rules from prior phases apply (terse reports, verify-before-act, escalate only on real architectural forks).

### P6.0 — ADRs (no code)

Three ADRs:

- **0012** — Fillout-path strategy: Option C with dual-path (records D1).
- **0013** — Mutation policy approach: D2a (records D2).
- **0014** — App role: qdesigner_app + grants (records D3 + D4).

Status updates:

- **0001:** stay "Infrastructure complete (Phase 5); enforcement deferred (ADR 0011)" until P6.7.
- **0011:** add forward reference to 0012/0013/0014.

### P6.1 — Role migration + DSN switch

`apps/server/migrations/00018_app_role.sql`:

```sql
CREATE ROLE qdesigner_app WITH NOSUPERUSER NOBYPASSRLS NOLOGIN;
GRANT USAGE ON SCHEMA public TO qdesigner_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qdesigner_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO qdesigner_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qdesigner_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO qdesigner_app;
ALTER ROLE qdesigner_app WITH LOGIN PASSWORD '<dev-only>';
```

(Password sourced from env in a future hardening; for dev use a literal documented in `.env.development`.)

Update `.env.development`, `.env.test`, `docker-compose.yml` to use `qdesigner_app` for the app DSN. Migrations continue as `qdesigner`.

**Verification (amended 2026-05-15 mid-P6.1 by supervisor advisory):**
`docker compose down -v; up`; `cargo run` applies migrations cleanly
under the split-DSN pattern; startup probe logs
`current_user = qdesigner_app`; `pg_stat_activity` shows app
connections under `qdesigner_app` and migration connections under
`qdesigner`; `cargo check` passes. **End-to-end curl smoke (login +
CRUD + fillout) deferred to the P6.2 gate.**

**Correction to the original P6.1 text ("RLS doesn't bind yet"):** the
plan was wrong. Non-owner ENABLE binds without FORCE. The DSN switch
alone activates RLS for `qdesigner_app` on every table where 00014
ran ENABLE — i.e., starting at P6.1, every admin-table
INSERT/UPDATE/DELETE default-denies because no mutation policies
exist yet, and the existing SELECT policies return empty for
anonymous routes (no `app.user_id` GUC). This is the same condition
the P6.5 empirical claim describes; the claim is answered early at
P6.1, not at P6.5. `cargo test auth_flows` is expected to fail in
the interval between P6.1 and P6.2; this is intentional ordering, not
a defect. P6.2 (admin permissive INSERT/UPDATE/DELETE policies in
migration 00020) restores the green state. The P6.5 FORCE migration
remains valuable as defence against the migration superuser
(`qdesigner`) accidentally hitting application data — note the
empirical confirmation in the P6.5 commit body when it lands.

**Risk:** every dev needs a fresh DB. Document loudly in commit body.
The intermediate-broken state between P6.1 and P6.2 lasts exactly one
commit; land P6.2 same-day.

### P6.2 — Sessions schema + admin mutation policies

Two migrations in the same commit:

`00019_sessions_user_id.sql`:

```sql
ALTER TABLE sessions ADD COLUMN user_id UUID NULL REFERENCES users(id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id) WHERE user_id IS NOT NULL;
```

`00020_admin_mutation_policies.sql`:

```sql
-- Pattern, repeated for each admin table
CREATE POLICY users_insert_all ON users FOR INSERT WITH CHECK (true);
CREATE POLICY users_update_all ON users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY users_delete_all ON users FOR DELETE USING (true);
```

Apply to: `users`, `organizations`, `organization_members`, `projects`, `project_members`, `media_assets`.

Handler change: `create_session` in `sessions.rs` populates `user_id` from JWT if the request is authenticated.

**Verification:** migrations apply; cargo check + cargo test; sessions table accepts both NULL and populated user_id.

### P6.3 — Fillout-path GUC + dual policies

`00021_fillout_dual_policies.sql`:

- Define `current_app_session_id()` helper.
- Drop existing single-GUC SELECT policies on `sessions`, `responses`, `interaction_events`, `session_variables`.
- Add dual-path SELECT + INSERT + UPDATE + DELETE policies (architecture section above).
- `ALTER TABLE questionnaire_definitions DISABLE ROW LEVEL SECURITY`.

Middleware: new `set_fillout_rls_context` layer mounted on `/api/sessions/*` (the OptionalUser routes) and `/api/q/by-code/*` if needed. Branches on JWT presence; sets one or both GUCs.

OptionalUser handlers refactor: `sessions::{create_session, update_session, submit_response, submit_events, upsert_variable, sync_session, upload_session_media}`, `questionnaires::get_by_code` if affected. Take `Tx` instead of `&state.pool`.

**Verification:** cargo check + cargo test; full curl smoke test of anonymous fillout flow AND authenticated fillout flow.

### P6.4 — sessions.rs helpers refactor

11 helpers identified in Phase 5 closeout (`fetch_session_variable_context`, `ensure_session_active`, `persist_session_variable`, plus 8 others — team-lead enumerates from sessions.rs). Refactor to `executor: impl PgExecutor<'_>` instead of `state: &AppState`. Same pattern as `api/access::*` after Phase 5 batch 1.

**Verification:** cargo check + cargo test + curl on a session-listing endpoint.

### P6.5 — Apply FORCE on admin tables

`00022_force_rls_admin.sql`:

```sql
ALTER TABLE users FORCE ROW LEVEL SECURITY;
-- repeat for organizations, organization_members, projects, project_members, media_assets
```

**Empirical claim to verify during this step:** because `qdesigner_app` is non-owner, ENABLE on tables owned by `qdesigner` already binds for `qdesigner_app` without FORCE. FORCE adds defense against `qdesigner` itself (the migration role) accidentally hitting application data. The team-lead should probe before/after: does running an INSERT as `qdesigner_app` against an RLS-enabled-but-not-FORCE'd table actually get blocked? If YES, FORCE is belt-and-suspenders. If NO, this migration is necessary even for `qdesigner_app`. Either way, the migration is correct to land — but note the discovered behavior in the commit body.

**Verification:** all gate commands green. Manual cross-tenant probe: user A → cannot SELECT user B's data via any authenticated handler.

### P6.6 — `rls_enforcement.rs` integration test

`apps/server/tests/rls_enforcement.rs`. Setup: two orgs, two users, two projects, one fillout session per user (one authenticated session linked to user A's user_id, one anonymous session).

Assertions:

1. User A connection (`app.user_id = A`) cannot SELECT B's projects.
2. User A connection cannot INSERT a project with B's organization_id at RLS layer (D2a permissive — should succeed at RLS; `api/access::*` blocks at handler layer; test asserts RLS behavior in isolation).
3. Anonymous fillout connection (`app.session_id = <anonymous session UUID>`) can SELECT its own responses.
4. Anonymous fillout connection cannot SELECT user A's responses (different session, no user_id GUC).
5. Authenticated fillout connection (`app.user_id = A`, `app.session_id = NULL`) can SELECT all of A's sessions (linked via user_id).
6. Authenticated fillout connection cannot SELECT B's sessions.

~200 LOC. The test that proves enforcement is real for both paths.

**Bonus probe:** temporarily revert P6.5 locally; confirm tests still pass (because non-owner ENABLE binds without FORCE) — this validates the P6.5 observation.

### P6.7 — Closeout

- **ADR 0001** status → "Complete (Phase 6 at SHA …)."
- **ADR 0011** → "Superseded by Phase 6 closeout (ADRs 0012/0013/0014)."
- **CLAUDE.md** Database section: rewrite reflecting `qdesigner_app` + dual-path policies + FORCE (or its discovered redundancy).
- **`docs/decisions/baseline.md`**: append Phase 6 row.
- Drop any `?panic=1`-style debug helpers if added.

Single closeout commit.

## Aggregate

- Migrations: 5 new SQL files (~300 LOC).
- Code: ~200 LOC sessions.rs helper refactor + ~150 LOC OptionalUser handler refactor + ~50 LOC middleware update + ~200 LOC test.
- ADRs: 3 new (0012, 0013, 0014) + status updates on 0001, 0011.
- Estimated net LOC: ~+800.
- Commits: ~8 (one per step plus closeout).

## Risks

1. **Schema migration on sessions** — adding `user_id` is non-destructive but every existing session row gets NULL. Verify fillout works for both NULL (legacy/anonymous) and populated (new authenticated) cases. Test with a fresh DB AND a DB with historical anonymous sessions present.
2. **Middleware branching complexity** — the OptionalUser fillout middleware is the highest-risk integration point. Implement as a separate layer (`set_fillout_rls_context`) rather than branching inside `set_rls_context`. Cleaner code, easier to verify.
3. **Pool exhaustion compounds** — Phase 5's per-request checkout × Phase 6's actual policy enforcement (slight query planner cost). Production telemetry will tell.
4. **Test environment** — every dev's local DB needs re-bootstrapping after P6.1. Document in commit body.
5. **Migration ordering is critical** — P6.1 (role) → P6.2 (schema + admin policies) → P6.3 (fillout policies + middleware) → P6.4 (helpers) → P6.5 (FORCE) → P6.6 (test). Don't reorder. Each migration depends on the prior state.
6. **session_id-as-credential** — anyone with a session URL can read that session's data through the API. RLS enforces that the URL-supplied session_id is the ONLY session readable by that request, but doesn't change that the URL is the credential. This was true pre-Phase-6 and remains true post-Phase-6.

## Standing rules

- **Verify before acting** — extends to every ADR claim and architectural assumption in this plan. The P6.5 "FORCE-may-be-redundant" observation is exactly the kind of thing to empirically probe during the spike, not at first surprise. Phase 5's two avoidable revisions came from skipping this discipline at planning time.
- **Per-step verification** — cargo check + curl smoke after every commit. Don't batch.
- **Per-step commits** — one commit per phase-step. Reviewable history.
- **Escalate only on real architectural forks** — re-verify supervisor advisories at action time. Phase 5 demonstrated supervisor advisories can themselves contain architectural errors.
- **Terse reports** — three-line phase reports unless something is genuinely worth surfacing. Full report at phase gate.
- **Anti-attractor rules A1–A10** from SUPERVISOR_PROTOCOL.md still binding. Self-audit silently; surface only when bumping against one.

## References

- `CLAUDE.md` — current architecture; rewrite in P6.7.
- `docs/decisions/SUPERVISOR_PROTOCOL.md` — communication protocol with supervisor (separate session).
- `docs/decisions/0001-rls.md` — RLS decision; infrastructure complete, enforcement is this phase.
- `docs/decisions/0011-rls-infra-only.md` — Phase 5 closeout; superseded by this phase's closeout.
- `docs/decisions/baseline.md` — pre-cleanup metrics; append Phase 6 row at P6.7.
- `apps/server/migrations/00014_rls_policies.sql` — existing SELECT policies on 11 tables. P6.3 modifies the fillout-path subset.
- `apps/server/src/middleware/rls_context.rs` — Phase 5 middleware; P6.3 adds a fillout-context sibling.
- `apps/server/src/middleware/tx.rs` — Phase 5 Tx extractor; unchanged.
- `apps/server/tests/rls_context.rs` — Phase 5 GUC guard test; stays as a regression guard.
