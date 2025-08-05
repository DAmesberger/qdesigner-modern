// Analytics Module Types

export interface Observable<T> {
  subscribe(observer: (value: T) => void): () => void;
}

export interface Response {
  id: string;
  questionId: string;
  questionnaireId: string;
  sessionId: string;
  participantId: string;
  value: any;
  timestamp: number;
  reactionTime?: number;
  metadata?: Record<string, any>;
}

export interface Variable {
  id: string;
  name: string;
  type: 'numeric' | 'categorical' | 'ordinal' | 'text';
  values: any[];
}

export interface DescriptiveStats {
  n: number;
  mean: number;
  median: number;
  mode: number | number[];
  std: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  percentiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  skewness: number;
  kurtosis: number;
  ci95: [number, number];
}

export interface CorrelationMatrix {
  variables: string[];
  matrix: number[][];
  pValues?: number[][];
  method: 'pearson' | 'spearman' | 'kendall';
}

export interface TTestResult {
  t: number;
  df: number;
  pValue: number;
  ci95: [number, number];
  mean1: number;
  mean2: number;
  meanDiff: number;
  pooledStd: number;
  effectSize: number; // Cohen's d
  significant: boolean;
  alpha: number;
}

export interface AnovaResult {
  f: number;
  df: { between: number; within: number };
  pValue: number;
  groupMeans: Record<string, number>;
  mse: number;
  etaSquared: number;
  significant: boolean;
  alpha: number;
  postHoc?: Record<string, TTestResult>;
}

export interface RegressionResult {
  coefficients: Array<{
    name: string;
    value: number;
    stdError: number;
    t: number;
    pValue: number;
  }>;
  rSquared: number;
  adjustedRSquared: number;
  fStatistic: number;
  fPValue: number;
  residualStdError: number;
  predictions?: number[];
  residuals?: number[];
}

export interface StatUpdate {
  type: 'descriptive' | 'correlation' | 'test' | 'regression';
  questionId?: string;
  data: any;
  timestamp: number;
}

export interface OutlierReport {
  method: 'iqr' | 'zscore' | 'isolation';
  outliers: Array<{
    responseId: string;
    value: any;
    score: number;
    reason: string;
  }>;
  threshold: number;
  totalResponses: number;
  outlierCount: number;
  outlierPercentage: number;
}

export interface CronbachAlpha {
  alpha: number;
  standardizedAlpha: number;
  items: string[];
  itemTotalCorrelations: Record<string, number>;
  alphaIfDeleted: Record<string, number>;
  interpretation: 'excellent' | 'good' | 'acceptable' | 'questionable' | 'poor' | 'unacceptable';
}

export interface AnalyticsReport {
  sessionId: string;
  timestamp: number;
  summary: {
    totalResponses: number;
    completionRate: number;
    averageTime: number;
    participantCount: number;
  };
  descriptives: Record<string, DescriptiveStats>;
  correlations?: CorrelationMatrix;
  reliability?: CronbachAlpha;
  outliers?: OutlierReport;
  customMetrics?: Record<string, any>;
}

export interface ExportFormat {
  type: 'csv' | 'spss' | 'r' | 'python' | 'excel' | 'json';
  options?: {
    delimiter?: string;
    includeHeaders?: boolean;
    dateFormat?: string;
    missingValue?: string;
    encoding?: string;
  };
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'scatter' | 'histogram' | 'boxplot' | 'heatmap';
  data: any;
  options?: {
    title?: string;
    xLabel?: string;
    yLabel?: string;
    colors?: string[];
    interactive?: boolean;
    responsive?: boolean;
  };
}

export interface RealtimeConfig {
  updateInterval: number; // milliseconds
  bufferSize: number;
  aggregation: 'none' | 'mean' | 'sum' | 'count';
  windowSize?: number; // for moving averages
}

export interface AnalyticsEngine {
  // Real-time calculations
  calculateDescriptives(responses: Response[]): DescriptiveStats;
  calculateCorrelations(variables: Variable[]): CorrelationMatrix;
  performTTest(group1: Response[], group2: Response[]): TTestResult;
  performAnova(groups: Record<string, Response[]>): AnovaResult;
  performRegression(x: number[], y: number[]): RegressionResult;
  
  // Advanced analytics
  detectOutliers(responses: Response[], method?: 'iqr' | 'zscore' | 'isolation'): OutlierReport;
  calculateReliability(scale: Response[]): CronbachAlpha;
  generateReport(session: { responses: Response[] }): AnalyticsReport;
  
  // Real-time updates
  subscribeToUpdates(config: RealtimeConfig): Observable<StatUpdate>;
  
  // Export functionality
  exportData(data: Response[], format: ExportFormat): Promise<Blob>;
}