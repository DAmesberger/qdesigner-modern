# Gap Remediation Plan — 2026-07-10

Source: post-M8 six-agent gap scan (report artifact:
https://claude.ai/code/artifact/c7378e62-8253-4221-84bc-52eceea0d7c5).
Method: supervised implementation — a supervisor session spawns implementation
agents per unit/wave in the shared working tree, reviews every diff, runs the
full gate, and commits per wave. **No agent commits; the supervisor commits.**

Gate per wave (all must be green before commit):

```
pnpm --filter @qdesigner/web check
pnpm --filter @qdesigner/web test
pnpm --filter @qdesigner/scripting-engine test   # when scripting touched
pnpm --filter @qdesigner/web build
cargo check --manifest-path apps/server/Cargo.toml          # when server touched
cargo clippy --manifest-path apps/server/Cargo.toml --all-targets -- -D warnings
cargo test  --manifest-path apps/server/Cargo.toml -- --include-ignored
```

Each phase exits through a **live browser QA pass** (agent-browser; dev servers:
backend `set -a; source .env.development; set +a; cargo run --manifest-path
apps/server/Cargo.toml`, frontend `pnpm dev` on **4173**). Green tests ≠ works —
project law.

Statuses: `todo` → `in-progress` → `merged` (or `deferred`). Update this file as
the ledger.

---

## R0 — Land the in-flight auth migration ✅ MERGED (commit `5fdadd8`)

| Unit | Scope | Status |
|---|---|---|
| R0-1 | Full gate on the working tree (Zitadel opaque-session work, migrations 00044/00045) | **merged** — required 2 supervised fixes: delete_account self-deadlock (drop(tx) does not commit; revocation moved onto the request tx, helpers take PgExecutor) + test-harness machine-token routing (sk_/scim_ → Bearer, sessions → qd_session cookie) |
| R0-2 | Commit auth work + plan doc + skills tooling | **merged** (`5fdadd8`, `e56dbb2`, `71d5b75`) |

Cookie-session auth browser-verified during R1 exit QA (login → /dashboard, reload stays authenticated, qd_session httpOnly).

Post-R0 follow-up (deferred to R5-4): delete vestigial JWT-era endpoints
(`/auth/refresh`, `/auth/me`, `/auth/csrf/rotate`, token-variant
`/auth/verify-email`) once the cookie-session model is confirmed the only path.

---

## R1 — Wire what's built + fix the lies ✅ MERGED (commits `66d1035` R1-A, `ef3e833` R1-B)

**Exit live-QA 2026-07-10: all 8 checklist items PASS in-browser** (auth reload,
nav reachability, real timestamps, Run button → /q/{code} new tab, F-35 dialog
stress + adaptive persistence across reload, publish gate both paths, all 3
delete confirms, bogus-code screen). **F-35 CLOSED.** Bonus fixes landed:
DocumentStore normalization silently downgraded `adaptive` blocks to `standard`
and dropped their config on every save (found by R1-5's test); fillout code is
derived from the questionnaire UUID (first 8 hex) — no stored column (R1-2).
Residual observation: a one-time "Auto-save failed" toast right after block
creation, self-recovered, data intact (pre-existing, noted post-M5 too).

### Wave R1-A (parallel: 4 agents)

| Unit | Title | Files | Detail / acceptance |
|---|---|---|---|
| R1-1 | Un-orphan `/admin/settings` and `/analytics` | `AppShell.svelte:20-24`, `admin/+page.svelte:227-231`, `CommandPalette.svelte:55-124` | Add "Analytics" to main nav; admin hub gets a real "Organization Settings" card → `/admin/settings` and "View Analytics" href fixed `/projects`→`/analytics`; both routes added to command palette. Accept: every built page reachable ≤2 clicks from dashboard. |
| R1-2 | Fix broken "Run questionnaire" button | `projects/[projectId]/+page.svelte:257`, `lib/routing/paths.ts:26` | Published questionnaires have a fillout code → button opens `/q/{code}` in a new tab; remove the dead `projectQuestionnaireRun` helper. If code isn't in the list payload, extend the list mapping (it exists server-side). Accept: Play on a published questionnaire opens working fillout; no 404 path remains. |
| R1-3 | Closed-study error screen | `(fillout)/q/[code]/+page.ts:104-115`, `+error.svelte:6-20` | Map inactive/ended → styled "Questionnaire Closed" (throw 410 where semantically closed; keep 403 for true forbidden and add a 403 branch). Accept: an ended questionnaire shows "Closed", not "Something Went Wrong". |
| R1-4 | Real dashboard timestamps | `dashboard/+page.ts:60-61` (+ server list handler if fields missing) | Stop hardcoding `new Date()`; surface real `created_at`/`updated_at` from the API (add to server response if absent). Accept: cards show true dates; no "Updated just now" for old items. |

### Wave R1-B (parallel: 3 agents)

| Unit | Title | Files | Detail / acceptance |
|---|---|---|---|
| R1-5 | F-35: block-dialog render mutation | `BlockManager.svelte:744` (`ensureAdaptive` at :59, `patchLoop`/`Object.assign` :83-91), `Dialog.svelte:114` | Remove all `$state` mutation during template render: normalize the adaptive/loop config when the dialog *opens* (event handler), not in the template; template reads only. Accept: repeated Add/Edit Block open-edit-save cycles never wedge; add a component test for the open→edit→save cycle; then human smoke-test closes F-35. |
| R1-6 | One publish path + safe versioning | `VersionManager.svelte:21,67,81,106,115,130`, `DesignerHeader.svelte:96-100` | VersionManager's Publish goes through the same `canPublish` validation gate + confirm as the header (extract shared helper); version "load"/rollback gets a dirty-guard confirm ("replace current working copy?"); wire `bumpNote` into the bump call if the API accepts a note, else store it in the version metadata in content — no dead state. Accept: invalid questionnaire cannot be published from anywhere; rollback always confirms. |
| R1-7 | Missing delete confirms | `FlowControlManager.svelte:115`, `TranslationPanel.svelte:87`, `reaction/BlockEditor.svelte:53` | Route the three unguarded deletes through the shared `confirmDialog` (match `QuestionCard.svelte:29` pattern; locale delete warns "removes N translations"). Accept: no immediate destructive delete remains in the designer. |

**R1 exit:** full gate + live QA (nav reachability, run button, closed-study
screen, block dialog stress, publish gating) + commit(s).

---

## R2 — Participant integrity ✅ CLOSED (exit live-QA passed; F-42 aftercare fixed `b736dbd`)

R2-1 `629730f` progress indicator (F-7 closed) · R2-2 `5838974` screener wired
(fake-thank-you fixed; F-40 logged) · R2-3 `ca11d22` deadletter surfaced ·
R2-4 `0ac60ff` WebGL preflight · R2-5 `272f9a1` recoverable errors + assertive
a11y · R2-6 `fba0bfc` prepare-offline (F-21) + cross-device notice (F-10
messaging).

### Wave R2-A (parallel: 3 agents)

| Unit | Title | Files | Detail / acceptance |
|---|---|---|---|
| R2-1 | Progress indicator (F-7) | fillout `+page.svelte`, `FilloutPageController.svelte.ts`, consume `settings.showProgressBar` | "Question N of M" + slim progress bar in the form-card chrome, page-based counting, honors `showProgressBar`, localized via Paraglide keys (add `fillout_progress`), announced politely to SR. Accept: authored toggle actually controls a visible, accurate indicator. |
| R2-2 | Wire the screener (closes F-20) | `ScreenerController.ts` (exists, unused), `FlowGraph.ts:136,342`, `FilloutPageController.svelte.ts`, new `ScreenedOutScreen` | `terminate`-with-screenout edges route to a dedicated screened-out screen (reason text + optional redirect, panel-integration aware), clearly distinct from completion; no completion code shown. Accept: an ineligible participant sees "you're not eligible", never "Thank You!". |
| R2-3 | Surface deadletter (silent-loss fix) | `FilloutPageController.svelte.ts:174,350`, `SyncStatusPanel.svelte`, `ShareDeviceExit.svelte` export path | SyncStatusPanel gets an error state when `deadletterCount > 0`: "N answers could not be submitted" + export escape hatch (reuse ShareDeviceExit export). Assertive live region. Accept: permanently rejected rows are visible + exportable, never "All saved". |

### Wave R2-B (parallel: 3 agents)

| Unit | Title | Files | Detail / acceptance |
|---|---|---|---|
| R2-4 | WebGL preflight | fillout `+page.ts`/controller, `WebGLRenderer.ts:151` | If the definition contains v1 reaction items, probe WebGL2 before session creation; unsupported → friendly blocking screen ("this study needs a device with…"). Accept: no mid-study uncaught throw on WebGL-less devices. |
| R2-5 | Recoverable errors + assertive a11y | `+page.svelte:374-382`, `ResourceManager.ts:198`, `ConsentScreen.svelte:147-149` | Media preload failure gets a Retry button (re-run preload, keep session); in-page error and consent validation get `role="alert"`. Accept: transient network blip is recoverable without losing the session; errors announced to SR. |
| R2-6 | Offline/resume affordances (F-21, F-10 messaging) | `WelcomeScreen.svelte`, controller, `+page.ts:283-295` | "Prepare offline" action on Welcome (prefetch media + content, show cached-state confirmation); anonymous cross-device open with `?sid=` shows honest "previous answers can't be restored on this device — continuing fresh" note. Accept: field-study provisioning is explicit; silent fallback is messaged. |

**R2 exit:** gate + live QA (fillout golden path + each new edge screen, offline
toggle in devtools) + commit(s).

---

## R3 — Researcher workflow ✅ CLOSED (exit live-QA passed 9/11 direct + 2 static/expected)

R3-1 `b90c25d` per-session response browser (F-41 logged) · R3-2 `b53c64e`
project lifecycle · R3-3 `7f13d9f` questionnaire lifecycle · R3-4 `eedd445`
pagination + export N+1 · R3-5 `3adee23` advanced analytics wire-or-delete
(−3,320 LOC; Advanced tab: segmentation + cohort comparison) · R3-6 `b5b67a3`
guest analytics (F-32 closed).

### Wave R3-A

| Unit | Title | Detail / acceptance |
|---|---|---|
| R3-1 | Per-session response browser (L) | Session table rows in `projects/[projectId]/analytics` become clickable → session detail (drawer or route): answers keyed to question text, session variables, timing provenance per trial, events timeline, sync status. Server: reuse existing `GET /sessions/{id}` + `/responses` + `/events` (events GET is currently orphan — this is its consumer). Accept: researcher reads any participant's full record in ≤2 clicks. |
| R3-2 | Project lifecycle UI | Rename/archive/delete on `/projects` and project page; wire the dead "More" menu (`projects/[projectId]/+page.svelte:284-289`). Delete = typed-confirm; archive hides from default list with filter. Server CRUD exists. |
| R3-3 | Questionnaire lifecycle UI | Duplicate / delete / archive / move-to-project actions on questionnaire cards. Check server endpoints; add thin handlers where missing (duplicate = copy content + reset version/code). |

### Wave R3-B

| Unit | Title | Detail / acceptance |
|---|---|---|
| R3-4 | Table pagination + N+1 fix | Paginate/sort sessions, admin users, cross-project analytics (follow audit-log pattern); replace the all-projects walk in `analytics/[questionnaireId]/+page.svelte:116-135` with a direct lookup. |
| R3-5 | Advanced-analytics decision (supervisor gates scope) | Wire `CohortComparison` + `FilterBuilder` + `DashboardBuilder` behind an "Advanced" tab on `/analytics/[questionnaireId]` **or** delete the unreachable modules (FactorAnalysis/PowerAnalysis/NormativeScoreInterpreter stay only if wired). No third state: nothing stays exported-but-unreachable. |
| R3-6 | Guest analytics route (F-32) | Read-only `/shared/questionnaires/[id]/analytics` honoring share grants; dashboard "Shared with me" questionnaire rows become openable. |

**R3 exit:** gate + live QA + commit(s).

---

## R4 — i18n & consistency ✅ ALL UNITS MERGED, exit live-QA passed 2026-07-10

R4-1 `0bb37d2` fillout chrome i18n (109 keys en/de/es, chrome follows content
locale) · R4-2 `c940f28` admin sweep + F-43 count fix · R4-3 `d8271bf` visual
report editor + real-renderer preview · R4-4 `9e35c5a`+`b11dc4a` scientific
validation (surfaced F-45) · R4-5 `d84afd0` designer safety (F-39 closed) ·
R4-6 `58fd6db` study settings + consent authoring (F-44 closed) + consent
checkbox crash fix `f257179` · R4-7 `26899de` media dimensions (F-8 closed) ·
F-42 sync retry-forever fix `b736dbd` · F-45 quota evaluation fix `9fece4e`.

**Exit QA (9/9 pass):** i18n flip, consent flow, quota validation + real
gating (2nd session correctly hit "Study Full" where the old stub allowed),
report grid drag + preview, undo/redo/Tools/delete-confirm/translation bars,
media dims + letterboxing, admin toasts + non-zero counts, no console errors.
Found F-46 (dead empty-state upload CTA — fixed `81865aa`; the later QA
retraction confirmed the fix). QA follow-up RESOLVED the ISI question: the
Min/Max ISI fields live under the PVT paradigm (only paradigm with an ISI
range by design; validation fires — "minimum cannot exceed the maximum") —
R4-4 fully PASS, no human check needed. Fresh live evidence captured for
R4-1 (en↔de chrome flip incl. progress chip) and all four R4-6 sub-items
(progress toggle both ways, consent checkbox+signature gating, no crash).
Remaining human smoke: WebGL trials advancing in a REAL browser (headless
automation couldn't drive frame-timed WebGL; M3's REACTION-SMOKE previously
proved it). New: F-47 (no UI entry opens MediaManager manage mode → assets
undeletable from the designer). Demo-data note: rebuild the seeded "Reaction
Time Study" (drifted to a plain MC question). Deferred: onboarding wizard.

| Unit | Title | Detail |
|---|---|---|
| R4-1 | Paraglide the fillout chrome | Welcome/Consent/Completion/error-boundary/controller fallback strings + LanguagePicker aria-label → `fillout_*` messages, keyed to content locale (`effectiveLocale`), en+de seeds; translatable-chrome override where questionnaire provides its own text. |
| R4-2 | Admin consistency sweep | One feedback idiom (toast) across admin pages; migrate `invitations`/`domains` to runes + typed; `goto` over `window.location.href`; chart colors → theme tokens. |
| R4-3 | Report-page visual editor | Replace numeric x/y/w/h with a drag/resize grid + live preview using `ReportPageView` (the participant renderer) with sample data. |
| R4-4 | Scientific-editor validation | Inline validation: CAT a/b/c ranges, ISI/timing min≤max, quota condition formula parse-check (scripting-engine parser), series wave interval sanity + email format. Invalid = field-level error, publish-gate integration. |
| R4-5 | Designer polish | Undo/redo toolbar buttons; header overflow grouping (≤6 primary actions); media dimensions (server adds width/height on upload — F-8 — UI shows them, no more blind `object-cover`); translation-progress % per locale. |
| R4-6 | Onboarding + dashboard dedup (S, optional) | Resumable onboarding checklist; admin dashboard de-duplicated to admin-specific content. |

**R4 exit:** gate + live QA (incl. a non-English fillout run) + commit(s).

---

## R5 — Production & enterprise closeout ✅ MERGED (except on-demand items)

R5-1/R5-2 `f64b156` prod fail-loud + SAML honesty (F-27 interim) · R5-3
`0ea11b3` hardening ledger F-25/30/31/34/37 (migration 00047, housekeeping
task) · R5-4 `e561c85` orphan-endpoint removal (−2,293 lines; resolves the
CLAUDE.md check-duplicate TODO; accuracyTrend computed). **Still open by
design:** R5-5 SSO-vs-real-IdP live-QA (F-28, needs a dev IdP in compose)
and the full SAML ACS (F-27, on customer demand); qdesigner_app prod
password (ADR 0014, deployment-time).

| Unit | Title | Detail |
|---|---|---|
| R5-1 | Prod config fail-loud | Missing `cors_origins` in prod-like env (`APP_ENV` etc.) = startup error, not localhost fallback (`organizations.rs:1619`, `sso.rs:804`); `qdesigner_app` password env-sourced; ops doc for `--features dns-verify`. |
| R5-2 | SAML honesty (F-27 interim) | Hide/disable `protocol='saml'` in `/admin/sso` UI with "contact us" note until the ACS handler ships; server rejects saml IdP *creation* (not just runtime). Full samael ACS = separate on-demand epic. |
| R5-3 | Hardening ledger | F-34 export TOCTOU (partial unique index on `data_exports` WHERE status pending/running); F-31 share purge (tokio interval job calling `purge_expired_resource_shares()`); F-30 dedicated API-key rate bucket; F-25 sole-member GDPR `status='active'` consistency; F-37 `yjs_state = NULL` on non-collab `content` writes. |
| R5-4 | Dead-code & orphan cleanup | Delete `mediaService.updateMedia`/`generateThumbnail` stubs, JWT-era auth endpoints (post-R0 confirmation), orphan session endpoints not consumed by R3-1 (`filter`, `check-duplicate` — note CLAUDE.md known-TODO before deleting), stub `accuracyTrend` (implement or remove the field). |
| R5-5 | SSO live-QA vs real IdP (F-28) | Keycloak (or Zitadel dev instance, now natural) in docker-compose + browser pass over org-SSO and Zitadel login. |

**R5 exit:** gate + live QA + commit(s). Then regenerate STATUS ledger and close.

---

## Supervisor protocol (this arc)

- Agents implement **one unit each** in the shared tree; prompt = the unit row
  above + repo conventions (pnpm only, Svelte 5 runes, no crate-wide fmt, no
  commits, match existing idioms, add tests fail-pre/pass-post where feasible).
- Waves group **file-disjoint** units for parallelism; supervisor serializes
  anything touching shared hotspots (`+page.svelte` fillout, `AppShell`,
  `FilloutPageController`).
- Supervisor reviews every diff (scope creep, fmt churn, contract drift), runs
  the gate, commits with unit IDs in the message.
- Live QA at each phase exit is mandatory; findings become F-ledger entries in
  `FOLLOWUPS.md`.
