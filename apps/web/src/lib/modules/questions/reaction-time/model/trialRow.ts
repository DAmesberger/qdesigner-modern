/**
 * Canonical long-format ("tidy") per-trial data model for reaction paradigms
 * (E-REACT-5).
 *
 * The reaction engine computes rich per-trial data (signed rawRtMs, anticipatory
 * false starts, display/output latency, offset method, frame health, video-frame
 * counts, a phase timeline). Both reaction runtimes persist that detail verbatim
 * into `value.responses[]` as {@link ReactionTrialRecord}s. This module defines
 * the ONE canonical tidy row — exactly one object per trial — that the analytics
 * export service flattens those records into, so SOTA reanalysis (anticipation
 * exclusion, latency auditing) has a defensible per-trial table.
 */

/**
 * A compacted phase mark persisted per trial. The engine's raw
 * `ReactionPhaseMark` carries absolute high-res start/end timestamps; the
 * persisted form adds the derived duration so downstream analysis needn't
 * recompute it, and drops nothing.
 */
export interface CompactPhaseMark {
  name: string;
  startTime: number;
  endTime: number;
  durationMs: number;
}

/**
 * The per-trial record as persisted in a reaction question's
 * `value.responses[]`. This is the structural contract that both
 * `ReactionTimeRuntime` and `ReactionExperimentRuntime` map their engine results
 * into — kept as a shared type so the export service and preview UI consume one
 * shape. Every field the engine measured is copied here; nothing is rolled up or
 * dropped at the trial level.
 */
export interface ReactionTrialRecord {
  trialId: string;
  trialNumber: number;
  isPractice: boolean;
  taskType: string;
  blockId: string;
  condition: string | null;
  trialTemplateId: string | null;
  /** Stimulus kind (`shape` | `text` | `image` | `video` | `audio` | `custom`). */
  stimulusKind: string | null;
  key: string | null;
  /** Reported reaction time, clamped at 0. */
  reactionTime: number | null;
  /** Signed raw reaction time (`response - onset`); may be negative. */
  rawRtMs: number | null;
  isCorrect: boolean | null;
  timeout: boolean;
  /** True when a response arrived before onset (a false start occurred). */
  anticipatory: boolean;
  /** Number of discarded pre-onset (anticipatory) responses. */
  falseStartCount: number;
  stimulusOnsetTime: number | null;
  stimulusOffsetTime: number | null;
  expectedResponse: string | null;
  isTarget: boolean | null;
  responseTimingMethod: string | null;
  responseDevice: string | null;
  holdDurationMs: number | null;
  gamepadButtonIndex: number | null;
  stimulusTimingMethod: string | null;
  /** Visual display-latency compensation applied to the onset (visual only). */
  displayLatencyMs: number | null;
  /** Audio output-latency folded into the onset (audio only). */
  outputLatencyMs: number | null;
  /** How the stimulus offset was scheduled (E-REACT-3): raf | timeout | none. */
  offsetMethod: string | null;
  /** Measured exposure in frames for a frame-accurate (raf) offset, else null. */
  actualDurationFrames: number | null;
  /** Number of logged video frames (video stimuli only; else 0). */
  videoFrameCount: number;
  /** Compacted per-phase timeline for this trial. */
  phaseTimeline: CompactPhaseMark[];
  frameStats: {
    fps: number;
    droppedFrames: number;
    jitter: number;
  };
  /** True when the trial was invalidated (e.g. stimulus render failed). */
  invalid: boolean;
  invalidReason: string | null;
  /**
   * The participant's assigned counterbalance cell (E-REACT-6) as a compact key
   * (e.g. `block-order=incompatible-first;key-mapping=reversed`), or null when the
   * design declared no counterbalancing. Constant across a session's trials.
   */
  counterbalanceCell?: string | null;
  /**
   * Environment provenance (W-2 / W-3 / W-6, ADR 0027). Both reaction runtimes
   * already persist these onto every trial record; they are the four fields that
   * tell a reviewer whether THIS run's timing can be trusted at all, so they are
   * declared here and exported. Optional because records written before the
   * runtimes captured them legitimately lack the measurement — an absent field
   * exports as empty (unknown), never as a fabricated `false`/`0`.
   */
  /** Whether the document was cross-origin isolated. When false, `performance.now()` is clamped (~100µs vs ~5µs) and the sub-ms claim silently degrades. */
  crossOriginIsolated?: boolean;
  /** Measured effective `performance.now()` quantum in ms during the trial. */
  timerResolutionMs?: number | null;
  /** Measured display refresh rate in Hz used for genuine drop counting (NOT targetFPS). */
  measuredRefreshRateHz?: number | null;
  /** True when the tab was backgrounded / lost focus during the trial. */
  visibilityInvalidated?: boolean;
}

/**
 * Compact the engine's raw phase timeline (absolute start/end timestamps) into
 * the persisted {@link CompactPhaseMark} form, adding the derived duration. A
 * null/undefined timeline compacts to an empty array.
 */
export function compactPhaseTimeline(
  timeline: ReadonlyArray<{ name: string; startTime: number; endTime: number }> | null | undefined
): CompactPhaseMark[] {
  if (!timeline) return [];
  return timeline.map((phase) => ({
    name: phase.name,
    startTime: phase.startTime,
    endTime: phase.endTime,
    durationMs: phase.endTime - phase.startTime,
  }));
}

/** Session-level context threaded into every tidy row. */
export interface TrialRowContext {
  sessionId: string;
  participantId?: string | null;
  questionId: string;
  /**
   * The exact questionnaire semver this session was filled out against (e.g.
   * `"1.4.2"`), or null when the source row carries no pin. Without it a trial
   * table cannot be tied back to the instrument that produced it.
   */
  questionnaireVersion?: string | null;
}

/**
 * One tidy row — a flat, one-object-per-trial record. Column order is fixed by
 * {@link TRIAL_ROW_COLUMNS}; the CSV flattener and the analytics preview both
 * read that ordered list so exports stay stable.
 */
export interface ReactionTrialRow {
  sessionId: string;
  participantId: string | null;
  questionId: string;
  /** Semver of the questionnaire build this session was filled against, or null. */
  questionnaireVersion: string | null;
  /** The participant's counterbalance cell key (E-REACT-6), or null. */
  counterbalanceCell: string | null;
  blockId: string;
  condition: string | null;
  trialNumber: number;
  trialId: string;
  isPractice: boolean;
  stimulusKind: string | null;
  key: string | null;
  expectedResponse: string | null;
  isTarget: boolean | null;
  reactionTimeMs: number | null;
  rawRtMs: number | null;
  isCorrect: boolean | null;
  timeout: boolean;
  anticipatory: boolean;
  falseStartCount: number;
  onsetMethod: string | null;
  responseMethod: string | null;
  responseDevice: string | null;
  displayLatencyMs: number | null;
  outputLatencyMs: number | null;
  offsetMethod: string | null;
  actualDurationFrames: number | null;
  holdDurationMs: number | null;
  stimulusOnsetTime: number | null;
  stimulusOffsetTime: number | null;
  videoFrameCount: number;
  fps: number | null;
  droppedFrames: number | null;
  jitter: number | null;
  /**
   * Whether the timer was at full resolution for this trial. `false` means
   * `performance.now()` was clamped and the sub-ms claim does not hold here.
   * Null when the record predates the measurement (unknown, not "fine").
   */
  crossOriginIsolated: boolean | null;
  /** Measured `performance.now()` quantum in ms, or null when unmeasured. */
  timerResolutionMs: number | null;
  /** Measured display refresh rate in Hz, or null when unmeasured. */
  measuredRefreshRateHz: number | null;
  /** True when the tab lost focus mid-trial, so the timing is untrustworthy. */
  visibilityInvalidated: boolean | null;
  invalid: boolean;
  invalidReason: string | null;
  /** True when this trial should be excluded from scored reanalysis. */
  excludeFromAnalysis: boolean;
  /** Machine-readable reason for exclusion, or null when kept. */
  excludeReason: string | null;
}

/**
 * Ordered column contract for the tidy table. Both the CSV flattener and the
 * preview UI iterate this so column order is a single source of truth. Each
 * entry pairs the {@link ReactionTrialRow} key with its export header (snake_case
 * for stats-package friendliness).
 */
export const TRIAL_ROW_COLUMNS: ReadonlyArray<{ key: keyof ReactionTrialRow; header: string }> = [
  { key: 'sessionId', header: 'session_id' },
  { key: 'participantId', header: 'participant_id' },
  { key: 'questionId', header: 'question_id' },
  { key: 'questionnaireVersion', header: 'questionnaire_version' },
  { key: 'counterbalanceCell', header: 'counterbalance_cell' },
  { key: 'blockId', header: 'block_id' },
  { key: 'condition', header: 'condition' },
  { key: 'trialNumber', header: 'trial_number' },
  { key: 'trialId', header: 'trial_id' },
  { key: 'isPractice', header: 'is_practice' },
  { key: 'stimulusKind', header: 'stimulus_kind' },
  { key: 'key', header: 'response_key' },
  { key: 'expectedResponse', header: 'expected_response' },
  { key: 'isTarget', header: 'is_target' },
  { key: 'reactionTimeMs', header: 'reaction_time_ms' },
  { key: 'rawRtMs', header: 'raw_rt_ms' },
  { key: 'isCorrect', header: 'is_correct' },
  { key: 'timeout', header: 'timeout' },
  { key: 'anticipatory', header: 'anticipatory' },
  { key: 'falseStartCount', header: 'false_start_count' },
  { key: 'onsetMethod', header: 'onset_method' },
  { key: 'responseMethod', header: 'response_method' },
  { key: 'responseDevice', header: 'response_device' },
  { key: 'displayLatencyMs', header: 'display_latency_ms' },
  { key: 'outputLatencyMs', header: 'output_latency_ms' },
  { key: 'offsetMethod', header: 'offset_method' },
  { key: 'actualDurationFrames', header: 'actual_duration_frames' },
  { key: 'holdDurationMs', header: 'hold_duration_ms' },
  { key: 'stimulusOnsetTime', header: 'stimulus_onset_time' },
  { key: 'stimulusOffsetTime', header: 'stimulus_offset_time' },
  { key: 'videoFrameCount', header: 'video_frame_count' },
  { key: 'fps', header: 'fps' },
  { key: 'droppedFrames', header: 'dropped_frames' },
  { key: 'jitter', header: 'jitter' },
  { key: 'crossOriginIsolated', header: 'cross_origin_isolated' },
  { key: 'timerResolutionMs', header: 'timer_resolution_ms' },
  { key: 'measuredRefreshRateHz', header: 'measured_refresh_rate_hz' },
  { key: 'visibilityInvalidated', header: 'visibility_invalidated' },
  { key: 'invalid', header: 'invalid' },
  { key: 'invalidReason', header: 'invalid_reason' },
  { key: 'excludeFromAnalysis', header: 'exclude_from_analysis' },
  { key: 'excludeReason', header: 'exclude_reason' },
] as const;

/**
 * Determine whether a trial should be excluded from scored reanalysis, and why.
 *
 * Three ways a trial fails to be a genuine measurement, in the same precedence the
 * runtime stamps `trials.invalidated` with (`trialEvent.ts`), so the exported row
 * and the persisted row never disagree about why a trial was dropped:
 *
 *  - `visibility`  — the tab was hidden mid-trial, so the clock we timed against
 *                    was not the clock the participant was looking at. This arm was
 *                    MISSING: a trial whose timing is known-untrustworthy still
 *                    scored and still entered aggregates.
 *  - render failure — the stimulus never appeared; nothing was measured.
 *  - `anticipatory` — a false start, timed against a stimulus not yet shown.
 */
function resolveExclusion(trial: ReactionTrialRecord): { exclude: boolean; reason: string | null } {
  if (trial.visibilityInvalidated) {
    return { exclude: true, reason: 'visibility' };
  }
  if (trial.invalid) {
    return { exclude: true, reason: trial.invalidReason ?? 'invalid' };
  }
  if (trial.anticipatory) {
    return { exclude: true, reason: 'anticipatory' };
  }
  return { exclude: false, reason: null };
}

/**
 * Build the canonical tidy row for a single persisted trial record. Populates
 * every column; missing engine fields (older/partial records) fall back to null
 * or the neutral default so the column set is always complete and stable.
 */
export function buildTrialRow(
  trial: ReactionTrialRecord,
  context: TrialRowContext
): ReactionTrialRow {
  const exclusion = resolveExclusion(trial);
  return {
    sessionId: context.sessionId,
    participantId: context.participantId ?? null,
    questionId: context.questionId,
    questionnaireVersion: context.questionnaireVersion ?? null,
    counterbalanceCell: trial.counterbalanceCell ?? null,
    blockId: trial.blockId,
    condition: trial.condition ?? null,
    trialNumber: trial.trialNumber,
    trialId: trial.trialId,
    isPractice: trial.isPractice,
    stimulusKind: trial.stimulusKind ?? null,
    key: trial.key ?? null,
    expectedResponse: trial.expectedResponse ?? null,
    isTarget: trial.isTarget ?? null,
    reactionTimeMs: trial.reactionTime ?? null,
    rawRtMs: trial.rawRtMs ?? null,
    isCorrect: trial.isCorrect ?? null,
    timeout: trial.timeout,
    anticipatory: trial.anticipatory,
    falseStartCount: trial.falseStartCount,
    onsetMethod: trial.stimulusTimingMethod ?? null,
    responseMethod: trial.responseTimingMethod ?? null,
    responseDevice: trial.responseDevice ?? null,
    displayLatencyMs: trial.displayLatencyMs ?? null,
    outputLatencyMs: trial.outputLatencyMs ?? null,
    offsetMethod: trial.offsetMethod ?? null,
    actualDurationFrames: trial.actualDurationFrames ?? null,
    holdDurationMs: trial.holdDurationMs ?? null,
    stimulusOnsetTime: trial.stimulusOnsetTime ?? null,
    stimulusOffsetTime: trial.stimulusOffsetTime ?? null,
    videoFrameCount: trial.videoFrameCount ?? 0,
    fps: trial.frameStats?.fps ?? null,
    droppedFrames: trial.frameStats?.droppedFrames ?? null,
    jitter: trial.frameStats?.jitter ?? null,
    crossOriginIsolated: trial.crossOriginIsolated ?? null,
    timerResolutionMs: trial.timerResolutionMs ?? null,
    measuredRefreshRateHz: trial.measuredRefreshRateHz ?? null,
    visibilityInvalidated: trial.visibilityInvalidated ?? null,
    invalid: trial.invalid,
    invalidReason: trial.invalidReason ?? null,
    excludeFromAnalysis: exclusion.exclude,
    excludeReason: exclusion.reason,
  };
}
