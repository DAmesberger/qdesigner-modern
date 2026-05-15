# ADR 0010 — Partial FORCE ROW LEVEL SECURITY (admin-side tables only)

**Status:** Accepted (2026-05-15). Companion to [ADR 0001](0001-rls.md) Phase
5 work. Narrows the original wording of this ADR (first drafted 2026-05-15
earlier the same day; first version proposed full FORCE on all 11 protected
tables — rewritten after the P5.2 mid-phase discovery that full FORCE
breaks both anonymous fillout reads and *all* INSERT/UPDATE/DELETE traffic
under the existing `00014_rls_policies.sql`, which declares `FOR SELECT`
policies only).

## Decision

Phase 5's final migration `00017_rls_force.sql` issues
`ALTER TABLE … FORCE ROW LEVEL SECURITY` on exactly six tables:

- `users`
- `organizations`
- `organization_members`
- `projects`
- `project_members`
- `media_assets`

These are the **admin-side tables** that authenticated handlers read in
patterns RLS naturally protects (cross-tenant org/project/user lookups).
They are touched only by authenticated handlers; every code path that
mutates or reads them runs inside the `set_rls_context` per-request
transaction with `app.user_id` set.

FORCE is **not** applied to:

- `questionnaire_definitions`
- `sessions`
- `responses`
- `interaction_events`
- `session_variables`

These are **fillout-path tables**: anonymous public traffic creates
sessions, submits responses, fetches the questionnaire by code, and
emits interaction events. There is no `app.user_id` for such requests.
Forcing RLS on these tables would deny anonymous fillout entirely.

The five fillout-path tables keep their `ENABLE ROW LEVEL SECURITY` and
existing SELECT policies as defense-in-depth against ad-hoc DB
sessions (psql, future read-replica analyst roles); on application
traffic they remain enforced only by `api/access::*` checks, exactly as
today. The intentional state is documented here so future readers
don't read the inconsistency as drift.

## Why partial FORCE rather than full FORCE

`00014_rls_policies.sql` declares `FOR SELECT` policies only — no
INSERT, UPDATE, or DELETE policies, no `WITH CHECK` clauses. Under
PostgreSQL's documented behaviour, `ENABLE` (and `FORCE`) plus no
policy for a given action defaults to deny for that action. Forcing
RLS on a table that has only SELECT policies blocks every
INSERT/UPDATE/DELETE through that table for non-bypass connections.

Full FORCE would therefore require either authoring permissive
mutation policies (`FOR INSERT WITH CHECK (true)` etc.) or rewriting
the threat-model rules in policy form. Both expand scope past Phase 5's
charter ("make the existing authored policies enforce on application
traffic") and introduce a second source of truth for authorization
rules that already live in `api/access::*` and `RbacManager`. The
attractor is bug-shape: policy disagrees with handler, hard to find.

Partial FORCE delivers exactly what was chartered — the authored
SELECT policies on admin tables enforce on application traffic —
without the duplicated-rules cost.

## Alternatives considered

### B — Full FORCE with permissive INSERT/UPDATE/DELETE policies

Add `FOR INSERT WITH CHECK (true)` + `FOR UPDATE USING (true) WITH CHECK
(true)` + `FOR DELETE USING (true)` on every protected table, plus a
fillout-path-readability SELECT clause keyed off `sessions.status`. ~150
LOC of SQL. Recreates `api/access::*` in policy form. Not worth the
two-locations-for-one-rule cost.

**Future Phase candidate.** If the threat model later admits "an
attacker with stolen app credentials issuing direct mutation queries,"
this becomes the right call. Not the current threat.

### C — Session-token GUC for anonymous fillout

Anonymous fillout sets an `app.session_id` GUC from a URL token; SELECT
policies admit either `current_app_user_id` membership *or*
`current_app_session_id` matching `sessions.id`. Cleanest end state,
biggest design lift — new GUC, new middleware path, new policy clauses,
new threat-model affordances for session-token leakage.

**Future Phase candidate.** Separate ADR; depends on product wanting
DB-level enforcement of fillout authorization.

### Don't FORCE anything

The pre-Phase-5 state. Connection-pinning is structurally in place but
enforces nothing. Rejected — Phase 5's charter is to make the policies
bite somewhere on application traffic; admin-side enforcement is the
non-trivial subset that doesn't break fillout.

## Consequences

- `00017_rls_force.sql` is six `ALTER TABLE` statements, lands in the
  same commit as `tests/rls_enforcement.rs` (P5.3). The test exercises
  cross-tenant SELECT denial on `projects`, `organization_members`, and
  `media_assets`.
- `OptionalUser` handlers (`create_session`, `update_session`,
  `submit_response`, `submit_events`, `upsert_variable`, `sync_session`,
  `get_questionnaire_by_code`, `upload_session_media`) keep using
  `&state.pool` directly — they touch only non-FORCE tables, so the
  GUC is irrelevant and a conditional Tx/pool fork would add a future-
  reader trap. P5.2 refactors `AuthenticatedUser` handlers only.
- Migrations themselves run as the table owner with FORCE on the six
  admin tables. Future migrations that need to bulk-update admin tables
  across tenants must `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` for
  the duration, or be issued as a superuser. Add to the migration-
  authoring checklist when Phase 5 closes.
- ADR 0001's "Complete" status at P5.4 will explicitly state "complete
  for admin tables; fillout-path tables retain their pre-existing
  ENABLE-only posture as documented in ADR 0010."

## Sequencing

`00017_rls_force.sql` must land in the same commit as the
`rls_enforcement.rs` test (P5.3), after every authenticated handler
that reads an admin table is on the per-request transaction
(P5.2 batches 1-7). Landing FORCE earlier would deny those reads from
still-unrefactored handlers. The test passing is the operational
proof; without FORCE it should pre-fail.
