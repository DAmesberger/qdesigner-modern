/**
 * ScaleScorer — subscale / normative scoring at fillout time (E-FEEDBACK-1)
 *
 * Pure, deterministic, offline-capable scoring of a questionnaire's declared
 * subscales (`settings.scoring`). For each scale it:
 *   (a) applies reverse scoring per `reverseScoredItemIds` via `(itemMin + itemMax - value)`,
 *   (b) resolves missing items per `missingPolicy` — reusing the resurrected
 *       {@link MissingDataHandler} for `listwise` / `mean-impute`, with a `prorate`
 *       branch (`sum * itemsExpected / itemsAnswered`) and an `available` branch,
 *   (c) aggregates `sum` | `mean`,
 *   (d) when a `norm` is supplied, delegates to the psychometric
 *       {@link NormativeScoreInterpreter} for z / T / stanine / percentile — the
 *       canonical normal-CDF math (P5-T2). No stats are re-implemented here.
 */

import type { ScaleScoringDef, ScoringConfig } from '@qdesigner/questionnaire-core';
import { MissingDataHandler } from '$lib/analytics/MissingDataHandler';
import {
  NormativeScoreInterpreter,
  type NormData,
} from '$lib/analytics/NormativeScoreInterpreter';

export interface ScaleScoreResult {
  scaleId: string;
  scaleName: string;
  /** Aggregated scale score, or null when the missing policy excludes it. */
  value: number | null;
  itemsExpected: number;
  itemsAnswered: number;
  aggregation: ScaleScoringDef['aggregation'];
  missingPolicy: ScaleScoringDef['missingPolicy'];
  /** Normative outputs — populated only when a `norm` was supplied and a score was computed. */
  z: number | null;
  tScore: number | null;
  stanine: number | null;
  percentile: number | null;
  /** Descriptive band (normative classification, e.g. "Above Average"), or null. */
  band: string | null;
}

const interpreter = new NormativeScoreInterpreter();
const missingDataHandler = MissingDataHandler.getInstance();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function aggregate(values: number[], aggregation: ScaleScoringDef['aggregation']): number {
  const sum = values.reduce((total, v) => total + v, 0);
  if (aggregation === 'mean') {
    return values.length > 0 ? sum / values.length : 0;
  }
  return sum;
}

function scoreScale(
  scale: ScaleScoringDef,
  responses: Record<string, number | null | undefined>
): ScaleScoreResult {
  const reverseSet = new Set(scale.reverseScoredItemIds ?? []);

  // Per-item values with reverse scoring applied; null marks a missing item.
  const items: (number | null)[] = scale.itemIds.map((itemId) => {
    const raw = responses[itemId];
    if (!isFiniteNumber(raw)) return null;
    return reverseSet.has(itemId) ? scale.itemMin + scale.itemMax - raw : raw;
  });

  const present = items.filter(isFiniteNumber);
  const itemsExpected = scale.itemIds.length;
  const itemsAnswered = present.length;

  let value: number | null;
  if (itemsAnswered === 0) {
    value = null;
  } else {
    switch (scale.missingPolicy) {
      case 'listwise': {
        // Scale-level listwise deletion: model the participant as a single case whose
        // items are the columns; if any item is missing the case is dropped (score = null).
        const columns = items.map((v) => [v]);
        const survived = missingDataHandler.listwiseDeletion(columns)[0]?.length === 1;
        value = survived ? aggregate(present, scale.aggregation) : null;
        break;
      }
      case 'mean-impute': {
        // Person-mean imputation: treat the scale's items as one column and fill each
        // missing item with the mean of the answered items, then aggregate all items.
        const [filled] = missingDataHandler.meanImputation([items]);
        value = aggregate(filled ?? present, scale.aggregation);
        break;
      }
      case 'prorate': {
        const sum = present.reduce((total, v) => total + v, 0);
        value =
          scale.aggregation === 'sum'
            ? sum * (itemsExpected / itemsAnswered)
            : sum / itemsAnswered;
        break;
      }
      case 'available':
      default:
        value = aggregate(present, scale.aggregation);
        break;
    }
  }

  const result: ScaleScoreResult = {
    scaleId: scale.id,
    scaleName: scale.name,
    value,
    itemsExpected,
    itemsAnswered,
    aggregation: scale.aggregation,
    missingPolicy: scale.missingPolicy,
    z: null,
    tScore: null,
    stanine: null,
    percentile: null,
    band: null,
  };

  if (scale.norm && value !== null && Number.isFinite(value)) {
    // `n` is unused by the z/T/stanine/percentile math (see NormativeScoreInterpreter);
    // the ScaleNormData model carries only mean/sd/source, so pass n: 0.
    const normData: NormData = { mean: scale.norm.mean, sd: scale.norm.sd, n: 0 };
    const comparison = interpreter.generateNormativeComparison(value, normData);
    result.z = comparison.zScore;
    result.tScore = comparison.tScore;
    result.stanine = comparison.stanine;
    result.percentile = comparison.percentileRank;
    result.band = comparison.classification;
  }

  return result;
}

/**
 * Score every scale declared in `config`. Pure: given the same responses + config it
 * always returns the same results, so it runs identically online and offline.
 *
 * @param responses Map of question id -> numeric answer (null/undefined/non-finite = missing).
 * @param config    The questionnaire's `settings.scoring`.
 */
export function scoreScales(
  responses: Record<string, number | null | undefined>,
  config: ScoringConfig | undefined
): ScaleScoreResult[] {
  if (!config || !Array.isArray(config.scales) || config.scales.length === 0) {
    return [];
  }
  return config.scales.map((scale) => scoreScale(scale, responses));
}
