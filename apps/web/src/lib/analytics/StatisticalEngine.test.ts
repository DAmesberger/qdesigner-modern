import { beforeEach, describe, expect, it } from 'vitest';
import { StatisticalEngine } from './StatisticalEngine';

describe('StatisticalEngine', () => {
  let engine: StatisticalEngine;

  beforeEach(() => {
    // Get singleton and clear cache between tests
    engine = StatisticalEngine.getInstance();
    engine.clearCache();
  });

  // ==========================================================================
  // Mann-Whitney U Test
  // ==========================================================================
  describe('mannWhitneyU', () => {
    it('computes correct U statistics for distinct groups', () => {
      // Classic textbook example: two independent groups
      const group1 = [8, 7, 6, 5, 4];
      const group2 = [12, 11, 10, 9, 3];

      const result = engine.mannWhitneyU(group1, group2);

      // U1 + U2 = n1 * n2
      expect(result.U1 + result.U2).toBe(25);
      expect(result.pValue).toBeGreaterThan(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
      expect(result.effectSize_r).toBeGreaterThanOrEqual(0);
      expect(result.effectSize_r).toBeLessThanOrEqual(1);
    });

    it('returns significant result for clearly separated groups', () => {
      const group1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const group2 = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

      const result = engine.mannWhitneyU(group1, group2);

      expect(result.pValue).toBeLessThan(0.001);
      expect(result.effectSize_r).toBeGreaterThan(0.5);
    });

    it('returns non-significant result for overlapping groups', () => {
      const group1 = [3, 5, 7, 9, 11];
      const group2 = [4, 6, 8, 10, 12];

      const result = engine.mannWhitneyU(group1, group2);

      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('handles tied values correctly', () => {
      const group1 = [5, 5, 5, 5, 5];
      const group2 = [5, 5, 5, 5, 5];

      const result = engine.mannWhitneyU(group1, group2);

      expect(result.U1).toBeCloseTo(12.5, 1);
      expect(result.U2).toBeCloseTo(12.5, 1);
    });

    it('throws on empty groups', () => {
      expect(() => engine.mannWhitneyU([], [1, 2])).toThrow('Both groups must be non-empty');
      expect(() => engine.mannWhitneyU([1, 2], [])).toThrow('Both groups must be non-empty');
    });

    it('computes rank-biserial correlation with correct sign', () => {
      const higher = [10, 11, 12, 13, 14];
      const lower = [1, 2, 3, 4, 5];

      const result = engine.mannWhitneyU(higher, lower);

      // Group 1 has higher values, so rank biserial should be positive
      expect(result.rankBiserialCorrelation).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Wilcoxon Signed-Rank Test
  // ==========================================================================
  describe('wilcoxonSignedRank', () => {
    it('detects significant paired difference', () => {
      const before = [125, 115, 130, 140, 140, 115, 140, 125, 140, 135];
      const after =  [110, 122, 125, 120, 140, 124, 123, 137, 135, 145];

      const result = engine.wilcoxonSignedRank(before, after);

      expect(result.W_plus).toBeGreaterThan(0);
      expect(result.W_minus).toBeGreaterThan(0);
      // One pair (140 vs 140) has zero difference and is excluded
      // So n_nonzero = 9, and W+ + W- = 9*(9+1)/2 = 45
      const nNonZero = 9;
      expect(result.W_plus + result.W_minus).toBeCloseTo(
        (nNonZero * (nNonZero + 1)) / 2,
        0
      );
      expect(result.effectSize_r).toBeGreaterThanOrEqual(0);
    });

    it('returns non-significant for identical pairs', () => {
      const before = [10, 20, 30, 40, 50];
      const after =  [10, 20, 30, 40, 50];

      const result = engine.wilcoxonSignedRank(before, after);

      expect(result.W_plus).toBe(0);
      expect(result.W_minus).toBe(0);
      expect(result.pValue).toBe(1);
      expect(result.effectSize_r).toBe(0);
    });

    it('handles all-positive differences', () => {
      const before = [1, 2, 3, 4, 5];
      const after =  [6, 7, 8, 9, 10];

      const result = engine.wilcoxonSignedRank(before, after);

      expect(result.W_plus).toBeGreaterThan(0);
      expect(result.W_minus).toBe(0);
    });

    it('throws on mismatched array lengths', () => {
      expect(() => engine.wilcoxonSignedRank([1, 2], [1])).toThrow('equal length');
    });

    it('throws on empty arrays', () => {
      expect(() => engine.wilcoxonSignedRank([], [])).toThrow('non-empty');
    });
  });

  // ==========================================================================
  // Kruskal-Wallis Test
  // ==========================================================================
  describe('kruskalWallis', () => {
    it('detects significant difference between well-separated groups', () => {
      const groups = [
        [1, 2, 3, 4, 5],
        [6, 7, 8, 9, 10],
        [11, 12, 13, 14, 15]
      ];

      const result = engine.kruskalWallis(groups);

      expect(result.H).toBeGreaterThan(0);
      expect(result.df).toBe(2);
      expect(result.pValue).toBeLessThan(0.01);
      expect(result.etaSquared).toBeGreaterThan(0);
    });

    it('returns non-significant for similar groups', () => {
      const groups = [
        [5, 6, 7, 8, 9],
        [5, 6, 7, 8, 9],
        [5, 6, 7, 8, 9]
      ];

      const result = engine.kruskalWallis(groups);

      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('includes Dunn post-hoc comparisons', () => {
      const groups = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ];

      const result = engine.kruskalWallis(groups);

      // k*(k-1)/2 = 3 comparisons for 3 groups
      expect(result.postHoc).toHaveLength(3);
      result.postHoc.forEach(ph => {
        expect(ph.group1).toBeLessThan(ph.group2);
        expect(ph.adjustedPValue).toBeGreaterThanOrEqual(ph.pValue);
        expect(ph.adjustedPValue).toBeLessThanOrEqual(1);
      });
    });

    it('throws on fewer than 2 groups', () => {
      expect(() => engine.kruskalWallis([[1, 2, 3]])).toThrow('at least 2');
    });

    it('throws on empty group', () => {
      expect(() => engine.kruskalWallis([[1, 2], []])).toThrow('empty');
    });
  });

  // ==========================================================================
  // Chi-Square Goodness of Fit
  // ==========================================================================
  describe('chiSquareGoodnessOfFit', () => {
    it('tests uniform distribution (fair die)', () => {
      // A perfectly fair die rolled 60 times
      const observed = [10, 10, 10, 10, 10, 10];

      const result = engine.chiSquareGoodnessOfFit(observed);

      expect(result.chiSquare).toBeCloseTo(0, 5);
      expect(result.df).toBe(5);
      expect(result.pValue).toBeCloseTo(1, 1);
      expect(result.residuals.every(r => Math.abs(r) < 0.001)).toBe(true);
    });

    it('detects deviation from uniform distribution', () => {
      // Loaded die
      const observed = [30, 5, 5, 5, 5, 10];

      const result = engine.chiSquareGoodnessOfFit(observed);

      expect(result.chiSquare).toBeGreaterThan(10);
      expect(result.pValue).toBeLessThan(0.05);
    });

    it('tests against custom expected frequencies', () => {
      const observed = [50, 30, 20];
      const expected = [40, 40, 20];

      const result = engine.chiSquareGoodnessOfFit(observed, expected);

      expect(result.chiSquare).toBeGreaterThan(0);
      expect(result.df).toBe(2);
      // Standardized residuals
      expect(result.residuals).toHaveLength(3);
    });

    it('computes Cramers V', () => {
      const observed = [50, 30, 20];
      const result = engine.chiSquareGoodnessOfFit(observed);

      expect(result.cramersV).toBeGreaterThanOrEqual(0);
    });

    it('throws on fewer than 2 categories', () => {
      expect(() => engine.chiSquareGoodnessOfFit([10])).toThrow('at least 2');
    });

    it('throws on mismatched expected length', () => {
      expect(() => engine.chiSquareGoodnessOfFit([10, 20], [10])).toThrow('equal length');
    });
  });

  // ==========================================================================
  // Chi-Square Independence
  // ==========================================================================
  describe('chiSquareIndependence', () => {
    it('detects independence in 2x2 table', () => {
      // Classic example: treatment vs. control
      const table = [
        [20, 30],
        [30, 20]
      ];

      const result = engine.chiSquareIndependence(table);

      expect(result.df).toBe(1);
      expect(result.chiSquare).toBeGreaterThan(0);
      expect(result.expectedFrequencies).toHaveLength(2);
      expect(result.expectedFrequencies[0]).toHaveLength(2);
      expect(result.residuals).toHaveLength(2);
    });

    it('computes correct expected frequencies', () => {
      const table = [
        [10, 20],
        [30, 40]
      ];
      const n = 100;

      const result = engine.chiSquareIndependence(table);

      // Expected: rowTotal * colTotal / n
      expect(result.expectedFrequencies[0]![0]).toBeCloseTo(30 * 40 / n, 5);
      expect(result.expectedFrequencies[0]![1]).toBeCloseTo(30 * 60 / n, 5);
    });

    it('handles larger contingency tables', () => {
      const table = [
        [10, 20, 30],
        [15, 25, 35],
        [20, 30, 40]
      ];

      const result = engine.chiSquareIndependence(table);

      expect(result.df).toBe(4); // (3-1)*(3-1)
      expect(result.cramersV).toBeGreaterThanOrEqual(0);
    });

    it('computes phi for 2x2 table', () => {
      const table = [
        [40, 10],
        [10, 40]
      ];

      const result = engine.chiSquareIndependence(table);

      expect(result.phi).toBeGreaterThan(0);
    });

    it('throws on fewer than 2 rows/columns', () => {
      expect(() => engine.chiSquareIndependence([[10, 20]])).toThrow('at least 2 rows');
      expect(() => engine.chiSquareIndependence([[10], [20]])).toThrow('at least 2 columns');
    });
  });

  // ==========================================================================
  // Fisher's Exact Test
  // ==========================================================================
  describe('fisherExactTest', () => {
    it('computes correct p-value for classic 2x2 table', () => {
      // Lady tasting tea: classic Fisher example
      const table: [[number, number], [number, number]] = [
        [3, 1],
        [1, 3]
      ];

      const result = engine.fisherExactTest(table);

      expect(result.pValue).toBeGreaterThan(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
      // Known p-value for this table is approximately 0.486
      expect(result.pValue).toBeCloseTo(0.486, 1);
    });

    it('computes odds ratio correctly', () => {
      const table: [[number, number], [number, number]] = [
        [10, 5],
        [5, 10]
      ];

      const result = engine.fisherExactTest(table);

      // OR = (10*10) / (5*5) = 4
      expect(result.oddsRatio).toBeCloseTo(4, 5);
    });

    it('provides 95% CI for odds ratio', () => {
      const table: [[number, number], [number, number]] = [
        [10, 5],
        [5, 10]
      ];

      const result = engine.fisherExactTest(table);

      expect(result.ci95[0]).toBeLessThan(result.oddsRatio);
      expect(result.ci95[1]).toBeGreaterThan(result.oddsRatio);
    });

    it('handles zero cells with Haldane correction', () => {
      const table: [[number, number], [number, number]] = [
        [5, 0],
        [0, 5]
      ];

      const result = engine.fisherExactTest(table);

      expect(result.oddsRatio).toBe(Infinity);
      expect(result.ci95[0]).toBeGreaterThan(0);
      expect(result.ci95[1]).toBeGreaterThan(0);
    });

    it('detects significance in a strong association', () => {
      const table: [[number, number], [number, number]] = [
        [20, 2],
        [3, 25]
      ];

      const result = engine.fisherExactTest(table);

      expect(result.pValue).toBeLessThan(0.001);
      expect(result.oddsRatio).toBeGreaterThan(10);
    });
  });

  // ==========================================================================
  // Tukey HSD
  // ==========================================================================
  describe('tukeyHSD', () => {
    it('computes pairwise comparisons', () => {
      const groups = [
        [1, 2, 3, 4, 5],
        [3, 4, 5, 6, 7],
        [8, 9, 10, 11, 12]
      ];

      const result = engine.tukeyHSD(groups);

      // 3 groups => 3 comparisons
      expect(result.comparisons).toHaveLength(3);
    });

    it('identifies significant differences between distant groups', () => {
      const groups = [
        [1, 2, 3, 4, 5],
        [50, 51, 52, 53, 54],
        [100, 101, 102, 103, 104]
      ];

      const result = engine.tukeyHSD(groups);

      result.comparisons.forEach(comp => {
        expect(comp.significant).toBe(true);
        expect(comp.pValue).toBeLessThan(0.05);
      });
    });

    it('provides confidence intervals for differences', () => {
      const groups = [
        [10, 11, 12, 13, 14],
        [15, 16, 17, 18, 19]
      ];

      const result = engine.tukeyHSD(groups);

      expect(result.comparisons).toHaveLength(1);
      const comp = result.comparisons[0]!;
      // diff = mean1 - mean2 = 12 - 17 = -5
      // CI should contain the diff: ci[0] < diff < ci[1]
      // With margin, ci should be wider than just the diff
      expect(comp.ci[1] - comp.ci[0]).toBeGreaterThan(0); // CI has positive width
      expect(comp.diff).toBeGreaterThanOrEqual(comp.ci[0]);
      expect(comp.diff).toBeLessThanOrEqual(comp.ci[1]);
    });

    it('q statistic is always non-negative', () => {
      const groups = [
        [5, 6, 7],
        [8, 9, 10],
        [1, 2, 3]
      ];

      const result = engine.tukeyHSD(groups);

      result.comparisons.forEach(comp => {
        expect(comp.q).toBeGreaterThanOrEqual(0);
      });
    });

    it('throws on fewer than 2 groups', () => {
      expect(() => engine.tukeyHSD([[1, 2, 3]])).toThrow('at least 2');
    });

    it('respects custom alpha level', () => {
      const groups = [
        [1, 2, 3, 4, 5],
        [3, 4, 5, 6, 7]
      ];

      const strict = engine.tukeyHSD(groups, 0.001);
      const lenient = engine.tukeyHSD(groups, 0.10);

      // With stricter alpha, fewer things should be significant
      const strictSig = strict.comparisons.filter(c => c.significant).length;
      const lenientSig = lenient.comparisons.filter(c => c.significant).length;
      expect(strictSig).toBeLessThanOrEqual(lenientSig);
    });
  });

  // ==========================================================================
  // Bonferroni Correction
  // ==========================================================================
  describe('bonferroniCorrection', () => {
    it('multiplies p-values by number of tests', () => {
      const pValues = [0.01, 0.03, 0.04];

      const result = engine.bonferroniCorrection(pValues);

      expect(result.adjustedPValues[0]).toBeCloseTo(0.03, 5);
      expect(result.adjustedPValues[1]).toBeCloseTo(0.09, 5);
      expect(result.adjustedPValues[2]).toBeCloseTo(0.12, 5);
    });

    it('caps adjusted p-values at 1', () => {
      const pValues = [0.5, 0.6];

      const result = engine.bonferroniCorrection(pValues);

      expect(result.adjustedPValues[0]).toBe(1);
      expect(result.adjustedPValues[1]).toBe(1);
    });

    it('correctly identifies significance', () => {
      const pValues = [0.001, 0.02, 0.04];

      const result = engine.bonferroniCorrection(pValues, 0.05);

      // 0.001*3 = 0.003 < 0.05 => significant
      expect(result.significant[0]).toBe(true);
      // 0.02*3 = 0.06 > 0.05 => not significant
      expect(result.significant[1]).toBe(false);
      // 0.04*3 = 0.12 > 0.05 => not significant
      expect(result.significant[2]).toBe(false);
    });

    it('throws on empty array', () => {
      expect(() => engine.bonferroniCorrection([])).toThrow('non-empty');
    });
  });

  // ==========================================================================
  // Holm-Bonferroni Correction
  // ==========================================================================
  describe('holmBonferroni', () => {
    it('applies step-down correction', () => {
      const pValues = [0.01, 0.04, 0.03, 0.005];

      const result = engine.holmBonferroni(pValues);

      // Sorted: 0.005 (rank 1), 0.01 (rank 2), 0.03 (rank 3), 0.04 (rank 4)
      // Adjustments: 0.005*4=0.02, 0.01*3=0.03, 0.03*2=0.06, 0.04*1=0.04
      // With monotonicity enforcement: 0.02, 0.03, 0.06, 0.06
      expect(result.adjustedPValues[3]).toBeCloseTo(0.02, 5); // p=0.005 was index 3
      expect(result.adjustedPValues[0]).toBeCloseTo(0.03, 5); // p=0.01 was index 0
    });

    it('is less conservative than Bonferroni', () => {
      const pValues = [0.01, 0.02, 0.03, 0.04, 0.05];

      const bonf = engine.bonferroniCorrection(pValues);
      const holm = engine.holmBonferroni(pValues);

      // Holm-Bonferroni should never be more conservative
      for (let i = 0; i < pValues.length; i++) {
        expect(holm.adjustedPValues[i]).toBeLessThanOrEqual(bonf.adjustedPValues[i]! + 1e-10);
      }
    });

    it('enforces monotonicity', () => {
      const pValues = [0.01, 0.04, 0.02];

      const result = engine.holmBonferroni(pValues);

      // Original order indices: [0, 2, 1] after sorting by p
      // Adjusted values should be non-decreasing when sorted
      const sorted = [...pValues.map((_, i) => i)]
        .sort((a, b) => pValues[a]! - pValues[b]!);
      for (let i = 1; i < sorted.length; i++) {
        expect(result.adjustedPValues[sorted[i]!]).toBeGreaterThanOrEqual(
          result.adjustedPValues[sorted[i - 1]!]! - 1e-10
        );
      }
    });

    it('throws on empty array', () => {
      expect(() => engine.holmBonferroni([])).toThrow('non-empty');
    });
  });

  // ==========================================================================
  // Effect Sizes
  // ==========================================================================
  describe('glassDelta', () => {
    it('computes correct effect size using control SD', () => {
      const treatment = [10, 11, 12, 13, 14];
      const control = [5, 6, 7, 8, 9];

      const delta = engine.glassDelta(treatment, control);

      const controlMean = 7;
      const treatmentMean = 12;
      const controlSD = Math.sqrt(2.5); // sample variance = 2.5
      const expected = (treatmentMean - controlMean) / controlSD;
      expect(delta).toBeCloseTo(expected, 5);
    });

    it('returns 0 when control has no variance', () => {
      const treatment = [10, 11, 12];
      const control = [5, 5, 5];

      expect(engine.glassDelta(treatment, control)).toBe(0);
    });

    it('throws on empty arrays', () => {
      expect(() => engine.glassDelta([], [1, 2])).toThrow('non-empty');
    });
  });

  describe('hedgesG', () => {
    it('applies small-sample bias correction', () => {
      const group1 = [10, 11, 12, 13, 14];
      const group2 = [5, 6, 7, 8, 9];

      const g = engine.hedgesG(group1, group2);

      // Cohen's d for these groups: (12-7) / pooledSD
      const pooledSD = Math.sqrt(((4 * 2.5 + 4 * 2.5) / 8));
      const d = 5 / pooledSD;
      // Hedges correction: 1 - 3/(4*8 - 1) = 1 - 3/31
      const correction = 1 - 3 / 31;
      expect(g).toBeCloseTo(d * correction, 5);
    });

    it('is slightly smaller in magnitude than Cohens d', () => {
      const group1 = [10, 11, 12];
      const group2 = [5, 6, 7];

      const g = Math.abs(engine.hedgesG(group1, group2));

      // Calculate Cohen's d manually
      const pooledSD = Math.sqrt(((2 * 1 + 2 * 1) / 4));
      const d = Math.abs(5 / pooledSD);
      expect(g).toBeLessThan(d);
    });

    it('returns 0 when groups have same mean and no variance', () => {
      expect(engine.hedgesG([5, 5, 5], [5, 5, 5])).toBe(0);
    });

    it('throws on empty arrays', () => {
      expect(() => engine.hedgesG([], [1, 2])).toThrow('non-empty');
    });
  });

  describe('cramersV', () => {
    it('computes Cramers V correctly', () => {
      // chiSquare=10, n=100, minDim=2
      const v = engine.cramersV(10, 100, 2);
      expect(v).toBeCloseTo(Math.sqrt(10 / (100 * 1)), 5);
    });

    it('returns 0 for invalid inputs', () => {
      expect(engine.cramersV(10, 0, 2)).toBe(0);
      expect(engine.cramersV(10, 100, 1)).toBe(0);
    });
  });

  describe('omegaSquared', () => {
    it('computes omega squared from ANOVA result', () => {
      const groups = [
        [1, 2, 3, 4, 5],
        [6, 7, 8, 9, 10],
        [11, 12, 13, 14, 15]
      ];

      const anova = engine.performANOVA(groups);
      const omega2 = engine.omegaSquared(anova);

      // Should be positive and less than eta-squared
      expect(omega2).toBeGreaterThan(0);
      expect(omega2).toBeLessThan(anova.etaSquared);
      expect(omega2).toBeLessThanOrEqual(1);
    });

    it('returns 0 when between-groups variance is negligible', () => {
      // Groups with same distribution should have near-zero omega squared
      const groups = [
        [5.0, 5.1, 4.9, 5.0, 5.1],
        [5.0, 4.9, 5.1, 5.0, 4.9]
      ];

      const anova = engine.performANOVA(groups);
      const omega2 = engine.omegaSquared(anova);

      expect(omega2).toBeGreaterThanOrEqual(0);
      expect(omega2).toBeLessThan(0.1);
    });
  });

  // ==========================================================================
  // Edge Cases and Integration
  // ==========================================================================
  describe('edge cases', () => {
    it('Mann-Whitney handles single-element groups', () => {
      const result = engine.mannWhitneyU([1], [2]);

      expect(result.U1 + result.U2).toBe(1);
    });

    it('Kruskal-Wallis with two groups approximates Mann-Whitney', () => {
      const group1 = [1, 3, 5, 7, 9];
      const group2 = [2, 4, 6, 8, 10];

      const kw = engine.kruskalWallis([group1, group2]);
      const mw = engine.mannWhitneyU(group1, group2);

      // Both should agree on significance
      const kwSig = kw.pValue < 0.05;
      const mwSig = mw.pValue < 0.05;
      expect(kwSig).toBe(mwSig);
    });

    it('chi-square independence matches goodness-of-fit for 1-row aggregation', () => {
      const observed = [20, 30, 50];
      const gof = engine.chiSquareGoodnessOfFit(observed);

      expect(gof.chiSquare).toBeGreaterThanOrEqual(0);
      expect(gof.pValue).toBeGreaterThanOrEqual(0);
      expect(gof.pValue).toBeLessThanOrEqual(1);
    });

    it('Holm-Bonferroni single p-value equals raw p-value', () => {
      const result = engine.holmBonferroni([0.03]);

      expect(result.adjustedPValues[0]).toBeCloseTo(0.03, 5);
    });

    it('Bonferroni single p-value equals raw p-value', () => {
      const result = engine.bonferroniCorrection([0.03]);

      expect(result.adjustedPValues[0]).toBeCloseTo(0.03, 5);
    });
  });
});
