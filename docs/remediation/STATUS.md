# Implementation status — QDesigner 2026 roadmap

> **Source of truth:** `roadmap.json`. **This file is the ledger** (regenerated from `status.json`). `implement-phase.mjs` / supervised batches are the executor.
> 95 / 98 units merged.

**Legend:** `pending` → `🔨 in-worktree` → `👀 in-review` → `✅ merged` (diff merged + gate green) · `⏭️ deferred` · `🚫 blocked`

## Milestone progress

| Milestone | Units | Merged | Status |
|---|---|---|---|
| **M1** Participant-Critical Correctness & Security Foundation | 16 | 16 | ✅ complete |
| **M2** Resumable Sessions + Test/Type/Structure Backbone | 22 | 22 | ✅ complete |
| **M3** Precision Reaction Core | 6 | 6 | ✅ complete |
| **M4** Instant Feedback Suite Resurrection | 7 | 7 | ✅ complete |
| **M5** SOTA Flow Programmability (plumbing) + Accessibility + Svelte 5 Correctness | 19 | 18 | 🔨 18/19 |
| **M6** Bulletproof Offline | 7 | 6 | 🔨 6/7 |
| **M7** Multi-tenant Governance Foundation + Product UX Polish | 13 | 13 | ✅ complete |
| **M8** Enterprise Federation + Adaptive / Longitudinal / Paradigm Frontier | 8 | 7 | 🔨 7/8 |

---

## M1 — Participant-Critical Correctness & Security Foundation

**Goal:** Close every participant-facing correctness defect and every auth/transport/injection hole before any capability is built on top. Data a participant produces is persisted, sanitized, and quota-enforced; the auth surface is hardened. No new capabilities — this is the platform the epics stand on.

**Exit gate:** security-review skill clean on branch; live golden-path QA green (derived variables persist through sync, fillout chrome renders with valid tokens, per-cell quota enforced and fails closed, anon cohort feedback returns data); no console PII in prod bundle; refresh token exists only in httpOnly Secure cookie; anonymous sessions cannot forge user_id (RLS WITH CHECK).

**Proven by:** An anonymous participant completes an offline questionnaire on a shared device: derived variables + quality report survive the final sync, IndexedDB is purged on session end, researcher-authored {@html} is DOMPurify-sanitized, and an auth brute-force attempt hits per-email lockout with dummy-Argon2 constant-time response.

**Run:** `Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M1' } })`

### Remediation fixes (16)
- [x] `P1-T1` · task · L/med · P1 — Persist derived variables and quality report through the offline-first pipeline  
      status: **✅ merged**
- [x] `P1-T2` · task · S/low · P1 — Fix broken HSL-triplet CSS tokens on participant fillout screens  
      status: **✅ merged**
- [x] `P1-T3` · task · S/low · P1 — Resolve question-id flow-control targets to their containing page  
      status: **✅ merged**
- [x] `P1-T4` · task · L/med · P1 — Real per-cell quota counting server-side; enforce offline; stop failing open  
      status: **✅ merged**
- [x] `P1-T5` · task · L/med · P1 — Anonymous-safe cohort feedback path (public aggregate stats endpoint)  
      status: **✅ merged**
- [x] `P1-T6` · task · M/low · P1 — Unify ${} and {{}} variable interpolation on the live runtime path  
      status: **✅ merged**
- [x] `P1-T7` · task · M/low · P1 — Statistical-feedback panel: require-Continue by default, honest report button, range descriptions, log cleanup  
      status: **✅ merged**
- [x] `P2-T1` · task · M/med · P2 — Centralize DOMPurify sanitization on every markdown/{@html} sink  
      status: **✅ merged**
- [x] `P2-T2` · task · L/high · P2 — Harden main-thread + worker script sandboxes against bracket-notation constructor escapes  
      status: **✅ merged**
- [x] `P2-T3` · task · S/low · P2 — Strip production console.* via esbuild drop + remove login-email PII log  
      status: **✅ merged**
- [x] `P2-T4` · task · M/med · P2 — Purge sensitive fillout data from IndexedDB after sync + shared-device clear  
      status: **✅ merged**
- [x] `P2-T5` · task · L/med · P2 — Auth endpoint hardening: peer-IP rate key, verify-code lockout + send cap, dummy-Argon2, max password, 23505→409  
      status: **✅ merged**
- [x] `P2-T6` · task · M/med · P2 — Validate anonymous session media uploads (size, MIME allowlist, magic bytes, filename sanitize, body limit)  
      status: **✅ merged**
- [x] `P2-T7` · task · L/high · P2 — Router/transport security: WS token off URL, CatchPanic on auth+ws, dev router out of release, verify_domain DNS challenge  
      status: **✅ merged**
- [x] `P2-T8` · task · S/low · P2 — Constrain anonymous sessions_insert_dual so user_id cannot be forged  
      status: **✅ merged**
- [x] `P2-T9` · task · L/high · P2 — Move refresh token to httpOnly cookie; keep only in-memory access token  
      status: **✅ merged**


## M2 — Resumable Sessions + Test/Type/Structure Backbone

**Goal:** Make sessions genuinely resumable (the single biggest offline gap: resume() at QuestionnaireRuntime.ts:274 only unpauses, currentItemIndex stays 0) and stand up the HTTP harness, typed contracts, and structural cleanup the capability epics compile against.

**Exit gate:** Reload/interrupt mid-questionnaire rehydrates exact position + prior responses + variable-engine state; cross-device resume-link works; CI runs HTTP round-trip + cross-tenant mutation-DENIAL + fullstack/visual e2e lanes against a live backend stack; runtime→module v1 contract (P4-T4) and fillout entry (P4-T6) fully typed; OpenAPI regenerated.

**Proven by:** Participant abandons at Q18 of 40 on a laptop and resumes on a phone via link at Q18 with every answer and computed variable intact; CI output shows the fillout-session round-trip and the api/access cross-tenant DENY suite passing.

**Run:** `Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M2' } })`

### Remediation fixes (20)
- [x] `P3-T1` · task · M/low · P3 — Shared test-DB bootstrap: self-provisioned migrations, REQUIRE_DB hard-fail, qdesigner_app DSN in CI  
      status: **✅ merged**
- [x] `P3-T2` · task · L/med · P3 — tower/axum HTTP handler harness: auth + fillout-session round-trips and explicit api/access cross-tenant mutation-DENIAL suite  
      status: **✅ merged**
- [x] `P3-T3` · task · M/med · P3 — MinIO storage + media-proxy Range + email-verification integration tests; provision minio/mailpit in the CI backend job  
      status: **✅ merged**
- [x] `P3-T4` · task · L/high · P3 — Wire fullstack + visual e2e lanes into CI against a real backend stack; kill the conditional e2e skip and the smoke port mismatch  
      status: **✅ merged**
- [x] `P3-T5` · task · L/med · P3 — @testing-library/svelte component tests: shared form/UI primitives + PropertiesPanel/ReactionTimeDesigner/ReactionLabWorkspace  
      status: **✅ merged**
- [x] `P4-T1` · task · L/med · P4 — Regenerate OpenAPI contracts and type the api.ts response path (mappers, session casts, sync body)  
      status: **✅ merged**
- [x] `P4-T2` · task · M/low · P4 — Align SessionManagementService with the real session-update wire contract  
      status: **✅ merged**
- [x] `P4-T3` · task · L/high · P4 — Narrow questionnaire-core DynamicValue to unknown and codify the legacy fields live data actually carries  
      status: **✅ merged**
- [x] `P4-T4` · task · L/med · P4 — Type the runtime→module v1 contract (QuestionRuntimeContext/Result, moduleConfigAdapter, FormQuestionHost)  
      status: **✅ merged**
- [x] `P4-T5` · task · M/med · P4 — Remove the (question as any) type-guard bypasses in PropertiesPanel  
      status: **✅ merged**
- [x] `P4-T6` · task · M/med · P4 — Type the fillout entry against a real FilloutDefinition (rawDefinition, questionList, consent/overlay handlers)  
      status: **✅ merged**
- [x] `P5-T1` · task · M/low · P5 — Dead-code purge: delete 13 orphan files + blocks island, drop 6 unused npm deps, gate test-runtime harness chunk  
      status: **✅ merged**
- [x] `P5-T2` · task · M/low · P5 — Canonical stats/math utils, single mathjs sandbox table, ScoreInterpreter/ScoreInterpretation disambiguation  
      status: **✅ merged**
- [x] `P5-T3` · task · S/low · P5 — Centralize Chart.js registration and the categorical palette in one shared chart-setup module  
      status: **✅ merged**
- [x] `P5-T4` · task · S/low · P5 — Break the questionnaire.ts <-> translation.ts cycle in questionnaire-core via a structural leaf type  
      status: **✅ merged**
- [x] `P5-T5` · task · S/low · P5 — Rename the misleading fillout sync siblings: FilloutSyncEngine -> FilloutUploadSync, FilloutOfflineSyncService -> FilloutContentCache  
      status: **✅ merged**
- [x] `P5-T6` · task · L/med · P5 — Split the 1,642-line api.ts god-service into per-resource modules and drop dual-case field emission  
      status: **✅ merged**
- [x] `P5-T7` · task · M/med · P5 — Collapse the non-reactive UiStore mirror into the designer facade's $state  
      status: **✅ merged**
- [x] `P5-T8` · task · L/med · P5 — Rust structure: Tx guard helper kills the 73-copy unwrap boilerplate; split sessions.rs (3,585 lines) by concern  
      status: **✅ merged**
- [x] `P5-T9` · task · L/med · P5 — Rust query/error safety: adopt sqlx compile-time macros on the highest-churn sessions queries + error-mapping/hygiene cleanup  
      status: **✅ merged**

### New capability (2)
- [x] `E-OFF-1` · epic · XL/high · Offline Fillout — True resumable sessions: rehydrate the runtime from persisted answers across reload and device  
      status: **✅ merged**
- [x] `E-FLOW-3` · epic · L/med · Programmable Flow — True save-and-continue: resumable sessions with position and variable-state restore  
      status: **✅ merged**


## M3 — Precision Reaction Core

**Goal:** Turn the strong precision clock into a complete experiment surface: multi-channel input, vsync-aligned offset, trial feedback, and full per-trial provenance export. This is the reaction pillar's foundational epic set.

**Exit gate:** Gamepad + key-hold/release + spatial responses produce correctly scored trials (evaluateCorrectness no longer rejects non-string values); stimulus offset is vsync-aligned with frame-count duration specification (not setTimeout); trial-level feedback renders (the normalized-but-dead feedback config); tidy long-format export carries signed RT, anticipatory flags, display/output latency, and the phase timeline; photosensitivity advisory shown before reaction paradigms.

**Proven by:** A masked dot-probe with a 100 ms vsync-aligned exposure, spatial left/right response captured over a gamepad, per-trial correctness feedback, exports a tidy CSV with full timing provenance columns — preceded by a photosensitivity + reduced-motion advisory.

**Run:** `Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M3' } })`

### Remediation fixes (2)
- [x] `P8-T3` · task · M/med · P8 — Hoist WebGLRenderer per-frame and per-draw allocations  
      status: **✅ merged**
- [x] `P7-T8` · task · M/low · P7 — Photosensitivity advisory + prefers-reduced-motion surfacing for WebGL reaction tasks; label the stimulus canvas  
      status: **✅ merged**

### New capability (4)
- [x] `E-REACT-1` · epic · L/med · Reaction Suite — Multi-channel precision response capture: gamepad, key-hold/release, and spatial-response scoring  
      status: **✅ merged**
- [x] `E-REACT-3` · epic · M/med · Reaction Suite — Frame-accurate stimulus offset and frame-count duration specification  
      status: **✅ merged**
- [x] `E-REACT-4` · epic · M/low · Reaction Suite — Trial-level feedback and criterion-based practice  
      status: **✅ merged**
- [x] `E-REACT-5` · epic · M/low · Reaction Suite — Full per-trial long-format data capture, provenance columns, and tidy export  
      status: **✅ merged**


## M4 — Instant Feedback Suite Resurrection

**Goal:** Wire the built-but-dead psychometric scoring engine (analytics/ScoreInterpreter, ScoringPipeline, MissingDataHandler) into the participant path and ship a designable end-of-survey report — the feedback pillar is mostly activation, not greenfield.

**Exit gate:** CompletionScreen mounted with scoreConfigs+variables (today inert at q/[code]/+page.svelte:700-707); report page composes multiple widgets with subscale/reverse scoring, T/z/stanine/percentile/CI, and missing-data handling; bundled norm-table library + self-baseline/pre-post source; per-band conditional interpretive text with piping; downloadable PDF with embedded charts; entire path works offline; charts carry role=img alt text.

**Proven by:** A participant finishes a multi-subscale inventory and sees a fully offline report: subscale T-scores against a bundled norm table, a pre/post trajectory line, conditional per-band interpretive text, and a downloadable PDF with embedded charts.

**Run:** `Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M4' } })`

### Remediation fixes (1)
- [x] `P7-T5` · task · M/low · P7 — Chart text alternatives for participant-facing canvases (FeedbackChart + BarChart)  
      status: **✅ merged**

### New capability (6)
- [x] `E-FEEDBACK-1` · epic · XL/med · Feedback Suite — Resurrect the psychometric scoring engine into the participant feedback path (subscale, reverse, T/z/stanine/percentile, missing-data)  
      status: **✅ merged**
- [x] `E-FEEDBACK-2` · epic · L/med · Feedback Suite — Norm/baseline mechanisms: bundled norm-table library + self-baseline/pre-post comparison source  
      status: **✅ merged**
- [x] `E-FEEDBACK-3` · epic · XL/high · Feedback Suite — Designable end-of-survey Report Page: multi-widget composition + wire CompletionScreen scores/variables  
      status: **✅ merged**
- [x] `E-FEEDBACK-4` · epic · M/low · Feedback Suite — Complete the chart-type set: results table, trajectory/pre-post line, and true designable reference bands  
      status: **✅ merged**
- [x] `E-FEEDBACK-5` · epic · L/med · Feedback Suite — Real downloadable per-participant PDF with embedded charts (replace print-dialog)  
      status: **✅ merged**
- [x] `E-FEEDBACK-6` · epic · M/low · Feedback Suite — Conditional feedback builder: per-band messages with variable piping  
      status: **✅ merged**


## M5 — SOTA Flow Programmability (plumbing) + Accessibility + Svelte 5 Correctness

**Goal:** Activate the flow-engine capabilities that are wired-but-dead (loops, timers, counterbalancing, quotas, position-scoped rules) and clear the accessibility and Svelte-5 memoization debt across participant + designer surfaces.

**Exit gate:** Loop blocks expand to N real iterations with per-iteration variable namespacing (BlockRandomizer dedup no longer collapses them); per-page/whole-survey/per-question deadlines enforced with configurable timeout actions; participantNumber flows server-atomically to the least-full arm (no more Latin-square row 0 for everyone); interlocking quota cells + pre-survey screener gate; WCAG focus/aria-live/radiogroup fixes green in axe; zero memoization-defeating $derived callables remain.

**Proven by:** A between-subjects study assigns participant #N to the least-full counterbalanced arm, runs a 3-iteration loop block with per-iteration answer piping, enforces a 90 s per-page limit that auto-advances, screens out ineligible participants at entry, and is fully keyboard-navigable with screen-reader question announcements.

**Run:** `Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M5' } })`

### Remediation fixes (14)
- [x] `P6-T1` · task · M/low · P6 — Fix memoization-defeating $derived callables, effect-as-derived, and config-default $effects  
      status: **✅ merged**
- [x] `P6-T2` · task · L/med · P6 — Finish legacy Svelte 4 migrations: QuestionCard, login, admin screens; delete ThemeProvider  
      status: **✅ merged**
- [x] `P6-T3` · task · M/low · P6 — Sweep deprecated $app/stores to $app/state across the remaining 13 files  
      status: **✅ merged**
- [x] `P6-T4` · task · L/med · P6 — Introduce a Context API seam over the designerStore singleton  
      status: **✅ merged**
- [x] `P6-T5` · task · L/med · P6 — Extract shared reaction block/trial/phase sub-editors; slim ReactionTimeDesigner  
      status: **✅ merged**
- [x] `P6-T6` · task · L/high · P6 — Decompose ReactionLabWorkspace and fold it under the module-registry contract  
      status: **✅ merged**
- [x] `P6-T7` · task · L/med · P6 — Decompose PropertiesPanel into registry dispatch plus extracted section components  
      status: **✅ merged**
- [x] `P6-T8` · task · L/high · P6 — Extract a headless FilloutPageController from the fillout entry page  
      status: **✅ merged**
- [x] `P7-T1` · task · M/med · P7 — Fillout question-change focus management, aria-live region, and heading structure  
      status: **✅ merged**
- [x] `P7-T2` · task · S/low · P7 — Visible focus rings on MultipleChoice/Matrix hidden inputs + muted-foreground contrast margin  
      status: **✅ merged**
- [x] `P7-T3` · task · L/med · P7 — Replace all native alert()/confirm() with a promise-based ConfirmDialog + Toast  
      status: **✅ merged**
- [x] `P7-T4` · task · M/low · P7 — Form primitive ARIA wiring: aria-describedby / aria-invalid / label association  
      status: **✅ merged**
- [x] `P7-T6` · task · M/med · P7 — Scale question ARIA refactor: radiogroup for discrete variants, native slider focus for continuous  
      status: **✅ merged**
- [x] `P7-T7` · task · M/low · P7 — CommandPalette dialog/combobox semantics, focus trap and focus restore; TourOverlay suppression  
      status: **✅ merged**

### New capability (5)
- [x] `E-FLOW-4` · epic · L/med · Programmable Flow — Real repeat/loop blocks with per-iteration variable namespacing, response capture, and piping  
      status: **✅ merged**
- [x] `E-FLOW-5` · epic · M/med · Programmable Flow — Unified timer subsystem: per-page time limits, whole-survey deadline, and per-question response deadlines with configurable timeout actions  
      status: **✅ merged**
- [x] `E-FLOW-6` · epic · L/med · Programmable Flow — Server-atomic between-subjects assignment: wire participantNumber, least-full arm allocation, persisted assignment, working counterbalancing  
      status: **✅ merged**
- [ ] `E-FLOW-7` · epic · L/med · Programmable Flow — Interlocking quota cells + structured pre-survey screener/eligibility gating  
      status: **partial**
- [x] `E-FLOW-8` · epic · M/med · Programmable Flow — Position-scoped flow rules + visual branch-graph authoring beyond page-target resolution  
      status: **✅ merged**


## M6 — Bulletproof Offline

**Goal:** Make the offline product resilient enough for long, reaction-heavy, shared-device field studies: encrypted at rest, cold-offline bootable, integrity-checked, ack-reconciled sync, and honest connectivity UX.

**Exit gate:** Fillout IndexedDB encrypted (WebCrypto AES-GCM) with a purge-and-destroy key lifecycle; cold-offline SPA boot reliably loads the fillout route (SW no longer disabled in dev); sync marks only server-ack-reconciled records with per-session retry, large-payload chunking, and a single unified queue; record checksums + write-verify + append-only sync ledger + eviction guards prevent silent loss; participant sees queued-count/last-synced/manual-sync/save-and-clear/offline quota; mathjs lazy-loaded off the critical path.

**Proven by:** An airplane-mode participant completes a long study; the device shows '23 responses queued, encrypted'; on reconnect the ledger reconciles every server ack with zero silent loss, and a forced storage-eviction is caught and surfaced rather than losing data.

**Run:** `Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M6' } })`

### Remediation fixes (2)
- [x] `P8-T1` · task · M/med · P8 — Server perf: set-based cross-project analytics + batched sync_session inserts  
      status: **✅ merged**
- [x] `P8-T2` · task · M/med · P8 — Lazy-load mathjs VariableEngine off the fillout route's critical path  
      status: **✅ merged**

### New capability (5)
- [x] `E-OFF-2` · epic · L/med · Offline Fillout — Encrypt fillout data at rest (WebCrypto AES-GCM) with a purge-and-destroy key lifecycle  
      status: **✅ merged**
- [x] `E-OFF-3` · epic · L/med · Offline Fillout — Bulletproof PWA app-shell: precache the fillout runtime + offline SPA navigation + dev testability  
      status: **✅ merged**
- [x] `E-OFF-4` · epic · L/med · Offline Fillout — Sync hardening: ack-reconciled marking, per-session retry, large-payload chunking, unify the two offline queues  
      status: **✅ merged**
- [ ] `E-OFF-5` · epic · L/med · Offline Fillout — Integrity + no-silent-loss: record checksums, write-verify, a sync ledger, and eviction guards  
      status: **partial**
- [x] `E-OFF-6` · epic · M/low · Offline Fillout — Participant connectivity UX: queued-count, last-synced, manual sync, save-and-clear, offline quota disclosure  
      status: **✅ merged**


## M7 — Multi-tenant Governance Foundation + Product UX Polish

**Goal:** Turn team-collaboration RBAC into real multi-tenant isolation with governance, and finish the remaining designer/admin UX polish. E-RBAC-1 is treated as security-adjacent (closes an active cross-project read-exposure gap) and must not be deferred to the enterprise tail.

**Exit gate:** Project-scoped READ isolation enforced (verify_project_access + list_projects consult project_members — ProjectRole::Viewer can no longer see all org projects); append-only audit log + admin timeline; granular Permission enum activated with require_permission + custom roles over the dead models.rs:66 enum; project member UI + seat model; explicit org & project ownership transfer; per-org branding; real DNS-TXT domain verification; self-service account deletion (GDPR erasure).

**Proven by:** A ProjectRole::Viewer added to a single project sees only that project (not the whole org); every privileged mutation appears in the org audit timeline; a custom role with a scoped permission set is created and enforced end-to-end; a sole-owner-guarded self-deletion anonymizes PII and revokes tokens.

**Run:** `Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M7' } })`

### Remediation fixes (7)
- [x] `P8-T4` · task · M/low · P8 — Cross-project analytics UI on the org analytics page  
      status: **✅ merged**
- [x] `P8-T5` · task · L/med · P8 — Adopt Input/Select/Checkbox/FormGroup/Button across module designer panels + fix the project create modal  
      status: **✅ merged**
- [x] `P8-T6` · task · M/low · P8 — Skeleton loading states + lazy list rendering on dashboard and analytics detail  
      status: **✅ merged**
- [x] `P8-T7` · task · S/low · P8 — Tap/keyboard question-reorder affordance in the designer canvas  
      status: **✅ merged**
- [x] `P8-T8` · task · M/med · P8 — Real DNS TXT domain-ownership verification (server + admin UI)  
      status: **✅ merged**
- [x] `P8-T9` · task · S/low · P8 — Onboarding invitation discovery (join-vs-create)  
      status: **✅ merged**
- [x] `P8-T10` · task · L/med · P8 — Self-service account deletion (GDPR erasure path)  
      status: **✅ merged**

### New capability (6)
- [x] `E-RBAC-1` · epic · L/high · RBAC / Multi-tenant — Enforce project-scoped read isolation so ProjectRole is a real access boundary  
      status: **✅ merged**
- [x] `E-RBAC-2` · epic · L/med · RBAC / Multi-tenant — Append-only audit log of privileged actions with admin timeline UI  
      status: **✅ merged**
- [x] `E-RBAC-3` · epic · XL/high · RBAC / Multi-tenant — Activate a granular permission layer + custom roles over the dead Permission enum  
      status: **✅ merged**
- [x] `E-RBAC-4` · epic · M/med · RBAC / Multi-tenant — Project member management UI + seat model  
      status: **✅ merged**
- [x] `E-RBAC-5` · epic · M/med · RBAC / Multi-tenant — Explicit org & project ownership transfer  
      status: **✅ merged**
- [x] `E-RBAC-8` · epic · M/low · RBAC / Multi-tenant — Per-org branding/whitelabel application + org settings surface  
      status: **✅ merged**


## M8 — Enterprise Federation + Adaptive / Longitudinal / Paradigm Frontier

**Goal:** The highest-order differentiators that require the full foundation: federated identity, the adaptive + longitudinal SOTA flow, and the standard-paradigm library. Highest estimation variance — external-standard and IRT-heavy work.

**Exit gate:** OIDC/SAML SSO with JIT org membership; SCIM 2.0 provisioning + API keys/service accounts; org-level GDPR export + tenant erasure + residency tagging; cross-project/external-guest sharing; CAT/IRT adaptive item-bank block live in fillout (CATSession wired — today CATEngine.ts:45 has zero runtime references) with SE-stop; longitudinal/EMA multi-session scheduling + reminders + resume-link enrollment; nine new standard paradigms (Go/NoGo, SART, Simon, Posner, visual search, Sternberg, PVT, temporal-order, RSVP); participant-level counterbalancing + stimulus-set assignment.

**Proven by:** An enterprise tenant provisions users via SCIM, logs in via SAML, runs a 7-day EMA study with push reminders and a CAT-adaptive depression scale that stops at SE<0.3 plus a counterbalanced Go/NoGo block, then exports the whole tenant's data on a GDPR request.

**Run:** `Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M8' } })`

### New capability (8)
- [ ] `E-RBAC-6` · epic · XL/high · RBAC / Multi-tenant — SSO federation (OIDC/SAML) with JIT org membership  
      status: **partial**
- [x] `E-RBAC-7` · epic · XL/high · RBAC / Multi-tenant — SCIM 2.0 provisioning + API keys / service accounts  
      status: **✅ merged**
- [x] `E-RBAC-9` · epic · L/high · RBAC / Multi-tenant — Org-level GDPR data export + tenant erasure + data residency tagging  
      status: **✅ merged**
- [x] `E-RBAC-10` · epic · L/high · RBAC / Multi-tenant — Cross-project & external-guest sharing controls  
      status: **✅ merged**
- [x] `E-FLOW-1` · epic · XL/high · Programmable Flow — Wire the CAT/IRT adaptive engine into the fillout runtime as an adaptive item-bank block  
      status: **✅ merged**
- [x] `E-FLOW-2` · epic · XL/high · Programmable Flow — Longitudinal / EMA study series: multi-session scheduling, reminders, and resume-link enrollment  
      status: **✅ merged**
- [x] `E-REACT-2` · epic · XL/med · Reaction Suite — Standard-paradigm library expansion: Go/NoGo, SART, Simon, Posner, visual search, Sternberg, PVT, temporal-order, RSVP  
      status: **✅ merged**
- [x] `E-REACT-6` · epic · M/med · Reaction Suite — Participant-level counterbalancing and stimulus-set assignment  
      status: **✅ merged**

