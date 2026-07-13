# ADR 0030 / 0032 — authorization sweep divergence ledger

Mandated by ADR 0032. The ADR 0030 `authorize()` sweep and the ADR 0032
vocabulary work claim to be **behavior-preserving**. This file is the proof
obligation: **any call site where post-sweep semantics ≠ pre-sweep
semantics gets a row here**, reviewed on its own. An empty ledger under a
"behavior-preserving" claim is the fiction that hid the `resource_shares:486`
404 regression — never let this file lie by omission.

Append a row when you convert a site whose effective check changes, when you
find a pre-existing asymmetry, or when you defer a tier change as a
candidate. A purely mechanical 1:1 conversion needs **no** row.

## Resolved by ADR 0032

| # | Site / concern | Pre-sweep behavior | Post-0032 behavior | Status |
|---|----------------|--------------------|--------------------|--------|
| L1 | System-role pass-through below org scope | Only org scope enforced per-permission tiers; project/questionnaire coarse gate was binary read/write | Project scope carries the tier via `min_project_role_for`; questionnaire scope is read-only — the coarse gate enforces tiers at every scope | Resolved (design) |
| L2 | Questionnaire scope has no write-tier gate (`verify_questionnaire_access` is membership-or-share) | A write routed through questionnaire scope would admit any active org member | Questionnaire scope is read-only; all mutations authorize at `Scope::Project`; invariant rejects non-read permissions at questionnaire scope | Resolved (design) |
| L3 | Project delete/manage gated by inline `has_project_role(Admin)` (6 sites) | Six handlers gate outside `authorize` because it had no Admin tier | Fold into `authorize(Scope::Project, ProjectDelete \| ProjectManageMembers)` via the tiered gate (rollout step 2) | Pending impl — **see L5 first** |
| L5 | **Step-2 blocker (found in step-1 review):** the definer gate's `'admin'`/`'owner'` tiers reproduce `has_project_role` = **project_members role only**. But the 6 inline sites gate on **"project admin+ OR org admin+"** (`projects.rs` 664/786/877) and **"project owner OR org owner/admin"** (500/1069) — they OR `has_project_role` with an **org-role override**. | Inline: org owner/admin passes even with no project_members row | If step 2 folds these sites into `verify_project_access(Admin/Owner)` as-is, an org admin/owner who is not a project member is **denied** — a silent tightening. | **Before step 2:** add the org owner/admin override branch to the `'admin'`/`'owner'` arms of `user_has_project_access` (00051), then fold. Dormant in step 1 (no swept site hits these tiers); suite green. |
| L4 | Custom-role grants can never widen past the coarse ceiling | Deny-wins: coarse gate first, custom role narrows only | Unchanged — reaffirmed as intended, not a divergence | Resolved (by design) |

## Regression already fixed (not a divergence — a break the sweep introduced)

| # | Site | Break | Fix |
|---|------|-------|-----|
| R1 | `list_sessions` / `timeseries` / arm-counts for a cross-org **questionnaire-share** guest | Sweep routed reads through `authorize()`, whose `get_questionnaire_org_id` is RLS-subject; `projects` had no questionnaire-share SELECT branch → org unresolved → 404 "Questionnaire not found" | Migration `00050` adds `projects_select_via_questionnaire_share` (RLS layer). ADR 0032 additionally makes the resolver `SECURITY DEFINER` so authz stops depending on the policy. Regression-locked in `authz_matrix`. |

## Step-2 folds (the 6 inline sites — heterogeneous, characterized in review)

| # | Site | Was (inline) | Folds to | Behavior note |
|---|------|--------------|----------|---------------|
| L6 | `delete_project` (projects.rs:500) | project **Owner** OR org admin | `authorize(Scope::Project, ProjectDelete)` with `ProjectDelete` **→ Owner** | Corrects the grill's ProjectDelete→Admin error. Owner tier + org override = same *authorization* outcome; cross-tenant/absent-project *status code* changes 404→403 — see L11. |
| L7 | `transfer_project_ownership` (projects.rs:1069) | project **Owner** OR org admin | `authorize(Scope::Project, ProjectTransferOwnership)` — **new** Owner-tier `Permission` (org Owner+Admin defaults) | User decision 2026-07-13: add the permission rather than reuse `ProjectDelete` (which would corrupt custom-role tightening). |
| L8 | `update_project` (projects.rs:376) | project **Editor** OR org admin, **no share branch** | `authorize(Scope::Project, ProjectWrite)` | **Loosening:** the Editor gate adds the editor-project-share path, so an external editor-share holder can now edit project settings. Deliberate (user decision) — matches what an editor share is for. |
| L9 | `add`/`update`/`remove_project_member` (664/786/877) | project **Admin** OR org admin | `authorize(Scope::Project, ProjectManageMembers)` (Admin tier) | Byte-identical once L5 adds the org override. |
| L10 | **All six folds add `require_permission` tightening** they lacked inline | inline sites ran no custom-role tightening | folded sites run the org-scoped custom-role tightening | This is ADR 0030's explicit deliverable ("custom roles that deny … actually take effect"), now reaching project mutations. Design, not regression — a custom-role member must now hold the permission. |
| L11 | `update_project` / `delete_project` cross-tenant & absent-project **denial status code** (found in step-2 gate: `http_access_denial.rs`) | 404 "Project not found" — handlers resolved the org via a plain RLS-subject `SELECT … FROM projects` **first**, which the 00014 SELECT policy hides from a non-member → NotFound | 403 "No write access to this project" — `authorize()` runs the SECURITY DEFINER tiered gate **before** the resolver, so a cross-tenant/absent caller is denied at the gate | **Accepted (user decision 2026-07-13).** The 404 was an incidental RLS-ordering artifact (the test's own header doc said so), not an existence-hiding policy; questionnaire mutations already returned 403. Converges the whole surface on 403 and removes the GET-404/PATCH-403 split. Two `http_access_denial` assertions + the suite header updated 404→403. |

## Candidate tightenings (deferred — decide separately, do NOT fold into the sweep)

| # | Change | Rationale to consider | Rationale to defer |
|---|--------|-----------------------|--------------------|
| C1 | `QuestionnaireDelete` → Admin (currently Editor at project scope) | Org scope already ranks Delete above Publish (Member has Publish, not Delete); consistency | Changes who-can-delete-a-questionnaire — a live authorization/UX change, must not ride inside a vocabulary refactor |
| C2 | `QuestionnairePublish` → Admin (currently Editor) | Publishing makes a study live to participants — arguably an Admin act | Same as C1; today Editors publish, and that may be the intended research workflow |

## Step-3 sweep completion — intentionally unfolded sites & non-sites

The final ADR-0030 call-site sweep (hybrid strategy: route a site through
`authorize()` only where a permission reproduces the exact current gate; add no
new `Permission` variants; fix no authorization bug). Sites that do **not** map
1:1 to an existing `(scope, permission)` at the right tier stay unfolded and are
recorded here; their `access::verify_*` / `require_permission` halves stay
`pub(crate)`.

| # | Site | Current gate | Why unfolded (not converted) |
|---|------|--------------|------------------------------|
| L12 | `comments.rs` — list (81, read), create (129), update (180), delete (255) | `access::verify_questionnaire_access` (read-level membership-or-share) on **all four**, writes included | Intentionally unfolded divergent site (ADR 0030 §Rollout sanctions this) — there is **no** Comment `Permission`, and ADR 0032 made `Scope::Questionnaire` read-only so the create/update/delete mutations cannot route there. Folding deferred until a dedicated Comment permission exists **and** the audit-tracked bug (comment cross-author rewrite) is fixed. Halves stay `pub(crate)`. |
| L13 | `series.rs` — create (186), list (236), get (275), update/cancel (349), send-now (461) | `access::verify_questionnaire_access` (read-level membership-or-share), writes included | Intentionally unfolded divergent site (ADR 0030 §Rollout sanctions this) — no Series `Permission`; ADR 0032 made `Scope::Questionnaire` read-only so its mutations can't route there. Folding deferred until a dedicated Series permission exists **and** the audit-tracked bug (series read-only-guest mutation) is fixed. Halves stay `pub(crate)`. |
| L14 | `sessions/analytics.rs:369` — `cross_project_analytics` | inline org-membership `EXISTS` check (348-363) **then** `require_permission(SessionRead)` at org scope | The endpoint is **cross-project** (`/api/organizations/{org_id}/analytics`, a comma-separated `questionnaire_ids` list spanning many resources) — it has no single questionnaire scope, so per the sweep directive no scope is forced. It *would* fold byte-identically to `authorize(Scope::Organization(org_id), SessionRead)` (min_org_role_for(SessionRead)==Viewer == the inline membership check; same `require_permission` tightening) — recorded as a foldable candidate but **left as a documented divergent site** this pass. Halves stay `pub(crate)`. |
| L15 | `sessions/sync.rs:71` — `sync_session` unpublished-questionnaire branch | `access::verify_questionnaire_access` for an authenticated user, inside the anonymous offline-session bootstrap | **Participant / fillout path** — runs under the fillout RLS GUC (`app.session_id`), not the standard `rls_context`, and the gate is a nested branch only reached when an authenticated author syncs an *unpublished* questionnaire's offline session. Routing through `authorize` would add org-scoped `require_permission` under the fillout GUC (ambiguous RLS visibility). Left unfolded. Halves stay `pub(crate)`. |
| L16 | `sessions/models.rs:1189` — `ensure_session_access` | `access::verify_questionnaire_access` after a session→questionnaire lookup | **Shared helper, 4 callers** (`crud.rs` 419/486/527/570); its signature carries no `RbacManager`, so folding would thread `rbac` through every caller. A pure read gate that maps to `Scope::Questionnaire` in principle, but left as a shared helper this pass (no vocabulary/behavior change intended). Halves stay `pub(crate)`. |
| L17 | `sessions/models.rs:1227` — `ensure_session_participant_or_member` | published → allow anonymous; else `access::verify_questionnaire_access` for the authenticated user | **Participant path + shared helper, 4 callers** (`crud.rs:612`, `ingestion.rs:32`, `sync.rs` 118/415). Admits anonymous participants when the questionnaire is published (no user to authorize); the authenticated branch is a read gate. Left unfolded — participant path, ambiguous scope. Halves stay `pub(crate)`. |

### Non-sites (not authorization gates — do not convert)

| Site | What it is |
|------|------------|
| `projects.rs:651` — `access::verify_org_membership(target_user, org_id)` (inside `add_project_member`) | **Not an authz gate.** It validates the *invited target user's* org membership (mapped to a `BadRequest` "must be an active member of the organization") — a data-validation precondition, not a check on the caller. Leave as `verify_org_membership`; the caller's own authorization runs separately via the project-member gate. |

### Converted-site note (cosmetic 403 message change)

| Site | Change |
|------|--------|
| `shares.rs` — `authorize_manage_shares` (was inline `has_project_role(Admin) OR has_org_role(Admin)`, lines 119/125) | **Converted** to `authorize(Scope::Project(project_id), ProjectManageMembers)`. The `00052` `'admin'` arm is `project_members(owner,admin) OR org_members(owner,admin)` — byte-identical *authorization* outcome to the former pair; adds the org-scoped custom-role tightening (ADR 0030 deliverable). The denial **message** changes `"Requires project admin or org admin to manage shares"` → `"Insufficient project role for this action"` (still `403 Forbidden`; no test asserts the old text). |

## Superseded by ADR 0033 (guest role removed)

ADR 0033 deletes the `resource_shares` / guest role and replaces it with
cross-org project membership. Several committed ADR-0030/0032 behaviors that
existed *only* to serve the guest role are reverted there; recorded so the
reversals are not silent:

| # | Committed behavior | ADR 0033 disposition |
|---|--------------------|----------------------|
| S1 | Migration `00050` `projects_select_via_questionnaire_share` (fixed the `resource_shares:486` guest 404) | **Dropped** — no questionnaire-share guest exists. Cross-org project members resolve the project row via the `is_project_member` branch instead. |
| S2 | L8 — `update_project` fold added the editor-project-share write path | **Reverted** — the edit-share branch is removed from `user_has_project_access` (00051); an external editor is now a project `Editor` member. |
| S3 | R1 — `authz_matrix` cross-org questionnaire-share-guest test | **Rewritten** — asserts a cross-org *project member* reads analytics end to end (same isolation property, new mechanism). |
| S4 | L14 note — `shares.rs::authorize_manage_shares` converted to `authorize(...)` | **Moot** — `shares.rs` is deleted entirely. |
| S5 | `verify_questionnaire_access` / `verify_project_*` / `require_permission` share branches | **Removed**; replaced by project-member branches / project-member pass-through (ADR 0033 §Decision). |

## Deferred to ADR 0034 (comment/series)

L12 (comments) and L13 (series) stay unfolded until ADR 0034, which — with the
guest role gone (ADR 0033) — folds them cleanly at `Scope::Project` (option B)
and fixes their two audit bugs (comment cross-author body rewrite; series
read-level-gated writes). Their `verify_*` halves stay `pub(crate)` until then.

## How to use during the ADR-0030 sweep completion (~43 sites remaining)

For each converted site: if the effective check is identical, no row. If it
differs — a missing half restored, an odd permission corrected, a status
code changed (e.g. a specific 403 message becoming the generic
`authorize()` text, or a new 404 for a soft-deleted resource) — add a row
with site, old gate, new gate, and why. The audit found ~22 read sites the
0030 sweep tightened (custom-role read denials now take effect); that
tightening is ADR 0030's explicit deliverable, so it is design, not
divergence — but note it here once for the record.
