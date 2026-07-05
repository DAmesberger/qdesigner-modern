import { mean } from '$lib/shared/utils/statistics';

export interface ReactionTrialLike {
  reactionTime: number | null;
  isCorrect: boolean | null;
  timeout?: boolean;
  isPractice?: boolean;
  condition?: string | null;
}

export interface ConditionMetric {
  condition: string;
  meanRT: number;
  accuracy: number;
  count: number;
}

export interface DerivedReactionMetrics {
  conditionMetrics: ConditionMetric[];
  congruencyEffectMs: number | null;
  dotProbeBiasMs: number | null;
  iatDScore: number | null;
}

/** A trial's timing-provenance-relevant fields (shared by both reaction runtimes). */
export interface ReactionProvenanceTrial {
  stimulusTimingMethod: string | null;
  responseTimingMethod: string | null;
  frameStats: { fps: number; droppedFrames: number; jitter: number };
}

/** Most frequent non-null value in a list, or a fallback when all are null. */
function dominant(values: Array<string | null>, fallback: string): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = fallback;
  let bestCount = 0;
  for (const [v, count] of counts) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Roll per-trial timing methods and frame health up to a single response-level
 * C-PROVENANCE object (contract from Phase 1). `onsetMethod`/`responseMethod` are
 * the dominant methods across the (non-practice) test trials; frame stats are
 * averaged. Shared by ReactionExperimentRuntime and ReactionTimeRuntime so both
 * persist a non-empty `timing_provenance`.
 */
export function aggregateReactionProvenance(
  testResponses: ReactionProvenanceTrial[],
  averageRT: number | null
): Record<string, unknown> {
  const n = testResponses.length || 1;
  const avg = (pick: (t: ReactionProvenanceTrial) => number) =>
    testResponses.reduce((sum, t) => sum + pick(t), 0) / n;

  return {
    onsetMethod: dominant(
      testResponses.map((t) => t.stimulusTimingMethod),
      'raf'
    ),
    responseMethod: dominant(
      testResponses.map((t) => t.responseTimingMethod),
      'performance.now'
    ),
    rawRtMs: averageRT,
    frameStats: {
      fps: avg((t) => t.frameStats.fps),
      droppedFrames: avg((t) => t.frameStats.droppedFrames),
      jitter: avg((t) => t.frameStats.jitter),
    },
  };
}

export function computeDerivedReactionMetrics(trials: ReactionTrialLike[]): DerivedReactionMetrics {
  const usable = trials.filter((trial) => !trial.isPractice);
  const conditionBuckets = new Map<string, ReactionTrialLike[]>();

  usable.forEach((trial) => {
    const condition = (trial.condition || 'unlabeled').toLowerCase();
    if (!conditionBuckets.has(condition)) {
      conditionBuckets.set(condition, []);
    }
    conditionBuckets.get(condition)!.push(trial);
  });

  const conditionMetrics: ConditionMetric[] = Array.from(conditionBuckets.entries()).map(([condition, entries]) => ({
    condition,
    meanRT: mean(
      entries
        .filter((entry) => !entry.timeout)
        .map((entry) => entry.reactionTime)
        .filter((value): value is number => typeof value === 'number' && value > 0)
    ),
    accuracy: entries.length > 0 ? entries.filter((entry) => entry.isCorrect).length / entries.length : 0,
    count: entries.length,
  }));

  const congruentMean = meanRTForCondition(conditionBuckets, 'congruent');
  const incongruentMean = meanRTForCondition(conditionBuckets, 'incongruent');
  const congruencyEffectMs =
    typeof congruentMean === 'number' && typeof incongruentMean === 'number'
      ? incongruentMean - congruentMean
      : null;

  const dotProbeBiasMs =
    typeof congruentMean === 'number' && typeof incongruentMean === 'number'
      ? incongruentMean - congruentMean
      : null;

  const iatCompatible = collectRTsByConditionPrefix(conditionBuckets, 'combined-');
  const iatReversed = collectRTsByConditionPrefix(conditionBuckets, 'reversed-combined-');
  const iatDScore = computeDScore(iatCompatible, iatReversed);

  return {
    conditionMetrics,
    congruencyEffectMs,
    dotProbeBiasMs,
    iatDScore,
  };
}

function meanRTForCondition(
  buckets: Map<string, ReactionTrialLike[]>,
  condition: string
): number | null {
  const entries = buckets.get(condition);
  if (!entries || entries.length === 0) return null;

  const rts = entries
    .filter((entry) => !entry.timeout)
    .map((entry) => entry.reactionTime)
    .filter((value): value is number => typeof value === 'number' && value > 0);

  if (rts.length === 0) return null;
  return mean(rts);
}

function collectRTsByConditionPrefix(
  buckets: Map<string, ReactionTrialLike[]>,
  prefix: string
): number[] {
  const rts: number[] = [];
  buckets.forEach((entries, condition) => {
    if (!condition.startsWith(prefix)) return;
    entries.forEach((entry) => {
      if (!entry.timeout && typeof entry.reactionTime === 'number' && entry.reactionTime > 0) {
        rts.push(entry.reactionTime);
      }
    });
  });
  return rts;
}

function computeDScore(compatible: number[], reversed: number[]): number | null {
  if (compatible.length === 0 || reversed.length === 0) return null;

  const combined = [...compatible, ...reversed];
  if (combined.length < 2) return null;

  const overallMean = mean(combined);
  const variance =
    combined.reduce((sum, value) => sum + (value - overallMean) ** 2, 0) /
    Math.max(1, combined.length - 1);

  if (variance <= 0) return null;

  return (mean(reversed) - mean(compatible)) / Math.sqrt(variance);
}
