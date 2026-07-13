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

  // ==========================================================================
  // PARAMETRIC CORE
  //
  // Every expected number below is traceable to one of three authoritative
  // sources, cited inline:
  //
  //   [TABLE]  A published Student's t table (the two-tailed .05 / .01 columns
  //            reproduced in every statistics textbook; e.g. Fisher & Yates,
  //            "Statistical Tables", Table III).
  //   [A&S]    Abramowitz & Stegun, "Handbook of Mathematical Functions",
  //            eqs. 26.7.3 (odd df) / 26.7.4 (even df) — a FINITE, EXACT
  //            closed-form expansion of the Student t CDF for integer df.
  //            Implemented below as `exactStudentTCDF`. This is a completely
  //            different algorithm from the engine's (regularized incomplete
  //            beta), so agreement between them is a real cross-check, not a
  //            tautology.
  //   [COHEN]  Cohen (1988), "Statistical Power Analysis for the Behavioral
  //            Sciences", 2nd ed. — the canonical power benchmarks.
  //
  // Context: `studentTCDF` used to DISCARD its df argument and return the
  // standard normal CDF, and `standardNormalInverse` evaluated its rational
  // approximation with the polynomial coefficients in reverse order. Between
  // them, every t/Pearson/Spearman/regression p-value, every confidence
  // interval and every power figure the platform produced was wrong. These
  // tests exist to make that impossible to reintroduce silently.
  // ==========================================================================

  /**
   * [A&S] Exact Student's t CDF for INTEGER df (Abramowitz & Stegun 26.7.3/26.7.4).
   * Finite sum — no iteration, no approximation beyond floating point.
   * Serves as the independent oracle for the engine's incomplete-beta version.
   */
  function exactStudentTCDF(t: number, df: number): number {
    const theta = Math.atan(t / Math.sqrt(df));
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    if (df === 1) {
      // Cauchy: F(t) = 1/2 + arctan(t)/pi
      return 0.5 + theta / Math.PI;
    }

    if (df % 2 === 1) {
      // A&S 26.7.3 (odd df >= 3)
      let sum = 0;
      let coef = 1;
      for (let j = 0; j <= (df - 3) / 2; j++) {
        if (j > 0) coef *= (2 * j) / (2 * j + 1);
        sum += coef * Math.pow(c, 2 * j + 1);
      }
      return 0.5 + (1 / Math.PI) * (theta + s * sum);
    }

    // A&S 26.7.4 (even df)
    let sum = 0;
    let coef = 1;
    for (let j = 0; j <= (df - 2) / 2; j++) {
      if (j > 0) coef *= (2 * j - 1) / (2 * j);
      sum += coef * Math.pow(c, 2 * j);
    }
    return 0.5 + 0.5 * s * sum;
  }

  const twoTailed = (t: number, df: number) => 2 * (1 - exactStudentTCDF(Math.abs(t), df));

  /**
   * [TABLE] Two-tailed .05 critical values, i.e. the 0.975 quantile of t(df).
   * These are the numbers printed in every published t table.
   */
  const T_CRIT_975: Record<number, number> = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    9: 2.262,
    10: 2.228,
    18: 2.101,
    20: 2.086,
    30: 2.042,
    60: 2.0,
    120: 1.98
  };

  describe('studentTCDF (regression: df must not be discarded)', () => {
    it('matches the exact Cauchy closed form at df=1', () => {
      // [A&S] df=1 is the Cauchy distribution: F(1) = 1/2 + arctan(1)/pi = 0.75 exactly.
      expect(engine.studentTCDF(1, 1)).toBeCloseTo(0.75, 12);
      expect(engine.studentTCDF(0, 1)).toBeCloseTo(0.5, 12);
    });

    it('matches the exact closed form at df=2', () => {
      // [A&S 26.7.4] df=2: F(t) = 1/2 + t / (2*sqrt(t^2 + 2))
      // F(1) = 0.5 + 1/(2*sqrt(3)) = 0.7886751345948129
      expect(engine.studentTCDF(1, 2)).toBeCloseTo(0.7886751345948129, 12);
    });

    it('reproduces published two-tailed .05 critical values (df = 1, 2, 5, 10, 30)', () => {
      // [TABLE] At the tabulated critical value the two-tailed p must be 0.05.
      // The table values are rounded to 3 dp, so p lands on 0.05 to ~4 dp.
      for (const df of [1, 2, 5, 10, 30]) {
        const tCrit = T_CRIT_975[df]!;
        const p = 2 * (1 - engine.studentTCDF(tCrit, df));
        expect(p).toBeCloseTo(0.05, 3);
      }
    });

    it('reproduces published one-tailed critical values at df=10', () => {
      // [TABLE] df=10: t_.95 = 1.812, t_.99 = 2.764, t_.995 = 3.169
      expect(engine.studentTCDF(1.812, 10)).toBeCloseTo(0.95, 4);
      expect(engine.studentTCDF(2.764, 10)).toBeCloseTo(0.99, 4);
      expect(engine.studentTCDF(3.169, 10)).toBeCloseTo(0.995, 4);
    });

    it('agrees with the A&S exact expansion across df and t (independent algorithm)', () => {
      // [A&S] Two mathematically independent algorithms (finite trigonometric
      // expansion vs. regularized incomplete beta) must agree to double precision.
      for (const df of [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50, 100]) {
        for (const t of [-8, -4, -2.5, -1, -0.3, 0, 0.3, 1, 2.5, 4, 8, 20]) {
          expect(engine.studentTCDF(t, df)).toBeCloseTo(exactStudentTCDF(t, df), 10);
        }
      }
    });

    it('is symmetric: F(-t) = 1 - F(t)', () => {
      for (const df of [1, 3, 7, 25]) {
        for (const t of [0.5, 1.5, 3]) {
          expect(engine.studentTCDF(-t, df)).toBeCloseTo(1 - engine.studentTCDF(t, df), 12);
        }
      }
    });

    it('converges to the standard normal as df -> infinity', () => {
      // The t distribution tends to N(0,1); at df=1e6 the two must agree to ~1e-7.
      for (const t of [-2.5, -1, 0.5, 1.959964, 3]) {
        expect(engine.studentTCDF(t, 1e6)).toBeCloseTo(engine.standardNormalCDF(t), 6);
      }
      // Even at df=10000 the gap is already < 2e-5.
      expect(engine.studentTCDF(1.959964, 10000)).toBeCloseTo(engine.standardNormalCDF(1.959964), 4);
      // df = Infinity IS the normal.
      expect(engine.studentTCDF(1.959964, Infinity)).toBeCloseTo(0.975, 8);
    });

    it('handles edge cases', () => {
      expect(engine.studentTCDF(0, 5)).toBe(0.5);
      expect(engine.studentTCDF(Infinity, 5)).toBe(1);
      expect(engine.studentTCDF(-Infinity, 5)).toBe(0);
      expect(engine.studentTCDF(1, 0)).toBeNaN();
      expect(engine.studentTCDF(1, -3)).toBeNaN();
      expect(engine.studentTCDF(NaN, 5)).toBeNaN();
      expect(engine.studentTCDF(1, NaN)).toBeNaN();
    });

    it('REGRESSION: is NOT the normal CDF at small df (the anti-conservative bug)', () => {
      // The old implementation returned standardNormalCDF(t) regardless of df.
      // [TABLE] df=9, t=2.262 is the classic two-tailed .05 critical value for n=10.
      const t = 2.262;
      const pStudent = 2 * (1 - engine.studentTCDF(t, 9));
      const pNormal = 2 * (1 - engine.standardNormalCDF(t));

      // Truth: p = 0.05 (that is what "critical value" means).
      expect(pStudent).toBeCloseTo(0.05, 3);
      // The bug: the normal CDF reports ~0.0237 for the same t — significant at
      // .05 and even at .025, when in truth the result sits exactly ON the .05
      // threshold. [A&S oracle: 0.0500128; normal: 0.0237055]
      expect(pNormal).toBeCloseTo(0.0237, 3);
      // The t p-value must be materially LARGER (more conservative).
      expect(pStudent).toBeGreaterThan(pNormal * 2);
    });

    it('REGRESSION: the anti-conservative gap widens as n shrinks', () => {
      // [A&S oracle] true vs. normal-CDF two-tailed p at the .05 critical value:
      //   df=18 (n=10/arm, two-sample): 0.04999 vs 0.03564  -> 1.4x
      //   df=9  (n=10, one-sample):     0.05001 vs 0.02371  -> 2.1x
      //   df=4  (n=5,  one-sample):     0.05002 vs 0.00550  -> 9.1x
      const cases: Array<[number, number]> = [
        [18, 2.101],
        [9, 2.262],
        [4, 2.776]
      ];
      let previousRatio = 0;
      for (const [df, tCrit] of cases) {
        const pStudent = 2 * (1 - engine.studentTCDF(tCrit, df));
        const pNormal = 2 * (1 - engine.standardNormalCDF(tCrit));
        expect(pStudent).toBeCloseTo(twoTailed(tCrit, df), 8);
        const ratio = pStudent / pNormal;
        expect(ratio).toBeGreaterThan(previousRatio);
        previousRatio = ratio;
      }
      // df=4: the old code understated the p-value by ~9x.
      expect(previousRatio).toBeGreaterThan(8);
    });
  });

  describe('studentTInverse', () => {
    it('reproduces the published t table (two-tailed .05 critical values)', () => {
      // [TABLE] the 0.975 quantile for each df.
      for (const [df, tCrit] of Object.entries(T_CRIT_975)) {
        expect(engine.studentTInverse(0.975, Number(df))).toBeCloseTo(tCrit, 3);
      }
    });

    it('reproduces published one-tailed critical values at df=10', () => {
      // [TABLE] df=10: t_.95 = 1.812, t_.99 = 2.764, t_.995 = 3.169
      expect(engine.studentTInverse(0.95, 10)).toBeCloseTo(1.812, 3);
      expect(engine.studentTInverse(0.99, 10)).toBeCloseTo(2.764, 3);
      expect(engine.studentTInverse(0.995, 10)).toBeCloseTo(3.169, 3);
    });

    it('round-trips against studentTCDF', () => {
      for (const df of [1, 2, 5, 9, 18, 30, 120]) {
        for (const p of [0.001, 0.01, 0.025, 0.1, 0.3, 0.5, 0.7, 0.9, 0.975, 0.99, 0.999]) {
          const t = engine.studentTInverse(p, df);
          expect(engine.studentTCDF(t, df)).toBeCloseTo(p, 10);
        }
      }
    });

    it('is a true quantile function: the .025 quantile is NEGATIVE', () => {
      // This is the contract the confidence-interval code depends on.
      // [TABLE] df=9: t_.025 = -2.262, t_.975 = +2.262
      expect(engine.studentTInverse(0.025, 9)).toBeCloseTo(-2.262, 3);
      expect(engine.studentTInverse(0.975, 9)).toBeCloseTo(2.262, 3);
      expect(engine.studentTInverse(0.5, 9)).toBe(0);
    });

    it('converges to the normal quantile for large df', () => {
      // [TABLE] z_.975 = 1.959964
      expect(engine.studentTInverse(0.975, 1e7)).toBeCloseTo(1.959964, 5);
    });

    it('rejects out-of-range probabilities', () => {
      expect(() => engine.studentTInverse(0, 10)).toThrow();
      expect(() => engine.studentTInverse(1, 10)).toThrow();
      expect(() => engine.studentTInverse(-0.1, 10)).toThrow();
    });
  });

  describe('standardNormalInverse (regression: reversed Horner coefficients)', () => {
    it('reproduces published standard normal quantiles', () => {
      // [TABLE] standard normal quantiles (any statistics text; NIST e-Handbook 1.3.6.7.1)
      //   Phi^-1(0.5)   =  0
      //   Phi^-1(0.75)  =  0.6744898
      //   Phi^-1(0.9)   =  1.2815516
      //   Phi^-1(0.95)  =  1.6448536
      //   Phi^-1(0.975) =  1.9599640
      //   Phi^-1(0.99)  =  2.3263479
      //   Phi^-1(0.995) =  2.5758293
      const expected: Record<string, number> = {
        '0.5': 0,
        '0.75': 0.6744897502,
        '0.9': 1.2815515655,
        '0.95': 1.644853627,
        '0.975': 1.9599639845,
        '0.99': 2.326347874,
        '0.995': 2.5758293035
      };
      for (const [p, z] of Object.entries(expected)) {
        expect(engine.standardNormalInverse(Number(p))).toBeCloseTo(z, 8);
      }
    });

    it('REGRESSION: lower-tail quantiles are negative and correctly signed', () => {
      // The old implementation returned +9.25 for Phi^-1(0.005) and only 0.054
      // for Phi^-1(0.975) — the sign AND the magnitude were wrong, which is why
      // every confidence interval came out inverted and hairline-narrow.
      expect(engine.standardNormalInverse(0.025)).toBeCloseTo(-1.9599639845, 8);
      expect(engine.standardNormalInverse(0.005)).toBeCloseTo(-2.5758293035, 8);
      expect(engine.standardNormalInverse(0.001)).toBeCloseTo(-3.0902323062, 8);
      // Antisymmetry: Phi^-1(p) = -Phi^-1(1-p)
      for (const p of [0.001, 0.01, 0.05, 0.2, 0.4]) {
        expect(engine.standardNormalInverse(p)).toBeCloseTo(-engine.standardNormalInverse(1 - p), 10);
      }
    });

    it('round-trips against standardNormalCDF', () => {
      for (const p of [1e-6, 0.001, 0.02, 0.2, 0.5, 0.8, 0.98, 0.999]) {
        expect(engine.standardNormalCDF(engine.standardNormalInverse(p))).toBeCloseTo(p, 12);
      }
    });
  });

  describe('standardNormalCDF', () => {
    it('matches published values of Phi', () => {
      // [TABLE] NIST e-Handbook / standard normal table:
      //   Phi(0)          = 0.5
      //   Phi(1)          = 0.8413447461
      //   Phi(1.959964)   = 0.975
      //   Phi(-3)         = 0.0013498980
      expect(engine.standardNormalCDF(0)).toBeCloseTo(0.5, 12);
      expect(engine.standardNormalCDF(1)).toBeCloseTo(0.8413447460685429, 12);
      expect(engine.standardNormalCDF(1.959963985)).toBeCloseTo(0.975, 10);
      expect(engine.standardNormalCDF(-3)).toBeCloseTo(0.001349898031630095, 12);
    });

    it('keeps relative accuracy far into the tail', () => {
      // [TABLE] Phi(-6) = 9.865876e-10. The old A&S 7.1.26 approximation had
      // ~1.5e-7 ABSOLUTE error, i.e. ~150x relative error at this point.
      expect(engine.standardNormalCDF(-6)).toBeCloseTo(9.865876450376946e-10, 15);
    });
  });

  describe('performTTest: one-sample', () => {
    // Fixed dataset: 10 reaction times (ms), tested against mu0 = 500 ms.
    // Hand-computed: mean = 511, sample var = 267.111..., sd = 16.343534,
    // se = 5.168279, t = (511 - 500)/se = 2.1283679, df = 9.
    const rt = [512, 486, 530, 498, 505, 540, 495, 520, 508, 516];

    it('computes the t statistic and df', () => {
      const r = engine.performTTest(rt, undefined, 500, 'one-sample');
      expect(r.statistic).toBeCloseTo(2.1283679388664634, 10);
      expect(r.degreesOfFreedom).toBe(9);
    });

    it('computes the p-value from the t distribution, not the normal', () => {
      const r = engine.performTTest(rt, undefined, 500, 'one-sample');
      // [A&S oracle] 2*(1 - T_9(2.1283679)) = 0.0621862292607684
      expect(r.pValue).toBeCloseTo(0.062186229260768444, 10);
      expect(r.pValue).toBeCloseTo(twoTailed(r.statistic, 9), 10);
    });

    it('REGRESSION: this dataset is NOT significant — the old code said it was', () => {
      const r = engine.performTTest(rt, undefined, 500, 'one-sample');
      // True p = 0.0622 -> NOT significant at alpha = .05.
      expect(r.pValue).toBeGreaterThan(0.05);
      // The old normal-CDF p-value for the same t was 0.0333 -> "significant".
      const oldP = 2 * (1 - engine.standardNormalCDF(Math.abs(r.statistic)));
      expect(oldP).toBeCloseTo(0.0333, 3);
      expect(oldP).toBeLessThan(0.05);
      // i.e. the bug flipped a null result into a publishable one.
    });

    it('produces a correctly ordered confidence interval that brackets the mean', () => {
      const r = engine.performTTest(rt, undefined, 500, 'one-sample');
      const [lo, hi] = r.confidenceInterval;
      // [TABLE] t_.975,9 = 2.262 -> CI = 511 +/- 2.262157 * 5.168279 = [499.3085, 522.6915]
      expect(lo).toBeLessThan(hi);
      expect(lo).toBeCloseTo(499.3085399209526, 6);
      expect(hi).toBeCloseTo(522.6914600790474, 6);
      expect(lo).toBeLessThan(511);
      expect(hi).toBeGreaterThan(511);
      // The CI must be consistent with the p-value: p > .05 <=> mu0 inside the CI.
      expect(lo).toBeLessThan(500);
      expect(hi).toBeGreaterThan(500);
    });

    it('reports honest power (not pinned at 1)', () => {
      const r = engine.performTTest(rt, undefined, 500, 'one-sample');
      // d = 11/16.343534 = 0.673049; [quadrature over the noncentral t] power = 0.4763
      expect(r.effectSize).toBeCloseTo(0.6730490385696035, 10);
      expect(r.power).toBeCloseTo(0.4763, 3);
      expect(r.power).toBeLessThan(0.6);
    });
  });

  describe('performTTest: two-sample (Welch)', () => {
    // g2 = g1 + 30, so the sample variances are identical and Welch's df is
    // exactly n1 + n2 - 2 = 18 — which lets us check against the integer-df oracle.
    const g1 = [420, 445, 460, 470, 480, 495, 505, 515, 530, 555];
    const g2 = [450, 475, 490, 500, 510, 525, 535, 545, 560, 585];

    it('computes Welch t and df', () => {
      const r = engine.performTTest(g1, g2, 0, 'two-sample-independent');
      expect(r.statistic).toBeCloseTo(-1.6452254913212452, 10);
      expect(r.degreesOfFreedom).toBeCloseTo(18, 10);
    });

    it('computes the p-value from the t distribution', () => {
      const r = engine.performTTest(g1, g2, 0, 'two-sample-independent');
      // [A&S oracle] 2*(1 - T_18(1.6452255)) = 0.1172729457816679
      expect(r.pValue).toBeCloseTo(0.11727294578166791, 10);
      expect(r.pValue).toBeGreaterThan(0.05);
      // Old normal-CDF answer was 0.0999 — still not significant here, but 1.17x
      // too small; at n=10/arm the gap reaches 1.4x at the .05 boundary.
      const oldP = 2 * (1 - engine.standardNormalCDF(Math.abs(r.statistic)));
      expect(oldP).toBeCloseTo(0.0999, 3);
      expect(r.pValue).toBeGreaterThan(oldP);
    });

    it('produces a correctly ordered CI that brackets the mean difference', () => {
      const r = engine.performTTest(g1, g2, 0, 'two-sample-independent');
      const [lo, hi] = r.confidenceInterval;
      // [TABLE] t_.975,18 = 2.101 -> CI = -30 +/- 2.100922 * 18.234583
      expect(lo).toBeLessThan(hi);
      expect(lo).toBeCloseTo(-68.30943632674047, 6);
      expect(hi).toBeCloseTo(8.309436326740467, 6);
      expect(lo).toBeLessThan(-30);
      expect(hi).toBeGreaterThan(-30);
      // p > .05 <=> the CI contains 0.
      expect(lo).toBeLessThan(0);
      expect(hi).toBeGreaterThan(0);
    });

    it('reports honest power for the two-sample design', () => {
      const r = engine.performTTest(g1, g2, 0, 'two-sample-independent');
      // d = -30/40.775 = -0.735767; [quadrature] power(df=18, ncp=|d|*sqrt(5)) = 0.3440
      expect(r.effectSize).toBeCloseTo(-0.735767207381959, 10);
      expect(r.power).toBeCloseTo(0.344, 3);
    });
  });

  describe('performTTest: paired', () => {
    it('equals the one-sample test on the differences', () => {
      const before = [520, 505, 530, 498, 512, 540, 495, 522];
      const after = [505, 500, 515, 495, 500, 520, 490, 510];
      const diffs = before.map((b, i) => b - after[i]!);

      const paired = engine.performTTest(before, after, 0, 'two-sample-paired');
      const oneSample = engine.performTTest(diffs, undefined, 0, 'one-sample');

      expect(paired.statistic).toBeCloseTo(oneSample.statistic, 12);
      expect(paired.degreesOfFreedom).toBe(7);
      // [A&S oracle] cross-check on the exact t distribution with df=7
      expect(paired.pValue).toBeCloseTo(twoTailed(paired.statistic, 7), 10);
      expect(paired.confidenceInterval[0]).toBeLessThan(paired.confidenceInterval[1]);
    });
  });

  describe('calculateCorrelation: p-values and CIs', () => {
    // Hand-verifiable dataset: Sxx = 10, Syy = 6, Sxy = 6
    //   => r = 6/sqrt(60) = sqrt(0.6) = 0.7745967
    //   => t = r*sqrt(3/(1-0.6)) = sqrt(4.5) = 2.1213203, df = 3
    const px = [1, 2, 3, 4, 5];
    const py = [2, 4, 5, 4, 5];

    it('computes Pearson r and its t-distribution p-value', () => {
      const r = engine.calculateCorrelation(px, py, 'pearson');
      expect(r.coefficient).toBeCloseTo(Math.sqrt(0.6), 12);
      // [A&S oracle] 2*(1 - T_3(2.1213203)) = 0.1240270626575546
      expect(r.pValue).toBeCloseTo(0.12402706265755459, 10);
    });

    it('REGRESSION: Pearson p is not the normal-CDF p (3.7x too small at n=5)', () => {
      const r = engine.calculateCorrelation(px, py, 'pearson');
      const oldP = 2 * (1 - engine.standardNormalCDF(Math.sqrt(4.5)));
      // Old: 0.0339 -> "r = .77 is significant, p < .05". Truth: 0.124, nowhere near.
      expect(oldP).toBeCloseTo(0.0339, 3);
      expect(r.pValue).toBeGreaterThan(0.05);
      expect(r.pValue / oldP).toBeGreaterThan(3.5);
    });

    it('produces a finite, correctly ordered Fisher-z confidence interval', () => {
      const r = engine.calculateCorrelation(px, py, 'pearson');
      const [lo, hi] = r.confidenceInterval;
      expect(Number.isNaN(lo)).toBe(false);
      expect(Number.isNaN(hi)).toBe(false);
      expect(lo).toBeLessThan(hi);
      expect(lo).toBeLessThan(r.coefficient);
      expect(hi).toBeGreaterThan(r.coefficient);
      // [Fisher z, z_.975 = 1.959964, se = 1/sqrt(n-3) = 1/sqrt(2)]
      // CI = tanh(atanh(sqrt(.6)) -/+ 1.959964/sqrt(2)) = [-0.3400820, 0.9842358]
      expect(lo).toBeCloseTo(-0.34008203518751035, 8);
      expect(hi).toBeCloseTo(0.9842357551507267, 8);
    });

    it('Fisher-z CI matches the closed-form reference for a larger sample', () => {
      const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      const y = x.map((v, i) => v + (i % 3) * 2.5);
      const r = engine.calculateCorrelation(x, y, 'pearson');
      const [lo, hi] = r.confidenceInterval;

      // Reference: Fisher's z transform with the published z_.975 = 1.959964 and
      // se = 1/sqrt(n-3); back-transformed with tanh. This is the interval R's
      // cor.test() reports. (For r = 0.8, n = 20 it gives [0.5534, 0.9177].)
      const Z_975 = 1.959963984540054;
      const se = 1 / Math.sqrt(20 - 3);
      const expectedLo = Math.tanh(Math.atanh(r.coefficient) - Z_975 * se);
      const expectedHi = Math.tanh(Math.atanh(r.coefficient) + Z_975 * se);

      expect(lo).toBeCloseTo(expectedLo, 10);
      expect(hi).toBeCloseTo(expectedHi, 10);
      expect(lo).toBeLessThan(hi);
      expect(lo).toBeLessThan(r.coefficient);
      expect(hi).toBeGreaterThan(r.coefficient);

      // Sanity-check the reference formula itself on the r = 0.8 / n = 20 case.
      expect(Math.tanh(Math.atanh(0.8) - Z_975 * se)).toBeCloseTo(0.5533876444538585, 8);
      expect(Math.tanh(Math.atanh(0.8) + Z_975 * se)).toBeCloseTo(0.9176554840969451, 8);
    });

    it('REGRESSION: the CI is not NaN at the n=3 boundary', () => {
      // se = 1/sqrt(n-3) is infinite at n=3; the old exp-based back-transform
      // produced Infinity/Infinity = NaN for the upper bound.
      const r = engine.calculateCorrelation([1, 2, 3], [2, 4, 7], 'pearson');
      const [lo, hi] = r.confidenceInterval;
      expect(Number.isNaN(lo)).toBe(false);
      expect(Number.isNaN(hi)).toBe(false);
      expect(lo).toBeLessThanOrEqual(hi);
    });

    it('computes Spearman rho and its t-distribution p-value', () => {
      const sx = [1, 2, 3, 4, 5, 6, 7, 8];
      const sy = [2, 1, 4, 3, 6, 5, 8, 7];
      const r = engine.calculateCorrelation(sx, sy, 'spearman');
      // rho = 0.9047619 (Pearson on the ranks), t = 5.2033643, df = 6
      expect(r.coefficient).toBeCloseTo(0.9047619047619048, 10);
      // [A&S oracle] 2*(1 - T_6(5.2033643)) = 0.0020082755054294
      expect(r.pValue).toBeCloseTo(0.002008275505429369, 10);
      // The old normal-CDF answer was 1.96e-7 — off by a factor of ~10,000.
      const oldP = 2 * (1 - engine.standardNormalCDF(5.203364296299079));
      expect(r.pValue / oldP).toBeGreaterThan(1000);
    });
  });

  describe('performLinearRegression: coefficient p-values', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = [2.1, 3.9, 6.2, 7.8, 10.1, 12.2, 13.8, 16.1, 18.0, 20.2];

    it('computes slope, R^2 and a t-distributed slope p-value', () => {
      const r = engine.performLinearRegression(x, y);
      expect(r.coefficients[0]).toBeCloseTo(2.0072727272727273, 10);
      expect(r.rSquared).toBeCloseTo(0.999339685760389, 10);
      // t_slope = 110.0338298, df = 8
      expect(r.tStatistics[0]).toBeCloseTo(110.03382983705185, 6);

      // Reference: 2 * P(T_8 > 110.0338) = 5.19967e-14, obtained by direct
      // numerical quadrature of the t density (Simpson, 2e6 panels, substitution
      // x = t/u). NOTE: the [A&S] oracle CANNOT be used at this magnitude — it
      // computes 1 - F where F is within 5e-14 of 1, so double-precision
      // cancellation costs it ~0.5% relative accuracy (it returns 5.1736e-14).
      // The engine evaluates the tail directly as 0.5 * I_x(df/2, 1/2) and is
      // accurate to 0.07% here, i.e. it is the more accurate of the two.
      expect(r.pValues[0]! / 5.199666229076761e-14).toBeCloseTo(1, 2);
      expect(r.pValues[0]).toBeGreaterThan(0);
      expect(r.pValues[0]).toBeLessThan(1e-10);
    });

    it('the F test of the model agrees with the squared slope t (F = t^2, p identical)', () => {
      // Mathematical identity for simple linear regression: F(1, n-2) = t^2,
      // and the F p-value equals the two-tailed t p-value. This exercises the
      // shared incomplete-beta code from the F side.
      const r = engine.performLinearRegression(x, y);
      expect(r.fStatistic).toBeCloseTo(r.tStatistics[0]! ** 2, 4);
      expect(r.pValue / r.pValues[0]!).toBeCloseTo(1, 4);
    });
  });

  describe('t-test power (noncentral t)', () => {
    // The power figures are cross-checked against numerical quadrature over the
    // chi-square mixture that defines the noncentral t, and against [COHEN]'s
    // published sample-size benchmarks.
    it('REGRESSION: power is not pinned at ~1 for a small effect at small n', () => {
      // The old code returned exactly 1.0 for EVERY input, including a zero effect.
      // [quadrature] one-sample d=0.2, n=10 -> power = 0.0877
      const data = Array.from({ length: 10 }, (_, i) => 0.2 + (i - 4.5) / 3.0276503540974917);
      const r = engine.performTTest(data, undefined, 0, 'one-sample');
      expect(r.effectSize).toBeCloseTo(0.2, 6);
      expect(r.power).toBeCloseTo(0.0877, 3);
      expect(r.power).toBeLessThan(0.2);
    });

    it('power at a zero effect size equals alpha', () => {
      // A test with no effect rejects at exactly the nominal rate: power = alpha = .05.
      // The old code reported 1.0 here — a test that "always detects" nothing.
      const data = Array.from({ length: 10 }, (_, i) => (i - 4.5) / 3.0276503540974917);
      const r = engine.performTTest(data, undefined, 0, 'one-sample');
      expect(r.effectSize).toBeCloseTo(0, 10);
      expect(r.power).toBeCloseTo(0.05, 6);
    });

    it('[COHEN] two-sample d=0.5 at n=64/group has power ~= .80', () => {
      // Cohen (1988): n = 64 per group is the canonical sample size for a medium
      // effect (d = .50) at alpha = .05 (two-tailed), power = .80.
      // [quadrature] exact value = 0.80146
      const sd = 1;
      const mk = (n: number, mean: number) => {
        // symmetric sample with exact mean and exact sample sd = 1
        const base = Array.from({ length: n }, (_, i) => i - (n - 1) / 2);
        const m = base.reduce((s, v) => s + v, 0) / n;
        const v = base.reduce((s, val) => s + (val - m) ** 2, 0) / (n - 1);
        const scale = sd / Math.sqrt(v);
        return base.map(val => mean + val * scale);
      };
      const a = mk(64, 0.5);
      const b = mk(64, 0);
      const r = engine.performTTest(a, b, 0, 'two-sample-independent');
      expect(r.effectSize).toBeCloseTo(0.5, 6);
      expect(r.power).toBeCloseTo(0.8015, 3);
    });

    it('power increases with n and with effect size', () => {
      const mk = (n: number, mean: number) => {
        const base = Array.from({ length: n }, (_, i) => i - (n - 1) / 2);
        const m = base.reduce((s, v) => s + v, 0) / n;
        const v = base.reduce((s, val) => s + (val - m) ** 2, 0) / (n - 1);
        const scale = 1 / Math.sqrt(v);
        return base.map(val => mean + val * scale);
      };
      const small = engine.performTTest(mk(10, 0.5), undefined, 0, 'one-sample');
      const big = engine.performTTest(mk(50, 0.5), undefined, 0, 'one-sample');
      const bigger = engine.performTTest(mk(50, 0.8), undefined, 0, 'one-sample');

      // [quadrature] one-sample d=0.5: n=10 -> 0.2932, n=50 -> 0.9339
      expect(small.power).toBeCloseTo(0.2932, 3);
      expect(big.power).toBeGreaterThan(small.power);
      expect(bigger.power).toBeGreaterThan(big.power);
      expect(bigger.power).toBeLessThanOrEqual(1);
    });
  });

  describe('regularizedIncompleteBeta', () => {
    it('matches known closed forms', () => {
      // I_x(1,1) = x  (uniform);  I_x(a,b) = 1 - I_{1-x}(b,a) (symmetry);
      // I_0.5(0.5,0.5) = 0.5 (arcsine distribution median)
      expect(engine.regularizedIncompleteBeta(1, 1, 0.37)).toBeCloseTo(0.37, 12);
      expect(engine.regularizedIncompleteBeta(0.5, 0.5, 0.5)).toBeCloseTo(0.5, 12);
      // I_x(2,1) = x^2
      expect(engine.regularizedIncompleteBeta(2, 1, 0.6)).toBeCloseTo(0.36, 12);
      // symmetry
      expect(engine.regularizedIncompleteBeta(3, 7, 0.25)).toBeCloseTo(
        1 - engine.regularizedIncompleteBeta(7, 3, 0.75),
        12
      );
    });

    it('handles boundaries and large parameters (no overflow)', () => {
      expect(engine.regularizedIncompleteBeta(2, 3, 0)).toBe(0);
      expect(engine.regularizedIncompleteBeta(2, 3, 1)).toBe(1);
      // a = df/2 = 5000: the old logGamma (log of an overflowing gamma) returned
      // Infinity here, poisoning every large-df computation.
      const v = engine.regularizedIncompleteBeta(5000, 0.5, 0.9996);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    });
  });
});
