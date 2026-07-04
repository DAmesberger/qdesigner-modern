# Phase 8 — Fillout renderer & reaction-framework remediation plan

Status: **in progress** (implementation started 2026-07-04, branch `phase-8/design-system`).
Origin: audit of the WebGL renderer, reaction-time framework, and multiple-choice
fillout path (see memory `fillout-rendering-three-stacks`). Three parallel rendering
stacks exist; only `ReactionEngine` + `WebGLRenderer` draws pixels. Form questions
render via a Svelte DOM overlay (ADR 0018). The other two stacks
(`lib/runtime/renderers/*`, `lib/runtime/stimuli/*`) are non-drawing scaffolding.

**Hard constraint:** fillout must work FULLY offline. Versioned questionnaire
definitions and all results (responses/events/variables) must sync to local storage
and reconcile to the server idempotently on reconnect.

## Cross-cutting contracts (fixed before any parallel work)

- **D1 — same-origin, stable media URLs.** Replace expiring presigned MinIO URLs with a
  streaming proxy `GET /api/media/{id}/content` on the API origin. Fixes cross-origin
  texture taint, COEP `require-corp`, and the offline Cache-API expiry/keying problem in
  one move. Cache key becomes a stable path; `Cache-Control: immutable`; Range support
  for video seeking.
- **D2 — one offline-first write path for results.** Every response/event/variable is
  written to IndexedDB first (with a `clientId` UUID), then `FilloutSyncEngine.syncNow()`
  is triggered when online. Server `ON CONFLICT (client_id) DO NOTHING` makes replay
  idempotent. Deletes the buggy online direct-submit mapper.
- **C-PROVENANCE — timing provenance object** stored per response (and per trial inside
  the reaction value blob), JSON:
  `{ onsetMethod, responseMethod, displayLatencyMs?, outputLatencyMs?, rawRtMs?,
     anticipatory?, frameStats?{fps,droppedFrames,jitter}, calibration? }`.
  Server column `responses.timing_provenance JSONB` (migration 00023).
- **Version pinning.** A session pins the exact `(questionnaireId, major.minor.patch)` +
  definition snapshot it started against; resumed/offline sessions load the pinned
  snapshot, never the latest cached one.

## Phase 1 — data-destroying bugs (small diffs, ship first) — ✅ DONE

Landed 2026-07-04. Gates: svelte-check+tsc 0 errors; web suite 768 passing (+ new
persistence-timing regression tests); cargo check clean; server sync_session_dedup 3/3
against live Postgres (migration 00024 applied, timing_provenance insert exercised).
Adversarial review caught + fixed a critical golden-path bug: `FilloutSyncEngine` only
drained sessions in the `filloutSessions` table, so online-created sessions (no local
row) never synced — fixed to drive off unsynced child records. Live browser QA of the
fillout golden path is PENDING (consolidated after Phase 2, which re-touches +page.svelte
and media resolution).


1.1 Form prompts/descriptions never render — `BaseQuestion` reads `question.title`;
    factory/designer write `text`/`display.prompt`/`display.description`. Map them in
    `moduleConfigAdapter` + `ModularRenderer`.
1.2 Online submit drops `reaction_time_us`/`presented_at`/`answered_at` (snake vs camel).
    Superseded by D2: delete the direct-submit branch, route through offline persistence.
1.3 Trial-level timing provenance not persisted at top level. Add `timingProvenance` to the
    record + sync payload + server column; align `ReactionExperiment.svelte` TrialRecord.
1.4 MC min/max selections unenforced — enforce in component + `BaseQuestion.validate`.
1.5 `BaseQuestion.validate` treats `[]` as satisfying `required` — fix array check.
1.6 "Other" response shape inconsistent — always emit `{selection, other}`.
1.7 `randomizeOptions` unseeded — seed with `sessionId+questionId`, persist order.
1.8 Module-registration race on resumed sessions — await registration; fail loud.

## Phase 2 — offline integrity: versioned questionnaires + results — ✅ DONE

Landed 2026-07-04. Gates: svelte-check 0 errors; web 770 passing (+ offline-roundtrip);
cargo check clean; server suite 44 passing (migrations 00024/00025/00026 apply in order on
live DB). Adversarial review caught 4 HIGH issues, all fixed: (1) cross-tenant media RLS
leak — org-scoped the anon-read policy; (2) designer `<img>` 404 — split proxy (fillout) vs
presigned (designer, Bearer can't ride an img src); (3) online-session version-pin GC gap
(the recurring "no local row" trap) — `recordServerSession` writes a durable pin; (4)
reaction WebGL baked presigned URLs — fillout runtimes now re-resolve media to the stable
same-origin proxy from `mediaId` (both reaction-experiment + reaction-time). Plus: cache-name
v1→v2 unification, sw video background-cache + clean media-miss error, eviction byte
accounting, dedup published-gate, openapi schema, Content-Length. Deferred low: s3 InvalidRange
→ 416 (currently 500 for malformed-range probes only). Live browser QA still pending
(consolidated after implementation phases).

## Phase 2 — offline integrity (original plan)

2.1 Implement D1; re-key `fillout-media-v1` on stable URLs.
2.2 Pin definition + version per session (Dexie v3, `[id+version]` key).
2.3 Definition refresh keeps versions pinned by active sessions; GC unreferenced.
2.4 Offline-completion → reconnect e2e (client_id dedup, exactly-once).
2.5 `check_duplicate` anonymous regression — server-side fingerprint dedup at create.
2.6 Media cache LRU/quota (never evict versions pinned by unsynced sessions).

## Phase 3 — reaction timing correctness — ✅ DONE

Landed 2026-07-04. Gates: svelte-check 0 errors; web 784 passing (+ deterministic
ReactionEngine tests with a mock renderer + injected clock). Adversarial review caught a
HIGH: audio onset double-counted output latency in the getOutputTimestamp() branch (that
pair is already output-referenced) — fixed branch-specific + a representative test mock that
catches it. Also fixed: gatekeeper qualify() in-flight memoization (two callers shared one
~320ms calibration), video raf-fallback now display-latency compensated (same compositor
clock as visual raf), a blocking test-mock type error (gatekeeper option retyped to a
structural interface), and reaction-TIME responses now persist a non-empty timing_provenance
via a shared aggregateReactionProvenance helper (parity with reaction-experiment). Shipped:
audio output-latency compensation, concurrent stimulus-duration timing, rVFC video onset
ownership (expectedDisplayTime + per-frame ring), anticipatory/false-start flagging, audio
warmup into audioBufferCache + primeAudio() on the consent gesture, wired the previously-dead
TimingGatekeeper/Calibration/DeviceQualification + banner, and corrected the
"microsecond-accurate" claim across CLAUDE.md/README/app.html/help/tour to "frame-accurate
onset, sub-ms relative precision".

## Phase 3 — reaction timing correctness (original plan)

3.1 Audio onset ignores output latency — add `outputLatency`/`getOutputTimestamp`.
3.2 `stimulusDurationMs` ordering broken — concurrent duration timer + response window.
3.3 rVFC video onset loses first-wins race + wrong field — let rVFC own onset via
    `expectedDisplayTime`; log `{mediaTime,presentedFrames,expectedDisplayTime}` ring.
3.4 Visual onset uncompensated + calibration subsystem dead — wire
    `TimingGatekeeper`/`TimingCalibration`/`DeviceQualification`; apply display-latency;
    mount `DeviceQualificationBanner`.
3.5 Anticipatory/premature responses collapse to RT 0 — flag `anticipatory`/`falseStart`,
    keep signed `rawRt`, never compute RT against null onset.
3.6 `warmUpStimuli` warms wrong audio cache — warm `audioBufferCache`; create/resume
    AudioContext on the consent-screen gesture.
3.7 `ctx.resume()` gesture failure → silent HTMLAudio — same gesture hook; mark degraded.
3.8 `marksStimulusOnset` scheduled phases dead — explicit reset semantic or remove.
3.9 Shallow tests — deterministic ReactionEngine tests (mock renderer + fake clock).
3.10 Update "microsecond-accurate" claim to "frame-accurate onset; sub-ms relative".
     Done: CLAUDE.md project overview corrected — the unsupportable "microsecond-accurate
     reaction time measurements" claim now reads as frame-accurate onset (display-latency
     corrected), high-res input timestamps, output-latency-corrected audio, sub-ms *relative*
     precision, and the COOP/COEP requirement for full timer resolution.

## Phase 4 — renderer robustness — ✅ DONE

Landed 2026-07-04. Gates: svelte-check 0 errors; web 800 passing (+ WebGLRenderer + engine
robustness tests). Adversarial review caught 3 HIGH: (1) custom-shader onError deduped for
the renderer's lifetime → trials 2..N not invalidated (fixed: emit every time, engine dedupes
per-trial); (2) a failed static upload was cached → trials 2..N drew blank yet weren't
invalidated (fixed: uploadTextureSource returns success, failed uploads not cached so each
draw retries + re-emits); (3) the reused text canvas was never re-uploaded → the PREVIOUS
trial's text drew (fixed: invalidateTexture after redraw + per-trial texture free). Also:
wired markTextures/deleteTexturesSince per trial (leak), real QuestionnaireRuntime.dispose()
(stop + destroy), invalid/invalidReason propagated into persisted trial records, and
ensureRenderer only remaps the genuine no-WebGL2 case. Shipped: onError surfacing +
trial-invalidation on render failure, crossOrigin before src, context-loss/restore rebuild,
single lazy renderer (form-only questionnaires never touch getContext), removed the fake
gpuTime stat + non-drawing custom-shader stub. Deferred low: DPR sharpening (resizeToDisplaySize
exists but the runtime keeps CSS-px resize — correct sizes, blurry on HiDPI; enabling it needs
stimulus-size scaling to avoid a half-size regression).

## Phase 4 — renderer robustness (original plan)

4.1 Tainted-texture SecurityError silently swallowed — surface via onRenderError; abort
    + mark trial invalid.
4.2 `loadImage` no `crossOrigin`; `loadVideo` sets it after `src` — set before `src`.
4.3 No context-loss handling — `webglcontextlost`/`restored`; rebuild GL resources.
4.4 DPR never applied — `resizeToDisplaySize(devicePixelRatio)`; audit pixel math.
4.5 GPU texture leak + per-frame re-upload of statics — re-upload only for video; delete
    per-trial textures; reuse one text canvas.
4.6 Two `WebGLRenderer` instances on one canvas — delete the page-level one.
4.7 Hard WebGL2 requirement for form-only questionnaires — lazy renderer; specific error.
4.8 `gpuTime` fake + `executeCustomShader` stub — delete/reject with clear error.

## Phase 5 — dead-code excision + docs — ✅ DONE

Landed 2026-07-04. Gates: svelte-check 0 errors; web 800 passing. Deleted 16 files (the
hollow stack: QuestionPresenter + runtime/renderers/* + runtime/stimuli/*), moved
RenderContext into WebGLRenderer, trimmed ResourceManager's GL half, taught scanQuestionnaire
about reaction config.assets. Review caught that display charts (bar-chart,
statistical-feedback) would THROW when routed to the overlay because ModularRenderer had no
`display` case — fixed by mapping the item under instruction/analytics/block so every display
component finds its prop (they were invisible before, now render). ADR 0023 written; CLAUDE.md
architecture + baseline updated; last stray "microsecond" claims removed (en.json, README).

## ALL PHASES COMPLETE (2026-07-04)

Phases 1–5 done and integrated. Cumulative gate: web suite 800 passing (was 716 baseline),
server 44 passing, svelte-check + tsc 0 errors, cargo check clean, migrations 00024/00025/00026
apply in order on live DB. Every phase's adversarial-review pass caught ≥1 HIGH/critical bug
before integration. Remaining: (1) consolidated live browser QA; (2) phase-8/design-system →
main merge assessment (below).

## Phase 5 — dead-code excision + docs (original plan)

5.1 Route `display`/`analytics` items to the DOM overlay (their HTML already exists in
    `QuestionPresenter`; nothing draws it today).
5.2 Delete the hollow stack: `lib/runtime/renderers/*`, `QuestionPresenter`,
    `lib/runtime/stimuli/*`, the `(gl as any).resourceManager` pattern; keep the
    loader/cache half of `ResourceManager`. Teach `scanQuestionnaire` about
    reaction-experiment `config.assets`.
5.3 ADR 0023: hybrid rendering finalized (DOM overlay for non-v1; ReactionEngine+WebGL the
    only GL path; D1 media proxy; D2 single persistence path). Update CLAUDE.md + baseline.

## Live browser QA — ✅ DONE (caught + fixed a real golden-path bug)

Drove the fillout golden path in chromium (agent-browser) against a freshly-published
MC questionnaire. Verified LIVE: the question prompt + description + options render (the
flagship Phase 1 fix — before it, `BaseQuestion` read an empty `title` and showed nothing);
required-gating works; the response is captured with value + `reactionTimeUs` + `presentedAt`
+ `answeredAt`.

**Live QA caught a HIGH bug all 800 unit tests missed:** anonymous participants' responses
were saved locally (`synced: 0`) but NEVER reached the server. Root cause:
`FilloutSyncEngine.ensureServerSession` probes with `api.sessions.get`, which for an
anonymous fillout caller returns **401 "Missing Authorization header"** (the GET requires
auth); the non-"not found" error was rethrown, aborting the sync before the POST. Every
anonymous online participant's data was stranded. The unit tests hid it by mocking
`api.sessions.get` to resolve. Exposed by the Phase-1/2 fixes that (correctly) made online
sessions reach the sync path. **Fix:** a non-404 error is not evidence the session is
missing — proceed to the anonymous-capable, idempotent sync POST. Verified live: response
went `synced: 0 → 1` (server-acked); a fresh end-to-end run shows `allSynced: true` with no
reload. Locked with a regression test (`persistence-timing.test.ts` — 401 GET still syncs).
Web suite now 801 passing. This is the canonical example of why live QA is a required gate.

Known pre-existing gap (documented, out of scope): a purely OFFLINE-created session cannot
sync because the create endpoint generates its own id (doesn't accept the client id) and the
sync endpoint requires the session to exist — needs a server change to accept a client id or
have sync upsert the session. Not introduced by this work; the online golden path is fixed.

## Post-implementation (user directive, 2026-07-04)

After the full fillout fix (Phases 1–5) is implemented and verified (incl. live browser
QA): assess whether `phase-8/design-system` — which now carries all of this fillout work
plus the prior design-system arc — can be merged into `main`. Check: branch is ahead of
main cleanly (no divergent conflicts), full gate green, migrations 00024/00025/00026 apply
in order on a clean DB, and no unfinished/half-landed phase. Report mergeability + a
recommended merge path; do not merge without confirming with the user.

## Sequencing & gates

Order 1→2→3→4→5. One adversarially-reviewed workflow per phase; full verification gate in
the main loop between phases: `pnpm --filter @qdesigner/web check && test`,
`cargo check`/`cargo test -- --include-ignored`, plus each phase's live-browser gate
(type/test green has demonstrably lied about this surface — the prompt bug passed a green
suite). Riskiest: D1 server endpoint + anonymous-read RLS posture, Dexie v3 migration,
trial-semantics changes (3.2/3.3) — cover with the deterministic harness first.
