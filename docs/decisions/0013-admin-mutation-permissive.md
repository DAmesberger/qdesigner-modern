# ADR 0013 — Admin-table mutation policies: permissive `WITH CHECK (true)`

**Status:** Accepted (2026-05-15). Records decision D2 of the Phase 6
plan ([PHASE_6_PLAN.md](PHASE_6_PLAN.md)). Refines the deferred-work
scope in [ADR 0011](0011-rls-infra-only.md) §"What's deferred"
("INSERT/UPDATE/DELETE policies …"). Picks option D2a from the
plan's deliberation.

## Decision

INSERT, UPDATE, and DELETE policies on the admin tables (`users`,
`organizations`, `organization_members`, `projects`, `project_members`,
`media_assets`) are **permissive**: `WITH CHECK (true)` / `USING
(true)`. They unblock writes from the non-superuser application role;
they do not re-encode the authorization rules already enforced by
`api/access::*` and `RbacManager`.

RLS's role on admin tables is **SELECT-side cross-tenant denial** only.
Application-side checks remain the sole gate for "is this user
allowed to perform *this mutation*."

## Why permissive

The alternative considered (option D2b) was to translate
`api/access::*` rules into per-action policy clauses — e.g.,
`projects_update USING (EXISTS (SELECT 1 FROM organization_members
WHERE … role IN ('owner','admin') …))`. The cost analysis from the
Phase 6 planning round:

- **Duplication.** The same rules then live in two places (Rust
  handlers and SQL policies). Either source can drift. The natural
  failure mode (policy more permissive than handler) hides as
  inconsistency: requests succeed at the DB layer but get denied by
  the handler, or worse, vice-versa. ADR 0010 §"Why partial FORCE"
  flagged this attractor explicitly.
- **Reviewability.** A policy walking `organization_members` joins is
  not obviously the same expression as the handler's permission check.
  Mismatches surface as production defects, not compile errors.
- **Coverage gap.** Even rule-encoding policies wouldn't catch every
  attack pattern `api/access::*` catches today, because some checks
  (e.g., quota limits, soft-delete tombstones, status transitions)
  aren't naturally expressible as RLS predicates without joining
  state that doesn't exist in the row being mutated.

D2a (permissive) accepts that RLS is not the mutation-authorization
layer. Its value is cross-tenant SELECT denial: a SQL-injection or
compromised handler that issues `SELECT * FROM projects WHERE …`
without an `api/access::*` gate is forced through the policy and sees
only the bound user's projects. That covers the realistic threat
without the duplication tax.

## Policy shape

Pattern repeated for each admin table:

```sql
CREATE POLICY users_insert_all ON users FOR INSERT WITH CHECK (true);
CREATE POLICY users_update_all ON users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY users_delete_all ON users FOR DELETE USING (true);
```

Existing `00014` SELECT policies stay; this ADR adds three new policies
per table without changing the SELECT rules. Migration
`00020_admin_mutation_policies.sql` is mechanical.

## Consequences

- 18 new policies across 6 tables.
- `api/access::*` remains the load-bearing authorization layer.
  Future maintainers must not assume RLS will catch a missing
  permission check — it won't on mutations.
- A future ADR could supersede this one with rule-encoded policies if
  the threat model shifts (e.g., "compromised app credentials issuing
  direct mutations bypassing the handler"). That's a real threat in
  some operational models; QDesigner's current one (handlers behind a
  trust boundary, RLS as second-line SELECT defence) doesn't motivate
  the cost.
- The mutation policies are deliberately distinguishable in the
  migration file with the `_all` suffix to signal "permissive,
  intentional, not a leak." Future schema-grep audits should look for
  policy names ending in `_all` as a checklist of where rule-encoding
  could later land.

## What this ADR explicitly does *not* defer

The plan-decoration alternative — "drop RLS from admin tables entirely
since `api/access::*` is the real gate" — was rejected. The SELECT
defence-in-depth value is real (cross-tenant cookie-confusion or
SQL-injection bugs) and the cost (18 trivial policies) is low.
