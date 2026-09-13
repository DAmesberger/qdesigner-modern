# Legacy → modern QDesigner feature matrix

> Historical snapshot: subsequent reconciliation is recorded in [the decision index](decisions/README.md). ADR 0039 removes JavaScript execution immediately; ADR 0040 retains PCA delivery. The findings below describe the pre-reconciliation snapshot.


**Compared:** legacy `origin/dev` 0.11.0 (`a8701d8`) against modern working tree on 2026-08-31.  
**Companion inventory:** [Legacy QDesigner feature audit](./legacy-qdesigner-feature-audit.md)

## Verdict

QDesigner Modern already exceeds the old system as a general research platform: it has a visual collaborative designer, richer question types, explicit flow/scoring/experimental-design tools, a much stronger offline engine, timing provenance, participant reports, analytics, multilingual studies, multi-tenant administration, audit/privacy controls, and broader exports.

It is **not yet a complete successor** under the client's “every old capability” rule. The largest verified gaps are:

1. no supported, versioned questionnaire definition exchange format and no MCP authoring/testing server; agents therefore cannot yet perform legacy migration through stable product interfaces;
2. script hooks and custom functions still accept JavaScript and compile it with `new Function`, despite the safe formula engine;
3. no equivalent for arbitrary WebSocket/serial output triggers; modern supports WebHID/gamepad input but explicitly says hardware trigger output is unavailable;
4. no native SPSS `.sav` export (modern emits CSV plus `.sps` syntax);
5. no legacy-style generated one-time respondent-code batches and usage ledger;
6. incomplete exact parity for legacy layout/print, stimulus lifecycle, project-driven `!show`, call/return flow, and administrator inspection of local/server fillouts;
7. no complete round-trip import for the modern offline recovery JSON export.

The right product strategy is not a migration CLI/GUI or a generic unsafe “legacy JavaScript” switch. Build the canonical QDef import/export contract and MCP authoring/testing server described in [Questionnaire definition exchange and MCP requirements](./questionnaire-definition-mcp-requirements.md), add the missing safe primitives, and let agents translate real client templates against executable acceptance fixtures.

## Status legend

| Status | Meaning |
|---|---|
| **Full** | The modern product provides the same researcher/participant outcome through a reachable implementation. |
| **Better** | Full outcome parity plus materially safer or broader modern behavior. |
| **Partial** | Important parts exist, but exact workflow, scope, or artifact parity is missing. |
| **Missing** | No reachable equivalent was found. |
| **Unsafe mismatch** | Capability exists, but its implementation conflicts with the requirement to avoid bare JavaScript or a comparable trust-boundary problem remains. |
| **Obsolete** | The old mechanism should not be preserved; its user outcome is covered elsewhere. |
| **Legacy incomplete** | The old path itself was not functional, so it is not a parity requirement. |

Types/interfaces alone are not counted as implementation. The matrix calls out config-only or partial paths explicitly.

The legacy catalogue contains **145 individually identified capabilities**. To keep this comparison readable, closely related capabilities are grouped into **97 legacy comparison rows**: 52 are Full/Better, 27 Partial, 12 Missing, 2 Missing by design, 1 Unsafe mismatch, 2 Obsolete mechanisms, and 1 legacy-incomplete path. Counts describe rows, not weighted implementation effort; the definition/MCP and scripting gaps are much larger than several “Better” rows combined.

Modern evidence paths are relative to `/home/dev/dev/qdesigner-modern` unless stated otherwise. Legacy evidence is centralized in the companion audit.

## A. Workspace, identity, projects, and permissions

| Legacy ID | Legacy outcome | Modern status | Modern evidence and comparison | Required work for successor acceptance |
|---|---|---:|---|---|
| LEG-APP-01 | One authenticated workspace for templates, fillouts, online, sync, settings, admin | **Better** | Routed Dashboard, Projects, Analytics, Settings and Admin in `AppShell.svelte:20+`; designer and participant routes are first-class | None for outcome; migration terminology/onboarding should map old tabs to new locations |
| LEG-APP-02/03 | Login/logout and protected app | **Better** | Auth layout gates every `(app)` route, plus signup/reset/SSO: `routes/(app)/+layout.ts:7-60`; auth routes | None |
| LEG-APP-04 | Version/build visibility | **Partial** | Modern has versioned questionnaires and builds, but no verified equivalent user-facing application build stamp in main shell | Add support/build identifier to About/diagnostics if client operations rely on it |
| LEG-APP-05 | Browser capability warning | **Better** | Fillout performs device/timing/WebHID/WebGL qualification and exposes fallbacks/provenance | Ensure generic unsupported-browser policy is visible before participation |
| LEG-APP-06 | German/English researcher UI | **Better** | Researcher UI message catalogs: `apps/web/messages/en.json`, `de.json`, `es.json`; study translations in `TranslationPanel.svelte` | Verify every researcher and participant string; migrate legacy language expectations |
| LEG-APP-07 | Offline application shell | **Better** | Service worker plus versioned IndexedDB/cache and dedicated fillout sync: `static/sw.js`; `services/db/indexeddb.ts` | None for outcome |
| LEG-ADM-01 | Five fixed project rights | **Better** | Org roles, custom granular roles, project members/invitations and ownership transfer; admin roles UI/backend | Produce a deterministic legacy-rights → modern-role migration mapping |
| LEG-ADM-02–05 | Enforce template/fillout access by owner/project rights | **Better** | Project/questionnaire APIs and RLS/permission checks; project members routes | Add migration tests for every legacy permission combination |
| LEG-ADM-06/07 | User list/create/edit/password/project assignments | **Better** | Org users, invitations, roles, local auth, SSO/SCIM; `admin/users`, `admin/invitations`, `admin/roles` | Same-name-project auto-creation should not be copied; document replacement workflow |
| LEG-ADM-08 | Project lifecycle and project users | **Better** | Project CRUD, archive/restore, membership/invitations/ownership | Migrate active/inactive flags and memberships |
| LEG-ADM-09 | Auto-create same-name personal project | **Obsolete** | Modern onboarding creates organization/project explicitly | Preserve data ownership through migration, not the old side effect |
| LEG-ADM-10 | Admin disk-capacity panel | **Missing** | No corresponding routed operational disk panel found; modern admin focuses on tenant controls | Decide whether infrastructure monitoring belongs in product UI or external observability; provide one of them |

## B. Template library, designer, and authoring ergonomics

| Legacy ID | Legacy outcome | Modern status | Modern evidence and comparison | Required work for successor acceptance |
|---|---|---:|---|---|
| LEG-AUTH-01 | Create questionnaire/template | **Better** | Routed visual designer creates questionnaires; reusable item templates via `SaveTemplateModal.svelte` and template APIs | None |
| LEG-AUTH-02 | File-picker and drag/drop legacy template import | **Missing** | No mounted questionnaire-definition import route or primary API import method; legacy standalone `Designer.svelte` JSON import is not the routed product | Implement generic QDef import in the product. Agents translate legacy CSV/ZIP externally through QDef/MCP; no migration-specific UI |
| LEG-AUTH-03 | Local/offline template library | **Partial** | Designer drafts/autosave and content cache exist; modern source of truth is server/project rather than an explicit local template shelf | Define offline authoring scope and provide visible draft/recovery management if required |
| LEG-AUTH-04 | Local/server hash comparison | **Better** | Autosave conflict handling, server versions/snapshots and CRDT collaboration supersede file hashes | Add a clear offline-divergence/conflict UX; no MD5 compatibility needed |
| LEG-AUTH-05 | Download/delete/rename/export/lock server templates | **Partial** | Questionnaire CRUD/archive, publish, semantic version bump/snapshot and permissions exist; the current server “export” route exports responses, not a portable definition | Add canonical QDef export; verify rename and read-only role behavior |
| LEG-AUTH-06/07 | Bulk project template download and assignment | **Partial** | Questionnaires are directly project-owned and reusable item templates exist; no verified “download all project definitions/assets” workflow | Add bulk project archive/export if the client uses project handoff/backup |
| LEG-AUTH-08 | Launch preview/fillout windowed/fullscreen | **Partial** | Preview/publish/public fillout exist; reaction/WebGL provide fullscreen-oriented execution, but no exact author action matching both old launch modes was verified | Add explicit Preview, Test run, Fullscreen lab run actions with clear data-isolation behavior |
| LEG-AUTH-09 | Add/edit/delete/reorder items | **Better** | WYSIWYG designer, structure tree, drag/drop, properties, keyboard/undo/redo | None |
| LEG-AUTH-10 | Manage media and see assets/sizes | **Better** | Org media upload/list/delete/stream endpoints and Media Manager/asset references | Add legacy package asset mapping and codec warnings |
| LEG-AUTH-11 | Global stylesheet asset | **Partial** | Modern theme/layout controls and scoped component styling exist; no equivalent arbitrary uploaded `style.css` package found | Provide safe advanced theming/scoped CSS only if actual templates require it |
| LEG-AUTH-12/13 | Schema-driven item editor and validation | **Better** | Typed designer components and registry metadata per module | Add migration diagnostics for unsupported legacy params instead of silently dropping them |
| LEG-AUTH-14 | Advanced raw parameters | **Better** | Purpose-built property panels are safer and more ergonomic | Ensure every used legacy parameter has a visible control or explicit advanced primitive |
| LEG-AUTH-15 | Per-item question/answer CSS and special layout token | **Partial** | Layout and style configuration exists, but exact two-sided raw CSS plus `sticky`/`table` semantics is not represented | Add safe row/grid/sticky layout components; do not restore unrestricted CSS by default |

## C. File formats, import/export, and migration

| Legacy ID | Legacy outcome | Modern status | Modern evidence and comparison | Required work for successor acceptance |
|---|---|---:|---|---|
| LEG-FMT-01–06 | CSV questionnaire as editable interchange, including commands/code/params/separators | **Missing** | Modern persists typed definition JSON, but has no supported exchange contract | QDef replaces CSV as the supported interchange. Migration agents parse legacy CSV and author QDef through MCP; there is no built-in legacy converter |
| LEG-FMT-07/08 | ZIP round trip with CSV, CSS, media | **Missing** | No canonical definition package or proven definition/assets round trip exists | P0: deterministic `.qdef` package with content-addressed assets, atomic import, validation and round-trip guarantees |
| LEG-FMT-09 | Code-level legacy JSON export helper (not visibly bound in old UI) | **Missing** | Modern has a designer deep-clone helper and an older local JSON path, but no supported schema-versioned definition export; the server route exports response data | Implement canonical `.qdef.json` read/export and import through the shared Definition Module |
| LEG-FMT-10 | Full local dump export and fillout import | **Partial** | Participant UI exposes unsynced JSON export via `FilloutPageController.svelte.ts:1489-1518`; no matching import/restore path found | Add authenticated/support-tool import with integrity checks, deduplication and explicit session targeting |
| LEG-FMT-11 | Hosted failure recovery export | **Better** | Multiple participant failure/dead-letter/offline banners call `exportUnsyncedData()` | Complete round-trip recovery tooling and document support procedure |
| — | Agent-driven questionnaire translation and verification | **Missing** | No MCP server exposes canonical definition creation/editing/validation/testing | P0: QDef plus three MCP tools (`definition_get`, `definition_apply`, `questionnaire_test`); explicitly no migration CLI/GUI |

## D. Stimulus and response modules

Modern registers four display modules, fourteen dedicated question modules, and three compatibility aliases in `apps/web/src/lib/modules/register-all.ts:36-114`. Raw WebGL is registered but hidden from the normal palette (`QuestionPalette.svelte:10-14,30-47`).

| Legacy ID | Legacy outcome | Modern status | Modern evidence and comparison | Required work for successor acceptance |
|---|---|---:|---|---|
| LEG-Q-01/02 | Styled text/HTML stimulus with interpolation | **Better** | Text Display/Text Instruction, markdown/rich content, variables/translations/theme | Verify sanitization and add migration for supported legacy markup/style subset |
| LEG-Q-03/04 | Positioned/resized image, including fullscreen | **Partial** | Media Display alias and reaction stimulus editors cover media and precision paths; generic legacy x/y CSS parity is not proven | Add explicit responsive/absolute lab-layout migration rules and screenshot fixtures |
| LEG-Q-05 | Video with controls/autoplay/size/position | **Full** | Media config supports image/video/audio, dimensions, autoplay/loop/controls: `questionnaire.ts:916-943`; media runtime | Verify browser autoplay/codecs and migrate each parameter |
| LEG-Q-06 | Stop video when variable changes | **Partial** | Flow/timing/hooks can reproduce the outcome; no dedicated safe “stop media when condition” control found | Add media lifecycle action/condition UI |
| LEG-Q-07 | Audio with controls/autoplay | **Full** | Media config/runtime and reaction audio timing | Verify asset migration/codecs |
| LEG-Q-08 | Stop audio when variable changes | **Partial** | Same as video lifecycle; script hook is possible but violates no-bare-JS goal | Add safe lifecycle rule |
| LEG-Q-09–11 | Fullscreen timed/sequenced stimuli | **Better** | Reaction Time/Reaction Experiment engines, phase timeline, high-resolution timing and validity policy | Build legacy simple-stimulus preset so authors need not enter full Reaction Lab for common cases |
| LEG-Q-12 | Separate participant/print visibility | **Partial** | Participant report is separately authored; no verified per-module questionnaire-vs-print flags | Provide report mapping/default inclusion rules during migration |
| LEG-R-01–03 | Single/multiple choice with integer values, min/max/required | **Better** | Single/multiple choice aliases/modules, validation, option randomization, carry-forward | Verify minimum/maximum selection UI/runtime and numeric code migration |
| LEG-R-04/05 | Text area/input with required, regex, error and size/style | **Better** | Text Input plus validation rules and layout | Migrate JavaScript regex safely and flag unsupported patterns |
| LEG-R-06–10 | Keyboard/touch reaction response, RT and correctness, allowed keys, auto-advance | **Better** | Reaction engine supports keyboard/touch/mouse, ResponseSets, correctness, paradigms, microsecond trial data | Add direct legacy key-code/arrow-quadrant importer and behavioral fixtures |
| LEG-R-11 | Send external trigger on keypress | **Missing** | Help explicitly says hardware trigger output is unavailable: `help/content/reaction.ts:49-58` | P0 for affected labs: permissioned trigger-output adapter with timing/provenance and failure policy |
| LEG-R-12/13 | Participant-vs-cohort bar feedback | **Better** | Bar Chart, Statistical Feedback, server-computed variables, scoring/report widgets/norms | Provide a one-click legacy bar-feedback preset and map old mean/deviation variables |
| LEG-R-14 | Required answer gates navigation | **Full** | Runtime validation and required rules | None |
| LEG-R-15 | Response visibility differs between survey and print | **Partial** | Same report-authoring mismatch as LEG-Q-12 | Define migration/report behavior |
| — | Matrix, ranking, date/time, number, rating/scale, file upload, drawing | **Better/new** | Dedicated registered modules | Not required for parity; retain |

## E. Runtime, layout, navigation, and flow

| Legacy ID | Legacy outcome | Modern status | Modern evidence and comparison | Required work for successor acceptance |
|---|---|---:|---|---|
| LEG-FLOW-01/02 | Page grouping, dynamic visibility, omit empty pages | **Better** | First-class Page/Block model, display conditions, conditional logic and runtime filtering | Add migration for variable-interpolated legacy page labels |
| LEG-FLOW-03/04 | Previous/next, history and resume | **Better** | Back-navigation setting, version-pinned durable ResumeState, offline and authenticated resume | Define anonymous cross-device limitation in UX; preserve old session cursor on import |
| LEG-FLOW-05 | Conditional jump | **Better** | Visual flow rules `skip`/`branch` with source, priority and target: `questionnaire.ts:372-403`; flow editor | Import `$goto` into explicit edges |
| LEG-FLOW-06 | Call/return (`$gosub`) | **Missing** | Modern flow types are skip, branch, loop, terminate; no call stack/return rule | Determine real usage; add reusable subflow/call-return or expand imported graphs safely |
| LEG-FLOW-07/08 | Normal finish and early end | **Better** | Terminate rules, normal completion, distinct screen-out/over-quota states and redirects | Map semantics exactly, especially completion codes and status |
| LEG-FLOW-09 | Show item based on project name | **Partial** | Display formulas and experimental conditions are broader, but project identity is not verified as participant formula input | Import into an explicit distribution/condition variable, not hidden project coupling |
| LEG-FLOW-10 | Sticky rows on every page | **Missing** | No equivalent repeating-page element verified | Add page template/header or repeated component primitive if used |
| LEG-FLOW-11 | Two-column question/answer table row | **Partial** | Horizontal/grid layouts exist (`LayoutConfig`), but exact imported row behavior is not proven | Map to responsive two-column layout and mobile fallback |
| LEG-FLOW-12 | Print a completed questionnaire with print-specific content | **Partial** | Configured participant report and real PDF generator exist; admin session detail exists, but exact old completed-form print view is not verified | Add “render completed response using pinned version” print/PDF action if client relies on it |
| LEG-FLOW-13–16 | Nested block randomization and stable resume order | **Better** | Randomized blocks, subsets, Latin square/fixed positions, per-session seed and stable resume: core/runtime | Build converter from comma-coordinate hierarchy and compare seeded fixtures |
| LEG-FLOW-17 | Page timeout/auto-advance | **Better** | Page `timeLimit` + auto-advance/terminate, question deadlines, whole-survey time budget: `questionnaire.ts:700-728,805-907` | Map last-timeout-wins legacy behavior explicitly |
| LEG-FLOW-18 | Per-page previous/next locks | **Better** | Questionnaire back-navigation, page allow-navigation, question `showPrevious/showNext` | Verify Next lock versus validation and migrate separately |
| LEG-FLOW-19 | Emergency operator keyboard finish/exit | **Missing** | No matching lab-operator chord verified | Add permissioned/test-mode abort/force-complete controls with audit trail |
| LEG-FLOW-20 | Windowed/fullscreen and high-DPI canvas | **Better** | Responsive form runtime plus WebGL/reaction engine/device qualification | Verify explicit fullscreen request and escape handling for lab protocols |
| LEG-FLOW-21 | Page timing | **Better** | Page/question/session/trial timing plus interaction events and validity provenance | None |
| — | Loops over static/answer/variable rosters | **Better/new** | Loop blocks, named loop variable, shuffle and max iterations: `questionnaire.ts:976-1010` | Retain |
| — | Adaptive CAT/IRT | **Better/new** | Model, designer editor and runtime support; `questionnaire.ts:280-370`, `AdaptiveBlockEditor.svelte` | Treat as advanced and validate separately; not legacy parity |
| — | Eligibility screeners and quotas | **Better/new** | Structured screeners, quotas and distinct outcomes | Retain |

## F. Variables, formulas, hooks, and trust boundaries

| Legacy ID | Legacy outcome | Modern status | Modern evidence and comparison | Required work for successor acceptance |
|---|---|---:|---|---|
| LEG-VAR-01/02 | Named responses with value/timing/correctness | **Better** | Typed response/variable engine plus detailed reaction trials/events | Define canonical migration mappings for `value`, `number`, `delta`, `time`, `correct` |
| LEG-VAR-03/04 | Local/server cohort aggregates | **Better** | Server-computed variable declarations, cohort privacy floor/cache, analytics/statistical feedback | Map legacy aggregate names and completed-only semantics |
| LEG-VAR-05/06 | Reactive computed formulas and variable/property references | **Better** | Parsed expression AST and variable engine; tree-walking evaluator avoids `eval` | Add legacy formula translator and compatibility diagnostics |
| LEG-VAR-07 | `_` local/non-persisted variables | **Partial** | Session variables and server-computed declarations exist; an exact author-facing persistence-class equivalent is not verified | Add explicit scope: ephemeral/session/persisted/server, then map `_` |
| LEG-VAR-08 | `__last` / `__lastall` change references | **Missing** | No direct equivalent found | Add last-response/change event references or rewrite actual usages to explicit hook inputs |
| LEG-VAR-09/10 | Legacy aggregate/correctness helper functions | **Partial** | Modern has broad math/statistics/psychometric functions and reaction scoring, but exact helper names/semantics are not all verified | Implement compatibility functions or translator rewrites with golden tests |
| LEG-VAR-11 | Rich expression calculations | **Better** | Parser supports literals, arrays, member access, unary/binary/logical/ternary/function calls; policies limit depth/time and block globals: `packages/scripting-engine/src/parser.ts`, `policies.ts:10-45` | Keep AST language; publish supported grammar/function reference |
| LEG-VAR-12 | Explicitly update another variable in reaction to an event | **Unsafe mismatch** | Hook context exposes `setVariable`, but hooks are JavaScript compiled through `new Function`: `ScriptExecutor.ts:44-90,124-146,256-262` | P0: replace with parsed action language/state machine, or isolate capability in a killable worker with strict serialized API |
| LEG-VAR-13 | DOM/network/storage/socket/global access from script | **Missing by design** | AST evaluator blocks dangerous identifiers; hook proxy tries to hide globals | Inventory real integrations and replace each with permissioned typed adapters; never restore ambient access |
| LEG-VAR-14 | Scores, derived classes, adaptive messages and conditional flow | **Better** | Formula variables, scoring, conditions, feedback/reporting | Add migration presets |
| — | Seven lifecycle hooks: mount, response, validate, navigate, page enter/exit, timer | **Unsafe mismatch** | Reachable runtime hooks and Monaco JS editor; main-thread no hard timeout, and source notes regex escape blind spot: `ScriptExecutor.ts:18-22,44-63,247-262`; `ScriptEditorOverlay.svelte` | P0: remove bare JS authoring before declaring the safe-scripting requirement met |
| — | User-defined custom functions | **Unsafe mismatch** | `packages/scripting-engine/src/customFunctions.ts` also compiles stored JavaScript with `new Function`/Proxy | Replace bodies with AST expressions or trusted administrator-installed extensions; migrate/reject stored JS |

### Safety conclusion

Modern formulas are on the correct path: the parser/evaluator uses a constrained AST, allowlisted functions, blocked identifiers, recursion/iteration limits and evaluation timeout policies (`packages/scripting-engine/src/policies.ts:1-45`; `ast-evaluator.ts`). However, the product still exposes a JavaScript Monaco editor for lifecycle hooks and JavaScript custom-function bodies. A Proxy plus regular-expression guard is defense in depth, not a language sandbox; the implementation comments explicitly acknowledge concatenated-property escapes and the absence of a hard timeout for main-thread hooks. This is the matrix's only **Unsafe mismatch**, and it should block a claim that “bare JavaScript has been replaced.”

## G. Offline operation, sync, and recovery

| Legacy ID | Legacy outcome | Modern status | Modern evidence and comparison | Required work for successor acceptance |
|---|---|---:|---|---|
| LEG-OFF-01/02 | Durable local responses and resume incomplete sessions | **Better** | Dexie stores pinned definition, session, response, event, variable, trial and binary data; runtime restores ResumeState | None, aside from migration/import |
| LEG-OFF-03/04 | Tune/defer autosave to protect reaction timing | **Better** | Dedicated reaction trial persistence, high-resolution timing, offline ledger and background sync separate timing from durable writes | Verify latency under target hardware; expose study policy rather than raw disable switch |
| LEG-OFF-05 | Visible local completed/incomplete/total inventory | **Partial** | Participant sync/dead-letter banners and admin analytics exist; no equivalent researcher-facing per-device template inventory | Add support diagnostics/session inventory only if operational workflow requires it |
| LEG-OFF-06/07 | Upload completed data and clean local copies | **Better** | Idempotent dedicated sync, acknowledgments, retry/dead letters and binary chunks; local recovery retained | Define retention/erasure policy instead of immediate old-style deletion |
| LEG-OFF-08 | Download cohort aggregates | **Better** | Server-computed variables/cohort stats with privacy floor and cache | None |
| LEG-OFF-09 | Offline rights/template availability | **Better** | Versioned public content cache and authenticated app/offline data services | Verify researcher offline-authoring authorization expiration policy |
| LEG-OFF-10 | Inspect/clear device storage | **Partial** | Participant recovery/clear paths exist around dead studies and failures; no broad raw-key debugger intended for researchers | Provide safe diagnostics and selective purge, not raw IndexedDB controls |
| LEG-OFF-11 | Dump export and import | **Partial** | Unsynced export is reachable from failure states; import is absent | Build recovery import and reconciliation tooling |

## H. Collection, distribution, and response administration

| Legacy ID | Legacy outcome | Modern status | Modern evidence and comparison | Required work for successor acceptance |
|---|---|---:|---|---|
| LEG-COL-01/02 | Filter sessions and see status/metadata | **Better** | Project/questionnaire/global analytics plus session detail routes | Verify filters include legacy owner/project/template fields after migration |
| LEG-COL-03 | View a completed response | **Better** | Session detail and participant report routes/components | Add pinned-definition render if “view the original filled form” is required |
| LEG-COL-03 | Print completed response | **Partial** | Report page + PDF generator exist, but generic completed-form print parity is not verified | Add admin print/PDF action using pinned questionnaire version |
| LEG-COL-03/04 | Continue/delete/bulk-delete responses | **Partial** | Participant resume exists; tenant/session retention is richer, but matching admin individual/bulk destructive controls were not all verified | Define legal/audit-safe deletion and researcher resume rules; implement missing UI |
| LEG-COL-05 | Create hosted link for questionnaire | **Better** | Publish/distribution panel provides share URL, copy/open, QR/embed behavior | None |
| LEG-COL-06 | Public/private access | **Partial** | Anonymous/auth settings exist; `DistributionSettings.passwordProtection` is declared, but no enforcement usage was found outside types | Wire and test authentication/password/access policy end to end; do not count type-only fields |
| LEG-COL-07–09 | Generate batches of one-time codes, track use, prevent reuse | **Missing** | No equivalent respondent-code management route/UI found; auth verification codes and resume tokens are unrelated | Add invitation/access-code batches with CSV export, revocation, single-use transaction and usage ledger |
| LEG-COL-10 | Offline-first hosted run and failure recovery | **Better** | Public fillout controller, service worker, durable queue, dead-letter UX and recovery export | Add recovery import |
| LEG-COL-11 | Hosted result view | **Legacy incomplete** | Old implementation threw `NotImplementedException`; modern reports/session detail exceed it | No legacy parity obligation |
| — | URL parameter capture and panel integrations | **Better/new** | Completion redirects/codes and Prolific/MTurk/SONA/CloudResearch/custom config in `questionnaire.ts:421-446`; completion runtime consumes panel settings | Verify authoring UI and distribution enforcement for all declared fields |
| — | Fraud/duplicate/data-quality controls | **Better/new** | Fingerprint/cookie/IP/combined policies, honeypot/behavior/speeder/flatline settings and server duplicate handling | Retain with privacy review |
| — | Longitudinal study series | **Better/new** | Study series designer, enrollment/reminders/series gating and completion advance | Retain |

## I. Analysis, feedback, and export

| Legacy ID | Legacy outcome | Modern status | Modern evidence and comparison | Required work for successor acceptance |
|---|---|---:|---|---|
| LEG-DATA-01 | Export filtered questionnaire responses | **Better** | Project/questionnaire analytics and export services | Verify server-side filtering and large-job behavior for migrated volume |
| LEG-DATA-02 | Native `.sav` download | **Missing** | UI explicitly labels SPSS as “CSV + .sps syntax file”: `routes/(app)/projects/[projectId]/analytics/+page.svelte:319-328` | Add real `.sav` writer or obtain explicit client acceptance of syntax-bundle replacement |
| LEG-DATA-03/04 | IDs plus values/delta/time | **Better** | CSV/JSON/XLSX/export bundles and reaction trial CSV/XLSX include richer provenance/version fields | Define compatibility column map and units (legacy ms vs modern µs) |
| LEG-DATA-05/06 | Multi-select split/combined and coded labels | **Partial** | Modern export normalization exists, but exact old options/label behavior is not verified | Add compatibility export profile and golden `.sav`/CSV datasets |
| LEG-DATA-07/08 | SPSS types, value labels, long/non-ASCII robustness | **Partial** | SPSS-compatible names and syntax generated; native `.sav` semantics are absent | Test Unicode, long text, missing values, labels and multi-select in target SPSS version |
| — | CSV, JSON, XLSX, R, Stata, SAS, Python exports | **Better/new** | Eight formats shown in analytics UI; `ResponseExportService.ts` | Retain |
| — | Descriptive/inferential/psychometric analytics | **Better/new** | Statistical engine, project/global/questionnaire analytics, scale scoring | Retain and validate separately |
| — | Configurable participant PDF/report with norms/cohort comparison | **Better/new** | Report page editor/view and `ReportGenerator.ts` | Retain |

## J. Hardware, sockets, packaging, and operations

| Legacy ID | Legacy outcome | Modern status | Modern evidence and comparison | Required work for successor acceptance |
|---|---|---:|---|---|
| LEG-INT-01–03 | Raw WebSocket connection, variable send/receive binding | **Missing by design** | Modern WebSockets are internal auth/collaboration/analytics, not a template integration API | Inventory endpoints/protocols; build allowlisted connector/action blocks with consent, schema and audit |
| LEG-INT-04 | Serial device bridge | **Partial** | Modern WebHID and gamepad response **input** exist; no WebSerial bridge/output | Add supported device-adapter architecture for actual client hardware |
| LEG-INT-05–07 | Chrome App/filesystem/serial/CRX packaging | **Obsolete** | PWA/service worker/offline DB replace application packaging; browser APIs replace some device input | Preserve offline/device outcomes only; do not reproduce CRX2 or broad filesystem permissions |
| LEG-INT-08 | Operational logs | **Better** | Rust tracing/error reporting/audit logs exist | Verify deployment retention and support access |
| LEG-INT-09/10 | Build/deploy/database/web-server assets | **Better** | Modern monorepo, Rust server, migrations, Docker/deployment configuration and CI/tests | Document supported production topology and observability |
| — | Hardware response boxes via WebHID | **Better/new** | `HidDeviceManager.ts`, `HidConnectAffordance.svelte`, device qualification; Chromium with fallback | Retain; test actual client devices |
| — | Hardware trigger output / photodiode validation | **Missing** | Explicitly disclosed unavailable in `help/content/reaction.ts:58` | Required only if client protocols use old socket/keypress output; likely high priority |

## Modern-only capability inventory

These are not legacy-parity requirements, but removing them would regress the current successor.

| Area | Verified modern capabilities |
|---|---|
| Organization security | Multi-tenant organizations; local auth; OIDC SSO; optional Zitadel; custom roles; project/org invitations; ownership transfer; API keys; verified domains; audit events; privacy residency/legal hold/export/erasure |
| Conditional enterprise features | SAML is UI/config only and explicitly unavailable in this build; SCIM Users is implemented but Groups mutation is not; DNS auto-verification depends on build feature/config |
| Designer workflow | WYSIWYG canvas, structure/properties sidebars, templates, variables, flow graph, comments, translation completeness, undo/redo, autosave, real-time CRDT presence/collaboration, semantic questionnaire versions and changelog |
| Research design | Weighted random/sequential/balanced conditions; Latin/balanced-Latin/full counterbalancing; randomized/conditional/loop/adaptive blocks; carry-forward; quotas; screeners; attention checks; subscale scoring |
| Question types | Multiple/single choice, scale, rating, text, number, matrix, ranking, date/time, file upload, media response, drawing, reaction-time, reaction experiment; display text/instruction/media/bar chart/statistical feedback; low-level WebGL registered but hidden |
| Reaction research | Standard paradigm presets (Go/No-Go, SART, Simon, Posner, visual search, Sternberg, PVT, temporal-order, RSVP), phase/trial editors, response sets, keyboard/touch/mouse/WebHID/gamepad, high-resolution clocks, trial rows, visibility/cross-origin timing provenance and validity enforcement |
| Participant experience | Welcome, consent, localization, progress, save/resume, screen-out, over-quota, completion redirects/codes, participant report/PDF, org branding, longitudinal series gating |
| Offline/data integrity | Version-pinned definitions, encrypted-at-rest sensitive offline data, responses/events/variables/trials/binaries, idempotent sync ledger, dedupe, chunks, dead letters, integrity reconciliation, service-worker caching and mutation replay |
| Data quality | Duplicate detection/fingerprinting, honeypot, behavior, speed and flatline policies, country rules, attention checks, session/trial timing validity provenance |
| Analytics/export | Dashboard, project/global/questionnaire/session views, realtime analytics, compare/timeseries, psychometrics/scoring, CSV/JSON/XLSX and SPSS/R/Stata/SAS/Python bundles |
| APIs/integrations | OpenAPI-generated client/contracts, scoped API keys, machine aggregate/export/member routes, media storage/streaming, authenticated WebSockets, Prolific/MTurk/SONA/CloudResearch/custom completion integration |

## Prioritized closure plan

### P0 — blocks “complete safe successor”

1. **Canonical QDef exchange.** Ship schema-versioned deterministic JSON and asset packages, generic product import/export, lossless round trips, stable diagnostics and safe declarative logic. This is the product seam agents migrate through; it is not a legacy migration tool.
2. **Remove bare JavaScript authoring.** Replace hook/custom-function JavaScript with a parsed action language or isolated capability model. Ban new JS saves, add migration diagnostics, and preserve only reviewed trusted extensions.
3. **MCP authoring/testing server.** Expose canonical definition read/apply and deterministic questionnaire testing through existing authorization, optimistic revisions, version snapshots and audit behavior. Do not expose publication initially.
4. **Real-template acceptance corpus.** Have migration agents translate all client template ZIPs and representative fillouts into QDef plus deterministic scenarios covering formulas, flows, timing, randomization, exports, layout and media.
5. **Hardware/integration decision.** Inventory actual WebSocket/serial/trigger use. If used, ship permissioned input/output adapters with protocol schemas, timing guarantees, fallback behavior, and audit logs.
6. **Data/export compatibility decision.** Either generate native `.sav` with legacy-compatible labels/types or secure formal acceptance that CSV + `.sps` is sufficient.

### P1 — visible workflow parity

7. Add one-time respondent code batches and usage management if used by the client.
8. Add completed-form view/print using the pinned questionnaire version.
9. Complete offline recovery import/reconciliation.
10. Add safe equivalents for sticky/repeated content, media stop-on-condition, project-derived visibility, emergency operator controls, and `$gosub` wherever agent analysis proves usage.
11. Add compatibility export profiles, including multi-select, Unicode, timing units, missing values and identifiers.

### P2 — operational completeness

12. Add bulk project backup/export if QDef-per-questionnaire export is insufficient; do not add a migration dashboard.
13. Decide whether disk monitoring belongs in QDesigner or external infrastructure monitoring.
14. Validate all conditional enterprise claims separately: SSO provider configuration, SCIM limitations, DNS verification, email, object storage, and browser/device matrix.

## Acceptance definition

The successor should be considered legacy-complete only when:

- every production legacy template receives one of **agent-authored QDef translation**, **reviewed safe rewrite**, or **documented intentional retirement**;
- every stored questionnaire can be exported to canonical QDef and imported as a draft without semantic drift;
- a standard MCP client can create/edit, validate and deterministically test questionnaires without bypassing product authorization, revision, version or audit rules;
- no unknown command, function, global, module, parameter, asset or CSS behavior is silently ignored;
- imported randomization, timing, correctness/scoring, navigation and persistence behavior passes fixture tests;
- representative legacy datasets produce accepted analysis exports;
- offline interruption/recovery and hardware failure scenarios pass end-to-end tests;
- questionnaire authors can achieve those outcomes through visible UI or a constrained documented language—without bare JavaScript.
