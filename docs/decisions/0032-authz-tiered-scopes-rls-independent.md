# 0032 — Authorization vocabulary: tiered project scope, read-only questionnaire scope, RLS-independent decisions

Status: accepted (2026-07-13, grilling session). Continues ADR 0030 (whose
`authorize()` sweep is ~27/70 sites done) and sharpens ADR 0013's posture:
RLS stays a defense-in-depth net, but authorization decisions are now
**independent** of it. Motivated by a live regression — see below.

## Context

Three gaps in ADR 0030's `authorize()`, two named on its own divergence
ledger and one found the hard way:

1. **`Scope` cannot express the tiers the handlers enforce.** At org scope
   `authorize` derives the required role per-permission via
   `min_org_role_for`. At project scope it collapses to a **binary** gate —
   `verify_project_read_access` (Viewer) or `verify_project_write_access`
   (Editor) — keyed on `is_read_permission`. So `ProjectDelete`,
   `ProjectManageMembers`, and `QuestionnaireDelete` all resolve to the
   Editor gate, and the six sites that genuinely need project-Admin stay on
   inline `has_project_role(ProjectRole::Admin)` outside `authorize`. At
   questionnaire scope there is **no** read/write distinction at all —
   `verify_questionnaire_access` is membership-or-share, so a write routed
   through `Scope::Questionnaire` would admit any active org member.

2. **`authorize`'s internal queries are RLS-subject.** The coarse gate and
   the org resolver run on the request's RLS-pinned connection. A cross-org
   guest holding a *questionnaire* share is admitted by the coarse gate
   (`verify_questionnaire_access` ORs in the `SECURITY DEFINER`
   `user_can_read_questionnaire_via_share`, RLS-immune) but the org resolver
   `get_questionnaire_org_id` is a plain `SELECT … FROM projects` — and
   `00041` gave `projects` a *project*-share SELECT branch but no
   *questionnaire*-share branch. Result: the guest resolves to no org and
   the read 404s "Questionnaire not found", even though every downstream
   policy would admit it. This shipped as an uncommitted regression on the
   ADR 0030 sweep (`tests/resource_shares.rs:486`), fixed at the RLS layer by
   migration `00050`. The deeper fault: an authorization outcome was hostage
   to RLS-policy completeness — a fail-closed-as-404 that reads as "not
   found" and hides the real bug.

3. **"Behavior-preserving" was unfalsifiable.** ADR 0030 promised a
   divergence ledger; none exists in the repo. The regression in (2) is
   precisely a silent semantic change a ledger-plus-test discipline would
   have surfaced.

## Decision

**Authorization is a self-contained decision, independent of RLS.** RLS
remains a second, *independent* defense-in-depth net on data queries; it can
no longer produce a wrong authorization answer. Two independent nets, not
one whose holes corrupt the other. (Consciously overrides the "checks
benefit from RLS" note in `api/access.rs`.)

**Project scope becomes tiered.** A `min_project_role_for(Permission) ->
ProjectRole` mapping backs one gate `verify_project_access(project_id,
user, required: ProjectRole)`, replacing the read/write pair. It preserves
all three admission branches at each tier: project-member role ≥ required,
**OR** org admin/owner override, **OR** an active `resource_shares` grant of
sufficient tier. `authorize`'s `Scope::Project` arm calls it with the
mapped tier. The six inline `has_project_role(Admin)` sites fold in as
`authorize(Scope::Project, ProjectDelete | ProjectManageMembers)`.

**Questionnaire scope is read-only.** All questionnaire mutations authorize
at `Scope::Project` against the parent project's tier — a questionnaire's
editability *is* its project's editability. `Scope::Questionnaire` keeps
only the share-aware `verify_questionnaire_access` read gate. An invariant
(debug-assert + exhaustive typing) rejects any non-read permission at
questionnaire scope, so a future write mis-routed there fails loudly rather
than under-gating to membership. Editor-*questionnaire*-shares confer read
only today (no write gate honors them) — recorded as a deliberate
non-feature, not a bug.

**Tiers strictly preserve current behavior.** `min_project_role_for`
mirrors what the handlers enforce today: Read-family → Viewer;
`ProjectWrite`/`QuestionnaireWrite`/`QuestionnairePublish`/
`QuestionnaireDelete` → Editor; `ProjectManageMembers` → Admin;
`ProjectDelete` and the new `ProjectTransferOwnership` → **Owner**
(corrected 2026-07-13 in step-2 review: `delete_project` and
`transfer_project_ownership` require project *owner* or org admin, not
Admin — the grill's "ProjectDelete→Admin" was wrong; ledger L6/L7). The
tiered gate applies the **org owner/admin override at every tier**
(Viewer/Editor already did; Admin/Owner gain it in step 2 so folding the
inline "project X+ OR org admin+" sites is behavior-preserving — ledger
L5). `ProjectTransferOwnership` is a new closed-enum `Permission` (Owner
tier; org Owner+Admin defaults). Tiers one *might* raise for org/project
consistency
(`QuestionnaireDelete`→Admin, `QuestionnairePublish`→Admin — note org scope
already ranks Delete above Publish) are **candidates on the ledger**,
decided separately with their own UX review. A vocabulary refactor must not
silently move who-can-delete — that is the exact failure mode of the
regression above.

**RLS-immunity via `SECURITY DEFINER` functions.** Every query inside
`authorize()` — coarse gates *and* org resolvers — runs through a
`SECURITY DEFINER` function that sees true rows, the idiom `00041` already
uses. State-of-the-art (2026) for app-centric authorization endorses this
over a BYPASSRLS side-connection, which no source recommends in the request
path and which would break single-transaction consistency. Definer
functions run inline on the request connection/transaction, so they still
see uncommitted rows. **Hardening rules are acceptance criteria** (per the
documented footguns): pinned `search_path` (`pg_catalog, public, pg_temp`,
`pg_catalog` first, or empty); user id taken as an explicit argument, never
`current_user`; `REVOKE EXECUTE FROM PUBLIC` then `GRANT` to `qdesigner_app`
only; no unfiltered dynamic SQL; owner audited (owned by the BYPASSRLS
`qdesigner` role is *how* they bypass — so each is itself a privilege
boundary).

**`Scope` stays three variants** — `Organization`, `Project`,
`Questionnaire` — with an **exhaustive** `(scope, permission) -> gate`
match (no wildcard arm), so a newly-added `Permission` fails to compile
until its tier is declared. Media authorizes at `Scope::Organization`
(`min_org_role_for`); session/response *reads* at `Scope::Questionnaire`;
session/response *writes* are the anonymous participant path (no user to
authorize). No resource with no independent ownership row gets its own
scope.

**Custom roles stay org-level, narrowing-only.** `require_permission`
remains the org-scoped tightening layer; a custom org-role can only
*narrow* within the coarse ceiling, uniformly at every scope (deny-wins).
Because the coarse gate now carries the tier at project scope too, the ADR
0030 ledger item "system-role pass-through skips tiers below org" is
resolved — it no longer skips them. Project-scoped custom roles are out of
scope (a new `project_roles` table + second tightening layer, no current
demand; `resource_shares` already covers scoped external access).

## Rollout

Three behavior-preserving steps, each green and committed separately, never
mixing a refactor with a semantic change:

1. Add `min_project_role_for` + tiered `verify_project_access` + the
   `SECURITY DEFINER` gate/resolver functions as pure groundwork; the matrix
   test proves equivalence.
2. Fold the six inline `has_project_role(Admin)` sites into `authorize`.
3. Complete the remaining ~43 ADR 0030 sweep sites on the finished
   vocabulary.

**Guardrails as acceptance criteria:**

- **A real in-repo divergence ledger** at
  `docs/decisions/0030-divergence-ledger.md`. Any site where post-sweep
  semantics ≠ pre-sweep semantics gets a row (site, old gate, new gate,
  why). An empty ledger under a "behavior-preserving" claim is the fiction
  that hid the 404.
- **Regression-locking `authz_matrix` tests:** (a) project-Editor is denied
  `ProjectDelete`/`ProjectManageMembers` but allowed `ProjectWrite`;
  (b) the read-only-questionnaire invariant trips if a write permission is
  routed through `Scope::Questionnaire`; (c) a cross-org questionnaire-share
  guest resolves org and reads analytics through the full `authorize()`
  path — the exact case that broke, locked so the definer-resolver
  conversion cannot regress it.
- **Keep migration `00050`.** Under this ADR `authorize` no longer *depends*
  on the `projects` questionnaire-share policy, but the two-independent-nets
  principle keeps it as RLS defense-in-depth for genuine guest *data* reads
  (the guest analytics view), not as an authz crutch.

`rbac_integration` and `rls_enforcement` stay green untouched at every step,
proving preservation.

## Rejected

- **Keep authz RLS-coupled, patch policies per gate (posture A).** Every new
  `(scope, permission)` gate would need a matching RLS policy or silently
  404. `00050` unblocks the immediate case, but the maintenance tax is
  permanent and the failure mode is a mis-authorization masquerading as
  not-found. Rejected in favor of decoupling.
- **BYPASSRLS side-connection for authz (mechanism 5b).** One mechanism, no
  per-query functions — but it runs authz outside the request transaction
  (cannot see uncommitted rows; breaks create-then-check) and threads a
  BYPASSRLS path into the application hot path. Not an endorsed pattern.
- **New `Scope::Media` / `Scope::Session` variants.** Self-documenting call
  sites, but ceremony for resources always reached through a parent with no
  independent ownership row. The richer permission→gate mapping expresses
  the need without growing the scope set.
- **Correct delete/publish tiers while sweeping.** Raising
  `QuestionnaireDelete`/`QuestionnairePublish` to Admin now is one migration
  instead of two rounds, but folds a live authorization change into a
  vocabulary refactor — the precise mistake this ADR exists to prevent.
  Ledgered as separately-reviewed candidates instead.
- **Build a questionnaire-scoped write gate now** to activate editor
  questionnaire-shares. A plausible research-collaboration feature, but
  currently dormant (no write path honors it) and expressible later; keeping
  questionnaire scope read-only is the smaller, safer vocabulary.
- **Project-scoped custom roles.** Speculative; `resource_shares` covers
  scoped external access today. A future ADR if a customer needs per-project
  custom permission sets.
