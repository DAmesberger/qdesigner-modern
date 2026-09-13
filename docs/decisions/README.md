# Architectural decisions

Reconciled 2026-09-11. Read the relevant decision and its successors before changing architecture. **Accepted** records a decision; it does not claim every implementation or acceptance gate is complete. Requirement outcomes remain binding unless explicitly changed (ADR 0038).

| ADR | Decision | Current status / relationship |
|---|---|---|
| 0001 | [Row-Level Security: fix properly](0001-rls.md) | RLS delivered; port plan superseded by 0009; application gate refined by 0030/0032. |
| 0002 | [Delete lib/pipeline](0002-pipeline.md) | Accepted; consult the decision for scope and historical context. |
| 0003 | [Scripting engine: one home at packages/scripting-engine](0003-scripting.md) | Package location retained; JavaScript retention superseded by 0039. |
| 0004 | [Adopt @qdesigner/* workspace aliases fully](0004-aliases.md) | Accepted; consult the decision for scope and historical context. |
| 0005 | [Keep questionnaire-core as a separate package](0005-types.md) | Accepted; consult the decision for scope and historical context. |
| 0006 | [Keep collaboration (Yjs); document it](0006-collaboration.md) | Accepted; consult the decision for scope and historical context. |
| 0007 | [Delete RbacManager and rbac middleware](0007-rbac-manager.md) | Superseded by 0008. |
| 0008 | [Retain RbacManager; delete only rbac/middleware.rs](0008-rbac-manager-retained.md) | Accepted; consult the decision for scope and historical context. |
| 0009 | [Phase 3.4 authors RLS policies; the dead migrations dir is not ported](0009-rls-author-not-port.md) | Accepted; consult the decision for scope and historical context. |
| 0010 | [Partial FORCE ROW LEVEL SECURITY (admin-side tables only)](0010-rls-force.md) | Superseded by 0011. |
| 0011 | [Phase 5 ships RLS infrastructure; enforcement deferred](0011-rls-infra-only.md) | Infrastructure delivered; enforcement deferral superseded by 0012–0015. |
| 0012 | [Fillout-path RLS: Option C (dual-path GUC)](0012-fillout-dual-path-rls.md) | Accepted; consult the decision for scope and historical context. |
| 0013 | [Admin-table mutation policies: permissive `WITH CHECK (true)`](0013-admin-mutation-permissive.md) | Accepted; consult the decision for scope and historical context. |
| 0014 | [Application role `qdesigner_app` (non-superuser, non-BYPASSRLS)](0014-qdesigner-app-role.md) | Accepted; consult the decision for scope and historical context. |
| 0015 | [RLS-exempt tables for intentional anonymous reads](0015-anon-read-rls-exempt.md) | Accepted; consult the decision for scope and historical context. |
| 0016 | [SUPERVISOR_PROTOCOL.md v2](0016-supervisor-protocol-v2.md) | Accepted; consult the decision for scope and historical context. |
| 0017 | [Open the Phase 7 Product-Completion & Wire-Up arc](0017-product-completion-arc.md) | Historical proposal; active work queue superseded by 0038. |
| 0018 | [Fillout Rendering Contract (Hybrid)](0018-fillout-rendering-contract.md) | Completed/refined by 0023. |
| 0019 | [Replace i18next with Paraglide (compile-time i18n, runtime/cookie locale)](0019-paraglide-i18n.md) | Accepted; consult the decision for scope and historical context. |
| 0020 | [Org member role-change endpoint](0020-org-role-change.md) | Accepted; consult the decision for scope and historical context. |
| 0021 | [Mount the analytics psychometrics suite](0021-analytics-psychometrics.md) | Mounted psychometrics; PCA numerical rationale refined by 0036, UI required by 0040. |
| 0022 | [Per-questionnaire content translation](0022-questionnaire-translation.md) | Accepted; consult the decision for scope and historical context. |
| 0023 | [Fillout Hybrid Rendering (Finalized)](0023-fillout-hybrid-rendering.md) | Accepted; consult the decision for scope and historical context. |
| 0024 | [sqlx compile-time query macros (offline mode) on the sessions hot path](0024-sqlx-offline-macros.md) | SQLx only; former duplicate hardware decision is 0037. |
| 0025 | [Trials materialize at generation time; the engine never samples](0025-generation-time-materialization.md) | Accepted; consult the decision for scope and historical context. |
| 0026 | [Reaction media is offline-complete at load and fail-closed at run](0026-media-fail-closed-offline.md) | Accepted; consult the decision for scope and historical context. |
| 0027 | [Timing-validity problems record by default; stopping is opt-in](0027-validity-policy-record-by-default.md) | Accepted; consult the decision for scope and historical context. |
| 0028 | [Trial-level server aggregates; disclosure floors are explicit, not platform-imposed](0028-trial-aggregates-explicit-minn.md) | Accepted; consult the decision for scope and historical context. |
| 0029 | [Form answers: validation blocks at capture; binary answers are offline-first](0029-form-enforcement-and-offline-binaries.md) | Module validity/binaries retained; JavaScript validation behavior superseded by 0039. Upload ceiling remains #49. |
| 0030 | [Single `authorize()` entry point for application-layer authorization](0030-single-authorize-entry-point.md) | Accepted; L14–L17 exceptions remain. See live ledger. |
| 0031 | [SSO is two products; the OIDC mechanism is one `OidcClient`](0031-sso-two-products-shared-oidc-client.md) | Accepted; consult the decision for scope and historical context. |
| 0032 | [Authorization vocabulary: tiered project scope, read-only questionnaire scope, RLS-independent decisions](0032-authz-tiered-scopes-rls-independent.md) | Implemented tiered/RLS-independent gates; share branches superseded by 0033. |
| 0033 | [Cross-org project membership replaces the external-guest / resource-shares role](0033-cross-org-project-membership-replaces-shares.md) | Accepted; consult the decision for scope and historical context. |
| 0034 | [Fold comments & series into `authorize()`; fix their two authorization bugs](0034-comments-series-authz-fold.md) | Accepted; consult the decision for scope and historical context. |
| 0035 | [SSO identities bind to verified domains; out-of-domain logins fail closed](0035-sso-verified-domain-binding.md) | Accepted; consult the decision for scope and historical context. |
| 0036 | [The statistics a researcher reads must be the statistics we computed](0036-honest-statistics.md) | Numerical decisions retained; PCA UI deferral superseded by 0040. |
| 0037 | [Response-set model with WebHID hardware, trigger output deferred](0037-response-model-and-hardware.md) | Unchanged July hardware decision, renumbered from duplicate 0024. |
| 0038 | [Current architecture and decision records](0038-current-architecture-and-decision-records.md) | Current backend and document authority; historical plans are not the live work queue. |
| 0039 | [Safe Logic only, with one QDef authoring and testing boundary](0039-safe-logic-only-and-qdef-boundary.md) | Safe Logic only; JavaScript removal immediate; full QDef/Safe Logic/MCP delivery outstanding. |
| 0040 | [PCA remains a delivery requirement](0040-pca-remains-a-delivery-requirement.md) | PCA is required; numerical engine exists, UI delivery outstanding. |

The old `0024-response-model-and-hardware.md` filename is a historical link, not a second ADR.

The [authorization divergence ledger](0030-divergence-ledger.md) is a live working record. `PHASE_*_PLAN.md`, `PHASE_7_FINDINGS.md`, `baseline.md` and `SUPERVISOR_PROTOCOL.md` are historical planning, evidence or process documents; their dated task counts are not current delivery status.

Remaining implementation gaps and decisions are tracked in GitHub. In particular: [binary upload ceiling #49](https://github.com/DAmesberger/qdesigner-modern/issues/49), [Safe Logic/QDef/MCP #75](https://github.com/DAmesberger/qdesigner-modern/issues/75), and [hardware boundary #66](https://github.com/DAmesberger/qdesigner-modern/issues/66). ADR 0040 makes the PCA UI required work, tracked in [#145](https://github.com/DAmesberger/qdesigner-modern/issues/145). External embedding is tracked in [#146](https://github.com/DAmesberger/qdesigner-modern/issues/146). The [ticket reconciliation](../ticket-reconciliation-2026-09-11.md) removes #91’s replacement-first blockers while preserving the remaining Safe Logic acceptance criteria in #85–#90.
