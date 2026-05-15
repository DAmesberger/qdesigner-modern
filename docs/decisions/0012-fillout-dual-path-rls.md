# ADR 0012 — Fillout-path RLS: Option C (dual-path GUC)

**Status:** Accepted (2026-05-15). Records decision D1 of the Phase 6
plan ([PHASE_6_PLAN.md](PHASE_6_PLAN.md)). Refines the deferred-work
scope in [ADR 0011](0011-rls-infra-only.md) §"What's deferred"
("Fillout-path strategy"). Forward reference target from
[ADR 0010](0010-rls-force.md) §Alternatives → "C — Session-token GUC for
anonymous fillout" (the alternative this ADR adopts).

## Decision

Fillout-path tables (`sessions`, `responses`, `interaction_events`,
`session_variables`) get **dual-path** RLS policies that admit either
of two GUCs set by request-scoped middleware:

- `app.user_id` (UUID) — set when the request carries a valid JWT.
- `app.session_id` (UUID) — set from the URL/body session id on
  fillout-path requests, authenticated or anonymous.

Both can be set on the same request (an authenticated user filling out
their own questionnaire). Policies combine the two with `OR` semantics.

`questionnaire_definitions` is **excluded** from RLS entirely
(`DISABLE ROW LEVEL SECURITY`): the public `GET /api/q/by-code/{code}`
endpoint is intentional product behaviour, and admin-side access flows
through the `projects` table whose RLS is enforced.

## Why Option C

ADR 0010 § "Alternatives considered" listed three live candidates after
the Phase 5 spike confirmed full-FORCE was unreachable:

- **B** — full FORCE + permissive INSERT/UPDATE/DELETE on all tables.
  Doesn't address fillout because the existing SELECT policies still
  reduce to `user_id = NULL` for anonymous fillout. Anonymous traffic
  would lose read access to its own sessions.
- **C** — session-token GUC. Anonymous fillout sets `app.session_id`
  from the URL; SELECT policies admit either `user_id`-based
  membership *or* `session_id` match. Cleanest end state; biggest
  design lift.
- **Drop RLS from fillout-path tables.** Trivially makes fillout work
  but abandons the defence-in-depth claim for the tables that carry
  the most sensitive data (raw responses).

D1 picks **C**, with the dual-path twist that the GUCs are independent
rather than alternative — authenticated and anonymous fillout share
policy shape, differentiated only by which GUC the middleware bound.

`questionnaire_definitions` is exempted because its public-read
endpoint is a feature, not a leak: anyone who knows the questionnaire
code is allowed to fetch it (that's how filling out works). Putting
RLS on a table whose public read is intentional adds zero security and
forces every read path to set a GUC for no enforcement benefit.

## Policy shape

`sessions` (template; the other three fillout tables join through it):

```sql
CREATE POLICY sessions_select_dual ON sessions FOR SELECT USING (
  (current_app_user_id() IS NOT NULL AND user_id = current_app_user_id())
  OR
  (current_app_session_id() IS NOT NULL AND id = current_app_session_id())
);
```

`responses`, `interaction_events`, `session_variables` follow the same
shape via `session_id IN (SELECT id FROM sessions WHERE …same dual
clause…)`. Parallel `WITH CHECK` clauses gate INSERT/UPDATE/DELETE.

Helper `current_app_session_id()` lands in migration `00021_…` and
mirrors `current_app_user_id()` from `00014`: `STABLE` SQL function
reading `current_setting('app.session_id', true)` with `NULLIF` /
`::uuid` cast.

## Middleware

A new sibling layer `set_fillout_rls_context` (next to Phase 5's
`set_rls_context`) is mounted on the OptionalUser router groups
(`/api/sessions/*` and the fillout-path subset). It:

1. Extracts JWT if present → sets `app.user_id`.
2. Extracts `session_id` from URL path or request body → sets
   `app.session_id`.
3. Begins the per-request transaction in the same shape as
   `set_rls_context` (Phase 5's `Tx` extractor reads it).

Authenticated-only routes continue on `set_rls_context` unchanged —
they never set `app.session_id`.

Separating the two layers (rather than branching inside
`set_rls_context`) keeps the authenticated path's behaviour byte-for-
byte identical to Phase 5; the fillout layer can evolve independently.

## Consequences

- New helper `current_app_session_id()` in migration `00021_fillout_dual_policies.sql`.
- 16 new policies across 4 tables (SELECT + 3 mutation actions each).
- `OptionalUser` handlers in `api/sessions.rs` stop using
  `&state.pool` directly; they take `Tx` like authenticated handlers.
- `questionnaire_definitions` loses its `00014` ENABLE + SELECT policy.
  Public-by-code reads continue working; admin-side reads still walk
  the `projects` RLS chain via the application's existing joins.
- Threat-model note: session URLs remain credentials. RLS enforces that
  a request bound to `app.session_id = X` can read only session X's
  data, but anyone with the URL can issue such a request. This was
  true pre-Phase-6 and the dual-path policies don't change it
  (PHASE_6_PLAN.md §Risks #6).
- One operational consequence is that the fillout middleware needs the
  session id *before* the handler runs, since the GUC is set during
  middleware. The middleware extracts it from URL path segments
  (`/api/sessions/{id}/…`) where present; for `POST /api/sessions`
  (create), no `app.session_id` is set and the INSERT policy admits
  via `app.user_id` OR by carrying the new session's id-to-be in the
  INSERT statement (sqlx `RETURNING` flow — the row is the one being
  inserted, the policy's `WITH CHECK` walks `user_id`-based admission
  if authenticated, or `id = current_app_session_id()` is vacuously
  inapplicable for create). Anonymous session creation is the only
  unguarded INSERT and that's by design — it's the entry point.

## Future considerations

- If anonymous fillout is ever removed (product decision), this ADR's
  `app.session_id` arm becomes dead code and the policies simplify to
  `user_id = current_app_user_id()`. Track via the deferred list.
- A second GUC (`app.session_token_hash`) could be added later to
  resist URL-id enumeration at the DB layer; out of scope for Phase 6.
