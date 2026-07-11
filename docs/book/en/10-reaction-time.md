# Chapter 10: Reaction Time Measurement

Reaction time (RT) measurement is the capability that sets QDesigner Modern apart from ordinary survey tools. A purpose-built reaction engine, driven by a WebGL 2.0 renderer, delivers **frame-accurate stimulus onset** and **sub-millisecond *relative* precision** on difference scores. This chapter is written for the researcher who authors and runs timed tasks. It covers how you choose a paradigm, how per-trial timings are generated, how you map responses to inputs (including external hardware), how stimulus media is guaranteed to be present before a timed block runs, what a trial records, and — honestly — what the timing numbers do and do not mean.

Two claims frame everything that follows, and both are deliberate:

- **Relative RT is scientifically defensible.** Within-participant difference scores — congruency effects, Simon/Posner costs, IAT *D*, set-size slopes — are measured on a single clock (`event.timeStamp` against a frame-counted onset), with fully seeded, reproducible randomization. The residual per-trial timing constant cancels in a difference.
- **Absolute RT is defensible only to about one frame.** The display-latency correction is a *modelled* one-frame estimate, not a photodiode measurement. Microsecond *storage* does not imply microsecond *absolute* accuracy. Treat absolute RT as frame-accurate; treat differences as sub-millisecond.

---

## 10.1 Core Concepts

The reaction system uses a small, precise vocabulary. These terms are used consistently throughout this manual (see also the Glossary appendix).

| Term | Meaning |
|---|---|
| **Paradigm** | A scientific procedure template for a reaction task (PVT, Simon, Stroop, …) that defines the trial structure and what counts as a correct response. |
| **Preset** | A saved, named parameterization of a Paradigm. A Preset never defines new procedure — only parameter values. |
| **Trial** | One fully materialized stimulus→response cycle. Every value a Trial uses — timings, stimulus, correct options — is a concrete number fixed at generation time. |
| **TimingSpec** | An authored phase duration that is either a fixed value or a distribution (uniform min/max today), sampled per-trial by the seeded generator. |
| **ResponseSet** | The named, ordered list of ResponseOptions a Trial arms; a Trial accepts exactly one winning response. |
| **ResponseOption** | One semantic response alternative, identified by a stable id (`left`, `target-present`, …) that analysis and export key on — independent of which physical input produced it. |
| **Binding** | The attachment of one physical input (a keyboard key, a HID button, a touch region) to a ResponseOption, including whether it fires on press or release. |
| **ResponseSource** | A device family that can deliver responses — keyboard, pointer, touch, gamepad, or a WebHID device. Several may be armed at once; the first event wins. |
| **ValidityPolicy** | A per-study posture toward degraded timing conditions. The default, `record`, stamps provenance and continues (see Chapter 11). |
| **Offline-complete** | The state in which every asset a study can present exists in local storage. Reaction studies with media must reach this before any timed block starts. |

### 10.1.1 The two rendering paths

The fillout runtime has exactly one drawing path for timed stimuli and one for everything else (ADR 0023). Stimuli for reaction paradigms are drawn by the **WebGL renderer** (`renderer/WebGLRenderer`) driven by the **ReactionEngine** (`runtime/reaction/ReactionEngine`) — frame-exact onset is the reason this path exists. Ordinary form questions, instructions, and feedback render as DOM overlays. As an author you never choose between them; adding a reaction question puts that question on the WebGL path automatically.

### 10.1.2 Generation-time materialization

A defining architectural decision (ADR 0025) is that **the engine never samples anything at runtime**. Every randomizable quantity — jittered phase durations, stimulus sequences, counterbalancing — is drawn by a seeded generator when the Trials are *materialized*, before the block runs. The engine receives only concrete per-trial numbers and executes them.

The consequence for you as a researcher is reproducibility and auditability:

- **`seed + sessionId` ⇒ an identical Trial sequence.** Re-running a session with the same seed reconstructs exactly the same timings and stimuli.
- **Every sampled value is data, not a runtime accident.** The materialized durations are persisted per-trial (`sampledTimings`), so an analyst can see the exact foreperiod a given Trial used.
- **A study authored entirely with fixed timings draws nothing from the RNG** — it produces a byte-identical sequence to the pre-TimingSpec engine. Only a distribution consumes a draw.

---

## 10.2 Choosing a Paradigm

In the questionnaire designer, add a **Reaction Time** question and open its properties. The first control is the **Paradigm** selector. Sixteen built-in paradigms ship; fifteen are procedure-fixed scientific templates and one (**Custom Trial Plan**) is a fully author-defined block builder.

| Designer label | Notes |
|---|---|
| Standard Reaction Time | Simple/choice RT; freely mappable responses. |
| N-Back | Match / non-match against *n* trials back. |
| Stroop | Colour–word interference. |
| Flanker (Eriksen) | Congruent / incongruent flankers. |
| Implicit Association Test (IAT) | Seven-block IAT with *D*-score support. |
| Dot-Probe | Attentional-bias probe. |
| Go / No-Go | Respond vs. withhold. |
| SART | Sustained-attention, withhold on the target digit. |
| Simon | Spatial stimulus–response compatibility. |
| Posner Cueing | Valid / invalid spatial cueing. |
| Visual Search | Set-size slope; target present / absent. |
| Sternberg Memory Search | In-set / out-of-set memory scanning. |
| PVT (Psychomotor Vigilance) | Random-foreperiod vigilance; records false starts. |
| Temporal-Order Judgment | Which of two stimuli came first. |
| RSVP | Rapid serial visual presentation with a target. |
| Custom Trial Plan | Author blocks and trials yourself in the visual editor. |

**Presets vs. Paradigms.** Choosing a paradigm and adjusting its fields (trial count, congruent ratio, timings, keys) *is* creating a Preset — a named parameterization. A Preset never changes the underlying procedure; it only sets values.

Below the selector, **Reset Selected Paradigm To Starter** re-seeds the current paradigm's fields with sensible defaults. Each procedure-fixed paradigm materializes its Trials from the top-level config at compile time; only the **Custom Trial Plan** paradigm stores an authored block plan (its **Visual Trial Blocks** editor, §10.6).

---

## 10.3 Timing: TimingSpec and Jitter

Every phase duration in a reaction task is a **TimingSpec** — either a single fixed value in milliseconds, or a **uniform distribution** sampled per Trial. This is how you introduce the jitter that defeats anticipation (a random foreperiod, a variable ISI, a jittered inter-trial interval).

### 10.3.1 The jitter toggle

In the designer, each timing field is a compact control with a **Jitter** checkbox:

- **Jitter off** — a single fixed-ms number input. Identical to a plain duration; consumes no random draw.
- **Jitter on** — a **min** input, the word **to**, a **max** input, and a **ms** unit. The seeded generator draws one value uniformly in `[min, max]` (inclusive, rounded to whole ms) for each Trial.

Fields authored this way include the PVT/vigilance **Foreperiod / ISI (ms)**, the Sternberg **Per-Item Study (ms)** and **Retention (ms)**, Posner **Cue Duration (ms)** and **Cue→Target SOA (ms)**, SART **Digit Duration (ms)**, RSVP **Item Duration (ms)**, and per-paradigm **Response Timeout (ms)**, among others. The same control shape covers them all.

### 10.3.2 Validation (min ≤ max)

Timing fields are validated inline as you type (they turn red on an error), so bad timings surface at authoring time rather than at publish:

- A jitter range with a minimum above its maximum is an **error**: *"…: jitter minimum cannot exceed the maximum."*
- A zero-width range (min equals max) is a **warning**: *"…: jitter min and max are equal — no variation."* — it jitters nothing.
- A range needing both bounds numeric reports *"…: jitter needs a numeric minimum and maximum."*

### 10.3.3 Reproducible sampling order

When a Trial jitters several fields, the generator samples them in a fixed, documented per-field order (each paradigm states its order — the PVT, for example, draws *foreperiod → response timeout*). This keeps the seeded stream reproducible: the same seed and session id reconstruct the same per-field draws in the same order. The TimingSpec object is deliberately shaped to admit future named distributions (exponential, etc.) without changing the engine — only the generation layer.

---

## 10.4 Responses: ResponseSets and Bindings

A Trial arms a **ResponseSet**: an ordered list of **ResponseOptions**, each identified by a stable semantic **id** (`left`, `go`, `target-present`) that your analysis and export key on. Each option carries one or more **Bindings** that attach a physical input to it. Multiple **ResponseSources** can be armed at once — keyboard, pointer, touch, gamepad, WebHID — and the **first event wins**; provenance records which source and binding fired.

This model replaces the older `validKeys` / `correctResponse` scheme. Existing content that still uses the legacy fields is compiled losslessly into a ResponseSet at run time, so nothing breaks — but new authoring should think in options and bindings.

### 10.4.1 Which paradigms are freely mappable

Only two paradigms expose the full **Responses** editor: **Standard Reaction Time** and **Custom Trial Plan**. These are author-defined — you decide the options and their inputs.

Every other paradigm is **procedure-fixed**: its response structure is part of the scientific procedure, so its keys are configured in that paradigm's own fields, and the preset builds the ResponseSet for you. In the Responses panel these paradigms show a read-only note pointing at where their responses live — for example:

- **Go / No-Go** — the single Response Key (withhold on no-go)
- **Flanker (Eriksen)** — the two Valid Response Keys (left / right)
- **IAT** — the fixed E / I category keys across its seven blocks
- **Simon**, **Posner** — the Left / Right keys
- **Visual Search** — the Present / Absent keys
- **Sternberg** — the In-set / Out-of-set keys

### 10.4.2 Authoring a response set (standard / custom)

For a freely mappable paradigm, the **Responses** panel starts from your **Valid Response Keys** / device settings. Click **Customize response set** to expand it into editable options. For each option you set:

- **Label** (human-readable) and **Option id** (the stable analysis key; auto-suggested from the label, must be unique — a duplicate or empty id is flagged).
- **Correct response** — a checkbox marking the option(s) scored as correct. A marked option is scored on its own, independent of the legacy *Require correct response* toggle.
- **Bindings** — click **Add binding** and choose a source: **Keyboard**, **Mouse**, **Touch**, **Gamepad**, or **HID device**.

Binding details by source:

- **Keyboard** — press-to-capture the key, plus an edge selector: **on press** (down) or **on release** (up). Key-up capture supports hold/release paradigms.
- **Mouse / Touch** — either *any click/tap*, or *limit to region* with normalized centre `x`, `y` and `radius` (0–1 canvas space, viewport-independent).
- **Gamepad** — a button index (0–31).
- **HID device** — a button number (0–255) and a press/release edge (see §10.5).

A single option may carry several bindings at once — e.g. the same `go` option on both a keyboard key **and** a HID button — so a hardware participant and a keyboard participant answer the same semantic option, and analysis sees one id regardless of which fired.

---

## 10.5 External Response Hardware (WebHID)

For labs that use physical **button boxes**, an external **ResponseSource** is available through the browser's **WebHID** API (ADR 0024). HID `inputreport` events carry a high-resolution timestamp on the same clock as keyboard events, so the RT arithmetic is unchanged — hardware responses are timed exactly like keyboard responses.

### 10.5.1 Chromium-only, and honest about it

WebHID exists only in Chromium-based browsers (Chrome, Edge). Participants on Safari or Firefox get keyboard/touch/pointer only. The platform discloses this rather than hiding it:

- In the ResponseSet editor, when any option binds a HID button, a hint appears: *"HID (button box) responses need Chrome or Edge; participants connect the device on the study's welcome screen. … Keyboard, mouse or touch bindings on the same option keep working as a fallback."* Always give HID options a keyboard/touch fallback binding for cross-browser participants.
- Device qualification records whether WebHID is available at all and whether a device was already granted, so an analyst knows a participant *could* have used a box.

### 10.5.2 Connecting a device (participant side)

When a study binds a HID response, the participant's **welcome screen** shows an optional **Connect response device** button (with the hint *"Optional — connect a hardware button box now, or just use the keyboard/touch."*). This is gesture-gated (browsers require a user gesture for the permission prompt). A device granted on a previous visit reconnects silently. On a non-Chromium browser the control is replaced by an explanation of the keyboard/tap fallback rather than a dead button. Connecting is never mandatory.

### 10.5.3 Button numbers are discovered empirically

The HID adapter is **descriptor-free**: it does not read a device's HID descriptor. Instead it detects which report bit changed between the "all released" state and a press (a bit-diff), and that bit index is the button's number. Practically, this means you **discover a button's number by pressing it** and reading the captured binding — there are no manufacturer labels to rely on. This works for the bitfield button boxes common in psychology labs; more exotic report layouts may not map cleanly.

### 10.5.4 Gamepad is convenience, not precision

A **gamepad** ResponseSource also exists and is convenient for authoring (the designer's *Press to Bind* affordance lets you bind a button by pressing it). Be clear about its timing, though: the Gamepad API is **polled**, not event-driven. The poller samples once per animation frame and detects the rising edge, so responses are **quantized to the frame loop (~8–16 ms)**. Retain gamepad for convenience where that resolution is acceptable; do **not** treat it as a precision RT source. For hardware-grade timing use keyboard or a WebHID button box.

> **Deferred by design.** TTL/trigger *output* for EEG/eye-tracker sync, and photodiode/loopback timing-validation hardware, are deliberately out of v1 (ADR 0024). The browser cannot yet bound when an output voltage flips; a photodiode fast-follow would upgrade the display-latency model from *modelled* to *measured*.

---

## 10.6 The Custom Trial Plan (visual block editor)

The **Custom Trial Plan** paradigm turns on the **Visual Trial Blocks** editor — fully programmable reaction tasks with no JSON. You author **blocks** (each with an id, name, a **Kind** of Practice / Test / Custom, **Block Repetitions**, and **Randomize Trial Order**) and, inside each block, **trials** (stimulus, valid keys, correct response, fixation, response timeout, inter-trial interval, and per-trial repeat).

A block can be gated on an accuracy criterion: **Gate on accuracy criterion (practice)** re-runs a practice block until the participant reaches a **Min accuracy (%)** or a **Max attempts** budget is spent. This is how you implement criterion-based practice.

Because Trials materialize at generation time, the custom plan you author is turned into concrete per-trial values the same way a built-in paradigm is — jitter, counterbalancing, and randomization all resolve into fixed numbers before the block runs.

---

## 10.7 Stimuli

A reaction stimulus is one of five authorable kinds, chosen with the **Stimulus Type** control: **Text**, **Shape**, **Image**, **Video**, or **Audio**.

| Kind | What you set | Timing notes |
|---|---|---|
| **Text** | The text to display; font size/family; colour; position. | Rendered to a texture; onset is the first presented frame. |
| **Shape** | Circle / square (and rectangle / triangle in trial plans); colour; size; position. | Single GPU draw; no asset loading. Lowest-latency choice. |
| **Image** | A media-library asset (preferred) or a remote URL. | Decoded to a texture at the block gate (§10.8). |
| **Video** | A media asset/URL; autoplay/muted/loop. | Fully fetched before the block; onset corrected via the frame-callback clock. |
| **Audio** | A media asset/URL; volume. | No visual output; onset marked at play, corrected for output/DAC latency. |

Fixation is configured separately (**Fixation Type** cross/dot, **Fixation Duration**).

> **A note on "custom shader" stimuli.** Earlier documentation described a first-class GLSL custom-shader stimulus type. That path was **rejected** and is not a functional stimulus kind: a trial whose stimulus is a raw shader is invalidated by design (audit finding W-17). Author procedural visual effects as shapes/images/video instead. The stimulus dropdown offers exactly the five kinds above.

Visual stimulus onset is recorded not when the stimulus is *requested* but when the **first frame containing it is actually presented** (the engine arms an onset detector and stamps the corrected onset on the next presented frame). Frame-accurate offsets are available for brief-exposure / masking / RSVP durations by counting presented frames rather than using a timer.

---

## 10.8 Media: Offline-Complete and Fail-Closed

Media-bearing reaction studies get a two-layer guarantee (ADR 0026) so that **no participant ever runs a timed block with missing stimuli**, and no network I/O or decoding ever happens on the timing-critical path.

### 10.8.1 Layer 1 — bytes cached at load (automatic)

Simply *loading* the questionnaire caches **all** of its assets locally, including `mediaId`-referenced reaction stimuli (fetched through the same-origin media proxy). Any participant who has opened the study is already **Offline-complete**. An explicit **make-available-offline** affordance also exists on the welcome screen for pre-provisioning in the field (an optional secondary control that reports "N of M" progress and a ready/partial/error state) — but reaching offline-complete is automatic at load, never a participant choice.

### 10.8.2 Layer 2 — decode gate per block (visible)

Immediately before a block's first Trial, every asset that block references is loaded from local cache and **fully decoded** — image→texture-ready bitmap, audio→WebAudio buffer, video→fully-fetched blob with its first frame decoded. This runs behind a visible **"Preparing stimuli… N of M"** state on the reaction canvas. Once the gate clears, the block runs with zero asset work on the critical path.

### 10.8.3 Fail-closed

If either layer cannot complete — a missing asset, a decode failure, or a storage-quota problem — the block **refuses to start** and shows an honest, retryable screen:

> Some stimuli for this task couldn't be prepared.
> Check your connection, then press any key to try again.

The gate loops until every asset is ready (or the trial is aborted). It never runs a timed block with partial stimuli — *"timing cannot be altered by missing data."* As a belt-and-braces backstop, if a visual stimulus never reaches the renderer the Trial is stamped `invalidated: 'no-stimulus'` rather than silently timed against a blank screen. A consequence, accepted by design: a study whose media exceeds a device's storage quota is unrunnable on that device — reaction assets are *pinned* against cache eviction rather than silently dropped.

---

## 10.9 What a Trial Records

Reaction data is **per-trial**, not per-block. Each completed Trial is written locally (encrypted at rest) and synced as its own record; the server stores it in a `trials` table joined to the version-pinned session, with reaction time in **microseconds** (`rt_us`, floored `ms × 1000`). Per-trial storage is the source of truth — a crash partway through a block does not lose completed trials, and export keys on the per-trial rows rather than any block average.

### 10.9.1 The tidy per-trial row

Every Trial flattens to one row in the canonical long-format ("tidy") export, with a stable column order. The columns include:

| Column | Meaning |
|---|---|
| `trial_number`, `trial_id`, `block_id`, `condition` | Trial identity and design cell. |
| `is_practice`, `counterbalance_cell` | Practice flag; assigned counterbalance cell. |
| `stimulus_kind` | shape / text / image / video / audio. |
| `response_key`, `expected_response`, `is_target` | The response and what was expected. |
| `reaction_time_ms` | Reported RT, clamped at 0. |
| `raw_rt_ms` | *Signed* raw RT (`response − onset`); may be negative for a same-frame/pre-onset event. |
| `is_correct`, `timeout` | Accuracy verdict; whether the window elapsed. |
| `anticipatory`, `false_start_count` | Pre-onset (false-start) flag and count. |
| `onset_method`, `response_method` | Which clock stamped onset / response (see below). |
| `response_device` | keyboard / mouse / touch / gamepad / hid. |
| `display_latency_ms`, `output_latency_ms` | Modelled visual display latency; audio output latency folded into onset. |
| `offset_method`, `actual_duration_frames` | How the stimulus offset was scheduled; measured frame exposure. |
| `hold_duration_ms` | Key hold time (down→up), for hold/release paradigms. |
| `stimulus_onset_time`, `stimulus_offset_time` | High-res on/off timestamps. |
| `fps`, `dropped_frames`, `jitter` | Frame health during the Trial. |
| `invalid`, `invalid_reason` | Whether the Trial was invalidated, and why. |
| `exclude_from_analysis`, `exclude_reason` | Analysis-ready exclusion flag (see Chapter 11). |

### 10.9.2 Sampled timings vs. measured provenance

Two distinct blobs travel with each Trial and should not be confused:

- **`sampledTimings`** — the *materialized* phase plan (ADR 0025): the concrete durations the seeded generator drew for this Trial (fixation, foreperiod, stimulus, response window, inter-trial). This is what *drove* the run and is fully reproducible from the seed.
- **`provenance`** — the *measured* timing environment: the onset/response methods, modelled `displayLatencyMs` / folded `outputLatencyMs`, signed `rawRtMs`, false-start flags, frame stats (fps, dropped frames, jitter), `crossOriginIsolated`, the measured `timerResolutionMs`, the `measuredRefreshRateHz`, and any `invalidated` stamp. This is what *actually happened* on the device.

### 10.9.3 Timing methods

The clock that stamped each onset/response is recorded as one of: `event.timeStamp` (keyboard/pointer/HID input), `rvfc` (video via `requestVideoFrameCallback`), `audioContext` (audio onset via the audio clock), `raf` (visual onset via the animation-frame counter), `gamepad.timestamp`, or `performance.now` (fallback). Recording the method lets an analyst audit exactly how each timestamp was obtained.

### 10.9.4 PVT anticipation is recorded, not dropped

In the **PVT**, a press during the random foreperiod (before the target) is a *false start* — a primary PVT measure. The preset arms responses during the foreperiod so that a premature press is **captured** as an anticipatory response (counted in `false_start_count`, flagged `anticipatory`, surfaced through the false-start hook) rather than silently discarded (audit finding W-4). The press never resolves the Trial — the participant still responds to the actual target — but the anticipation is now in the data, so lapse and anticipation metrics are complete.

---

## 10.10 Timing Precision — What the Numbers Mean

This section is deliberately conservative. Report timing the way the platform actually measures it.

### 10.10.1 The clock and cross-origin isolation

All timestamps use `performance.now()` — monotonic, relative to the page's time origin. Its resolution, however, depends on **cross-origin isolation** (COOP/COEP). When the page **is** cross-origin isolated, the effective quantum is ~5 µs; when it is **not**, browsers clamp it toward ~100 µs. The engine measures the effective quantum per Trial and records it (`timerResolutionMs`), along with the `crossOriginIsolated` flag. Full timer resolution therefore requires the study to be served with the isolation headers; without them the sub-ms claim silently degrades — which is exactly why the flag is stamped on every Trial (see Chapter 11).

### 10.10.2 Onset correction is modelled, not measured

Visual onset is the first *presented* frame plus a **display-latency correction** — but that correction is a uniform one-frame model (the mean frame interval), not a photodiode or GPU-fence measurement. Audio onset folds in the output/DAC latency the audio system reports. Both corrections are honest estimates of the same order every trial, so they **cancel in a difference score** — which is why relative RT survives while absolute RT does not claim more than frame accuracy.

### 10.10.3 Storage precision ≠ absolute accuracy

RT is stored as an integer number of **microseconds** (`rt_us`) to avoid floating-point loss and give statistics packages a clean integer column. Integer-microsecond *storage* is not a claim of microsecond *absolute* accuracy. The defensible reading is: **frame-accurate absolute onset; sub-millisecond relative precision on difference scores.**

### 10.10.4 Frame health

Each Trial records `fps`, a real jitter measure (standard deviation of frame times), and a **measured**-refresh-rate-based dropped-frame count (the engine counts drops against the measured refresh rate, not a nominal target FPS, so drop counts on a 60 Hz display are honest). Use jitter and drop counts to screen trials whose display timing was poor.

---

## 10.11 Best Practices for Timing-Critical Studies

### 10.11.1 Display and environment

1. Serve the study **cross-origin isolated** (COOP/COEP) so the timer is not clamped — verify `crossOriginIsolated` in the recorded provenance.
2. Prefer a **high-refresh display** and set the paradigm's target FPS to match the device.
3. Use **fullscreen**, disable OS notifications and power management, and prefer a **wired** keyboard or a WebHID box.
4. Chromium-based browsers give the most consistent timing (and are required for WebHID).

### 10.11.2 Design

1. Use **shape** or **text** stimuli where the science allows — they carry zero asset-loading latency.
2. **Jitter** foreperiods/ISIs (uniform min/max) to defeat anticipation; keep the ranges scientifically justified.
3. Give every **HID** option a keyboard/touch fallback binding so non-Chromium participants can still respond.
4. Set a **seed** and record the `sessionId` so a session's Trials can be reconstructed exactly.

### 10.11.3 Analysis hygiene

1. Exclude **anticipatory** and **invalid** Trials — the export already flags them in `exclude_from_analysis` (see §10.9 and Chapter 11).
2. Screen on **frame health** (`dropped_frames`, `jitter`) and on the **`invalidated`** provenance stamp.
3. Report **relative** effects (difference scores), and describe absolute RT as frame-accurate, not microsecond-accurate.
4. Prefer the **median** RT — RT distributions are right-skewed.

---

## 10.12 Summary

| Feature | How it works | What to rely on |
|---|---|---|
| Paradigms | 16 built-in (15 procedure-fixed + Custom Trial Plan) | Presets = saved parameterizations |
| Timings | TimingSpec: fixed or uniform(min,max), **sampled at generation** | Reproducible from `seed + sessionId` |
| Responses | ResponseSet of semantic option ids, multi-source Bindings, first-wins | Analysis keys on the stable `optionId` |
| Free mapping | **Standard** and **Custom Trial Plan** only | Others are procedure-fixed |
| Hardware | WebHID button boxes (Chromium-only, descriptor-free bit-diff) | Same clock as keyboard; give a fallback |
| Gamepad | Polled once per frame (~8–16 ms) | Convenience, **not** precision |
| Media | Layer 1 auto-cache at load + Layer 2 decode gate, **fail-closed** | No timed block ever runs with missing stimuli |
| Per-trial data | Tidy row + `sampledTimings` + measured `provenance`, `rt_us` | Per-trial is the source of truth |
| Timing precision | Frame-accurate onset (modelled correction), sub-ms relative | COOP/COEP required for full timer resolution |
| Validity | Degraded timing stamped (`invalidated`, isolation, timer res.) | Recorded by default — see Chapter 11 |

For how invalidated and excluded Trials flow into aggregate statistics, see **Chapter 11 (Data Quality)** for the validity model and **Chapter 12 (Analytics and Statistics)** for their effect on reported aggregates.
