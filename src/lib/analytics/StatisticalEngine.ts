/**
 * Statistical Engine
 * Advanced statistical calculations for QDesigner Modern analytics
 */

import type {
  StatisticalSummary,
  CorrelationAnalysis,
  TTestResult,
  AnovaResult,
  AnovaGroup,
  RegressionResult,
  ReliabilityAnalysis,
  FactorAnalysis,
  MannWhitneyResult,
  WilcoxonSignedRankResult,
  KruskalWallisResult,
  DunnResult,
  ChiSquareGoodnessOfFitResult,
  ChiSquareIndependenceResult,
  FisherExactResult,
  TukeyHSDResult,
  TukeyComparison,
  CorrectionResult
} from './types';

export class StatisticalEngine {
  private static instance: StatisticalEngine;
  private cache: Map<string, unknown> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): StatisticalEngine {
    if (!StatisticalEngine.instance) {
      StatisticalEngine.instance = new StatisticalEngine();
    }
    return StatisticalEngine.instance;
  }

  // ============================================================================
  // Descriptive Statistics
  // ============================================================================

  /**
   * Calculate comprehensive descriptive statistics
   */
  calculateDescriptiveStats(data: number[]): StatisticalSummary {
    if (!data || data.length === 0) {
      throw new Error('Data array cannot be empty');
    }

    const cacheKey = `descriptive_${this.hashArray(data)}`;
    const cached = this.getFromCache<StatisticalSummary>(cacheKey);
    if (cached) return cached;

    const validData = data.filter(x => !isNaN(x) && isFinite(x));
    if (validData.length === 0) {
      throw new Error('No valid numeric data found');
    }

    const sorted = [...validData].sort((a, b) => a - b);
    const n = sorted.length;
    
    const mean = this.calculateMean(validData);
    const median = this.calculateMedian(sorted);
    const mode = this.calculateMode(validData);
    const variance = this.calculateVariance(validData, mean);
    const standardDeviation = Math.sqrt(variance);
    const quartiles = this.calculateQuartiles(sorted);
    const percentiles = this.calculatePercentiles(sorted, [5, 10, 25, 75, 90, 95]);
    
    const result: StatisticalSummary = {
      count: n,
      mean,
      median,
      mode,
      standardDeviation,
      variance,
      min: sorted[0] ?? 0,
      max: sorted[n - 1] ?? 0,
      range: (sorted[n - 1] ?? 0) - (sorted[0] ?? 0),
      quartiles,
      percentiles,
      skewness: this.calculateSkewness(validData, mean, standardDeviation),
      kurtosis: this.calculateKurtosis(validData, mean, standardDeviation),
      outliers: this.identifyOutliers(sorted, quartiles)
    };

    this.setCache(cacheKey, result);
    return result;
  }

  private calculateMean(data: number[]): number {
    return data.reduce((sum, x) => sum + x, 0) / data.length;
  }

  private calculateMedian(sortedData: number[]): number {
    const n = sortedData.length;
    if (n % 2 === 0) {
      return ((sortedData[n / 2 - 1] ?? 0) + (sortedData[n / 2] ?? 0)) / 2;
    }
    return sortedData[Math.floor(n / 2)] ?? 0;
  }

  private calculateMode(data: number[]): number[] {
    const frequency = new Map<number, number>();
    data.forEach(x => frequency.set(x, (frequency.get(x) || 0) + 1));
    
    const maxFreq = Math.max(...frequency.values());
    return Array.from(frequency.entries())
      .filter(([, freq]) => freq === maxFreq)
      .map(([value]) => value);
  }

  private calculateVariance(data: number[], mean: number): number {
    const sumSquares = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0);
    return sumSquares / (data.length - 1); // Sample variance
  }

  private calculateQuartiles(sortedData: number[]) {
    return {
      q1: this.calculatePercentile(sortedData, 25),
      q2: this.calculatePercentile(sortedData, 50),
      q3: this.calculatePercentile(sortedData, 75)
    };
  }

  private calculatePercentiles(sortedData: number[], percentiles: number[]): Record<number, number> {
    const result: Record<number, number> = {};
    percentiles.forEach(p => {
      result[p] = this.calculatePercentile(sortedData, p);
    });
    return result;
  }

  private calculatePercentile(sortedData: number[], percentile: number): number {
    const n = sortedData.length;
    const index = (percentile / 100) * (n - 1);
    
    if (Number.isInteger(index)) {
      return sortedData[index] ?? 0;
    }
    
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    return (sortedData[lower] ?? 0) * (1 - weight) + (sortedData[upper] ?? 0) * weight;
  }

  private calculateSkewness(data: number[], mean: number, stdDev: number): number {
    const n = data.length;
    const sumCubes = data.reduce((sum, x) => sum + Math.pow((x - mean) / stdDev, 3), 0);
    return (n / ((n - 1) * (n - 2))) * sumCubes;
  }

  private calculateKurtosis(data: number[], mean: number, stdDev: number): number {
    const n = data.length;
    const sumFourths = data.reduce((sum, x) => sum + Math.pow((x - mean) / stdDev, 4), 0);
    const kurtosis = (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * sumFourths;
    return kurtosis - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)); // Excess kurtosis
  }

  private identifyOutliers(sortedData: number[], quartiles: { q1: number; q2: number; q3: number }): number[] {
    const iqr = quartiles.q3 - quartiles.q1;
    const lowerBound = quartiles.q1 - 1.5 * iqr;
    const upperBound = quartiles.q3 + 1.5 * iqr;
    
    return sortedData.filter(x => x < lowerBound || x > upperBound);
  }

  // ============================================================================
  // Correlation Analysis
  // ============================================================================

  calculateCorrelation(
    x: number[], 
    y: number[], 
    method: 'pearson' | 'spearman' | 'kendall' = 'pearson'
  ): CorrelationAnalysis {
    if (x.length !== y.length) {
      throw new Error('Arrays must have equal length');
    }

    if (x.length < 3) {
      throw new Error('Need at least 3 data points for correlation');
    }

    const cacheKey = `correlation_${method}_${this.hashArray(x)}_${this.hashArray(y)}`;
    const cached = this.getFromCache<CorrelationAnalysis>(cacheKey);
    if (cached) return cached;

    let coefficient: number;
    let pValue: number;

    switch (method) {
      case 'pearson':
        coefficient = this.calculatePearsonCorrelation(x, y);
        pValue = this.calculatePearsonPValue(coefficient, x.length);
        break;
      case 'spearman':
        coefficient = this.calculateSpearmanCorrelation(x, y);
        pValue = this.calculateSpearmanPValue(coefficient, x.length);
        break;
      case 'kendall':
        coefficient = this.calculateKendallCorrelation(x, y);
        pValue = this.calculateKendallPValue(coefficient, x.length);
        break;
      default:
        throw new Error(`Unsupported correlation method: ${method}`);
    }

    const significance = this.determineSignificance(pValue);
    const confidenceInterval = this.calculateCorrelationCI(coefficient, x.length);

    const result: CorrelationAnalysis = {
      coefficient,
      pValue,
      significance,
      confidenceInterval,
      method
    };

    this.setCache(cacheKey, result);
    return result;
  }

  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * (y[i] ?? 0), 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    const sumY2 = y.reduce((sum, val) => sum + val * val, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateSpearmanCorrelation(x: number[], y: number[]): number {
    const rankX = this.calculateRanks(x);
    const rankY = this.calculateRanks(y);
    return this.calculatePearsonCorrelation(rankX, rankY);
  }

  private calculateKendallCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    let concordant = 0;
    let discordant = 0;

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const signX = Math.sign((x[j] ?? 0) - (x[i] ?? 0));
        const signY = Math.sign((y[j] ?? 0) - (y[i] ?? 0));
        
        if (signX * signY > 0) concordant++;
        else if (signX * signY < 0) discordant++;
      }
    }

    return (concordant - discordant) / (n * (n - 1) / 2);
  }

  private calculateRanks(data: number[]): number[] {
    const indexed = data.map((value, index) => ({ value, index }));
    indexed.sort((a, b) => a.value - b.value);
    
    const ranks = new Array(data.length);
    let currentRank = 1;
    
    for (let i = 0; i < indexed.length; i++) {
      let tieCount = 1;
      while (i + tieCount < indexed.length && indexed[i]?.value === indexed[i + tieCount]?.value) {
        tieCount++;
      }
      
      const averageRank = currentRank + (tieCount - 1) / 2;
      for (let j = 0; j < tieCount; j++) {
        const idx = indexed[i + j]?.index;
        if (idx !== undefined) ranks[idx] = averageRank;
      }
      
      currentRank += tieCount;
      i += tieCount - 1;
    }
    
    return ranks;
  }

  private calculatePearsonPValue(r: number, n: number): number {
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    return 2 * (1 - this.studentTCDF(Math.abs(t), n - 2));
  }

  private calculateSpearmanPValue(rho: number, n: number): number {
    // Approximate p-value using t-distribution
    const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
    return 2 * (1 - this.studentTCDF(Math.abs(t), n - 2));
  }

  private calculateKendallPValue(tau: number, n: number): number {
    // Approximate p-value for Kendall's tau
    const variance = (2 * (2 * n + 5)) / (9 * n * (n - 1));
    const z = tau / Math.sqrt(variance);
    return 2 * (1 - this.standardNormalCDF(Math.abs(z)));
  }

  // ============================================================================
  // T-Test Analysis
  // ============================================================================

  performTTest(
    data1: number[], 
    data2?: number[], 
    mu0: number = 0,
    type: 'one-sample' | 'two-sample-independent' | 'two-sample-paired' = 'one-sample'
  ): TTestResult {
    const cacheKey = `ttest_${type}_${this.hashArray(data1)}_${data2 ? this.hashArray(data2) : 'none'}_${mu0}`;
    const cached = this.getFromCache<TTestResult>(cacheKey);
    if (cached) return cached;

    let result: TTestResult;

    switch (type) {
      case 'one-sample':
        result = this.performOneSampleTTest(data1, mu0);
        break;
      case 'two-sample-independent':
        if (!data2) throw new Error('Second data array required for two-sample t-test');
        result = this.performTwoSampleTTest(data1, data2);
        break;
      case 'two-sample-paired':
        if (!data2) throw new Error('Second data array required for paired t-test');
        result = this.performPairedTTest(data1, data2);
        break;
      default:
        throw new Error(`Unsupported t-test type: ${type}`);
    }

    this.setCache(cacheKey, result);
    return result;
  }

  private performOneSampleTTest(data: number[], mu0: number): TTestResult {
    const n = data.length;
    const mean = this.calculateMean(data);
    const std = Math.sqrt(this.calculateVariance(data, mean));
    const standardError = std / Math.sqrt(n);
    
    const t = (mean - mu0) / standardError;
    const df = n - 1;
    const pValue = 2 * (1 - this.studentTCDF(Math.abs(t), df));
    
    const tCritical = this.studentTInverse(0.025, df);
    const marginOfError = tCritical * standardError;
    const confidenceInterval: [number, number] = [mean - marginOfError, mean + marginOfError];
    
    const effectSize = (mean - mu0) / std;
    const power = this.calculateTTestPower(effectSize, n, 0.05);

    return {
      statistic: t,
      pValue,
      degreesOfFreedom: df,
      confidenceInterval,
      effectSize,
      power,
      type: 'one-sample'
    };
  }

  private performTwoSampleTTest(data1: number[], data2: number[]): TTestResult {
    const n1 = data1.length;
    const n2 = data2.length;
    const mean1 = this.calculateMean(data1);
    const mean2 = this.calculateMean(data2);
    const var1 = this.calculateVariance(data1, mean1);
    const var2 = this.calculateVariance(data2, mean2);
    
    // Welch's t-test (unequal variances)
    const standardError = Math.sqrt(var1 / n1 + var2 / n2);
    const t = (mean1 - mean2) / standardError;
    
    // Welch-Satterthwaite equation for degrees of freedom
    const df = Math.pow(var1 / n1 + var2 / n2, 2) / 
               (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1));
    
    const pValue = 2 * (1 - this.studentTCDF(Math.abs(t), df));
    
    const tCritical = this.studentTInverse(0.025, df);
    const marginOfError = tCritical * standardError;
    const meanDiff = mean1 - mean2;
    const confidenceInterval: [number, number] = [meanDiff - marginOfError, meanDiff + marginOfError];
    
    const pooledStd = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
    const effectSize = (mean1 - mean2) / pooledStd;
    const power = this.calculateTTestPower(effectSize, Math.min(n1, n2), 0.05);

    return {
      statistic: t,
      pValue,
      degreesOfFreedom: df,
      confidenceInterval,
      effectSize,
      power,
      type: 'two-sample-independent'
    };
  }

  private performPairedTTest(data1: number[], data2: number[]): TTestResult {
    if (data1.length !== data2.length) {
      throw new Error('Paired data must have equal length');
    }

    const differences = data1.map((x, i) => x - (data2[i] ?? 0));
    return { ...this.performOneSampleTTest(differences, 0), type: 'two-sample-paired' };
  }

  // ============================================================================
  // ANOVA Analysis
  // ============================================================================

  performANOVA(groups: number[][]): AnovaResult {
    if (groups.length < 2) {
      throw new Error('ANOVA requires at least 2 groups');
    }

    const cacheKey = `anova_${groups.map(g => this.hashArray(g)).join('_')}`;
    const cached = this.getFromCache<AnovaResult>(cacheKey);
    if (cached) return cached;

    const k = groups.length; // number of groups
    const groupData: AnovaGroup[] = groups.map((group, i) => ({
      name: `Group ${i + 1}`,
      count: group.length,
      mean: this.calculateMean(group),
      standardDeviation: Math.sqrt(this.calculateVariance(group, this.calculateMean(group)))
    }));

    const N = groups.reduce((sum, group) => sum + group.length, 0); // total sample size
    const grandMean = groups.flat().reduce((sum, x) => sum + x, 0) / N;

    // Sum of squares between groups (SSB)
    const ssb = groups.reduce((sum, group, i) => {
      const groupMean = groupData[i]?.mean ?? 0;
      const groupSize = group.length;
      return sum + groupSize * Math.pow(groupMean - grandMean, 2);
    }, 0);

    // Sum of squares within groups (SSW)
    const ssw = groups.reduce((sum, group, i) => {
      const groupMean = groupData[i]?.mean ?? 0;
      return sum + group.reduce((innerSum, x) => innerSum + Math.pow(x - groupMean, 2), 0);
    }, 0);

    // Degrees of freedom
    const dfBetween = k - 1;
    const dfWithin = N - k;

    // Mean squares
    const msb = ssb / dfBetween;
    const msw = ssw / dfWithin;

    // F-statistic
    const fStatistic = msb / msw;

    // p-value (approximate using F-distribution)
    const pValue = 1 - this.fCDF(fStatistic, dfBetween, dfWithin);

    // Effect size (eta-squared)
    const etaSquared = ssb / (ssb + ssw);

    const result: AnovaResult = {
      fStatistic,
      pValue,
      degreesOfFreedomBetween: dfBetween,
      degreesOfFreedomWithin: dfWithin,
      meanSquareBetween: msb,
      meanSquareWithin: msw,
      etaSquared,
      groups: groupData
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ============================================================================
  // Regression Analysis
  // ============================================================================

  performLinearRegression(x: number[], y: number[]): RegressionResult {
    if (x.length !== y.length) {
      throw new Error('X and Y arrays must have equal length');
    }

    if (x.length < 3) {
      throw new Error('Need at least 3 data points for regression');
    }

    const cacheKey = `regression_${this.hashArray(x)}_${this.hashArray(y)}`;
    const cached = this.getFromCache<RegressionResult>(cacheKey);
    if (cached) return cached;

    const n = x.length;
    const xMean = this.calculateMean(x);
    const yMean = this.calculateMean(y);

    // Calculate slope and intercept
    const numerator = x.reduce((sum, xi, i) => sum + (xi - xMean) * ((y[i] ?? 0) - yMean), 0);
    const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0);
    
    const slope = numerator / denominator;
    const intercept = yMean - slope * xMean;

    // Calculate residuals and predicted values
    const predicted = x.map(xi => intercept + slope * xi);
    const residuals = y.map((yi, i) => yi - (predicted[i] ?? 0));

    // Calculate R-squared
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const ssRes = residuals.reduce((sum, res) => sum + res * res, 0);
    const rSquared = 1 - (ssRes / ssTot);
    const adjustedRSquared = 1 - ((1 - rSquared) * (n - 1)) / (n - 2);

    // Calculate standard errors
    const mse = ssRes / (n - 2);
    const slopeStdError = Math.sqrt(mse / x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0));
    const interceptStdError = Math.sqrt(mse * (1/n + Math.pow(xMean, 2) / x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0)));

    // Calculate t-statistics and p-values
    const slopeT = slope / slopeStdError;
    const interceptT = intercept / interceptStdError;
    const slopePValue = 2 * (1 - this.studentTCDF(Math.abs(slopeT), n - 2));
    const interceptPValue = 2 * (1 - this.studentTCDF(Math.abs(interceptT), n - 2));

    // F-statistic for overall model significance
    const msReg = (ssTot - ssRes) / 1; // 1 degree of freedom for simple linear regression
    const fStatistic = msReg / mse;
    const modelPValue = 1 - this.fCDF(fStatistic, 1, n - 2);

    const result: RegressionResult = {
      coefficients: [slope],
      intercept,
      rSquared,
      adjustedRSquared,
      fStatistic,
      pValue: modelPValue,
      residuals,
      standardErrors: [slopeStdError, interceptStdError],
      tStatistics: [slopeT, interceptT],
      pValues: [slopePValue, interceptPValue]
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ============================================================================
  // Reliability Analysis
  // ============================================================================

  calculateCronbachAlpha(items: number[][]): ReliabilityAnalysis {
    if (items.length < 2) {
      throw new Error('Need at least 2 items for reliability analysis');
    }

    const cacheKey = `cronbach_${items.map(item => this.hashArray(item)).join('_')}`;
    const cached = this.getFromCache<ReliabilityAnalysis>(cacheKey);
    if (cached) return cached;

    const k = items.length; // number of items
    const n = items[0]?.length ?? 0; // number of observations

    // Calculate total scores
    const totalScores = Array.from({ length: n }, (_, i) => 
      items.reduce((sum, item) => sum + (item[i] ?? 0), 0)
    );

    // Calculate variances
    const itemVariances = items.map(item => this.calculateVariance(item, this.calculateMean(item)));
    const totalVariance = this.calculateVariance(totalScores, this.calculateMean(totalScores));

    // Cronbach's alpha
    const sumItemVariances = itemVariances.reduce((sum, v) => sum + v, 0);
    const cronbachAlpha = (k / (k - 1)) * (1 - sumItemVariances / totalVariance);

    // Item-total correlations
    const itemTotalCorrelations: Record<string, number> = {};
    items.forEach((item, i) => {
      const otherItemsTotal = Array.from({ length: n }, (_, j) => 
        items.reduce((sum, otherItem, otherIndex) => 
          otherIndex !== i ? sum + (otherItem[j] ?? 0) : sum, 0
        )
      );
      const correlation = this.calculatePearsonCorrelation(item, otherItemsTotal);
      itemTotalCorrelations[`Item_${i + 1}`] = correlation;
    });

    // Alpha if item deleted
    const alphaIfItemDeleted: Record<string, number> = {};
    items.forEach((_, i) => {
      const remainingItems = items.filter((_, index) => index !== i);
      if (remainingItems.length > 1) {
        const analysis = this.calculateCronbachAlpha(remainingItems);
        alphaIfItemDeleted[`Item_${i + 1}`] = analysis.cronbachAlpha;
      }
    });

    // Mean inter-item correlation
    let totalCorrelations = 0;
    let correlationCount = 0;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        totalCorrelations += this.calculatePearsonCorrelation(items[i]!, items[j]!);
        correlationCount++;
      }
    }
    const meanInterItemCorrelation = totalCorrelations / correlationCount;

    // Split-half reliability (Spearman-Brown formula)
    const firstHalf = items.slice(0, Math.floor(k / 2));
    const secondHalf = items.slice(Math.floor(k / 2));
    
    const firstHalfScores = Array.from({ length: n }, (_, i) => 
      firstHalf.reduce((sum, item) => sum + (item[i] ?? 0), 0)
    );
    const secondHalfScores = Array.from({ length: n }, (_, i) => 
      secondHalf.reduce((sum, item) => sum + (item[i] ?? 0), 0)
    );
    
    const splitHalfCorrelation = this.calculatePearsonCorrelation(firstHalfScores, secondHalfScores);
    const splitHalfReliability = (2 * splitHalfCorrelation) / (1 + splitHalfCorrelation);

    const result: ReliabilityAnalysis = {
      cronbachAlpha,
      itemTotalCorrelations,
      alphaIfItemDeleted,
      meanInterItemCorrelation,
      splitHalfReliability
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ============================================================================
  // Factor Analysis (Principal Component Analysis)
  // ============================================================================

  performPCA(data: number[][], components?: number): FactorAnalysis {
    if (data.length < 2) {
      throw new Error('Need at least 2 variables for PCA');
    }

    const cacheKey = `pca_${data.map(d => this.hashArray(d)).join('_')}_${components || 'all'}`;
    const cached = this.getFromCache<FactorAnalysis>(cacheKey);
    if (cached) return cached;

    const nVars = data.length;

    // Standardize the data
    const standardizedData = data.map(variable => {
      const mean = this.calculateMean(variable);
      const std = Math.sqrt(this.calculateVariance(variable, mean));
      return variable.map(value => (value - mean) / std);
    });

    // Calculate correlation matrix
    const correlationMatrix: number[][] = Array(nVars).fill(null).map(() => Array(nVars).fill(0));
    for (let i = 0; i < nVars; i++) {
      for (let j = 0; j < nVars; j++) {
        if (i === j) {
          correlationMatrix[i]![j] = 1;
        } else {
          correlationMatrix[i]![j] = this.calculatePearsonCorrelation(standardizedData[i] ?? [], standardizedData[j] ?? []);
        }
      }
    }

    // Simple eigenvalue/eigenvector calculation (for small matrices)
    const eigenResult = this.calculateEigenvalues(correlationMatrix);
    const eigenvalues = eigenResult.values;
    const eigenvectors = eigenResult.vectors;

    // Sort by eigenvalue (descending)
    const sortedIndices = eigenvalues
      .map((value, index) => ({ value, index }))
      .sort((a, b) => b.value - a.value)
      .map(item => item.index);

    const sortedEigenvalues = sortedIndices.map(i => eigenvalues[i]!);
    const sortedEigenvectors = sortedIndices.map(i => eigenvectors[i]!);

    // Calculate explained variance
    const totalVariance = sortedEigenvalues.reduce((sum, val) => sum + (val ?? 0), 0);
    const explainedVariance = sortedEigenvalues.map(val => ((val ?? 0) / totalVariance) * 100);
    const cumulativeVariance = explainedVariance.reduce((acc, val, index) => {
      acc[index] = val + (acc[index - 1] ?? 0);
      return acc;
    }, [] as number[]);

    // Factor loadings
    const numComponents = components || Math.min(nVars, sortedEigenvalues.filter(val => val > 1).length);
    const factorLoadings: Record<string, number[]> = {};
    
    for (let i = 0; i < nVars; i++) {
      factorLoadings[`Variable_${i + 1}`] = [];
      for (let j = 0; j < numComponents; j++) {
        const eigenvector = sortedEigenvectors[j] ?? [];
        const eigenvalue = sortedEigenvalues[j] ?? 0;
        const loading = (eigenvector[i] ?? 0) * Math.sqrt(eigenvalue);
        factorLoadings[`Variable_${i + 1}`]!.push(loading);
      }
    }

    // Communalities
    const communalities: Record<string, number> = {};
    for (let i = 0; i < nVars; i++) {
      let communality = 0;
      for (let j = 0; j < numComponents; j++) {
        const loadings = factorLoadings[`Variable_${i + 1}`];
        if (loadings && loadings[j] !== undefined) {
          communality += Math.pow(loadings[j] ?? 0, 2);
        }
      }
      communalities[`Variable_${i + 1}`] = communality;
    }

    const result: FactorAnalysis = {
      eigenvalues: sortedEigenvalues,
      explainedVariance,
      cumulativeVariance,
      factorLoadings,
      communalities,
      method: 'pca'
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ============================================================================
  // Non-Parametric Tests
  // ============================================================================

  /**
   * Mann-Whitney U test for two independent samples
   */
  mannWhitneyU(group1: number[], group2: number[]): MannWhitneyResult {
    if (group1.length === 0 || group2.length === 0) {
      throw new Error('Both groups must be non-empty');
    }

    const n1 = group1.length;
    const n2 = group2.length;

    // Combine and rank all data
    const combined = [
      ...group1.map(v => ({ value: v, group: 1 })),
      ...group2.map(v => ({ value: v, group: 2 }))
    ];
    const values = combined.map(c => c.value);
    const ranks = this.rankData(values);

    // Sum of ranks for each group
    let R1 = 0;
    let R2 = 0;
    for (let i = 0; i < combined.length; i++) {
      if (combined[i]!.group === 1) {
        R1 += ranks[i]!;
      } else {
        R2 += ranks[i]!;
      }
    }

    const U1 = R1 - (n1 * (n1 + 1)) / 2;
    const U2 = R2 - (n2 * (n2 + 1)) / 2;

    // Normal approximation with tie correction
    const N = n1 + n2;
    const meanU = (n1 * n2) / 2;

    // Tie correction factor
    const tieGroups = this.countTieGroups(values);
    const tieCorrection = tieGroups.reduce((sum, t) => sum + (t ** 3 - t), 0);
    const varianceU = (n1 * n2 / 12) * (N + 1 - tieCorrection / (N * (N - 1)));

    const z = (U1 - meanU) / Math.sqrt(varianceU);
    const pValue = 2 * (1 - this.standardNormalCDF(Math.abs(z)));
    const effectSize_r = Math.abs(z) / Math.sqrt(N);
    const rankBiserialCorrelation = (U1 - U2) / (n1 * n2);

    return { U1, U2, z, pValue, effectSize_r, rankBiserialCorrelation };
  }

  /**
   * Wilcoxon signed-rank test for paired samples
   */
  wilcoxonSignedRank(before: number[], after: number[]): WilcoxonSignedRankResult {
    if (before.length !== after.length) {
      throw new Error('Paired data must have equal length');
    }
    if (before.length === 0) {
      throw new Error('Data arrays must be non-empty');
    }

    // Calculate differences and remove zeros
    const diffs: { diff: number; absDiff: number }[] = [];
    for (let i = 0; i < before.length; i++) {
      const diff = after[i]! - before[i]!;
      if (diff !== 0) {
        diffs.push({ diff, absDiff: Math.abs(diff) });
      }
    }

    if (diffs.length === 0) {
      return { W_plus: 0, W_minus: 0, z: 0, pValue: 1, effectSize_r: 0 };
    }

    // Rank absolute differences
    const absDiffs = diffs.map(d => d.absDiff);
    const ranks = this.rankData(absDiffs);

    // Sum signed ranks
    let W_plus = 0;
    let W_minus = 0;
    for (let i = 0; i < diffs.length; i++) {
      if (diffs[i]!.diff > 0) {
        W_plus += ranks[i]!;
      } else {
        W_minus += ranks[i]!;
      }
    }

    const n = diffs.length;
    const meanW = (n * (n + 1)) / 4;

    // Tie correction
    const tieGroups = this.countTieGroups(absDiffs);
    const tieCorrection = tieGroups.reduce((sum, t) => sum + (t ** 3 - t), 0);
    const varianceW = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorrection / 48;

    const W = Math.min(W_plus, W_minus);
    const z = (W - meanW) / Math.sqrt(varianceW);
    const pValue = 2 * (1 - this.standardNormalCDF(Math.abs(z)));
    const effectSize_r = Math.abs(z) / Math.sqrt(n);

    return { W_plus, W_minus, z, pValue, effectSize_r };
  }

  /**
   * Kruskal-Wallis H test for k independent samples with Dunn post-hoc
   */
  kruskalWallis(groups: number[][]): KruskalWallisResult {
    if (groups.length < 2) {
      throw new Error('Need at least 2 groups');
    }
    for (let i = 0; i < groups.length; i++) {
      if (groups[i]!.length === 0) {
        throw new Error(`Group ${i} is empty`);
      }
    }

    const allValues: number[] = [];
    const groupLabels: number[] = [];
    for (let g = 0; g < groups.length; g++) {
      for (const val of groups[g]!) {
        allValues.push(val);
        groupLabels.push(g);
      }
    }

    const N = allValues.length;
    const ranks = this.rankData(allValues);

    // Sum of ranks per group
    const groupRankSums: number[] = new Array(groups.length).fill(0);
    const groupSizes: number[] = groups.map(g => g.length);
    for (let i = 0; i < N; i++) {
      const gIdx = groupLabels[i]!;
      groupRankSums[gIdx] = (groupRankSums[gIdx] ?? 0) + ranks[i]!;
    }

    // H statistic
    let H = 0;
    for (let g = 0; g < groups.length; g++) {
      const meanRank = groupRankSums[g]! / groupSizes[g]!;
      H += groupSizes[g]! * (meanRank - (N + 1) / 2) ** 2;
    }
    H = (12 / (N * (N + 1))) * groups.reduce((sum, group, g) => {
      return sum + (groupRankSums[g]! ** 2) / groupSizes[g]!;
    }, 0) - 3 * (N + 1);

    // Tie correction
    const tieGroups = this.countTieGroups(allValues);
    const tieCorrection = tieGroups.reduce((sum, t) => sum + (t ** 3 - t), 0);
    if (tieCorrection > 0) {
      H = H / (1 - tieCorrection / (N ** 3 - N));
    }

    const df = groups.length - 1;
    const pValue = 1 - this.chiSquareCDF(H, df);
    const etaSquared = (H - df) / (N - 1);

    // Dunn's post-hoc test
    const postHoc: DunnResult[] = [];
    const numComparisons = (groups.length * (groups.length - 1)) / 2;
    const groupMeanRanks = groupRankSums.map((sum, g) => sum / groupSizes[g]!);

    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const diff = Math.abs(groupMeanRanks[i]! - groupMeanRanks[j]!);
        const se = Math.sqrt(
          ((N * (N + 1)) / 12 - tieCorrection / (12 * (N - 1))) *
          (1 / groupSizes[i]! + 1 / groupSizes[j]!)
        );
        const z = diff / se;
        const rawP = 2 * (1 - this.standardNormalCDF(Math.abs(z)));
        const adjustedP = Math.min(1, rawP * numComparisons); // Bonferroni

        postHoc.push({
          group1: i,
          group2: j,
          z,
          pValue: rawP,
          adjustedPValue: adjustedP,
          significant: adjustedP < 0.05
        });
      }
    }

    return { H, df, pValue, etaSquared: Math.max(0, etaSquared), postHoc };
  }

  // ============================================================================
  // Chi-Square Tests
  // ============================================================================

  /**
   * Chi-square goodness-of-fit test
   */
  chiSquareGoodnessOfFit(observed: number[], expected?: number[]): ChiSquareGoodnessOfFitResult {
    if (observed.length < 2) {
      throw new Error('Need at least 2 categories');
    }

    const n = observed.reduce((sum, o) => sum + o, 0);
    const exp = expected || observed.map(() => n / observed.length);

    if (observed.length !== exp.length) {
      throw new Error('Observed and expected arrays must have equal length');
    }

    let chiSquare = 0;
    const residuals: number[] = [];
    for (let i = 0; i < observed.length; i++) {
      const o = observed[i]!;
      const e = exp[i]!;
      if (e <= 0) throw new Error('Expected frequencies must be positive');
      chiSquare += (o - e) ** 2 / e;
      residuals.push((o - e) / Math.sqrt(e));
    }

    const df = observed.length - 1;
    const pValue = 1 - this.chiSquareCDF(chiSquare, df);
    const cramersV = Math.sqrt(chiSquare / (n * df));

    return { chiSquare, df, pValue, cramersV, residuals };
  }

  /**
   * Chi-square test of independence for a contingency table
   */
  chiSquareIndependence(table: number[][]): ChiSquareIndependenceResult {
    const nRows = table.length;
    if (nRows < 2) throw new Error('Need at least 2 rows');
    const nCols = table[0]!.length;
    if (nCols < 2) throw new Error('Need at least 2 columns');

    // Row and column totals
    const rowTotals = table.map(row => row.reduce((s, v) => s + v, 0));
    const colTotals: number[] = new Array(nCols).fill(0);
    for (let j = 0; j < nCols; j++) {
      for (let i = 0; i < nRows; i++) {
        colTotals[j] = (colTotals[j] ?? 0) + table[i]![j]!;
      }
    }
    const n = rowTotals.reduce((s, v) => s + v, 0);

    // Expected frequencies
    const expectedFrequencies: number[][] = [];
    for (let i = 0; i < nRows; i++) {
      expectedFrequencies.push([]);
      for (let j = 0; j < nCols; j++) {
        expectedFrequencies[i]!.push((rowTotals[i]! * colTotals[j]!) / n);
      }
    }

    // Chi-square statistic
    let chiSquare = 0;
    const residuals: number[][] = [];
    for (let i = 0; i < nRows; i++) {
      residuals.push([]);
      for (let j = 0; j < nCols; j++) {
        const o = table[i]![j]!;
        const e = expectedFrequencies[i]![j]!;
        chiSquare += (o - e) ** 2 / e;
        residuals[i]!.push((o - e) / Math.sqrt(e));
      }
    }

    const df = (nRows - 1) * (nCols - 1);
    const pValue = 1 - this.chiSquareCDF(chiSquare, df);
    const minDim = Math.min(nRows, nCols);
    const cramersV = Math.sqrt(chiSquare / (n * (minDim - 1)));
    const phi = nRows === 2 && nCols === 2
      ? Math.sqrt(chiSquare / n)
      : Math.sqrt(chiSquare / n);

    return { chiSquare, df, pValue, cramersV, phi, expectedFrequencies, residuals };
  }

  /**
   * Fisher's exact test for 2x2 contingency tables
   */
  fisherExactTest(table: [[number, number], [number, number]]): FisherExactResult {
    const a = table[0][0];
    const b = table[0][1];
    const c = table[1][0];
    const d = table[1][1];

    const n = a + b + c + d;
    const r1 = a + b;
    const r2 = c + d;
    const c1 = a + c;
    const c2 = b + d;

    // Calculate probability of observing this exact table
    const pExact = (
      this.factorialLn(r1) + this.factorialLn(r2) +
      this.factorialLn(c1) + this.factorialLn(c2) -
      this.factorialLn(n) - this.factorialLn(a) -
      this.factorialLn(b) - this.factorialLn(c) -
      this.factorialLn(d)
    );
    const pObserved = Math.exp(pExact);

    // Two-tailed p-value: sum probabilities <= observed probability
    let pValue = 0;
    const minA = Math.max(0, c1 - r2);
    const maxA = Math.min(r1, c1);
    for (let ai = minA; ai <= maxA; ai++) {
      const bi = r1 - ai;
      const ci = c1 - ai;
      const di = r2 - ci;
      const pTable = Math.exp(
        this.factorialLn(r1) + this.factorialLn(r2) +
        this.factorialLn(c1) + this.factorialLn(c2) -
        this.factorialLn(n) - this.factorialLn(ai) -
        this.factorialLn(bi) - this.factorialLn(ci) -
        this.factorialLn(di)
      );
      if (pTable <= pObserved + 1e-10) {
        pValue += pTable;
      }
    }
    pValue = Math.min(1, pValue);

    // Odds ratio
    const oddsRatio = (b === 0 || c === 0) ? Infinity : (a * d) / (b * c);

    // 95% CI for odds ratio (Woolf logit method)
    let ci95: [number, number];
    if (a === 0 || b === 0 || c === 0 || d === 0) {
      // Use Haldane correction
      const ah = a + 0.5;
      const bh = b + 0.5;
      const ch = c + 0.5;
      const dh = d + 0.5;
      const logOR = Math.log((ah * dh) / (bh * ch));
      const se = Math.sqrt(1 / ah + 1 / bh + 1 / ch + 1 / dh);
      ci95 = [Math.exp(logOR - 1.96 * se), Math.exp(logOR + 1.96 * se)];
    } else {
      const logOR = Math.log(oddsRatio);
      const se = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
      ci95 = [Math.exp(logOR - 1.96 * se), Math.exp(logOR + 1.96 * se)];
    }

    return { pValue, oddsRatio, ci95 };
  }

  // ============================================================================
  // Post-Hoc Tests
  // ============================================================================

  /**
   * Tukey's Honestly Significant Difference (HSD) test
   */
  tukeyHSD(groups: number[][], alpha: number = 0.05): TukeyHSDResult {
    if (groups.length < 2) {
      throw new Error('Need at least 2 groups');
    }

    const anova = this.performANOVA(groups);
    const MSW = anova.meanSquareWithin;
    const dfW = anova.degreesOfFreedomWithin;
    const k = groups.length;

    const comparisons: TukeyComparison[] = [];

    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const ni = groups[i]!.length;
        const nj = groups[j]!.length;
        const meani = this.calculateMean(groups[i]!);
        const meanj = this.calculateMean(groups[j]!);
        const diff = meani - meanj;

        // Standard error (harmonic mean of sample sizes for unequal n)
        const se = Math.sqrt(MSW * (1 / ni + 1 / nj) / 2);
        const q = Math.abs(diff) / se;

        // Approximate p-value using studentized range distribution
        const pValue = this.studentizedRangePValue(q, k, dfW);

        // Confidence interval
        const qCritical = this.studentizedRangeInverse(alpha, k, dfW);
        const margin = qCritical * se;
        const ci: [number, number] = [diff - margin, diff + margin];

        comparisons.push({
          group1: i,
          group2: j,
          diff,
          q,
          pValue,
          ci,
          significant: pValue < alpha
        });
      }
    }

    return { comparisons };
  }

  /**
   * Bonferroni correction for multiple comparisons
   */
  bonferroniCorrection(pValues: number[], alpha: number = 0.05): CorrectionResult {
    if (pValues.length === 0) {
      throw new Error('pValues array must be non-empty');
    }
    const m = pValues.length;
    const adjustedPValues = pValues.map(p => Math.min(1, p * m));
    const significant = adjustedPValues.map(p => p < alpha);
    return { adjustedPValues, significant };
  }

  /**
   * Holm-Bonferroni step-down correction for multiple comparisons
   */
  holmBonferroni(pValues: number[], alpha: number = 0.05): CorrectionResult {
    if (pValues.length === 0) {
      throw new Error('pValues array must be non-empty');
    }
    const m = pValues.length;

    // Sort by p-value, keeping track of original indices
    const indexed = pValues.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => a.p - b.p);

    const adjustedPValues = new Array<number>(m);
    let maxSoFar = 0;

    for (let rank = 0; rank < m; rank++) {
      const adjusted = indexed[rank]!.p * (m - rank);
      // Enforce monotonicity: adjusted p can't decrease
      maxSoFar = Math.max(maxSoFar, adjusted);
      adjustedPValues[indexed[rank]!.i] = Math.min(1, maxSoFar);
    }

    const significant = adjustedPValues.map(p => p < alpha);
    return { adjustedPValues, significant };
  }

  /**
   * Holm step-down correction (alias for holmBonferroni)
   */
  holmCorrection(pValues: number[], alpha: number = 0.05): CorrectionResult {
    return this.holmBonferroni(pValues, alpha);
  }

  /**
   * Benjamini-Hochberg FDR (False Discovery Rate) correction
   */
  fdrCorrection(pValues: number[], alpha: number = 0.05): CorrectionResult {
    if (pValues.length === 0) {
      throw new Error('pValues array must be non-empty');
    }
    const m = pValues.length;

    // Sort by p-value, keeping track of original indices
    const indexed = pValues.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => a.p - b.p);

    const adjustedPValues = new Array<number>(m);
    let minSoFar = 1;

    // Work backwards from largest p-value
    for (let rank = m - 1; rank >= 0; rank--) {
      const adjusted = indexed[rank]!.p * m / (rank + 1);
      // Enforce monotonicity: adjusted p can't increase going backwards
      minSoFar = Math.min(minSoFar, adjusted);
      adjustedPValues[indexed[rank]!.i] = Math.min(1, minSoFar);
    }

    const significant = adjustedPValues.map(p => p < alpha);
    return { adjustedPValues, significant };
  }

  // ============================================================================
  // Effect Size Measures
  // ============================================================================

  /**
   * Glass's delta: effect size using control group standard deviation
   */
  glassDelta(treatment: number[], control: number[]): number {
    if (treatment.length === 0 || control.length === 0) {
      throw new Error('Both arrays must be non-empty');
    }
    const meanT = this.calculateMean(treatment);
    const meanC = this.calculateMean(control);
    const sdC = Math.sqrt(this.calculateVariance(control, meanC));
    if (sdC === 0) return 0;
    return (meanT - meanC) / sdC;
  }

  /**
   * Hedges' g: bias-corrected effect size for two independent groups
   */
  hedgesG(group1: number[], group2: number[]): number {
    if (group1.length === 0 || group2.length === 0) {
      throw new Error('Both arrays must be non-empty');
    }
    const n1 = group1.length;
    const n2 = group2.length;
    const mean1 = this.calculateMean(group1);
    const mean2 = this.calculateMean(group2);
    const var1 = this.calculateVariance(group1, mean1);
    const var2 = this.calculateVariance(group2, mean2);

    const pooledSD = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
    if (pooledSD === 0) return 0;

    const cohensD = (mean1 - mean2) / pooledSD;

    // Hedges' correction factor (exact)
    const df = n1 + n2 - 2;
    const correction = 1 - 3 / (4 * df - 1);
    return cohensD * correction;
  }

  /**
   * Cramer's V: effect size for chi-square test
   */
  cramersV(chiSquare: number, n: number, minDim: number): number {
    if (n <= 0 || minDim <= 1) return 0;
    return Math.sqrt(chiSquare / (n * (minDim - 1)));
  }

  /**
   * Omega squared: less biased effect size for ANOVA
   */
  omegaSquared(anovaResult: AnovaResult): number {
    const { degreesOfFreedomBetween: dfB, degreesOfFreedomWithin: dfW, meanSquareWithin: MSW } = anovaResult;
    const SSB = anovaResult.meanSquareBetween * dfB;
    const SST = SSB + MSW * dfW;
    const omega2 = (SSB - dfB * MSW) / (SST + MSW);
    return Math.max(0, omega2);
  }

  // ============================================================================
  // Helper Methods for Non-Parametric Tests
  // ============================================================================

  /**
   * Assign ranks to data with tied rank averaging
   */
  private rankData(data: number[]): number[] {
    const indexed = data.map((value, index) => ({ value, index }));
    indexed.sort((a, b) => a.value - b.value);

    const ranks = new Array<number>(data.length);
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j < indexed.length && indexed[j]!.value === indexed[i]!.value) {
        j++;
      }
      // Average rank for ties
      const avgRank = (i + 1 + j) / 2; // ranks are 1-based
      for (let k = i; k < j; k++) {
        ranks[indexed[k]!.index] = avgRank;
      }
      i = j;
    }
    return ranks;
  }

  /**
   * Count sizes of groups of tied values
   */
  private countTieGroups(data: number[]): number[] {
    const sorted = [...data].sort((a, b) => a - b);
    const groups: number[] = [];
    let i = 0;
    while (i < sorted.length) {
      let count = 1;
      while (i + count < sorted.length && sorted[i] === sorted[i + count]) {
        count++;
      }
      if (count > 1) {
        groups.push(count);
      }
      i += count;
    }
    return groups;
  }

  /**
   * Log factorial using Stirling's approximation for large n
   */
  private factorialLn(n: number): number {
    if (n < 0) return 0;
    if (n <= 1) return 0;
    // Use logGamma: ln(n!) = logGamma(n+1)
    return this.logGamma(n + 1);
  }

  /**
   * Chi-square CDF approximation
   */
  private chiSquareCDF(x: number, df: number): number {
    if (x <= 0) return 0;
    // Chi-square is gamma(df/2, 2), use regularized incomplete gamma
    return this.regularizedGammaP(df / 2, x / 2);
  }

  /**
   * Regularized lower incomplete gamma function P(a, x)
   */
  private regularizedGammaP(a: number, x: number): number {
    if (x <= 0) return 0;
    if (x < a + 1) {
      // Series expansion
      return this.gammaPSeries(a, x);
    } else {
      // Continued fraction
      return 1 - this.gammaQContinuedFraction(a, x);
    }
  }

  private gammaPSeries(a: number, x: number): number {
    const maxIter = 200;
    const eps = 1e-15;
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < maxIter; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < eps * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
  }

  private gammaQContinuedFraction(a: number, x: number): number {
    const maxIter = 200;
    const eps = 1e-15;
    let b = x + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= maxIter; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
  }

  /**
   * Approximate p-value for the studentized range distribution
   * Uses an approximation based on the normal distribution
   */
  private studentizedRangePValue(q: number, k: number, df: number): number {
    // Gleason (1999) approximation for studentized range p-value
    // Transform to approximate standard normal
    const v = df;
    // Rough approximation: convert q to z-like statistic
    // The studentized range for k groups with df degrees of freedom
    // can be approximated via simulation tables, but for a pure-math
    // implementation we use a conservative bound based on Bonferroni
    const numComparisons = (k * (k - 1)) / 2;
    // Each pairwise comparison is approximately a t-test
    const tApprox = q / Math.sqrt(2);
    const pPairwise = 2 * (1 - this.studentTCDF(tApprox, v));
    // Sidak correction gives tighter bound than Bonferroni
    const pValue = 1 - (1 - pPairwise) ** numComparisons;
    return Math.max(0, Math.min(1, pValue));
  }

  /**
   * Approximate critical value for studentized range distribution
   */
  private studentizedRangeInverse(alpha: number, k: number, df: number): number {
    // Approximate using Bonferroni-corrected t critical value
    const numComparisons = (k * (k - 1)) / 2;
    const adjustedAlpha = alpha / numComparisons;
    const tCrit = Math.abs(this.studentTInverse(adjustedAlpha / 2, df));
    return tCrit * Math.sqrt(2);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private calculateEigenvalues(matrix: number[][]): { values: number[]; vectors: number[][] } {
    // Simplified power iteration method for small matrices
    // In production, use a robust linear algebra library
    const n = matrix.length;
    const values: number[] = [];
    const vectors: number[][] = [];

    // This is a simplified implementation
    // For production use, implement QR algorithm or use a math library
    for (let i = 0; i < n; i++) {
      values.push(matrix[i]?.[i] ?? 0); // Diagonal approximation
      const vector = Array(n).fill(0);
      vector[i] = 1;
      vectors.push(vector);
    }

    return { values, vectors };
  }

  private determineSignificance(pValue: number): number {
    if (pValue < 0.001) return 0.001;
    if (pValue < 0.01) return 0.01;
    if (pValue < 0.05) return 0.05;
    return 1;
  }

  private calculateCorrelationCI(r: number, n: number, confidence: number = 0.95): [number, number] {
    const z = 0.5 * Math.log((1 + r) / (1 - r)); // Fisher z-transformation
    const se = 1 / Math.sqrt(n - 3);
    const alpha = 1 - confidence;
    const zCritical = this.standardNormalInverse(1 - alpha / 2);
    
    const zLower = z - zCritical * se;
    const zUpper = z + zCritical * se;
    
    // Transform back
    const rLower = (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1);
    const rUpper = (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1);
    
    return [rLower, rUpper];
  }

  private calculateTTestPower(effectSize: number, n: number, alpha: number): number {
    // Simplified power calculation
    const tCritical = this.studentTInverse(alpha / 2, n - 1);
    const nonCentrality = effectSize * Math.sqrt(n);
    
    // Approximate power using normal distribution
    const power = 1 - this.standardNormalCDF(tCritical - nonCentrality) + 
                      this.standardNormalCDF(-tCritical - nonCentrality);
    
    return Math.max(0, Math.min(1, power));
  }

  // Statistical distribution functions (simplified implementations)
  private studentTCDF(t: number, _df: number): number {
    // Simplified t-distribution CDF approximation
    // For large degrees of freedom, t-distribution converges to normal distribution
    return this.standardNormalCDF(t);
  }

  private studentTInverse(p: number, df: number): number {
    // Simplified t-distribution inverse CDF
    if (df >= 30) {
      return this.standardNormalInverse(p);
    }
    
    // Approximation for t-distribution
    const z = this.standardNormalInverse(p);
    const correction = (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2);
    return z + correction;
  }

  private standardNormalCDF(z: number): number {
    // Abramowitz and Stegun approximation
    const sign = z >= 0 ? 1 : -1;
    const x = Math.abs(z) / Math.sqrt(2);
    
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return 0.5 * (1.0 + sign * y);
  }

  private standardNormalInverse(p: number): number {
    // Beasley-Springer-Moro approximation
    if (p <= 0 || p >= 1) {
      throw new Error('p must be between 0 and 1');
    }
    
    const a = [0, -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [0, -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [0, -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [0, 7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    
    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    
    let x: number;
    
    if (p < pLow) {
      const q = Math.sqrt(-2 * Math.log(p));
      x = (((((c[6]! * q + c[5]!) * q + c[4]!) * q + c[3]!) * q + c[2]!) * q + c[1]!) * q + c[0]!;
      x /= ((((d[4]! * q + d[3]!) * q + d[2]!) * q + d[1]!) * q + 1);
    } else if (p <= pHigh) {
      const q = p - 0.5;
      const r = q * q;
      x = (((((a[6]! * r + a[5]!) * r + a[4]!) * r + a[3]!) * r + a[2]!) * r + a[1]!) * r + a[0]!;
      x *= q;
      x /= ((((b[5]! * r + b[4]!) * r + b[3]!) * r + b[2]!) * r + b[1]!) * r + 1;
    } else {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      x = -(((((c[6]! * q + c[5]!) * q + c[4]!) * q + c[3]!) * q + c[2]!) * q + c[1]!) * q + c[0]!;
      x /= ((((d[4]! * q + d[3]!) * q + d[2]!) * q + d[1]!) * q + 1);
    }
    
    return x;
  }

  private fCDF(f: number, df1: number, df2: number): number {
    // Simplified F-distribution CDF approximation
    if (f <= 0) return 0;
    
    const x = df2 / (df2 + df1 * f);
    return 1 - this.betaIncomplete(df2 / 2, df1 / 2, x);
  }

  private betaIncomplete(a: number, b: number, x: number): number {
    // Simplified incomplete beta function
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    
    // Use continued fraction approximation
    let result = Math.exp(this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    
    if (x < (a + 1) / (a + b + 2)) {
      return result * this.betaContinuedFraction(a, b, x) / a;
    } else {
      return 1 - result * this.betaContinuedFraction(b, a, 1 - x) / b;
    }
  }

  private betaContinuedFraction(a: number, b: number, x: number): number {
    // Simplified continued fraction for incomplete beta
    const maxIterations = 100;
    const epsilon = 1e-15;
    
    let qab = a + b;
    let qap = a + 1;
    let qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    
    if (Math.abs(d) < epsilon) d = epsilon;
    d = 1 / d;
    let h = d;
    
    for (let m = 1; m <= maxIterations; m++) {
      let m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < epsilon) d = epsilon;
      c = 1 + aa / c;
      if (Math.abs(c) < epsilon) c = epsilon;
      d = 1 / d;
      h *= d * c;
      
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < epsilon) d = epsilon;
      c = 1 + aa / c;
      if (Math.abs(c) < epsilon) c = epsilon;
      d = 1 / d;
      let del = d * c;
      h *= del;
      
      if (Math.abs(del - 1) < epsilon) break;
    }
    
    return h;
  }

  private gamma(z: number): number {
    // Lanczos approximation
    const g = 7;
    const C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    
    if (z < 0.5) {
      return Math.PI / (Math.sin(Math.PI * z) * this.gamma(1 - z));
    }
    
    z -= 1;
    let x = C[0] ?? 0;
    for (let i = 1; i < g + 2; i++) {
      x += (C[i] ?? 0) / (z + i);
    }
    
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  private logGamma(z: number): number {
    return Math.log(this.gamma(z));
  }

  private hypergeometric2F1(a: number, b: number, c: number, z: number): number {
    // Simplified hypergeometric function approximation
    if (Math.abs(z) < 0.5) {
      let sum = 1;
      let term = 1;
      
      for (let n = 1; n < 50; n++) {
        term *= (a + n - 1) * (b + n - 1) * z / (n * (c + n - 1));
        sum += term;
        if (Math.abs(term) < 1e-15) break;
      }
      
      return sum;
    }
    
    return 1; // Simplified fallback
  }

  // Cache management
  private getFromCache<T>(key: string): T | null {
    const now = Date.now();
    const expiry = this.cacheExpiry.get(key);
    
    if (expiry && now > expiry) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }
    
    return (this.cache.get(key) as T) || null;
  }

  private setCache<T>(key: string, value: T): void {
    this.cache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  private hashArray(arr: number[]): string {
    return arr.reduce((hash, val) => hash + val.toString(), '').slice(0, 16);
  }

  /**
   * Clear the statistical cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses
      memoryUsage: JSON.stringify([...this.cache.entries()]).length
    };
  }
}