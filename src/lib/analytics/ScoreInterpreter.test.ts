import { describe, expect, it, beforeEach } from 'vitest';
import {
  ScoreInterpreter,
  normalCDF,
  type ScoreRange,
  type NormData,
  type SubscaleConfig,
} from './ScoreInterpreter';

describe('ScoreInterpreter', () => {
  let interpreter: ScoreInterpreter;

  const ranges: ScoreRange[] = [
    { min: 0, max: 10, label: 'Low', description: 'Score is low', color: '#22c55e' },
    { min: 11, max: 20, label: 'Moderate', description: 'Score is moderate', color: '#eab308' },
    { min: 21, max: 30, label: 'High', description: 'Score is high', color: '#ef4444' },
  ];

  const normData: NormData = { mean: 50, sd: 10, n: 500 };

  beforeEach(() => {
    interpreter = new ScoreInterpreter();
  });

  // ========================================================================
  // interpretScore
  // ========================================================================

  describe('interpretScore', () => {
    it('returns correct label for a score in the low range', () => {
      const result = interpreter.interpretScore(5, 30, ranges);
      expect(result.label).toBe('Low');
      expect(result.color).toBe('#22c55e');
      expect(result.description).toBe('Score is low');
    });

    it('returns correct label for a score in the moderate range', () => {
      const result = interpreter.interpretScore(15, 30, ranges);
      expect(result.label).toBe('Moderate');
    });

    it('returns correct label for a score in the high range', () => {
      const result = interpreter.interpretScore(25, 30, ranges);
      expect(result.label).toBe('High');
    });

    it('returns percentage correctly', () => {
      const result = interpreter.interpretScore(15, 30, ranges);
      expect(result.percentage).toBe(50);
    });

    it('returns Unclassified for score outside all ranges', () => {
      const result = interpreter.interpretScore(35, 40, ranges);
      expect(result.label).toBe('Unclassified');
    });

    it('handles maxScore of 0 gracefully', () => {
      const result = interpreter.interpretScore(0, 0, ranges);
      expect(result.percentage).toBe(0);
    });

    it('handles boundary values (score at range min/max)', () => {
      const atMin = interpreter.interpretScore(0, 30, ranges);
      expect(atMin.label).toBe('Low');

      const atMax = interpreter.interpretScore(10, 30, ranges);
      expect(atMax.label).toBe('Low');

      const nextMin = interpreter.interpretScore(11, 30, ranges);
      expect(nextMin.label).toBe('Moderate');
    });

    it('handles empty ranges array', () => {
      const result = interpreter.interpretScore(15, 30, []);
      expect(result.label).toBe('Unclassified');
    });
  });

  // ========================================================================
  // generateNormativeComparison
  // ========================================================================

  describe('generateNormativeComparison', () => {
    it('returns z=0, percentile~50, T=50, stanine=5 at the mean', () => {
      const result = interpreter.generateNormativeComparison(50, normData);
      expect(result.zScore).toBe(0);
      expect(result.percentileRank).toBeCloseTo(50, 0);
      expect(result.tScore).toBe(50);
      expect(result.stanine).toBe(5);
      expect(result.classification).toBe('Average');
    });

    it('returns correct values for 1 SD above the mean', () => {
      const result = interpreter.generateNormativeComparison(60, normData);
      expect(result.zScore).toBeCloseTo(1, 5);
      expect(result.percentileRank).toBeCloseTo(84.1, 0);
      expect(result.tScore).toBeCloseTo(60, 5);
      expect(result.stanine).toBe(7);
      expect(result.classification).toBe('Above Average');
    });

    it('returns correct values for 1 SD below the mean', () => {
      const result = interpreter.generateNormativeComparison(40, normData);
      expect(result.zScore).toBeCloseTo(-1, 5);
      expect(result.percentileRank).toBeCloseTo(15.9, 0);
      expect(result.tScore).toBeCloseTo(40, 5);
      expect(result.stanine).toBe(3);
      expect(result.classification).toBe('Below Average');
    });

    it('returns correct values for 2 SD above the mean', () => {
      const result = interpreter.generateNormativeComparison(70, normData);
      expect(result.zScore).toBeCloseTo(2, 5);
      expect(result.percentileRank).toBeCloseTo(97.7, 0);
      expect(result.tScore).toBeCloseTo(70, 5);
      expect(result.stanine).toBe(9);
      expect(result.classification).toBe('Very Above Average');
    });

    it('handles sd=0 gracefully', () => {
      const result = interpreter.generateNormativeComparison(50, { mean: 50, sd: 0, n: 100 });
      expect(result.zScore).toBe(0);
      expect(result.percentileRank).toBe(50);
      expect(result.stanine).toBe(5);
    });
  });

  // ========================================================================
  // getPercentileRank
  // ========================================================================

  describe('getPercentileRank', () => {
    it('returns ~50 at the mean', () => {
      expect(interpreter.getPercentileRank(50, normData)).toBeCloseTo(50, 0);
    });

    it('returns ~84.1 at 1 SD above', () => {
      expect(interpreter.getPercentileRank(60, normData)).toBeCloseTo(84.1, 0);
    });

    it('returns ~97.7 at 2 SD above', () => {
      expect(interpreter.getPercentileRank(70, normData)).toBeCloseTo(97.7, 0);
    });

    it('returns ~15.9 at 1 SD below', () => {
      expect(interpreter.getPercentileRank(40, normData)).toBeCloseTo(15.9, 0);
    });

    it('returns ~2.3 at 2 SD below', () => {
      expect(interpreter.getPercentileRank(30, normData)).toBeCloseTo(2.3, 0);
    });

    it('returns 50 when sd is 0', () => {
      expect(interpreter.getPercentileRank(100, { mean: 50, sd: 0, n: 100 })).toBe(50);
    });
  });

  // ========================================================================
  // getConfidenceInterval
  // ========================================================================

  describe('getConfidenceInterval', () => {
    it('computes 95% CI correctly', () => {
      const ci = interpreter.getConfidenceInterval(50, 3);
      expect(ci.confidence).toBe(0.95);
      expect(ci.sem).toBe(3);
      expect(ci.lower).toBeCloseTo(50 - 1.96 * 3, 5);
      expect(ci.upper).toBeCloseTo(50 + 1.96 * 3, 5);
    });

    it('computes 90% CI correctly', () => {
      const ci = interpreter.getConfidenceInterval(50, 3, 0.90);
      expect(ci.confidence).toBe(0.90);
      expect(ci.lower).toBeCloseTo(50 - 1.645 * 3, 5);
      expect(ci.upper).toBeCloseTo(50 + 1.645 * 3, 5);
    });

    it('computes 99% CI correctly', () => {
      const ci = interpreter.getConfidenceInterval(50, 3, 0.99);
      expect(ci.confidence).toBe(0.99);
      expect(ci.lower).toBeCloseTo(50 - 2.576 * 3, 5);
      expect(ci.upper).toBeCloseTo(50 + 2.576 * 3, 5);
    });

    it('CI is symmetric around the score', () => {
      const ci = interpreter.getConfidenceInterval(75, 5);
      const margin = ci.upper - 75;
      expect(75 - ci.lower).toBeCloseTo(margin, 10);
    });

    it('handles sem=0', () => {
      const ci = interpreter.getConfidenceInterval(50, 0);
      expect(ci.lower).toBe(50);
      expect(ci.upper).toBe(50);
    });
  });

  // ========================================================================
  // computeSubscaleScores
  // ========================================================================

  describe('computeSubscaleScores', () => {
    const subscaleConfigs: SubscaleConfig[] = [
      { name: 'Anxiety', questionIds: ['q1', 'q2', 'q3'], maxPerItem: 4 },
      { name: 'Depression', questionIds: ['q4', 'q5'], maxPerItem: 4 },
    ];

    it('sums responses per subscale correctly', () => {
      const responses = new Map([
        ['q1', 3],
        ['q2', 2],
        ['q3', 4],
        ['q4', 1],
        ['q5', 3],
      ]);

      const result = interpreter.computeSubscaleScores(responses, subscaleConfigs);

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('Anxiety');
      expect(result[0]!.score).toBe(9);
      expect(result[0]!.maxScore).toBe(12);
      expect(result[1]!.name).toBe('Depression');
      expect(result[1]!.score).toBe(4);
      expect(result[1]!.maxScore).toBe(8);
    });

    it('treats missing responses as 0', () => {
      const responses = new Map([['q1', 3]]);
      const result = interpreter.computeSubscaleScores(responses, subscaleConfigs);

      expect(result[0]!.score).toBe(3); // q1=3, q2=0, q3=0
      expect(result[1]!.score).toBe(0); // q4=0, q5=0
    });

    it('attaches interpretation when ranges are provided', () => {
      const responses = new Map([
        ['q1', 1],
        ['q2', 1],
        ['q3', 1],
      ]);

      const subRanges: ScoreRange[] = [
        { min: 0, max: 4, label: 'Low', description: 'Low', color: '#22c55e' },
        { min: 5, max: 8, label: 'Moderate', description: 'Moderate', color: '#eab308' },
        { min: 9, max: 12, label: 'High', description: 'High', color: '#ef4444' },
      ];

      const result = interpreter.computeSubscaleScores(responses, subscaleConfigs, subRanges);
      expect(result[0]!.interpretation).toBeDefined();
      expect(result[0]!.interpretation!.label).toBe('Low');
    });

    it('does not attach interpretation when ranges are not provided', () => {
      const responses = new Map([['q1', 1]]);
      const result = interpreter.computeSubscaleScores(responses, subscaleConfigs);
      expect(result[0]!.interpretation).toBeUndefined();
    });
  });

  // ========================================================================
  // normalCDF helper
  // ========================================================================

  describe('normalCDF', () => {
    it('returns ~0.5 at z=0', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 5);
    });

    it('returns ~0.841 at z=1', () => {
      expect(normalCDF(1)).toBeCloseTo(0.8413, 3);
    });

    it('returns ~0.159 at z=-1', () => {
      expect(normalCDF(-1)).toBeCloseTo(0.1587, 3);
    });

    it('returns ~0.977 at z=2', () => {
      expect(normalCDF(2)).toBeCloseTo(0.9772, 3);
    });

    it('returns ~0.023 at z=-2', () => {
      expect(normalCDF(-2)).toBeCloseTo(0.0228, 3);
    });

    it('returns ~0.999 at z=3', () => {
      expect(normalCDF(3)).toBeCloseTo(0.9987, 3);
    });

    it('returns value close to 0 for very negative z', () => {
      expect(normalCDF(-4)).toBeLessThan(0.001);
      expect(normalCDF(-4)).toBeGreaterThan(0);
    });

    it('returns value close to 1 for very positive z', () => {
      expect(normalCDF(4)).toBeGreaterThan(0.999);
      expect(normalCDF(4)).toBeLessThan(1);
    });
  });
});
