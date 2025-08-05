import type {
  Response,
  Variable,
  DescriptiveStats,
  CorrelationMatrix,
  TTestResult,
  AnovaResult,
  RegressionResult,
  OutlierReport,
  CronbachAlpha
} from '../types';

export class StatisticsEngine {
  // Calculate descriptive statistics
  calculateDescriptives(responses: Response[]): DescriptiveStats {
    const values = responses
      .map(r => parseFloat(r.value))
      .filter(v => !isNaN(v))
      .sort((a, b) => a - b);
    
    const n = values.length;
    if (n === 0) {
      return this.emptyStats();
    }
    
    // Basic stats
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const min = values[0];
    const max = values[n - 1];
    const range = max - min;
    
    // Median
    const median = n % 2 === 0
      ? (values[n / 2 - 1] + values[n / 2]) / 2
      : values[Math.floor(n / 2)];
    
    // Mode
    const frequency = new Map<number, number>();
    let maxFreq = 0;
    values.forEach(v => {
      const freq = (frequency.get(v) || 0) + 1;
      frequency.set(v, freq);
      maxFreq = Math.max(maxFreq, freq);
    });
    const modes = Array.from(frequency.entries())
      .filter(([_, freq]) => freq === maxFreq)
      .map(([val, _]) => val);
    const mode = modes.length === n ? NaN : modes.length === 1 ? modes[0] : modes;
    
    // Variance and standard deviation
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
    const std = Math.sqrt(variance);
    
    // Percentiles
    const percentile = (p: number) => {
      const index = (n - 1) * p;
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index % 1;
      return lower === upper ? values[lower] : values[lower] * (1 - weight) + values[upper] * weight;
    };
    
    // Skewness and kurtosis
    const standardized = values.map(v => (v - mean) / std);
    const skewness = standardized.reduce((sum, z) => sum + Math.pow(z, 3), 0) / n;
    const kurtosis = standardized.reduce((sum, z) => sum + Math.pow(z, 4), 0) / n - 3;
    
    // 95% Confidence interval for the mean
    const se = std / Math.sqrt(n);
    const tValue = this.getTValue(n - 1, 0.05); // 95% CI
    const marginOfError = tValue * se;
    
    return {
      n,
      mean,
      median,
      mode,
      std,
      variance,
      min,
      max,
      range,
      percentiles: {
        p25: percentile(0.25),
        p50: percentile(0.50),
        p75: percentile(0.75),
        p90: percentile(0.90),
        p95: percentile(0.95),
        p99: percentile(0.99)
      },
      skewness,
      kurtosis,
      ci95: [mean - marginOfError, mean + marginOfError]
    };
  }
  
  // Calculate correlation matrix
  calculateCorrelations(variables: Variable[], method: 'pearson' | 'spearman' | 'kendall' = 'pearson'): CorrelationMatrix {
    const n = variables.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    const pValues: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1; // Diagonal is always 1
      pValues[i][i] = 0;
      
      for (let j = i + 1; j < n; j++) {
        const result = this.calculateCorrelation(variables[i].values, variables[j].values, method);
        matrix[i][j] = matrix[j][i] = result.r;
        pValues[i][j] = pValues[j][i] = result.p;
      }
    }
    
    return {
      variables: variables.map(v => v.name),
      matrix,
      pValues,
      method
    };
  }
  
  // Perform independent samples t-test
  performTTest(group1: Response[], group2: Response[], alpha: number = 0.05): TTestResult {
    const values1 = group1.map(r => parseFloat(r.value)).filter(v => !isNaN(v));
    const values2 = group2.map(r => parseFloat(r.value)).filter(v => !isNaN(v));
    
    const n1 = values1.length;
    const n2 = values2.length;
    const df = n1 + n2 - 2;
    
    // Calculate means
    const mean1 = values1.reduce((a, b) => a + b, 0) / n1;
    const mean2 = values2.reduce((a, b) => a + b, 0) / n2;
    const meanDiff = mean1 - mean2;
    
    // Calculate pooled standard deviation
    const var1 = this.calculateVariance(values1, mean1);
    const var2 = this.calculateVariance(values2, mean2);
    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / df;
    const pooledStd = Math.sqrt(pooledVar);
    
    // Calculate t-statistic
    const se = pooledStd * Math.sqrt(1/n1 + 1/n2);
    const t = meanDiff / se;
    
    // Calculate p-value (two-tailed)
    const pValue = this.calculateTTestPValue(Math.abs(t), df);
    
    // Calculate confidence interval
    const tCrit = this.getTValue(df, alpha);
    const marginOfError = tCrit * se;
    const ci95: [number, number] = [meanDiff - marginOfError, meanDiff + marginOfError];
    
    // Calculate effect size (Cohen's d)
    const effectSize = meanDiff / pooledStd;
    
    return {
      t,
      df,
      pValue,
      ci95,
      mean1,
      mean2,
      meanDiff,
      pooledStd,
      effectSize,
      significant: pValue < alpha,
      alpha
    };
  }
  
  // Perform one-way ANOVA
  performAnova(groups: Record<string, Response[]>, alpha: number = 0.05): AnovaResult {
    const groupNames = Object.keys(groups);
    const k = groupNames.length; // Number of groups
    
    // Calculate group statistics
    const groupStats = groupNames.map(name => {
      const values = groups[name].map(r => parseFloat(r.value)).filter(v => !isNaN(v));
      const n = values.length;
      const mean = values.reduce((a, b) => a + b, 0) / n;
      return { name, values, n, mean };
    });
    
    // Calculate grand mean
    const allValues = groupStats.flatMap(g => g.values);
    const N = allValues.length;
    const grandMean = allValues.reduce((a, b) => a + b, 0) / N;
    
    // Calculate sum of squares
    const ssBetween = groupStats.reduce((sum, group) => {
      return sum + group.n * Math.pow(group.mean - grandMean, 2);
    }, 0);
    
    const ssWithin = groupStats.reduce((sum, group) => {
      return sum + group.values.reduce((s, v) => s + Math.pow(v - group.mean, 2), 0);
    }, 0);
    
    const ssTotal = allValues.reduce((sum, v) => sum + Math.pow(v - grandMean, 2), 0);
    
    // Calculate degrees of freedom
    const dfBetween = k - 1;
    const dfWithin = N - k;
    
    // Calculate mean squares
    const msBetween = ssBetween / dfBetween;
    const msWithin = ssWithin / dfWithin;
    
    // Calculate F-statistic
    const f = msBetween / msWithin;
    
    // Calculate p-value
    const pValue = this.calculateFTestPValue(f, dfBetween, dfWithin);
    
    // Calculate effect size (eta squared)
    const etaSquared = ssBetween / ssTotal;
    
    // Create group means object
    const groupMeans: Record<string, number> = {};
    groupStats.forEach(g => {
      groupMeans[g.name] = g.mean;
    });
    
    return {
      f,
      df: { between: dfBetween, within: dfWithin },
      pValue,
      groupMeans,
      mse: msWithin,
      etaSquared,
      significant: pValue < alpha,
      alpha
    };
  }
  
  // Perform linear regression
  performRegression(x: number[], y: number[]): RegressionResult {
    const n = x.length;
    
    // Calculate means
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    
    // Calculate sums for regression
    let ssXX = 0, ssYY = 0, ssXY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      ssXX += dx * dx;
      ssYY += dy * dy;
      ssXY += dx * dy;
    }
    
    // Calculate coefficients
    const slope = ssXY / ssXX;
    const intercept = meanY - slope * meanX;
    
    // Calculate R-squared
    const rSquared = Math.pow(ssXY, 2) / (ssXX * ssYY);
    
    // Calculate residuals and predictions
    const predictions: number[] = [];
    const residuals: number[] = [];
    let ssResidual = 0;
    
    for (let i = 0; i < n; i++) {
      const pred = intercept + slope * x[i];
      const resid = y[i] - pred;
      predictions.push(pred);
      residuals.push(resid);
      ssResidual += resid * resid;
    }
    
    // Calculate standard errors
    const residualStdError = Math.sqrt(ssResidual / (n - 2));
    const slopeStdError = residualStdError / Math.sqrt(ssXX);
    const interceptStdError = residualStdError * Math.sqrt(1/n + meanX*meanX/ssXX);
    
    // Calculate t-statistics and p-values
    const slopeT = slope / slopeStdError;
    const interceptT = intercept / interceptStdError;
    const df = n - 2;
    
    const slopePValue = this.calculateTTestPValue(Math.abs(slopeT), df);
    const interceptPValue = this.calculateTTestPValue(Math.abs(interceptT), df);
    
    // Calculate F-statistic
    const ssRegression = ssYY - ssResidual;
    const msRegression = ssRegression / 1; // 1 predictor
    const msResidual = ssResidual / df;
    const fStatistic = msRegression / msResidual;
    const fPValue = this.calculateFTestPValue(fStatistic, 1, df);
    
    // Calculate adjusted R-squared
    const adjustedRSquared = 1 - (1 - rSquared) * (n - 1) / df;
    
    return {
      coefficients: [
        {
          name: 'Intercept',
          value: intercept,
          stdError: interceptStdError,
          t: interceptT,
          pValue: interceptPValue
        },
        {
          name: 'Slope',
          value: slope,
          stdError: slopeStdError,
          t: slopeT,
          pValue: slopePValue
        }
      ],
      rSquared,
      adjustedRSquared,
      fStatistic,
      fPValue,
      residualStdError,
      predictions,
      residuals
    };
  }
  
  // Detect outliers using IQR method
  detectOutliers(responses: Response[], method: 'iqr' | 'zscore' | 'isolation' = 'iqr'): OutlierReport {
    const values = responses.map((r, i) => ({
      index: i,
      value: parseFloat(r.value),
      responseId: r.id
    })).filter(v => !isNaN(v.value));
    
    let outliers: OutlierReport['outliers'] = [];
    let threshold: number;
    
    switch (method) {
      case 'iqr': {
        const sorted = values.map(v => v.value).sort((a, b) => a - b);
        const q1 = this.percentile(sorted, 0.25);
        const q3 = this.percentile(sorted, 0.75);
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        threshold = 1.5;
        
        outliers = values
          .filter(v => v.value < lowerBound || v.value > upperBound)
          .map(v => ({
            responseId: v.responseId,
            value: v.value,
            score: v.value < lowerBound ? (lowerBound - v.value) / iqr : (v.value - upperBound) / iqr,
            reason: v.value < lowerBound ? 'Below Q1 - 1.5*IQR' : 'Above Q3 + 1.5*IQR'
          }));
        break;
      }
      
      case 'zscore': {
        const mean = values.reduce((sum, v) => sum + v.value, 0) / values.length;
        const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v.value - mean, 2), 0) / (values.length - 1));
        threshold = 3;
        
        outliers = values
          .map(v => ({
            ...v,
            zscore: Math.abs((v.value - mean) / std)
          }))
          .filter(v => v.zscore > threshold)
          .map(v => ({
            responseId: v.responseId,
            value: v.value,
            score: v.zscore,
            reason: `Z-score = ${v.zscore.toFixed(2)} > ${threshold}`
          }));
        break;
      }
      
      default:
        threshold = 0;
    }
    
    return {
      method,
      outliers,
      threshold,
      totalResponses: responses.length,
      outlierCount: outliers.length,
      outlierPercentage: (outliers.length / responses.length) * 100
    };
  }
  
  // Calculate Cronbach's Alpha for scale reliability
  calculateReliability(scale: Response[]): CronbachAlpha {
    // Group responses by participant and item
    const participantResponses = new Map<string, Map<string, number>>();
    
    scale.forEach(response => {
      const value = parseFloat(response.value);
      if (!isNaN(value)) {
        if (!participantResponses.has(response.participantId)) {
          participantResponses.set(response.participantId, new Map());
        }
        participantResponses.get(response.participantId)!.set(response.questionId, value);
      }
    });
    
    // Get unique items
    const items = Array.from(new Set(scale.map(r => r.questionId)));
    const k = items.length;
    
    // Create data matrix
    const dataMatrix: number[][] = [];
    participantResponses.forEach(responses => {
      if (responses.size === k) { // Only include complete responses
        const row = items.map(item => responses.get(item)!);
        dataMatrix.push(row);
      }
    });
    
    if (dataMatrix.length < 2 || k < 2) {
      return this.emptyReliability(items);
    }
    
    // Calculate item variances
    const itemVariances: number[] = [];
    for (let j = 0; j < k; j++) {
      const itemValues = dataMatrix.map(row => row[j]);
      const variance = this.calculateVariance(itemValues);
      itemVariances.push(variance);
    }
    
    // Calculate total scores and variance
    const totalScores = dataMatrix.map(row => row.reduce((a, b) => a + b, 0));
    const totalVariance = this.calculateVariance(totalScores);
    
    // Calculate Cronbach's Alpha
    const sumItemVariances = itemVariances.reduce((a, b) => a + b, 0);
    const alpha = (k / (k - 1)) * (1 - sumItemVariances / totalVariance);
    
    // Calculate item-total correlations
    const itemTotalCorrelations: Record<string, number> = {};
    const alphaIfDeleted: Record<string, number> = {};
    
    for (let j = 0; j < k; j++) {
      const itemValues = dataMatrix.map(row => row[j]);
      const remainingTotals = dataMatrix.map(row => 
        row.reduce((sum, val, idx) => idx !== j ? sum + val : sum, 0)
      );
      
      const correlation = this.calculateCorrelation(itemValues, remainingTotals).r;
      itemTotalCorrelations[items[j]] = correlation;
      
      // Calculate alpha if item deleted
      const remainingVariances = itemVariances.filter((_, idx) => idx !== j);
      const sumRemainingVariances = remainingVariances.reduce((a, b) => a + b, 0);
      const remainingTotalVariance = this.calculateVariance(remainingTotals);
      const alphaDeleted = ((k - 1) / (k - 2)) * (1 - sumRemainingVariances / remainingTotalVariance);
      alphaIfDeleted[items[j]] = alphaDeleted;
    }
    
    // Interpret alpha
    let interpretation: CronbachAlpha['interpretation'];
    if (alpha >= 0.9) interpretation = 'excellent';
    else if (alpha >= 0.8) interpretation = 'good';
    else if (alpha >= 0.7) interpretation = 'acceptable';
    else if (alpha >= 0.6) interpretation = 'questionable';
    else if (alpha >= 0.5) interpretation = 'poor';
    else interpretation = 'unacceptable';
    
    return {
      alpha,
      standardizedAlpha: alpha, // Simplified for now
      items,
      itemTotalCorrelations,
      alphaIfDeleted,
      interpretation
    };
  }
  
  // Helper methods
  private emptyStats(): DescriptiveStats {
    return {
      n: 0,
      mean: NaN,
      median: NaN,
      mode: NaN,
      std: NaN,
      variance: NaN,
      min: NaN,
      max: NaN,
      range: NaN,
      percentiles: {
        p25: NaN,
        p50: NaN,
        p75: NaN,
        p90: NaN,
        p95: NaN,
        p99: NaN
      },
      skewness: NaN,
      kurtosis: NaN,
      ci95: [NaN, NaN]
    };
  }
  
  private emptyReliability(items: string[]): CronbachAlpha {
    const empty: Record<string, number> = {};
    items.forEach(item => {
      empty[item] = NaN;
    });
    
    return {
      alpha: NaN,
      standardizedAlpha: NaN,
      items,
      itemTotalCorrelations: empty,
      alphaIfDeleted: empty,
      interpretation: 'unacceptable'
    };
  }
  
  private calculateVariance(values: number[], mean?: number): number {
    const m = mean ?? values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (values.length - 1);
  }
  
  private calculateCorrelation(x: number[], y: number[], method: 'pearson' | 'spearman' | 'kendall' = 'pearson'): { r: number; p: number } {
    const n = x.length;
    
    if (method === 'pearson') {
      const meanX = x.reduce((a, b) => a + b, 0) / n;
      const meanY = y.reduce((a, b) => a + b, 0) / n;
      
      let ssXX = 0, ssYY = 0, ssXY = 0;
      for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        ssXX += dx * dx;
        ssYY += dy * dy;
        ssXY += dx * dy;
      }
      
      const r = ssXY / Math.sqrt(ssXX * ssYY);
      
      // Calculate p-value using t-distribution
      const t = r * Math.sqrt((n - 2) / (1 - r * r));
      const p = this.calculateTTestPValue(Math.abs(t), n - 2);
      
      return { r, p };
    }
    
    // Simplified for other methods
    return { r: 0, p: 1 };
  }
  
  private percentile(sorted: number[], p: number): number {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    return lower === upper ? sorted[lower] : sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
  
  private getTValue(df: number, alpha: number): number {
    // Simplified t-value lookup (should use proper distribution)
    const tValues: Record<string, number> = {
      '1_0.05': 12.706,
      '5_0.05': 2.571,
      '10_0.05': 2.228,
      '20_0.05': 2.086,
      '30_0.05': 2.042,
      '50_0.05': 2.009,
      '100_0.05': 1.984,
      'inf_0.05': 1.96
    };
    
    const key = df <= 100 ? `${df}_${alpha}` : `inf_${alpha}`;
    return tValues[key] || 1.96;
  }
  
  private calculateTTestPValue(t: number, df: number): number {
    // Simplified p-value calculation (should use proper distribution)
    // Using approximation for two-tailed test
    if (df >= 30) {
      // Normal approximation for large df
      return 2 * (1 - this.normalCDF(Math.abs(t)));
    }
    // For small df, use conservative estimate
    return Math.min(1, 2 * Math.exp(-Math.abs(t)));
  }
  
  private calculateFTestPValue(f: number, df1: number, df2: number): number {
    // Simplified F-test p-value (should use proper distribution)
    if (f <= 1) return 1;
    // Conservative approximation
    return Math.exp(-f * Math.min(df1, df2) / 10);
  }
  
  private normalCDF(z: number): number {
    // Approximation of normal CDF
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    const sign = z >= 0 ? 1 : -1;
    z = Math.abs(z) / Math.sqrt(2);
    
    const t = 1 / (1 + p * z);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    
    return 0.5 * (1 + sign * y);
  }
}