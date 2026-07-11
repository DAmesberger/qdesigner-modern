# 0030 — Single `authorize()` entry point for application-layer authorization

Status: accepted (2026-07-11, grilling session). Executes the consolidation
ADR 0008 named as legitimate future work ("consolidate the three-layer
authorization … into fewer layers"). Does not touch ADR 0013's posture:
RLS stays a separate DB-enforced defense-in-depth layer; application-side
checks remain the sole mutation gate.

## Context

Application-layer authorization is two calls today: a coarse membership/
role-tier gate (`api/access::verify_*`) plus RbacManager's custom-role
tightening (`require_permission`). `require_permission`'s own doc comment
states it "must be paired with the endpoint's existing coarse gate — it is
a tightening layer, not a standalone authorization": a member on a system
role passes through it. The pairing is enforced only by convention, so a
future endpoint calling `require_permission` alone silently admits every
system-role member. ~70 authenticated call sites across 162 handlers hold
half of a two-part check the type system knows nothing about.

## Decision

One entry point:

```rust
authz::authorize(executor, user_id, Scope::Project(id), Permission::QuestionnaireWrite).await?
```

- **Vocabulary:** reuse the existing `Permission` enum (it already carries
  `*Read` variants for every resource); `Scope` names the org / project /
  questionnaire the check is made against. The coarse membership gate is
  derived internally from the `Scope` — a caller cannot hold half the check.
- **Reads included.** Every authenticated handler check routes through
  `authorize()`, so custom roles that deny reads actually take effect.
  Anonymous paths (fillout by-code, ADR 0015 reads) are out of scope — there
  is no user to authorize.
- **Compile-time enforcement.** After the sweep, `access::verify_*` and
  `require_permission` become private to the `authz` module. Genuinely
  non-authorization utilities (role listing for admin UI) stay public under
  names that don't read as gates.
- **Signatures** follow the ADR 0011 convention: single-shot takes
  `impl PgExecutor<'_>`, multi-shot takes `&mut PgConnection`.

## Rollout

Standalone sweep, before the domain-core extraction arc. The sweep is
**behavior-preserving**: each site's current effective check maps 1:1 onto
`authorize()`; zero semantic change, mechanically reviewable. Every
divergence found (missing half, odd permission choice) goes into a ledger
and is fixed afterward in individually reviewed commits — authorization
changes never hide inside a rename diff.

Gate: a dedicated matrix integration test on the authz interface
(system role × custom-role override × scope × read/write permission),
explicitly covering the old footgun case — a system-role member with a
denying custom role must be DENIED through `authorize()` where bare
`require_permission` admitted. Existing `rbac_integration` and
`rls_enforcement` suites stay green untouched, proving preservation.

## Rejected

- **New `Action` enum** (one variant per operation): self-documenting, but
  ~70 authored variants and a new vocabulary competing with the `Permission`
  enum rather than replacing it.
- **Lint-enforced pairing** (keep both calls, add a clippy lint /
  debug_assert): interface stays two calls wide; the matrix still can't be
  tested in one place.
- **Mutations-only scope**: smaller sweep, but the half-check footgun
  survives on the read side and custom-role read denials stay silently
  ineffective.
- **Fix-as-we-go sweep**: a 70-site diff where some sites change semantics
  is unreviewable; a wrong "fix" is a silent privilege change.
