import { describe, expect, it } from 'vitest';
import { scoreScales, type ScaleScoreResult } from './ScaleScorer';
import type { ScaleScoringDef, ScoringConfig } from '@qdesigner/questionnaire-core';

function config(...scales: ScaleScoringDef[]): ScoringConfig {
  return { scales };
}

function only(results: ScaleScoreResult[]): ScaleScoreResult {
  expect(results).toHaveLength(1);
  return results[0]!;
}

describe('ScaleScorer.scoreScales', () => {
  it('returns nothing when scoring is absent or empty', () => {
    expect(scoreScales({ q1: 1 }, undefined)).toEqual([]);
    expect(scoreScales({ q1: 1 }, { scales: [] })).toEqual([]);
  });

  it('applies reverse scoring via (itemMin + itemMax - value)', () => {
    const result = only(
      scoreScales(
        { q1: 4, q2: 5, q3: 3 },
        config({
          id: 'rev',
          name: 'Reverse',
          itemIds: ['q1', 'q2', 'q3'],
          reverseScoredItemIds: ['q2'],
          itemMin: 1,
          itemMax: 5,
          aggregation: 'sum',
          missingPolicy: 'available',
        })
      )
    );

    // q2 reversed: 1 + 5 - 5 = 1 -> sum = 4 + 1 + 3 = 8
    expect(result.value).toBe(8);
    expect(result.itemsAnswered).toBe(3);
    expect(result.itemsExpected).toBe(3);
  });

  it('aggregates sum vs mean over the same items', () => {
    const items = ['q1', 'q2', 'q3', 'q4'];
    const responses = { q1: 2, q2: 4, q3: 4, q4: 2 };
    const base = {
      itemIds: items,
      itemMin: 1,
      itemMax: 5,
      missingPolicy: 'available' as const,
    };

    const sum = only(
      scoreScales(responses, config({ id: 's', name: 'Sum', aggregation: 'sum', ...base }))
    );
    const mean = only(
      scoreScales(responses, config({ id: 'm', name: 'Mean', aggregation: 'mean', ...base }))
    );

    expect(sum.value).toBe(12);
    expect(mean.value).toBe(3);
  });

  describe('missing-item policies (q5 unanswered)', () => {
    const responses = { q1: 3, q2: 3, q3: 3, q4: 3 };
    const base = {
      itemIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
      itemMin: 1,
      itemMax: 5,
      aggregation: 'sum' as const,
    };

    it('prorate scales the answered sum up to the expected item count', () => {
      const result = only(
        scoreScales(responses, config({ id: 'p', name: 'Prorate', missingPolicy: 'prorate', ...base }))
      );
      // sum(present)=12, expected=5, answered=4 -> 12 * 5/4 = 15
      expect(result.value).toBe(15);
      expect(result.itemsAnswered).toBe(4);
      expect(result.itemsExpected).toBe(5);
    });

    it('listwise drops the whole scale when any item is missing', () => {
      const result = only(
        scoreScales(responses, config({ id: 'l', name: 'Listwise', missingPolicy: 'listwise', ...base }))
      );
      expect(result.value).toBeNull();
    });

    it('available sums only the answered items (no proration)', () => {
      const result = only(
        scoreScales(responses, config({ id: 'a', name: 'Available', missingPolicy: 'available', ...base }))
      );
      expect(result.value).toBe(12);
    });

    it('mean-impute fills the missing item with the person mean before summing', () => {
      const result = only(
        scoreScales(responses, config({ id: 'mi', name: 'MeanImpute', missingPolicy: 'mean-impute', ...base }))
      );
      // person mean of answered = 3 -> imputed items [3,3,3,3,3] -> sum = 15
      expect(result.value).toBe(15);
    });

    it('listwise with all items answered aggregates normally', () => {
      const result = only(
        scoreScales(
          { q1: 3, q2: 3, q3: 3, q4: 3, q5: 3 },
          config({ id: 'l2', name: 'Listwise', missingPolicy: 'listwise', ...base })
        )
      );
      expect(result.value).toBe(15);
    });
  });

  describe('normative comparison', () => {
    const scale: ScaleScoringDef = {
      id: 'phq',
      name: 'PHQ',
      itemIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
      itemMin: 0,
      itemMax: 3,
      aggregation: 'sum',
      missingPolicy: 'available',
      norm: { mean: 5, sd: 3, source: 'demo norm' },
    };

    it('yields T=50 / z=0 / percentile=50 / stanine=5 at the norm mean', () => {
      const result = only(scoreScales({ q1: 1, q2: 1, q3: 1, q4: 1, q5: 1 }, config(scale)));
      expect(result.value).toBe(5);
      expect(result.z).toBe(0);
      expect(result.tScore).toBe(50);
      expect(result.stanine).toBe(5);
      expect(result.percentile).toBeCloseTo(50, 5);
      expect(result.band).toBeTruthy();
    });

    it('maps a score one SD above the mean to z=1 / T=60 / ~84th percentile', () => {
      const result = only(scoreScales({ q1: 2, q2: 2, q3: 2, q4: 1, q5: 1 }, config(scale)));
      // sum = 8, z = (8 - 5) / 3 = 1
      expect(result.value).toBe(8);
      expect(result.z).toBeCloseTo(1, 5);
      expect(result.tScore).toBeCloseTo(60, 5);
      expect(result.percentile).toBeGreaterThan(83);
      expect(result.percentile).toBeLessThan(85);
      expect(result.stanine).toBe(7);
    });

    it('leaves normative fields null when no norm is configured', () => {
      const result = only(
        scoreScales(
          { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1 },
          config({ ...scale, id: 'no-norm', norm: undefined })
        )
      );
      expect(result.tScore).toBeNull();
      expect(result.percentile).toBeNull();
      expect(result.band).toBeNull();
    });
  });
});
