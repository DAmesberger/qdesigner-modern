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

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
