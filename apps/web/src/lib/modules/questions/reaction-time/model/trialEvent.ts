import type { RuntimeTrialEvent } from '$lib/runtime/core/question-runtime';
import type { ReactionTrialConfig, ScheduledPhase } from '$lib/runtime/reaction';
import type { CompactPhaseMark } from './trialRow';

/**
 * Derive the materialized core phases of a trial (ADR 0025) as ScheduledPhase
 * records, so the per-trial durations a paradigm SAMPLED at generation — the PVT
 * foreperiod, a jittered fixation/ISI, a Sternberg study+retention delay — reach
 * `sampledTimings`. Paradigm presets don't populate `metadata.scheduledPhases`
 * (those are extra tail phases for study-block templates), so without this the
 * blob would be empty for them. Only phases with a concrete positive duration are
 * emitted. The runtimes prepend these to any authored `scheduledPhases`.
 */
export function materializedPhasesFromTrial(trial: ReactionTrialConfig): ScheduledPhase[] {
  const phases: ScheduledPhase[] = [];

  if (trial.fixation?.enabled && (trial.fixation.durationMs ?? 0) > 0) {
    phases.push({ name: 'fixation', durationMs: trial.fixation.durationMs ?? 0 });
  }
  if ((trial.preStimulusDelayMs ?? 0) > 0 || (trial.preStimulusDelayFrames ?? 0) > 0) {
    phases.push({
      name: 'foreperiod',
      durationMs: trial.preStimulusDelayMs ?? 0,
      durationFrames: trial.preStimulusDelayFrames,
    });
  }
  if ((trial.stimulusDurationMs ?? 0) > 0 || (trial.stimulusDurationFrames ?? 0) > 0) {
    phases.push({
      name: 'stimulus',
      durationMs: trial.stimulusDurationMs ?? 0,
      durationFrames: trial.stimulusDurationFrames,
    });
  }
  if ((trial.responseTimeoutMs ?? 0) > 0) {
    phases.push({ name: 'response-window', durationMs: trial.responseTimeoutMs ?? 0 });
  }
  if ((trial.interTrialIntervalMs ?? 0) > 0) {
    phases.push({ name: 'inter-trial', durationMs: trial.interTrialIntervalMs ?? 0 });
  }

  return phases;
}

/**
 * The slice of a runtime's per-trial `TrialResponse` that {@link buildRuntimeTrialEvent}
 * reads. Both v1 reaction runtimes build a structurally-richer `TrialResponse`; this
 * subset is what maps onto the persisted per-trial row (RT-1b), so passing the full
 * response satisfies it (extra fields are ignored).
 */
export interface TrialEventSource {
  trialNumber: number;
  taskType: string;
  isPractice: boolean;
  optionId: string | null;
  responseSource: string | null;
  reactionTime: number | null;
  isCorrect: boolean | null;
  rawRtMs: number | null;
  anticipatory: boolean;
  displayLatencyMs: number | null;
  outputLatencyMs: number | null;
  stimulusTimingMethod: string | null;
  responseTimingMethod: string | null;
  frameStats: { fps: number; droppedFrames: number; jitter: number };
  crossOriginIsolated: boolean;
  timerResolutionMs: number | null;
  measuredRefreshRateHz: number | null;
  phaseTimeline: CompactPhaseMark[];
  visibilityInvalidated: boolean;
  /** How many times the tab was hidden during this trial (0 when it never was). */
  visibilityLossCount?: number;
  /** Which phase each visibility loss landed in, and how far into it. */
  visibilityLossPhases?: Array<{ phase: string; phaseElapsedMs: number }>;
  invalid: boolean;
  invalidReason: string | null;
}

/**
 * Map a completed trial into the persistence-facing {@link RuntimeTrialEvent} (RT-1b).
 *
 * `rtUs` is floored ms×1000 (a single scalar of microseconds, matching the server
 * `trials.rt_us` column). `sampledTimings` is the MATERIALIZED phase plan for the
 * trial (ADR 0025 — trials are sampled at generation, so these are the fixed
 * durations that drove this run), kept distinct from `provenance`, the MEASURED
 * environment/timing blob.
 *
 * `invalidated` names the single most fundamental reason the trial is not a clean
 * measurement, in this precedence:
 *
 *   1. `visibility`     — the tab was hidden; the timing itself is untrustworthy.
 *   2. the invalid reason — the stimulus failed to render; nothing was measured.
 *   3. `anticipatory`   — a false start: the response landed BEFORE onset, so the
 *                         RT is measured against a stimulus that wasn't shown yet.
 *
 * The anticipatory arm is the one the live path used to drop on the floor. The
 * 00048 backfill has always mapped it (`00048_trials.sql:171-175`), so the same
 * false start was excluded when it arrived by backfill and silently pooled into
 * cohort quartiles when it arrived live. Live and backfill now agree.
 */
export function buildRuntimeTrialEvent(
  questionId: string,
  trial: TrialEventSource,
  scheduledPhases: ScheduledPhase[] | undefined
): RuntimeTrialEvent {
  const rtUs =
    typeof trial.reactionTime === 'number' ? Math.floor(trial.reactionTime * 1000) : null;

  const invalidated = trial.visibilityInvalidated
    ? 'visibility'
    : trial.invalid
      ? (trial.invalidReason ?? 'invalid')
      : trial.anticipatory
        ? 'anticipatory'
        : null;

  return {
    questionId,
    trialIndex: trial.trialNumber,
    paradigm: trial.taskType,
    optionId: trial.optionId,
    source: trial.responseSource,
    rtUs,
    correct: trial.isCorrect,
    isPractice: trial.isPractice,
    sampledTimings: {
      phases: (scheduledPhases ?? []).map((phase) => ({
        name: phase.name,
        durationMs: phase.durationMs,
        durationFrames: phase.durationFrames ?? null,
      })),
    },
    provenance: {
      onsetMethod: trial.stimulusTimingMethod,
      responseMethod: trial.responseTimingMethod,
      displayLatencyMs: trial.displayLatencyMs,
      outputLatencyMs: trial.outputLatencyMs,
      rawRtMs: trial.rawRtMs,
      anticipatory: trial.anticipatory,
      frameStats: trial.frameStats,
      crossOriginIsolated: trial.crossOriginIsolated,
      timerResolutionMs: trial.timerResolutionMs,
      measuredRefreshRateHz: trial.measuredRefreshRateHz,
      phaseTimeline: trial.phaseTimeline,
      // The engine counts every visibility loss and records which phase it landed
      // in, then threw both away here. `invalidated: 'visibility'` is a verdict
      // with no evidence behind it — a reviewer can't see how bad the interruption
      // was or whether it touched the stimulus. ADR 0027 is record-by-default, so
      // record it: jsonb, no schema change, and it rides the existing export.
      visibilityLossCount: trial.visibilityLossCount ?? 0,
      visibilityLossPhases: trial.visibilityLossPhases ?? [],
    },
    invalidated,
  };
}
