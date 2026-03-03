# Chapter 10: Reaction Time Measurement

Reaction time (RT) measurement is at the heart of cognitive and behavioral research. QDesigner Modern provides a purpose-built reaction time engine backed by a WebGL 2.0 renderer, delivering microsecond timing precision and 120+ FPS rendering. This chapter covers the architecture, stimulus types, timing model, supported paradigms, trial configuration, and best practices for timing-critical research.

---

## 10.1 Architecture Overview

The reaction time system consists of two core components:

1. **WebGLRenderer** (`src/lib/renderer/WebGLRenderer.ts`) -- A hardware-accelerated rendering engine that draws stimuli, tracks frame timing, and reports dropped frames.
2. **ReactionEngine** (`src/lib/runtime/reaction/ReactionEngine.ts`) -- An orchestrator that runs trial sequences, captures responses, computes reaction times, and records per-frame timing data.

### 10.1.1 WebGL 2.0 Renderer

The renderer creates a WebGL 2.0 context with performance-optimized settings:

| Setting             | Default Value      | Purpose                               |
|--------------------|--------------------|---------------------------------------|
| `antialias`        | `false`            | Avoid per-sample smoothing overhead   |
| `depth`            | `false`            | No 3D depth buffer needed             |
| `stencil`          | `false`            | No stencil operations needed          |
| `alpha`            | `true`             | Support transparent overlays          |
| `desynchronized`   | `true`             | Bypass compositor for lower latency   |
| `powerPreference`  | `high-performance` | Request dedicated GPU                 |
| `preserveDrawingBuffer` | `false`       | Allow buffer swap optimization        |

The `desynchronized` flag is particularly important: it tells the browser to bypass the compositor pipeline, reducing display latency by one frame or more on supported systems.

**Rendering pipeline:**

1. `requestAnimationFrame` callback fires.
2. Renderer checks if enough time has passed since the last presented frame (based on target FPS and vsync settings).
3. If presenting: clear the canvas, iterate through renderables sorted by layer, call each renderable's `render()` function.
4. Frame callbacks are invoked with `FrameSample` data (timestamp, delta, presented flag, dropped-frame count).

### 10.1.2 Frame Statistics

The renderer continuously tracks performance metrics:

| Metric          | Type     | Description                                    |
|----------------|----------|------------------------------------------------|
| `fps`          | `number` | Current frames per second (updated every 1s)   |
| `frameTime`    | `number` | Average frame time in ms (rolling 240 samples) |
| `droppedFrames`| `number` | Total frames missed since start                |
| `targetFPS`    | `number` | Configured target frame rate                   |
| `totalFrames`  | `number` | Total frames presented since start             |
| `jitter`       | `number` | Standard deviation of frame times (ms)         |
| `gpuTime`      | `number` | GPU execution time (if `EXT_disjoint_timer_query_webgl2` available) |

### 10.1.3 Renderable System

Stimuli are displayed through a layer-based renderable system. Each renderable has:

- **id**: Unique string identifier
- **layer**: Numeric z-order (lower layers render first)
- **render()**: Function called each frame with the WebGL context and a `RenderContext`

The `RenderContext` provides:

```typescript
interface RenderContext {
  time: number;          // Current timestamp (performance.now())
  deltaTime: number;     // Time since last frame (ms)
  stimulusTime: number;  // Time since stimulus onset (ms)
  width: number;         // Canvas width in pixels
  height: number;        // Canvas height in pixels
  pixelRatio: number;    // Device pixel ratio
}
```

---

## 10.2 Timing Precision

### 10.2.1 performance.now()

All timestamps in QDesigner's reaction time system use `performance.now()`, which provides sub-millisecond precision (typically 5-microsecond resolution in modern browsers). This is critical because:

- `Date.now()` only provides millisecond precision.
- `performance.now()` is monotonic (never goes backward).
- It is relative to the page's `timeOrigin`, avoiding clock drift.

### 10.2.2 Stimulus Onset Detection

Stimulus onset time is not recorded when the stimulus is *requested* but when the first frame containing the stimulus is *actually presented*. The engine uses a two-step process:

1. When the stimulus phase begins, a `pendingStimulusOnsetMark` flag is set.
2. On the next frame callback where `sample.presented === true`, the onset time is recorded from `sample.now`.

This ensures that the onset timestamp reflects the actual display time, not the time the stimulus was queued.

### 10.2.3 Reaction Time Computation

Reaction time is computed as:

$$RT = t_{\text{response}} - t_{\text{stimulus onset}}$$

where both timestamps come from `performance.now()`. The result is stored in milliseconds with sub-millisecond precision.

### 10.2.4 Microsecond Storage

When reaction time data is persisted to the database, QDesigner stores timing values as `BIGINT` representing microseconds:

$$\text{reaction\_time\_us} = \lfloor RT \times 1000 \rfloor$$

This avoids floating-point precision loss during storage and retrieval, and provides a consistent integer representation suitable for statistical analysis.

---

## 10.3 Stimulus Types

The `ReactionEngine` supports six stimulus types, each rendered through the WebGL pipeline.

### 10.3.1 Shape Stimuli

Geometric shapes rendered as WebGL primitives:

| Shape       | Parameters                       | Notes                      |
|------------|----------------------------------|----------------------------|
| `circle`    | `radiusPx`, `color`, `position`  | Rendered as triangle fan   |
| `square`    | `widthPx`, `color`, `position`   | Width = height             |
| `rectangle` | `widthPx`, `heightPx`, `color`   | Independent dimensions     |
| `triangle`  | `widthPx`, `color`, `position`   | Equilateral, apex at top   |

Shapes are positioned using normalized coordinates (0-1 maps to viewport) or pixel coordinates if values exceed 1:

```typescript
position: { x: 0.5, y: 0.5 }  // Center of screen
position: { x: 400, y: 300 }   // Pixel coordinates
```

Colors are specified as RGBA arrays with values in [0, 1]:

```typescript
color: [1, 0, 0, 1]  // Opaque red
color: [0, 0.5, 1, 0.8]  // Semi-transparent blue
```

### 10.3.2 Text Stimuli

Text is rendered to an off-screen canvas and then displayed as a WebGL texture:

| Parameter    | Type     | Default  | Description              |
|-------------|----------|----------|--------------------------|
| `text`       | `string` | Required | The text content          |
| `fontPx`     | `number` | 64       | Font size in pixels       |
| `fontFamily` | `string` | "Arial"  | CSS font family           |
| `color`      | `RGBAColor` | White | Text color                |
| `position`   | `{x,y}`  | Center   | Position on screen        |

This approach ensures crisp text at any size while maintaining WebGL rendering performance.

### 10.3.3 Image Stimuli

Images are loaded asynchronously and cached for subsequent trials:

| Parameter  | Type     | Description                         |
|-----------|----------|-------------------------------------|
| `src`      | `string` | URL or path to the image            |
| `widthPx`  | `number` | Display width (defaults to natural) |
| `heightPx` | `number` | Display height (defaults to natural)|
| `position` | `{x,y}`  | Center position                     |

The image cache (`imageCache`) prevents redundant network requests when the same image appears across multiple trials.

### 10.3.4 Video Stimuli

Video elements are used as WebGL texture sources, updated each frame:

| Parameter  | Type      | Default | Description              |
|-----------|-----------|---------|--------------------------|
| `src`      | `string`  | Required | URL to the video file   |
| `autoplay` | `boolean` | `true`  | Start playing on display |
| `muted`    | `boolean` | `true`  | Mute audio by default    |
| `loop`     | `boolean` | `false` | Loop playback            |
| `widthPx`  | `number`  | Video native | Display width       |
| `heightPx` | `number`  | Video native | Display height      |

Video textures are re-uploaded to the GPU every frame via `texImage2D`, enabling real-time video display within the WebGL context.

### 10.3.5 Audio Stimuli

Audio stimuli do not produce visual output. The stimulus onset is marked at the moment `audio.play()` is called:

| Parameter  | Type      | Default | Description              |
|-----------|-----------|---------|--------------------------|
| `src`      | `string`  | Required | URL to the audio file   |
| `volume`   | `number`  | 1.0     | Volume (0.0 - 1.0)       |
| `autoplay` | `boolean` | `true`  | Start playing on display |

Audio stimuli are commonly used in auditory RT paradigms where participants respond to tones, speech, or other sounds.

### 10.3.6 Custom Shader Stimuli

For advanced stimulus requirements (e.g., Gabor patches, random dot kinematograms, procedural animations), QDesigner supports custom GLSL shaders:

| Parameter   | Type                    | Description                    |
|------------|-------------------------|--------------------------------|
| `shader`    | `string`                | GLSL fragment shader source    |
| `vertices`  | `number[]`              | Vertex positions               |
| `uniforms`  | `Record<string, ...>`   | Uniform values                 |

The engine automatically passes `time` (seconds since stimulus onset) and `resolution` (viewport dimensions) as uniforms.

---

## 10.4 Media Library Integration

Stimulus media (images, videos, audio) can be uploaded to QDesigner's MinIO-based media library and referenced by URL in trial configurations. Benefits include:

- **Preloading:** Media is loaded and cached before the trial begins.
- **CDN-ready:** MinIO URLs can be fronted by a CDN for fast global delivery.
- **Versioning:** Media assets are stored with content-addressable hashes.

In the designer, drag media from the **Media Library** panel directly onto a reaction time block to create stimulus references.

---

## 10.5 Paradigms

The `ReactionEngine` is flexible enough to implement all common RT paradigms through configuration alone.

### 10.5.1 Simple Reaction Time

The participant presses a single key as quickly as possible when a stimulus appears.

**Configuration:**

```typescript
{
  id: "simple-rt-trial-1",
  responseMode: "keyboard",
  validKeys: ["space"],
  fixation: { enabled: true, type: "cross", durationMs: 500 },
  preStimulusDelayMs: 800,       // Random jitter recommended
  stimulus: { kind: "shape", shape: "circle", color: [1, 0, 0, 1] },
  responseTimeoutMs: 1500,
  interTrialIntervalMs: 1000,
  targetFPS: 120
}
```

### 10.5.2 Choice Reaction Time

The participant presses different keys depending on which stimulus appears.

**Configuration:**

```typescript
{
  id: "choice-rt-trial-1",
  responseMode: "keyboard",
  validKeys: ["f", "j"],
  correctResponse: "f",           // "f" for left stimulus
  requireCorrect: true,
  fixation: { enabled: true, type: "cross", durationMs: 500 },
  preStimulusDelayMs: 600,
  stimulus: { kind: "shape", shape: "circle", color: [0, 0, 1, 1] },
  responseTimeoutMs: 2000,
  interTrialIntervalMs: 800
}
```

### 10.5.3 Go/No-Go

The participant responds to "go" stimuli but withholds responses to "no-go" stimuli.

**Configuration (Go trial):**

```typescript
{
  id: "go-trial-1",
  responseMode: "keyboard",
  validKeys: ["space"],
  correctResponse: "space",
  requireCorrect: true,
  stimulus: { kind: "shape", shape: "circle", color: [0, 1, 0, 1] },  // Green = go
  responseTimeoutMs: 1500
}
```

**Configuration (No-Go trial):**

```typescript
{
  id: "nogo-trial-1",
  responseMode: "keyboard",
  validKeys: ["space"],
  requireCorrect: true,
  // No correctResponse set -> correct response is no response (timeout)
  stimulus: { kind: "shape", shape: "circle", color: [1, 0, 0, 1] },  // Red = no-go
  responseTimeoutMs: 1500
}
```

For no-go trials, correctness is evaluated as: `response === null` indicates a correct inhibition.

### 10.5.4 N-Back

N-back tasks require participants to compare the current stimulus with the stimulus presented *n* trials earlier. QDesigner supports this by:

1. Configuring a sequence of text or image stimuli.
2. Setting `correctResponse` dynamically based on whether the current stimulus matches the one *n* steps back.
3. Using the `validKeys` to define "match" and "non-match" keys.

### 10.5.5 Custom Paradigms with Scheduled Phases

The `ReactionEngine` supports arbitrary trial structures through **scheduled phases**:

```typescript
engine.schedulePhase({
  name: "mask",
  durationMs: 200,
  allowResponse: false,
  marksStimulusOnset: false
});

engine.schedulePhase({
  name: "probe",
  durationMs: 0,  // Duration until response
  allowResponse: true,
  marksStimulusOnset: true
});
```

This enables paradigms like:
- **Masked priming:** fixation -> prime -> mask -> target
- **Attentional blink:** RSVP stream with target detection
- **Visual search:** display array with response window

---

## 10.6 Trial Configuration

Each trial is configured through a `ReactionTrialConfig` object:

| Field                          | Type                  | Default    | Description                              |
|-------------------------------|-----------------------|------------|------------------------------------------|
| `id`                           | `string`              | Required   | Unique trial identifier                  |
| `responseMode`                 | `'keyboard' \| 'mouse' \| 'touch'` | `'keyboard'` | Input method         |
| `validKeys`                    | `string[]`            | `[]` (any) | Allowed keyboard keys                    |
| `correctResponse`             | `string`              | -          | Expected correct response                |
| `requireCorrect`              | `boolean`             | `false`    | Evaluate correctness                     |
| `fixation`                     | `ReactionFixationConfig` | disabled | Fixation cross/dot settings             |
| `preStimulusDelayMs`          | `number`              | 0          | Delay after fixation, before stimulus    |
| `stimulus`                     | `ReactionStimulusConfig` | Required | Stimulus definition                     |
| `stimulusDurationMs`          | `number`              | -          | How long stimulus stays after response   |
| `responseTimeoutMs`           | `number`              | 2000       | Maximum response window                  |
| `interTrialIntervalMs`        | `number`              | 0          | Blank screen between trials              |
| `targetFPS`                    | `number`              | 120        | Renderer target frame rate               |
| `vsync`                        | `boolean`             | `true`     | Synchronize with display refresh         |
| `backgroundColor`             | `RGBAColor`           | Black      | Canvas background color                  |
| `allowResponseDuringPreStimulus` | `boolean`           | `false`    | Accept early responses                   |

### 10.6.1 Fixation Configuration

| Field      | Type               | Default   | Description              |
|-----------|--------------------|-----------|--------------------------|
| `enabled`  | `boolean`          | `false`   | Show fixation            |
| `type`     | `'cross' \| 'dot'` | `'cross'` | Fixation type            |
| `durationMs` | `number`        | 0         | Display duration         |
| `color`    | `RGBAColor`        | White     | Fixation color           |
| `sizePx`   | `number`           | 20        | Size in pixels           |

The fixation cross is rendered as two perpendicular rectangles (2px wide). The dot is rendered as a filled circle with radius `sizePx / 4`.

### 10.6.2 Response Mapping

**Keyboard:** The `validKeys` array specifies which keys are accepted. Key values use `event.key.toLowerCase()`. If the array is empty, any key is accepted.

**Mouse:** Click position is normalized to [0, 1] relative to the canvas:

```typescript
response.value = {
  x: (clientX - canvasLeft) / canvasWidth,
  y: (clientY - canvasTop) / canvasHeight
}
```

**Touch:** The first touch point is normalized identically to mouse clicks.

---

## 10.7 Trial Sequence

A trial proceeds through the following phases:

```
1. Fixation (optional)
   |
2. Pre-Stimulus Delay (optional)
   |
3. Stimulus Display + Response Window
   |  -> Response captured (or timeout)
   |
4. Post-Stimulus Duration (optional)
   |
5. Scheduled Phases (optional, arbitrary)
   |
6. Inter-Trial Interval (optional)
```

### 10.7.1 Phase Timeline

Every phase is recorded with precise start and end times in the `phaseTimeline` array:

```typescript
interface ReactionPhaseMark {
  name: string;       // "fixation", "pre-stimulus-delay", "stimulus", etc.
  startTime: number;  // performance.now() at phase start
  endTime: number;    // performance.now() at phase end
}
```

### 10.7.2 ISI and SOA Control

**Inter-Stimulus Interval (ISI):** The blank interval between the offset of one stimulus and the onset of the next. Controlled by `interTrialIntervalMs`.

**Stimulus Onset Asynchrony (SOA):** The time between the onset of one stimulus and the onset of the next:

$$SOA = \text{stimulusDuration} + ISI$$

For precise SOA control, set `stimulusDurationMs` and `interTrialIntervalMs` explicitly:

```typescript
// 200ms stimulus, 300ms ISI -> 500ms SOA
{ stimulusDurationMs: 200, interTrialIntervalMs: 300 }
```

---

## 10.8 Practice Trials

Practice trials use the same `ReactionTrialConfig` structure but are marked separately in the data. To implement practice:

1. Create a set of practice trial configs.
2. Run them through `engine.runTrial()` before the main trials.
3. Provide feedback using the `hooks.onResponse` callback.
4. Discard practice data in analysis (they are tagged with practice-prefixed IDs).

---

## 10.9 Trial Result Data

Each trial produces a `ReactionTrialResult` with comprehensive timing data:

```typescript
interface ReactionTrialResult {
  trialId: string;                    // Trial identifier
  startedAt: number;                  // Trial start (performance.now())
  stimulusOnsetTime: number | null;   // Actual display time
  response: ReactionResponseCapture | null;
  isCorrect: boolean | null;          // null if requireCorrect is false
  timeout: boolean;                   // Whether response timed out
  frameLog: FrameSample[];            // Per-frame timing data
  phaseTimeline: ReactionPhaseMark[]; // Phase timestamps
  stats: FrameStats;                  // Renderer statistics
}
```

### 10.9.1 Response Capture

```typescript
interface ReactionResponseCapture {
  source: 'keyboard' | 'mouse' | 'touch';
  value: string | { x: number; y: number };
  timestamp: number;         // performance.now() of the response event
  reactionTimeMs: number;    // timestamp - stimulusOnsetTime
}
```

### 10.9.2 Frame Log

The frame log records every animation frame during the trial:

```typescript
interface FrameSample {
  index: number;          // Frame counter
  now: number;            // performance.now() timestamp
  delta: number;          // Time since previous frame (ms)
  presented: boolean;     // Whether a frame was actually painted
  droppedSinceLast: number; // Frames missed since last presentation
}
```

This data enables post-hoc analysis of display timing quality (see Section 10.11).

---

## 10.10 Hooks

The `ReactionEngine` provides lifecycle hooks for real-time monitoring:

| Hook            | Signature                                    | Use Case                        |
|----------------|----------------------------------------------|---------------------------------|
| `onFrame`       | `(sample: FrameSample, stats: FrameStats) => void` | Real-time FPS display    |
| `onPhaseChange` | `(phase: string, startedAt: number) => void` | Phase progress indicator        |
| `onResponse`    | `(response: ReactionResponseCapture) => void` | Immediate feedback             |

---

## 10.11 Best Practices for Timing-Critical Research

### 10.11.1 Display Considerations

1. **Use fullscreen mode** to eliminate browser chrome and compositor interference.
2. **Request high refresh rate:** Set `targetFPS: 120` or higher. On 60Hz displays, this degrades gracefully.
3. **Enable vsync** (`vsync: true`) to synchronize with the display refresh cycle.
4. **Use `desynchronized: true`** (the default) to bypass the compositor.
5. **Minimize other browser activity** during testing.

### 10.11.2 Timing Validation

1. **Check `frameLog`** for dropped frames. If `droppedSinceLast > 0` on the stimulus onset frame, the onset time may be inaccurate.
2. **Check `stats.jitter`**: For timing-critical research, jitter should be below 2ms.
3. **Examine `phaseTimeline`** to verify that phase durations match configuration.
4. **Use `stimulusOnsetTime`** (not `startedAt`) for RT computation -- the engine does this automatically.

### 10.11.3 Stimulus Preparation and Automatic Preloading

QDesigner provides automatic media preloading through the **ResourceManager** to guarantee frame-exact timing with no network jitter on first stimulus presentation.

**How automatic preloading works:**

1. **ResourceManager integration**: The `ResourceManager` scans all trial configurations for media URLs (images, videos, audio) and begins downloading them in parallel before the questionnaire starts.
2. **seedFromResourceManager()**: The `ReactionEngine` calls `seedFromResourceManager()` during initialization, wiring the ResourceManager's cached assets into the engine's internal media cache. This means all media is already decoded and GPU-ready before the first trial begins.
3. **warmUpStimuli() per block**: Before each reaction time block starts, the engine calls `warmUpStimuli()`, which pre-caches all stimuli for the upcoming block. This includes uploading textures to the GPU, decoding audio buffers, and pre-rendering text canvases.
4. **Automatic preload() invocation**: The runtime automatically invokes `preload()` before the questionnaire starts, ensuring that all media assets referenced in the questionnaire definition are fetched and cached. Researchers do not need to manually trigger preloading.

This four-stage pipeline ensures that when a stimulus is presented, no network requests, image decoding, or texture uploads occur on the critical path. The result is frame-exact stimulus onset timing with zero jitter from asset loading.

**Additional best practices:**

1. **Use shape stimuli** when possible -- they render in a single GPU draw call with zero loading latency.
2. **Pre-render text** if the same text appears across trials (the text canvas is generated fresh each time).
3. **Verify preload completion**: The ResourceManager emits progress events that the runtime uses to display a loading indicator. Trials do not begin until all assets report ready.

### 10.11.4 Environmental Recommendations

1. **Hardware:** Dedicated GPU, 120Hz+ display, wired keyboard.
2. **Browser:** Chromium-based browsers provide the most consistent timing.
3. **OS:** Disable display scaling, power management, and notifications.
4. **Network:** Preload all media assets before the session.

### 10.11.5 Data Quality Checks

1. **Exclude trials with `response.reactionTimeMs < 100`** (anticipatory responses).
2. **Exclude trials with `timeout === true`** or analyze separately.
3. **Report frame drop rates** from `stats.droppedFrames / stats.totalFrames`.
4. **Report median RT** rather than mean, as RT distributions are typically right-skewed.

---

## 10.12 Summary

| Feature                     | Implementation                        | Key Value               |
|----------------------------|---------------------------------------|------------------------|
| Renderer                    | WebGL 2.0 with `desynchronized` flag  | Sub-frame latency       |
| Frame rate                  | Configurable target, vsync support    | 120+ FPS                |
| Timing API                  | `performance.now()`                   | ~5 microsecond resolution|
| Stimulus onset              | Frame-accurate detection              | First-presented-frame    |
| RT computation              | `response.timestamp - stimulusOnset`  | Sub-ms precision         |
| Storage precision           | BIGINT microseconds                   | Lossless integer storage |
| Stimulus types              | Shape, text, image, video, audio, custom shader | 6 types      |
| Response modes              | Keyboard, mouse, touch                | 3 modes                 |
| Paradigms                   | Simple RT, Choice RT, Go/No-Go, N-back, custom | Unlimited     |
| Per-trial data              | Frame log, phase timeline, stats      | Complete audit trail     |
| Media caching               | In-memory image/video/audio cache     | Zero re-load latency    |
| Automatic preloading        | ResourceManager + seedFromResourceManager() + warmUpStimuli() | Frame-exact first stimulus |
