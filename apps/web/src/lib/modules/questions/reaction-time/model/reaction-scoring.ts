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
  // Standard-paradigm library expansion (E-REACT-2).
  /** Proportion of no-go/stop trials that received a response (Go/No-Go, SART). */
  commissionErrorRate: number | null;
  /** Proportion of go trials that received no response (Go/No-Go, SART). */
  omissionErrorRate: number | null;
  /** Stop-signal reaction time (integration method) in ms (Go/No-Go, SART). */
  ssrtMs: number | null;
  /** Simon effect: mean RT(incongruent) − mean RT(congruent), ms. */
  simonEffectMs: number | null;
  /** Posner cueing effect: mean RT(invalid) − mean RT(valid), ms. */
  posnerCueingEffectMs: number | null;
  /** Visual-search slope: ms per item (least-squares over set size). */
  searchSlopeMsPerItem: number | null;
  /** Sternberg slope: ms per memory-set item (least-squares over set size). */
  sternbergSlopeMsPerItem: number | null;
  /** PVT lapses: responses ≥ 500 ms (or misses) on PVT trials. */
  pvtLapseCount: number | null;
  /** PVT mean 1/RT (response speed, s⁻¹) over responded PVT trials. */
  pvtMeanReciprocalRT: number | null;
  /** Temporal-order JND (ms): half the 25–75% width of the psychometric fit. */
  temporalOrderJND: number | null;
}

/** A trial's timing-provenance-relevant fields (shared by both reaction runtimes). */
export interface ReactionProvenanceTrial {
  stimulusTimingMethod: string | null;
  responseTimingMethod: string | null;
  frameStats: { fps: number; droppedFrames: number; jitter: number };
  /** How the stimulus offset was scheduled (E-REACT-3): raf | timeout | none. */
  offsetMethod?: string | null;
  /** Measured exposure in frames for a frame-accurate (raf) offset, else null. */
  actualDurationFrames?: number | null;
  /** Visual display-latency compensation applied to the onset (visual only). E-REACT-5. */
  displayLatencyMs?: number | null;
  /** Audio output-latency folded into the onset (audio only). E-REACT-5. */
  outputLatencyMs?: number | null;
}

/** min / max / median across a set of latency samples, or null when empty. */
export interface LatencyStats {
  min: number;
  max: number;
  median: number;
}

/** Compute min/max/median of a numeric sample, or null when the sample is empty. */
function latencyStats(values: number[]): LatencyStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return { min: sorted[0]!, max: sorted[sorted.length - 1]!, median };
}

/** Non-null latency samples for a picked field across a set of trials. */
function latencySamples(
  trials: ReactionProvenanceTrial[],
  pick: (t: ReactionProvenanceTrial) => number | null | undefined
): number[] {
  return trials.map(pick).filter((v): v is number => typeof v === 'number');
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

  // Mean measured exposure across trials that used the frame-accurate (raf)
  // offset; null when none did (E-REACT-3).
  const framedExposures = testResponses
    .map((t) => t.actualDurationFrames)
    .filter((v): v is number => typeof v === 'number');
  const meanActualDurationFrames =
    framedExposures.length > 0
      ? framedExposures.reduce((sum, v) => sum + v, 0) / framedExposures.length
      : null;

  return {
    onsetMethod: dominant(
      testResponses.map((t) => t.stimulusTimingMethod),
      'raf'
    ),
    responseMethod: dominant(
      testResponses.map((t) => t.responseTimingMethod),
      'performance.now'
    ),
    // Dominant stimulus-offset scheduling method across the test trials.
    offsetMethod: dominant(
      testResponses.map((t) => t.offsetMethod ?? null),
      'none'
    ),
    actualDurationFrames: meanActualDurationFrames,
    rawRtMs: averageRT,
    // Per-trial latency spread (E-REACT-5) so the aggregate blob supports
    // latency auditing without needing the full per-trial table.
    displayLatencyStats: latencyStats(latencySamples(testResponses, (t) => t.displayLatencyMs)),
    outputLatencyStats: latencyStats(latencySamples(testResponses, (t) => t.outputLatencyMs)),
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

  // --- Standard-paradigm metrics (E-REACT-2). ---
  const goTrials = usable.filter((trial) => normalizeCondition(trial) === 'go');
  const stopTrials = usable.filter((trial) => {
    const condition = normalizeCondition(trial);
    return condition === 'nogo' || condition === 'stop';
  });

  const commissionErrorRate =
    stopTrials.length > 0 ? stopTrials.filter(responded).length / stopTrials.length : null;
  const omissionErrorRate =
    goTrials.length > 0
      ? goTrials.filter((trial) => !responded(trial)).length / goTrials.length
      : null;
  const ssrtMs = computeSsrt(goTrials, stopTrials);

  const validMean = meanRTForCondition(conditionBuckets, 'valid');
  const invalidMean = meanRTForCondition(conditionBuckets, 'invalid');
  const posnerCueingEffectMs =
    typeof validMean === 'number' && typeof invalidMean === 'number'
      ? invalidMean - validMean
      : null;

  // Simon shares the congruent/incongruent labels, so its effect is the same
  // incongruent−congruent RT cost, surfaced under its own name.
  const simonEffectMs = congruencyEffectMs;

  const searchSlopeMsPerItem = computeSetSizeSlope(usable, /^present-(\d+)$/);
  const sternbergSlopeMsPerItem = computeSetSizeSlope(usable, /^(?:in|out)-(\d+)$/);

  const pvtTrials = usable.filter((trial) => normalizeCondition(trial) === 'pvt');
  const pvtLapseCount = pvtTrials.length > 0 ? pvtTrials.filter(isPvtLapse).length : null;
  const pvtReciprocals = pvtTrials
    .filter(responded)
    .map((trial) => 1000 / (trial.reactionTime as number));
  const pvtMeanReciprocalRT = pvtReciprocals.length > 0 ? mean(pvtReciprocals) : null;

  const temporalOrderJND = computeTemporalOrderJND(usable);

  return {
    conditionMetrics,
    congruencyEffectMs,
    dotProbeBiasMs,
    iatDScore,
    commissionErrorRate,
    omissionErrorRate,
    ssrtMs,
    simonEffectMs,
    posnerCueingEffectMs,
    searchSlopeMsPerItem,
    sternbergSlopeMsPerItem,
    pvtLapseCount,
    pvtMeanReciprocalRT,
    temporalOrderJND,
  };
}

/** Lowercased condition label, or empty string when unlabeled. */
function normalizeCondition(trial: ReactionTrialLike): string {
  return (trial.condition || '').toLowerCase();
}

/** True when the trial captured a post-onset response (a positive, non-timeout RT). */
function responded(trial: ReactionTrialLike): boolean {
  return !trial.timeout && typeof trial.reactionTime === 'number' && trial.reactionTime > 0;
}

/** A PVT lapse: a response at/over 500 ms, or a miss (timeout / no response). */
function isPvtLapse(trial: ReactionTrialLike): boolean {
  if (!responded(trial)) return true;
  return (trial.reactionTime as number) >= 500;
}

/**
 * Stop-signal reaction time via the integration method (Verbruggen & Logan).
 * Go RTs are rank-ordered; the nth RT at the p(respond|signal) area is taken and
 * the mean stop-signal delay subtracted. For Go/No-Go and SART the stop signal
 * coincides with the go stimulus, so SSD ≈ 0 and SSRT is the nth go RT.
 */
function computeSsrt(
  goTrials: ReactionTrialLike[],
  stopTrials: ReactionTrialLike[]
): number | null {
  if (stopTrials.length === 0) return null;

  const goRTs = goTrials
    .filter(responded)
    .map((trial) => trial.reactionTime as number)
    .filter((rt) => rt > 0)
    .sort((a, b) => a - b);
  if (goRTs.length === 0) return null;

  const pRespond = stopTrials.filter(responded).length / stopTrials.length;
  const rank = Math.min(goRTs.length, Math.max(1, Math.ceil(pRespond * goRTs.length)));
  const nthRT = goRTs[rank - 1]!;
  const meanSsd = 0;
  return nthRT - meanSsd;
}

/**
 * Least-squares slope (ms per item) of mean RT against set size, where set size
 * is parsed from the condition label via `pattern` (capture group 1). Requires
 * at least two distinct set sizes; returns null otherwise.
 */
function computeSetSizeSlope(trials: ReactionTrialLike[], pattern: RegExp): number | null {
  const rtsBySize = new Map<number, number[]>();

  for (const trial of trials) {
    const match = normalizeCondition(trial).match(pattern);
    if (!match) continue;
    const size = Number(match[1]);
    if (!Number.isFinite(size)) continue;
    if (trial.timeout || typeof trial.reactionTime !== 'number' || trial.reactionTime <= 0) continue;

    if (!rtsBySize.has(size)) rtsBySize.set(size, []);
    rtsBySize.get(size)!.push(trial.reactionTime);
  }

  const points: Array<[number, number]> = [];
  for (const [size, rts] of rtsBySize) {
    if (rts.length === 0) continue;
    points.push([size, mean(rts)]);
  }

  return leastSquaresSlope(points);
}

/** Ordinary-least-squares slope over (x, y) points, or null when degenerate. */
function leastSquaresSlope(points: Array<[number, number]>): number | null {
  const distinctX = new Set(points.map(([x]) => x));
  if (points.length < 2 || distinctX.size < 2) return null;

  const n = points.length;
  const sumX = points.reduce((sum, [x]) => sum + x, 0);
  const sumY = points.reduce((sum, [, y]) => sum + y, 0);
  const sumXY = points.reduce((sum, [x, y]) => sum + x * y, 0);
  const sumXX = points.reduce((sum, [x]) => sum + x * x, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;
  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Temporal-order JND from the psychometric function of "second-first" (right
 * leads) judgments across signed SOAs (`soa:<ms>`). The judgment proportion is
 * reconstructed from accuracy and the SOA sign (a correct response at a positive
 * SOA is a right-first judgment; at a negative SOA it is a left-first judgment).
 * JND is half the SOA width between the 25% and 75% crossings.
 */
function computeTemporalOrderJND(trials: ReactionTrialLike[]): number | null {
  const bySoa = new Map<number, { correct: number; total: number }>();

  for (const trial of trials) {
    const match = normalizeCondition(trial).match(/^soa:(-?\d+(?:\.\d+)?)$/);
    if (!match) continue;
    const soa = Number(match[1]);
    if (!Number.isFinite(soa) || soa === 0) continue;

    const bucket = bySoa.get(soa) ?? { correct: 0, total: 0 };
    bucket.total += 1;
    if (trial.isCorrect) bucket.correct += 1;
    bySoa.set(soa, bucket);
  }

  const points: Array<[number, number]> = [];
  for (const [soa, { correct, total }] of bySoa) {
    if (total === 0) continue;
    const accuracy = correct / total;
    // p(judge right-first): accuracy when right actually led (soa>0), else its
    // complement (a correct left-first judgment is NOT a right-first judgment).
    const pRightFirst = soa > 0 ? accuracy : 1 - accuracy;
    points.push([soa, pRightFirst]);
  }

  points.sort((a, b) => a[0] - b[0]);
  const x25 = interpolateSoaAtProportion(points, 0.25);
  const x75 = interpolateSoaAtProportion(points, 0.75);
  if (x25 === null || x75 === null) return null;

  return Math.abs(x75 - x25) / 2;
}

/**
 * Piecewise-linear interpolation of the SOA at which the (assumed monotone,
 * increasing) judgment proportion crosses `target`. Returns null when the curve
 * never brackets the target.
 */
function interpolateSoaAtProportion(
  points: Array<[number, number]>,
  target: number
): number | null {
  if (points.length < 2) return null;

  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    if (target < lo || target > hi) continue;
    if (y1 === y0) return x0;
    const t = (target - y0) / (y1 - y0);
    return x0 + t * (x1 - x0);
  }

  return null;
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
