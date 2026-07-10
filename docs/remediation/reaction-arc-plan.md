# Reaction Platform Arc — plan of record (2026-07-10)

Product of a grilled design session. Decisions are recorded in ADRs
0024–0028 + `CONTEXT.md` (glossary: Paradigm, Preset, Trial, TimingSpec,
ResponseSet, ResponseOption, Binding, ResponseSource, Server Variable,
ValidityPolicy, Offline-complete). Goal: **general platform completeness**
— every paradigm honestly authorable, all media stimulus kinds first-class
and offline-complete, external hardware input, validity recorded by
default, per-trial data as a first-class analytic object, locked by an e2e
lane. WebGL audit findings (`webgl-audit-2026-07-10.md`, W-1..W-20) fold in.

Method: supervised loop — opus implementation agents per unit, supervisor
reviews diffs, runs gates, commits; live-QA at phase exits. Same gate
commands as `gap-plan-2026-07.md`.

## Decisions in force

- **ADR 0024** ResponseSet model (semantic option ids, multi-source
  bindings, down/up edges, first-wins concurrency); WebHID hardware input;
  trigger output + scripted validators rejected/deferred.
- **ADR 0025** Trials materialize at generation time (TimingSpec
  fixed-or-uniform-distribution; engine never samples).
- **ADR 0026** Media: offline-complete at load (automatic Layer-1 byte
  caching incl. mediaId assets), per-block decode gate (Layer 2), fail-closed,
  media pinned against quota eviction.
- **ADR 0027** ValidityPolicy `record` (default) | `enforce`; degraded
  timing stamps provenance and continues; only missing data stops.
- **ADR 0028** Trial-level server aggregates; explicit per-declaration
  `minN` (new default 1, existing migrate at 5), authored below-floor
  behavior, mandatory n disclosure.
- **Per-trial persistence** (Q10): local `filloutTrials` rows written per
  completed trial (AES-GCM), synced as the fourth record kind through the
  existing batch `/sync` + client_id dedup, server `trials` table joined to
  the version-pinned session; backfill from value JSON;
  `responses.reaction_time_us` → NULL for multi-trial questions.
- **E2E** (Q12): test-mode phase hook + Playwright lane (golden path with
  server-side trial assertions, W-1 regression, preload fail-closed,
  mapping, offline round-trip). HID via fake-source unit rig.

## Phases

### RT-1 — Core model & data spine
| Unit | Scope |
|---|---|
| RT-1a | ResponseSet/ResponseOption/Binding types + engine arming (concurrent sources, first-wins, optionId+source+edge recorded), legacy `{validKeys, correctResponse}` compiled to a ResponseSet; key-up support; `event.repeat` guard (W-14). No designer UI yet. |
| RT-1b | Trials spine: server migration (trials table + dual-path RLS + client_id dedup), `/sync` gains `trials[]`, backfill migration from `value` JSON, `reaction_time_us` NULL for multi-trial; then client side — Dexie `filloutTrials`, per-trial write at trial completion, SyncLedger integration; session browser gains per-trial source ("Per Trial" tab reads table-backed data). |
| RT-1c | W-fix batch: W-1 audio-resume timeout race; W-2 nginx COOP/COEP + `crossOriginIsolated`/timer-resolution provenance stamps; W-3 record-mode (visibility/blur → `invalidated:'visibility'` + phase deltas, no abort); W-5 isDisposed guard; W-6 droppedFrames vs measured refresh; W-10 delete the keystroke-logging stub chain; W-11 resume-path preflight. |

### RT-2 — Authoring surface
TimingSpec (fixed | uniform min/max) on every phase duration across all 16
paradigms, designer jitter toggles + R4-4-style validation; ResponseSet
editor (options, bindings, correctness per trial/condition); "Task Type" →
"Paradigm" label migration; PVT anticipation capture via the response
model (W-4 dissolves: foreperiod presses are recorded options).

### RT-3 — Media contract
Layer-1 automatic caching at load (mediaId assets join the reactive path),
Layer-2 per-block decode gate ("preparing stimuli N of M"), fail-closed
retry screens, eviction pinning for reaction media, onset arming moved
after renderable-add (W-9 structural fix), full-fetch video (no streaming
mid-block), audio decoded to WebAudio buffers at gate time.

### RT-4 — Hardware
`ResponseSource` WebHID adapter (inputreport timeStamps), permission UX,
device-qualification disclosure (Chromium-only), fake-source test rig,
gamepad honesty note (polled ≠ precision).

### RT-5 — Feedback
Trial-level `ServerComputationDef` sources over `trials`; explicit `minN` +
authored below-floor behavior + migration of existing declarations to
minN 5; offline participant-vs-cohort box plot (cohort whiskers pre-synced,
participant dot from local trials).

### RT-6 — E2E lane
Test-mode phase hook (gated like `window.testMode`); Playwright cases:
golden path (seeded RT study → trusted input → per-trial server rows with
plausible rtUs + provenance), W-1 regression (hung resume → block still
starts), preload fail-closed, two-bindings-one-option mapping, offline
round-trip. CI flags: `--autoplay-policy=no-user-gesture-required`,
SwiftShader.

**Fast-follow (outside this arc):** photodiode/loopback timing validation
(upgrades the display-latency model to measured — audit T1/L1).
**Remaining W-minors** (W-12 DPR, W-13 VAO, W-15/16 context flags, W-17
custom-stimulus messaging, W-18 focus blur, W-19/20) ride along
opportunistically where their files are touched.

## Ledger

| Phase | Status |
|---|---|
| RT-1 | ✅ CLOSED (b743be4 RT-1c, 5fd46e3 RT-1b-server, 7366e99 RT-1a, deeede2 RT-1b-client; exit live-QA all-pass: trials end-to-end in-browser with full provenance, W-1/W-3/W-10 verified, per-trial rows server-side) |
| RT-2 | in progress — RT-2a merged a3bfe85 (jitter sampling live-verified; authoring persistence bug F-49 in fix); RT-2b (ResponseSet editor + Paradigm label) queued |
| RT-3..RT-6 | todo |

QA-surfaced bugs: F-48 (pre-existing designer autosave create/update race —
fix in flight), F-49 (TimingSpec persistence — fix in flight). Live-QA
tooling notes: agent-browser CLI keyboard commands are too slow for
response windows (dispatch KeyboardEvents from a single in-page eval);
the CDP daemon can wedge after activity bursts (kill -9 + respawn +
re-login). Process rule learned: NEVER run live-QA while any agent edits
apps/web — Vite HMR invalidates in-flight sessions and the module-registry
graph makes everything downstream of everything.
