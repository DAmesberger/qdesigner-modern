# Legacy parity — implementation status re-check (2026-09-02)

> Historical snapshot: subsequent reconciliation is recorded in [the decision index](decisions/README.md). ADR 0039 removes JavaScript execution immediately; ADR 0040 retains PCA delivery. The findings below describe the pre-reconciliation snapshot.


**Baseline:** `docs/legacy-modern-feature-matrix.md` (compared modern `e99379a`, 2026-08-31).
**Re-checked against:** `main` at `9e5fdcc` (working tree, 2026-09-02).
**Method:** every Partial / Missing / Unsafe-mismatch row re-verified in code by grep + file read; ticket state read from GitHub Issues #33–#102.

## 1. What changed since the matrix

One commit landed: `9e5fdcc feat(qdef): add canonical text definition tracer`.

| Aspect | State |
|---|---|
| Export | `GET /api/projects/{id}/questionnaires/{qid}/definition` → canonical RFC-8785 JSON, SHA-256 digest, schema `…/questionnaire/1.0.0` (`apps/server/src/questionnaire_definition.rs`) |
| Import | dry-run only (`POST …/questionnaire-definitions/dry-run`); any commit is rejected with `QDEF_DRY_RUN_ONLY`. **No write path.** |
| Coverage | `text-display` / `text-instruction` questions and `standard` blocks only; `assets`, `variables`, `flow`, `rules`, `translations` always emitted empty; non-empty stored variables/flow is a hard error |
| Package | none — single `.qdef.json`, no ZIP, no content-addressed assets |
| UI | wired: DesignerHeader "Export definition (.qdef.json)" + "Inspect definition file" dialog |
| MCP | nothing in the repo |

Matrix rows that move: **LEG-FMT-09** Missing → Partial; **LEG-AUTH-05** export half delivered (row stays Partial). Ticket **#76** is roughly 70 % done (export + dry-run; missing: byte-identical round-trip proof through the shared interface as the acceptance criterion states, and the import direction which is #78).

## 2. Rows the matrix stated too optimistically

| Row | Matrix | Verified | Evidence |
|---|---|---|---|
| LEG-COL-03/04 continue / delete / bulk-delete responses | Partial | **Missing** for delete: no session DELETE route or handler anywhere in `apps/server/src/api/sessions/`; only org-wide GDPR erasure + retention sweep | `gdpr.rs:1038`, contracts have no session-delete op |
| LEG-DATA-05/06 multi-select split / coded labels | Partial | **Missing**: `generateSPSS` emits a fixed header (session metadata labels only), no per-question value labels, no multi-select expansion | `ResponseExportService.ts:304-380` |
| LEG-Q-12 / LEG-R-15 survey-vs-print visibility | Partial | **Missing**: no flag of any kind exists | grep `showInPrint|includeInReport|printOnly` → 0 hits |
| LEG-FLOW-09 project-driven visibility | Partial | nearer Missing: `projectName` only reaches the welcome screen, never the variable engine | `WelcomeScreen.svelte:113` |
| LEG-COL-06 password protection | Partial (type-only) | also `requireAuthentication` / `allowAnonymous` are displayed but never enforced server-side | `questionnaire.ts:430,740`, `DistributionPanel.svelte:48` |

## 3. Unsafe mismatch — unchanged, plus two unlisted sinks

- `ScriptExecutor.ts:261` `new Function('sandbox', 'with(sandbox){…}')`; hooks reachable at `QuestionnaireRuntime.ts:1267,1307,1332`; Monaco JS editor live via `ScriptEditor.svelte:179`.
- `customFunctions.ts:111` still compiles JS (no designer UI references it — API-level only).
- CSP still grants `'unsafe-eval'` for this (`apps/web/src/lib/server/csp.js:31-71`).
- Not in the matrix: `packages/scripting-engine/src/ScriptWorker.ts:211`, `ScriptEngine.ts:228`.
- Safe Logic (`qexpr/1`, `qrule/1`) exists only as prose in `docs/questionnaire-definition-mcp-requirements.md`.

## 4. Everything else

All remaining Partial / Missing rows in sections A–J re-verified as **still accurate** (build stamp, disk panel, bulk project export, preview/test/fullscreen split, custom CSS unmounted, `.qdef` package, recovery import, media stop-on-condition, `$gosub`, sticky rows, two-column rows, completed-form print, operator chord, trigger output, `__last`, ephemeral scope, legacy helper functions, one-time codes, native `.sav`, WebSerial, SAML, SCIM Groups, DNS verify). Nothing regressed.

## 5. Ticket state

| Range | Purpose | State |
|---|---|---|
| #33–#35, #47, #48 | form-path / upload fixes | closed |
| #36–#46, #49–#52 | modern-only designer/reaction/upload backlog (15 open) | open, `needs-triage`; **#51 is a data-loss bug** (`/sync` behind the 10/60s IP limiter) |
| #54 | Wayfinder program: safe legacy parity | open |
| #55–#59, #61–#74 | decision / prototype / research items (18) | open except #60 (MCP research, closed) |
| #75 | Spec: QDef + Safe Logic + MCP foundation | open |
| #76–#102 | 27 implementation tickets of tranche 1 | all open; #76 ≈ 70 % via `9e5fdcc` |

Tranche boundaries **after** the foundation (SPSS, codes, hardware, layout/print/operator, offline authoring/recovery, workspace/permission mapping) are explicitly "not yet specified" in #54 and are decision tickets #61–#74.

## 6. Bottom line

Of 97 matrix rows: 52 Full/Better unchanged; 27 Partial → 24 Partial and 12 Missing → 15 Missing (three rows downgraded, LEG-FMT-09 upgraded). The foundation tranche (#76–#102) is ~2 % done by ticket count. The German offer (standard development offer, L1–L15 + options) is in `docs/angebot-qdesigner-modern-2026-09.md`.
