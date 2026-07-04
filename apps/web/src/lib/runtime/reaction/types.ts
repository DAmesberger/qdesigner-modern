import type { RGBAColor, FrameSample, FrameStats } from '$lib/shared';

export type ReactionResponseMode = 'keyboard' | 'mouse' | 'touch';

export interface ReactionFixationConfig {
  enabled?: boolean;
  type?: 'cross' | 'dot';
  durationMs?: number;
  color?: RGBAColor;
  sizePx?: number;
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
  requireCorrect?: boolean;
  fixation?: ReactionFixationConfig;
  preStimulusDelayMs?: number;
  stimulus: ReactionStimulusConfig;
  stimulusDurationMs?: number;
  responseTimeoutMs?: number;
  interTrialIntervalMs?: number;
  targetFPS?: number;
  vsync?: boolean;
  backgroundColor?: RGBAColor;
  allowResponseDuringPreStimulus?: boolean;
}

export type TimingMethod =
  | 'event.timeStamp'
  | 'rvfc'
  | 'audioContext'
  | 'raf'
  | 'performance.now';

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
  frameStats: {
    fps: number;
    droppedFrames: number;
    jitter: number;
  };
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
