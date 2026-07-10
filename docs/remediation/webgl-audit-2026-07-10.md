# WebGL / Reaction-Time Stack Audit — 2026-07-10

Four parallel audits (renderer pipeline, ReactionEngine + timing, runtime
integration, live in-browser diagnosis), read-only, against `main` @ `8aa3ab8`.

## Overall verdict

**Relative RT (within-participant difference scores — congruency, Simon,
Posner, IAT-D, set-size slopes) is scientifically defensible**: same-clock
capture (`event.timeStamp` ↔ rAF onset, audio via `getOutputTimestamp`,
video via rVFC `expectedDisplayTime`), fully seeded/reproducible
randomization + counterbalancing, frame-accurate vsync-counted offsets,
onError-driven trial invalidation on texture failure/context loss, genuine
context-restore, complete timing_provenance that survives resume.

**Absolute RT is defensible only to ~1 frame** — the "measured
display-latency correction" is a uniform one-frame MODEL
(`TimingCalibration.ts:31`: estimatedDisplayLatency = meanFrameInterval),
not a photodiode/fence measurement; microsecond storage overstates absolute
precision. The constant cancels in difference scores, so the platform's core
claim survives; the wording should say "modelled".

**The live mystery is solved**: the earlier "trials don't advance in
headless Chrome" was an automation artifact (synthetic untrusted click →
AudioContext stays suspended) — but it exposed a real deadlock reachable by
real participants (finding 1). With a trusted click, trials render, capture
keyboard input, complete, and persist provenance.

## Findings (ranked)

### Fix-worthy — data validity & participant-facing robustness

| # | Finding | Evidence | Fix |
|---|---|---|---|
| W-1 | **Audio-priming deadlock kills the whole reaction task.** `prepare()` awaits `ctx.resume()` un-timed; when resume never settles (no user activation, some iOS/mobile audio states) the promise stays PENDING — `.catch(()=>{})` never fires, `run()` is never called: black canvas, no listener, no timeout, no recovery. Live-reproduced 3 ways (hang with synthetic click; completes with resume stubbed; completes with trusted click). | `ReactionTimeRuntime.ts:125` → `ReactionEngine.ts:283-293` (hang :288) | Race `resume()` against a short timeout or fire-and-forget — priming must never block the trial loop. |
| W-2 | **Prod cross-origin isolation is not delivered → silent ~100µs clamp.** COOP/COEP only set in `hooks.server.ts:29-33`; `nginx.conf:24-27` lacks them; DeviceQualification only soft-warns (grade yellow). Sub-ms claim silently degrades in any static/proxy serving path. | `hooks.server.ts:29`, `nginx.conf:24`, `DeviceQualification.ts:64-68` | Add COOP/COEP at the nginx fillout location + consider a hard gate when `!crossOriginIsolated` for timing-sensitive studies. |
| W-3 | **No background-tab / focus-loss protection.** rAF halts but phase waits use `setTimeout` (throttled ≥1s in background): fixation/ITI balloon, stimuli can be "shown" unseen, onset can stamp against a stale frame; nothing aborts/flags the trial; fully-paused loops don't register as dropped frames. | no `visibilitychange`/`blur` handling anywhere in renderer/reaction (grep empty); `ReactionEngine.ts:1182,1937` | `visibilitychange`/`blur` → abort + flag the in-flight trial in provenance. |
| W-4 | **PVT foreperiod anticipations silently vanish.** `responseEnabled=false` during pre-stimulus delay (presets don't set `allowResponseDuringPreStimulus`), keydown bails before the false-start path — contradicts the PVT preset's own doc comment; anticipation/lapse metrics under-report. | `ReactionEngine.ts:635,1007,1138-1146`; `presets/pvt.ts` header | Presets needing anticipation capture set `allowResponseDuringPreStimulus: true`. |
| W-5 | **Unmount-during-init race leaks a WebGL context.** `dispose()` has no flag; if the page unmounts while `makeRuntime`/`start()` are in flight, the runtime is built onto a detached canvas with a spinning rAF loop (browsers cap ~16 contexts). Retry path is guarded; unmount path is not. | `FilloutPageController.svelte.ts:995-1042,1301` | `isDisposed` flag checked after each await; dispose the just-built runtime. |

### Significant — provenance & data quality

| # | Finding | Evidence |
|---|---|---|
| W-6 | `frameStats.droppedFrames` is fake on any sub-120Hz display: targetFPS defaults 120, expectedFrames computed against 8.33ms → ~1 "dropped" per real 60Hz frame, persisted into provenance. Jitter is real; drop counts are not. | `ReactionEngine.ts:266,387`; `WebGLRenderer.ts:366-371` |
| W-7 | Reaction blocks persist atomically — a crash 90 trials into 100 loses everything (single Response written at block completion; aborts propagate before persistence). Contradicts the per-trial resume expectation. | `ReactionTimeRuntime.run()`; `ResponsePersistenceService.saveResponse` |
| W-8 | `reaction_time_us` column stores the block AVERAGE; per-trial RTs live only in the `value` JSON. Export/analysis keyed on the column reads a mean as if per-response. | `ReactionTimeRuntime.ts:256`; `ResponsePersistenceService.ts:60-61` |
| W-9 | Premature-onset race on media cache miss: the onset mark is armed before `await createStimulusRenderable`; a cache miss lets onset stamp 1-2 frames before pixels (RT inflated). Warm-up usually saves it; any miss regresses. (Found independently by two auditors.) | `ReactionEngine.ts:668,860` |
| W-10 | The page-level keyboard "routing chain" is a dead stub that `console.log`s EVERY keystroke on the runtime screen — including free-text answers (PII-in-console). Real reaction input uses the engine's own `document` listeners; forms use component handlers. Delete the chain (it cannot eat keys — no preventDefault — but it misleads and leaks). | `+page.svelte:339` → `FilloutPageController.svelte.ts:1219` → `FilloutRuntime.ts:438-442` |
| W-11 | Resume path (`initFromLoad`) skips the R2-4 WebGL preflight; the mid-study net matches `/webgl/i` messages only — shader/link/buffer failures land on the generic error screen. | `FilloutPageController.svelte.ts:573-584,1064`; `QuestionnaireRuntime.ts:524-529` |

### Minor / informational

- W-12 DPR: the DPR-aware `resizeToDisplaySize` is dead; live wiring sizes the backing store in CSS px → stimuli render at 1x on HiDPI (soft edges; physical size correct). `createRenderContext.pixelRatio` is inconsistent with canvas.width (latent trap). `WebGLRenderer.ts:955,452`; `QuestionnaireRuntime.ts:571`.
- W-13 VAO leaked per context init/restore (never stored, never deleted). `WebGLRenderer.ts:208,965-991`.
- W-14 Keyboard auto-repeat inflates `falseStartCount` (no `event.repeat` guard). `ReactionEngine.ts:1140`.
- W-15 `desynchronized:true` partially contradicts the +1-frame latency model (may over-correct). `WebGLRenderer.ts:145`.
- W-16 `alpha:true` composites the background; `alpha:false` would be marginally lower-latency. `WebGLRenderer.ts:144`.
- W-17 kind:'custom' stimuli route to the rejected custom-shader path → invalidate every trial by design (non-functional stimulus type, not just unstyled). `ReactionEngine.ts:1508`.
- W-18 Focused chrome buttons + Space/Enter response keys can double-act (reaction records AND button activates). Blur-on-trial-start would close it.
- W-19 v1 modules' `components.runtime` Svelte components are never mounted in fillout (dead code).
- W-20 Continuous 120fps render loop between trials (deliberate for timing stability; thermal cost on laptops).

### Verified solid
Trusted-gesture flow completes end-to-end (live-verified: stimulus renders,
f/j advance trials, completion + provenance persisted). Clock consistency,
audio/video onset correction (counted exactly once), seeded randomization,
counterbalancing, multiple-response suppression, texture-failure trial
invalidation, context-restore with texture rebuild, allocation-light render
loop, overlay/canvas layering and pointer-events, abort chain and renderer
ownership. Reaction responses at rest are AES-GCM encrypted (E-OFF-2) —
confirmed live in IndexedDB.

## Suggested fix order
W-1 (participant-facing deadlock) → W-2 + W-3 (validity gates) → W-4, W-5 →
W-10 (PII log; trivial) → W-6, W-7, W-8, W-9, W-11 → minors opportunistically.
W-1/W-4/W-9/W-10/W-14 are small, surgical fixes; W-2 is nginx config + a gate
decision; W-3 and W-7 need small design choices (abort-vs-flag; per-trial
persistence cadence).
