# 0033 — Cross-org project membership replaces the external-guest / resource-shares role

Status: accepted (2026-07-13, grilling session). **Supersedes** the E-RBAC-10
`resource_shares` sharing arc and **amends ADR 0032**: the editor-share branch
(L8), the questionnaire-share regression fix (migration 00050, R1), and the
L11 rationale all rest on a `guest` role this ADR removes. Preserves ADR 0032's
core (single `authorize()`, tiered project scope, RLS-independent decisions via
SECURITY DEFINER, org-level narrowing-only custom roles).

## Context

The platform has **two** ways a person who is not a full org member can touch a
resource:

1. **Anonymous fillout** — a participant with no auth and no role fills out a
   published questionnaire. This is the product's reason to exist.
2. **The `guest` role** — `resource_shares` (E-RBAC-10): an external, non-member
   collaborator holding a share grant reads a shared questionnaire's analytics,
   or (editor share) makes scoped edits.

The guest role is the single largest source of authorization intricacy: a
`resource_shares` table, ~10 SECURITY DEFINER share functions + dual RLS
policies across `projects`/`sessions`/`responses`/`interaction_events`/
`session_variables`, seven `shares.rs` handlers, share branches inside every
`verify_*` gate and `require_permission`, an expired-share purge, and a whole
frontend surface (`ShareDialog`, `guestAnalytics`, the `/shared` route). It was
the source of the `resource_shares:486` regression this arc just fixed. It also
duplicates a capability the platform already has: `project_members` carries a
`ProjectRole` and is already admitted by the ADR 0032 tiered `verify_project_access`
gate. The only thing stopping `project_members` from serving external
collaborators is the `trg_project_members_org_check` trigger (00009), which
requires every project member to be an org member.

## Decision

**Delete the guest role. External collaboration is cross-org project
membership.** One collaboration mechanism (project membership, with roles)
instead of two; it reuses the `ProjectRole` tiers and the `authorize()` path
from ADR 0032 rather than a parallel share vocabulary. Anonymous fillout is
untouched.

- **Remove** `resource_shares` (table + data), `shares.rs`, the share SECURITY
  DEFINER functions + share RLS branches, the expired-share purge, and the
  frontend `ShareDialog` / `shares.ts` / `guestAnalytics.ts` / `/shared`
  analytics route. The cross-org member reads through the *normal* project /
  questionnaire analytics views.

- **Cross-org project membership.** Drop `trg_project_members_org_check`
  (00009) and the `verify_org_membership(target)` requirement at
  `projects.rs:651`, so a `project_members` row need not be an org member. A
  cross-org project member is a member of **that one project only** — invisible
  at org scope. Org membership stays its own concept (org roles govern org-wide
  admin, member management, tenant settings).

- **Study-data RLS swap.** Replace the `…_via_share` branches on `sessions` /
  `responses` / `interaction_events` / `session_variables` and the `projects`
  share branch with **`is_project_member`-based branches** (the SECURITY DEFINER
  helper already exists, 00033). This is the same deliberate, *scoped*
  cross-tenant grant shares provided — a cross-org member sees only that
  project's data and nothing else in the org — keyed on project membership
  instead of a share row. Tenant isolation posture is unchanged.

- **`project_invitations` flow.** A dedicated table + handlers mirroring
  `organization_invitations` at project scope (`project_id`, `email`,
  `ProjectRole`, `token`, `status`); accept → a `project_members` row; supports
  not-yet-registered emails. This is the structural replacement for share's
  invite-by-email — invitations that mean "collaborate on one project" stay
  distinct from those that mean "join the org."

- **Authz-layer consequences** (stated so none is silent):
  - `verify_questionnaire_access`: `org-member OR share` → **`org-member OR
    project-member`** of the questionnaire's project.
  - `verify_project_write_access` (the tiered gate's Editor arm): **loses the
    edit-share branch** — an external editor is now a project `Editor` member.
    This **reverts ADR 0032 L8** (the editor-project-share write path).
  - `require_permission`: the non-org-member **share pass-through becomes a
    project-member pass-through**. A cross-org project member carries no org
    custom role, so the org-scoped tightening passes them through, gated solely
    by the coarse project gate. Without this, `authorize()` (coarse gate admits
    the project member, then tightening) would deny them at the tightening
    layer — this is the load-bearing change that makes cross-org membership work
    end to end.
  - **Migration 00050 is superseded** (dropped — no questionnaire-share guest to
    admit); the edit-share branch is removed from `user_has_project_access`
    (00051); the R1 `authz_matrix` test is rewritten (guest → cross-org project
    member). The divergence ledger records each reversion of committed 0032
    share behavior.

- **Existing share data** is dropped (dev carries no production data). Any real
  environment would first run a one-time migration converting active shares to
  `project_members` rows before applying this ADR's teardown.

## Rollout

A destructive-and-replace arc; not a mechanical sweep, so each step is gated
and committed separately:

1. **Data-read path first** (no user-visible change): add the `is_project_member`
   RLS branches to the study-data tables and the `project-member` branch to
   `verify_questionnaire_access`, alongside the existing share branches. Both
   admit; behavior unchanged. Prove with a cross-org-project-member read test.
2. **Cross-org membership:** drop the org-check trigger, allow non-org
   `add_project_member`, add the `require_permission` project-member
   pass-through. Prove a cross-org member authorizes end to end.
3. **`project_invitations`** table + handlers + accept route + frontend invite
   UI.
4. **Teardown:** remove `resource_shares` (table + API + functions + share RLS
   branches + purge), the frontend share surface, migration 00050's policy, the
   edit-share branch; rewrite the R1 test. Drop share data.

**Gate:** `rls_enforcement` / `authz_matrix` / project-isolation suites stay
green, **plus** new tests proving (a) a cross-org project member reads *only*
that project's data (tenant isolation intact), (b) the project-invitation accept
flow lands a `project_members` row without org membership, (c) an org
viewer / non-member is denied. Every reversion of committed 0032 share behavior
gets a ledger row.

## Rejected

- **Keep shares; just don't extend them to comments/series.** Leaves the single
  largest authz-complexity source in place (dual RLS, definer functions,
  cross-tenant edge cases, the class of the `resource_shares:486` bug) to serve
  a capability `project_members` already covers.
- **External collaborators must join the org** (drop shares, keep the org-check
  trigger). Simplest teardown, but forces an outside co-author / reviewer into
  full org membership — too coarse; a per-project collaborator should not gain
  org-wide visibility.
- **Overload `organization_invitations` with a project scope.** Fewer tables,
  but muddies a flow whose meaning is "join the org." A dedicated
  `project_invitations` keeps the two intents legible.
- **Bundle the comment/series fold into this ADR.** Mixes a structural teardown
  with unrelated feature bug-fixes — the muddy-change failure the divergence
  ledger exists to prevent. Split to ADR 0034 (trivial once guests are gone).
