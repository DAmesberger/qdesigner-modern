import type { RGBAColor, FrameSample, FrameStats } from '$lib/shared';

export type ReactionResponseMode = 'keyboard' | 'mouse' | 'touch' | 'gamepad';

/**
 * A normalized target region for spatial-response scoring. `x`/`y` are the
 * region centre and `radius` its extent, all expressed in the SAME normalized
 * [0,1] canvas space as a captured `{ x, y }` pointer/touch value — so a click
 * is scored viewport-independently (see `input/spatialHit.ts`).
 */
export interface ReactionTargetRegion {
  x: number;
  y: number;
  radius: number;
}

/**
 * A device family that can deliver participant responses (ADR 0024). Multiple
 * sources may be armed concurrently for one trial; the first event wins. The
 * union is deliberately OPEN for `'hid'` — RT-4 adds the WebHID adapter that
 * consumes it; until then the engine arms the other sources and ignores `'hid'`
 * bindings gracefully.
 */
export type ResponseSourceKind = 'keyboard' | 'pointer' | 'touch' | 'gamepad' | 'hid';

/** A keyboard key attached to a ResponseOption, firing on press or release. */
export interface KeyboardBinding {
  source: 'keyboard';
  /** The `KeyboardEvent.key` value (compared case-insensitively). */
  key: string;
  /** Which edge fires the response. Defaults to `'down'` (press). */
  on?: 'down' | 'up';
}

/** A pointer (mouse) click attached to a ResponseOption, optionally region-scoped. */
export interface PointerBinding {
  source: 'pointer';
  /**
   * Optional spatial-hit region in normalized [0,1] canvas space. When several
   * pointer options are armed, a click resolves to the option whose region
   * contains it; a region-less binding is a catch-all. Absent = any click.
   */
  region?: ReactionTargetRegion;
}

/** A touch attached to a ResponseOption, optionally region-scoped (see PointerBinding). */
export interface TouchBinding {
  source: 'touch';
  region?: ReactionTargetRegion;
}

/** A gamepad button (by `navigator.getGamepads()` index) attached to a ResponseOption. */
export interface GamepadBinding {
  source: 'gamepad';
  button: number;
}

/**
 * A WebHID button attached to a ResponseOption. RT-4 adds the adapter that reads
 * `inputreport` events and resolves this binding; the engine currently ignores
 * it. Kept in the union so content and the designer can author it ahead of the
 * adapter.
 */
export interface HidBinding {
  source: 'hid';
  /** HID report button index the RT-4 adapter matches against. */
  button: number;
  on?: 'down' | 'up';
}

/**
 * The attachment of one physical input to a ResponseOption (ADR 0024 / CONTEXT
 * glossary). Discriminated on `source`; the engine's arming switch ignores any
 * unknown source kind, so the union can grow (WebHID, WebSerial) without
 * touching the resolver.
 */
export type Binding =
  | KeyboardBinding
  | PointerBinding
  | TouchBinding
  | GamepadBinding
  | HidBinding;

/**
 * One semantic response alternative in a ResponseSet, identified by a stable
 * `id` that analysis and export key on (e.g. `'left'`, `'go'`), independent of
 * which physical input produced it. A single option may carry several bindings
 * (e.g. the same option on a keyboard key AND a HID button).
 */
export interface ResponseOption {
  id: string;
  label?: string;
  bindings: Binding[];
}

/**
 * The named, ordered list of ResponseOptions a trial arms (ADR 0024). A trial
 * accepts exactly one winning response from its set. Existing content compiles
 * its legacy `{validKeys, correctResponse, …}` shape into a ResponseSet via
 * `compileLegacyResponse` — see `responseSet.ts`.
 */
export interface ResponseSet {
  id?: string;
  options: ResponseOption[];
}

/**
 * An authored phase duration (ADR 0025). Either a fixed value in ms, or a
 * distribution the seeded generator samples per-trial when trials are
 * materialized. The object form is shaped to admit future named distributions
 * (exponential, …) by discriminating on `dist`; today only `'uniform'` exists.
 *
 * A fixed number never consumes an rng draw, so a study authored entirely with
 * fixed timings produces a byte-identical trial sequence to the pre-TimingSpec
 * generators; only a distribution spec draws. See `presets/timingSpec.ts`.
 */
export type TimingSpec = number | UniformTimingSpec;

/** A per-trial duration drawn uniformly from `[min, max]` ms (inclusive). */
export interface UniformTimingSpec {
  dist: 'uniform';
  min: number;
  max: number;
}

export interface ReactionFixationConfig {
  enabled?: boolean;
  type?: 'cross' | 'dot';
  durationMs?: number;
  color?: RGBAColor;
  sizePx?: number;
}

/**
 * Per-trial feedback config (E-REACT-4). When `show` is true the engine renders
 * a short feedback message after the response window closes, for `durationMs`:
 * - `accuracy`: Correct / Incorrect / Too slow (from the trial verdict).
 * - `rt`: the measured reaction time in ms.
 * - `both`: the verdict plus the reaction time.
 * The `*Text` fields override the default verdict strings. Feedback is a display
 * phase only — it captures no response and never contributes to scored RT.
 */
export interface ReactionTrialFeedbackConfig {
  show: boolean;
  mode: 'accuracy' | 'rt' | 'both';
  durationMs: number;
  correctText?: string;
  incorrectText?: string;
  tooSlowText?: string;
}

export interface ReactionStimulusBase {
  id?: string;
  position?: { x: number; y: number };
}

export interface ShapeStimulusConfig extends ReactionStimulusBase {
  kind: 'shape';
  shape: 'circle' | 'square' | 'rectangle' | 'triangle';
  color?: RGBAColor;
  widthPx?: number;
  heightPx?: number;
  radiusPx?: number;
}

export interface TextStimulusConfig extends ReactionStimulusBase {
  kind: 'text';
  text: string;
  color?: RGBAColor;
  fontPx?: number;
  fontFamily?: string;
}

export interface ImageStimulusConfig extends ReactionStimulusBase {
  kind: 'image';
  src: string;
  widthPx?: number;
  heightPx?: number;
}

export interface VideoStimulusConfig extends ReactionStimulusBase {
  kind: 'video';
  src: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  widthPx?: number;
  heightPx?: number;
}

export interface AudioStimulusConfig extends ReactionStimulusBase {
  kind: 'audio';
  src: string;
  volume?: number;
  autoplay?: boolean;
}

export interface CustomStimulusConfig extends ReactionStimulusBase {
  kind: 'custom';
  shader: string;
  vertices: number[];
  uniforms?: Record<string, number | number[] | boolean>;
}

export type ReactionStimulusConfig =
  | ShapeStimulusConfig
  | TextStimulusConfig
  | ImageStimulusConfig
  | VideoStimulusConfig
  | AudioStimulusConfig
  | CustomStimulusConfig;

export interface ScheduledPhase {
  name: string;
  durationMs: number;
  /**
   * Frame-accurate phase length (E-REACT-3). When set (> 0) the phase advances
   * on the presented-frame counter — it ends on the exact vsync boundary
   * `durationFrames` presented frames in — instead of the `durationMs`
   * `setTimeout`, which drifts up to a frame. `durationMs` remains the fallback
   * for uncalibrated/time-based phases. Prerequisite for trustworthy RSVP /
   * temporal-order timing (E-REACT-2).
   */
  durationFrames?: number;
  allowResponse?: boolean;
  /**
   * When true this phase RE-MARKS the stimulus onset: at the start of the phase
   * the previously recorded onset is discarded and the raf onset detector is
   * re-armed, so the next presented frame during this phase becomes the new
   * onset (with display-latency compensation applied, exactly like the primary
   * visual onset). Use for multi-phase paradigms (e.g. masking) where a later
   * phase carries the true stimulus. This is an explicit reset — it is NOT
   * blocked by the first-wins onset guard (which historically made the flag a
   * no-op once an earlier phase had already stamped onset).
   */
  marksStimulusOnset?: boolean;
}

export interface ReactionTrialConfig {
  id: string;
  metadata?: Record<string, unknown>;
  responseMode?: ReactionResponseMode;
  validKeys?: string[];
  correctResponse?: string;
  /**
   * Explicit ResponseSet (ADR 0024). When present it wins over the legacy
   * `responseMode`/`validKeys`/`gamepadButtonMap`/`targetRegion` fields — the
   * engine arms exactly the sources its bindings name. When absent the engine
   * compiles the legacy fields into a ResponseSet (`compileLegacyResponse`), so
   * existing content behaves identically.
   */
  responseSet?: ResponseSet;
  /**
   * Semantic option ids counted as correct (ADR 0024). Only consulted when
   * `requireCorrect` is set AND this is present: correctness becomes
   * `correctOptionIds.includes(winner.optionId)`. Compiled-legacy content leaves
   * this undefined and keeps its `correctResponse`/`targetRegion` correctness.
   */
  correctOptionIds?: string[];
  requireCorrect?: boolean;
  fixation?: ReactionFixationConfig;
  preStimulusDelayMs?: number;
  /**
   * Frame-accurate pre-stimulus delay (E-REACT-3). When set (> 0) the delay is
   * counted in presented frames (vsync-aligned) rather than the `preStimulusDelayMs`
   * `setTimeout`. Takes precedence over `preStimulusDelayMs` when both are given.
   */
  preStimulusDelayFrames?: number;
  stimulus: ReactionStimulusConfig;
  stimulusDurationMs?: number;
  /**
   * Frame-accurate stimulus exposure (E-REACT-3). When set (> 0) the stimulus is
   * removed on the exact presented frame `stimulusDurationFrames` frames after
   * onset (`offsetMethod === 'raf'`), giving drift-free brief-exposure / masking
   * / RSVP durations. Takes precedence over `stimulusDurationMs`. When only
   * `stimulusDurationMs` is given, a calibrated device converts it to a frame
   * budget; an uncalibrated one falls back to `setTimeout` (`offsetMethod ===
   * 'timeout'`).
   */
  stimulusDurationFrames?: number;
  responseTimeoutMs?: number;
  interTrialIntervalMs?: number;
  targetFPS?: number;
  vsync?: boolean;
  backgroundColor?: RGBAColor;
  allowResponseDuringPreStimulus?: boolean;
  /**
   * Keyboard only: also capture the key-UP so a hold/release paradigm records
   * `releaseTimestamp` and `holdDurationMs`. When set, the response is finalized
   * on release (RT is still measured from the key-DOWN onset).
   */
  captureKeyUp?: boolean;
  /**
   * Spatial-response scoring region (mouse/touch). When present,
   * `evaluateCorrectness` marks the trial correct iff the captured normalized
   * `{ x, y }` point falls within `radius` of `(x, y)`.
   */
  targetRegion?: ReactionTargetRegion;
  /**
   * Gamepad only: maps a `navigator.getGamepads()` button index to the response
   * value emitted when that button transitions unpressed→pressed.
   */
  gamepadButtonMap?: Record<number, string>;
  /**
   * Trial-level feedback (E-REACT-4). When present with `show === true`, the
   * engine renders a feedback message after the response window closes.
   */
  feedback?: ReactionTrialFeedbackConfig;
}

export type TimingMethod =
  | 'event.timeStamp'
  | 'rvfc'
  | 'audioContext'
  | 'raf'
  | 'gamepad.timestamp'
  | 'performance.now';

/**
 * How a stimulus offset was scheduled (E-REACT-3):
 * - `raf`: removed on the exact presented (vsync) frame N frames after onset —
 *   frame-count offset, or a calibrated ms→frames conversion. Frame-accurate.
 * - `timeout`: removed by a `window.setTimeout` (a ms duration on an
 *   uncalibrated device). Drifts up to a frame.
 * - `none`: no duration configured; removed when the response window closed.
 */
export type ReactionOffsetMethod = 'raf' | 'timeout' | 'none';

export interface ReactionResponseCapture {
  source: ReactionResponseMode;
  value: string | { x: number; y: number };
  timestamp: number;
  /** Reported reaction time, clamped at 0 (`max(0, timestamp - onset)`). */
  reactionTimeMs: number;
  /**
   * Signed raw reaction time (`timestamp - onset`). May be negative when the
   * response landed on the same frame as (or just before) the corrected onset;
   * `reactionTimeMs` is the clamped view of this value. Absent when there was
   * no onset to measure against.
   */
  rawRtMs?: number;
  timingMethod?: TimingMethod;
  /**
   * The device family that produced the response. Usually equal to `source`;
   * threaded explicitly so the persistence layer can record it verbatim.
   */
  responseDevice?: ReactionResponseMode;
  /**
   * Keyboard hold/release paradigms (`captureKeyUp`): the high-resolution
   * timestamp of the key-UP that finalized the response.
   */
  releaseTimestamp?: number;
  /** Hold duration in ms (`releaseTimestamp - keydownTimestamp`), clamped at 0. */
  holdDurationMs?: number;
  /** Gamepad only: the `navigator.getGamepads()` button index that fired. */
  gamepadButtonIndex?: number;
  /**
   * ResponseSet (ADR 0024): the semantic id of the ResponseOption the winning
   * binding resolved to. Absent when the response matched no option (e.g. a
   * legacy keyboard trial with no `validKeys` accepting an arbitrary key).
   */
  optionId?: string;
  /**
   * ResponseSet (ADR 0024): the source family of the winning binding
   * (`keyboard`/`pointer`/`touch`/`gamepad`/`hid`). Distinct from `source`,
   * which stays the legacy `ReactionResponseMode` (`pointer` ⇒ `mouse`).
   */
  responseSource?: ResponseSourceKind;
  /** ResponseSet (ADR 0024): the concrete winning binding (carries the key/button/edge). */
  binding?: Binding;
}

/** One logged video frame, used to reconstruct the displayed frame at response time. */
export interface VideoFrameSample {
  /** Media presentation timestamp of the frame, in seconds. */
  mediaTime: number;
  /** Count of frames the compositor has presented for this video. */
  presentedFrames: number;
  /** Expected display time of the frame (rVFC clock, `DOMHighResTimeStamp`). */
  expectedDisplayTime: number;
}

/** Onset details surfaced through the `onStimulusOnset` hook. */
export interface ReactionOnsetInfo {
  method: TimingMethod;
  /** Raw onset in the source clock, before any correction. */
  rawOnsetTime: number;
  /** Onset used for RT: `rawOnsetTime + displayLatencyMs` for visual, else raw. */
  correctedOnsetTime: number;
  /** Visual (raf) only: measured display latency added to the raw raf time. */
  displayLatencyMs?: number;
  /** Audio (audioContext) only: output/DAC latency folded into the onset. */
  outputLatencyMs?: number;
  /** True when a degraded fallback path produced the onset (e.g. HTMLAudio). */
  degraded: boolean;
}

/** Info surfaced through the `onFalseStart` hook for anticipatory responses. */
export interface ReactionFalseStartInfo {
  source: ReactionResponseMode;
  value: string | { x: number; y: number };
  timestamp: number;
  /** ResponseSet (ADR 0024): option the anticipatory response resolved to, if any. */
  optionId?: string;
  /** ResponseSet (ADR 0024): source family of the anticipatory binding. */
  responseSource?: ResponseSourceKind;
  /** ResponseSet (ADR 0024): the concrete binding the anticipatory response matched. */
  binding?: Binding;
}

/**
 * Render-error payload (CONTRACT-ERR). Surfaced by the renderer's `onError` hook
 * — which the WebGLRenderer slice invokes when a texture upload throws — and
 * relayed through the engine's `onRenderError` hook when a trial is aborted.
 */
export interface ReactionRenderErrorInfo {
  /** The renderer operation that failed (e.g. `'drawTexture'`). */
  source: string;
  /** The thrown error (e.g. a cross-origin `SecurityError`). */
  error: unknown;
}

/**
 * Per-trial timing provenance (C-PROVENANCE). Aggregated up to the response
 * level by the reaction runtimes for the `timing_provenance` persistence field.
 */
export interface ReactionTrialProvenance {
  /** Method that produced the stimulus onset (`raf` | `rvfc` | `audioContext` | …). */
  onsetMethod: TimingMethod;
  /** Method that timestamped the captured response, or null when none captured. */
  responseMethod: TimingMethod | null;
  /** Visual display-latency compensation applied to the onset (visual only). */
  displayLatencyMs?: number;
  /** Audio output-latency folded into the onset (audio only). */
  outputLatencyMs?: number;
  /** Signed raw reaction time of the captured response, or null. */
  rawRtMs?: number | null;
  /** True when at least one response arrived before onset (a false start). */
  anticipatory: boolean;
  /** Alias of `anticipatory`, kept explicit for the persistence contract. */
  falseStart: boolean;
  /** Number of discarded pre-onset (anticipatory) responses. */
  falseStartCount: number;
  /** True when the onset was produced by a degraded fallback path. */
  degraded: boolean;
  /** How the stimulus offset was scheduled (E-REACT-3). */
  offsetMethod: ReactionOffsetMethod;
  /**
   * Measured exposure in presented frames (`offsetFrameIndex - onsetFrameIndex`)
   * for a vsync-aligned (`offsetMethod === 'raf'`) offset; null otherwise. Lets
   * a researcher verify per-trial that a frame-counted stimulus was shown for
   * exactly the requested number of frames.
   */
  actualDurationFrames?: number | null;
  frameStats: {
    fps: number;
    droppedFrames: number;
    jitter: number;
  };
  /**
   * Whether the document was cross-origin isolated during the trial (W-2). When
   * false, `performance.now()` is clamped (~100µs vs ~5µs) and the sub-ms claim
   * silently degrades — the run stays recorded but is flagged here (ADR 0027).
   */
  crossOriginIsolated: boolean;
  /**
   * Measured effective `performance.now()` quantum in ms (W-2): the smallest
   * positive inter-sample delta observed in a tight loop. ~0.005 when isolated,
   * clamped toward ~0.1 otherwise. 0 when it could not be estimated.
   */
  timerResolutionMs: number;
  /**
   * Measured display refresh rate in Hz used to count genuinely-dropped frames
   * (W-6), from calibration or the renderer's observed frame cadence — NOT the
   * `targetFPS`. Null when no measurement was available.
   */
  measuredRefreshRateHz?: number | null;
  /**
   * Set when the trial's timing cannot be trusted (ADR 0027 record mode). Absent
   * for a clean trial.
   * - `'visibility'`: the tab was backgrounded / lost focus during the trial
   *   (W-3). The trial still completes and records its RT; the timing may be
   *   unreliable.
   * - `'no-stimulus'`: a visual stimulus never reached the renderer (F-54
   *   belt-and-braces). Onset was never armed against real pixels, so any RT is
   *   measured against a blank screen — the trial is marked invalid, not timed.
   */
  invalidated?: 'visibility' | 'no-stimulus' | null;
  /** Number of visibility/focus-loss events observed during the trial (W-3). */
  visibilityLossCount?: number;
  /**
   * Per-event phase context for each visibility loss (W-3): which phase was
   * active and how many ms into it focus was lost. Empty for a clean trial.
   */
  visibilityLossPhases?: Array<{ phase: string; phaseElapsedMs: number }>;
  /** Per-trial ring of video frames (video stimuli only). */
  videoFrames?: VideoFrameSample[];
}

export interface ReactionPhaseMark {
  name: string;
  startTime: number;
  endTime: number;
}

export interface ReactionTrialResult {
  trialId: string;
  startedAt: number;
  /** Corrected onset used for RT (raw + display-latency for visual stimuli). */
  stimulusOnsetTime: number | null;
  /** Raw onset in the source clock before display-latency correction. */
  stimulusOnsetRawTime: number | null;
  /**
   * Time the stimulus renderable was removed. Set when `stimulusDurationMs`
   * elapses (the visual is removed while the response window stays open) or,
   * for open-ended stimuli, when the response window closes. Null if never
   * shown as a renderable (e.g. audio-only).
   */
  stimulusOffsetTime: number | null;
  /**
   * How the stimulus offset was scheduled (E-REACT-3): `raf` (vsync-aligned
   * frame-count / calibrated ms→frames), `timeout` (uncalibrated ms setTimeout),
   * or `none` (removed at response-window close).
   */
  offsetMethod: ReactionOffsetMethod;
  /**
   * Measured exposure in presented frames for a frame-accurate (`raf`) offset —
   * `offsetFrameIndex - onsetFrameIndex` — or null for a timeout/none offset.
   */
  actualDurationFrames: number | null;
  stimulusTimingMethod?: TimingMethod;
  /** Visual display-latency compensation applied to the onset (visual only). */
  displayLatencyMs?: number;
  /** Audio output-latency folded into the onset (audio only). */
  outputLatencyMs?: number;
  /** True when a response arrived before onset (a false start occurred). */
  anticipatory: boolean;
  /** Alias of `anticipatory`, kept explicit for the persistence contract. */
  falseStart: boolean;
  /** Number of discarded pre-onset (anticipatory) responses. */
  falseStartCount: number;
  /** Per-trial ring of logged video frames (video stimuli only; else empty). */
  videoFrames: VideoFrameSample[];
  response: ReactionResponseCapture | null;
  isCorrect: boolean | null;
  timeout: boolean;
  /**
   * True when the trial was aborted and its measurement discarded — e.g. a
   * render error fired mid-trial (a stimulus texture upload failed, leaving a
   * blank screen), so any captured RT would be measured against nothing shown.
   * An invalid trial carries a null `response` (no RT recorded). Defaults false.
   */
  invalid: boolean;
  /** Machine-readable reason the trial was marked invalid (`invalid === true`). */
  invalidReason?: string;
  frameLog: FrameSample[];
  phaseTimeline: ReactionPhaseMark[];
  stats: FrameStats;
  /** Rolled-up C-PROVENANCE for this trial. */
  provenance: ReactionTrialProvenance;
}

export interface ReactionEngineHooks {
  onFrame?: (sample: FrameSample, stats: FrameStats) => void;
  onPhaseChange?: (phase: string, startedAt: number) => void;
  onResponse?: (response: ReactionResponseCapture) => void;
  /** Fired once per trial when the stimulus onset is recorded. */
  onStimulusOnset?: (onset: ReactionOnsetInfo) => void;
  /** Fired for each anticipatory (pre-onset) response that is discarded. */
  onFalseStart?: (info: ReactionFalseStartInfo) => void;
  /**
   * Fired once per trial when a render error aborts it (CONTRACT-ERR). The
   * result is returned with `invalid === true`; this hook surfaces the failing
   * renderer operation for logging/telemetry.
   */
  onRenderError?: (info: ReactionRenderErrorInfo) => void;
}
