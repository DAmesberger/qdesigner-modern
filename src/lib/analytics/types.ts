/**
 * Analytics Module Types
 * Comprehensive TypeScript interfaces for QDesigner Modern analytics system
 */

import type { ResponseData, InteractionEvent } from '$lib/types/response';

// ============================================================================
// Core Analytics Types
// ============================================================================

export interface AnalyticsData {
  questionnaireId: string;
  sessionId: string;
  responses: ResponseData[];
  interactions: InteractionEvent[];
  metadata: AnalyticsMetadata;
  completionTime?: number;
  startTime: number;
  endTime?: number;
}

export interface AnalyticsMetadata {
  participantId?: string;
  demographicData?: Record<string, any>;
  deviceInfo?: DeviceInfo;
  browserInfo?: BrowserInfo;
  environmentalFactors?: EnvironmentalFactors;
  version: string;
  timestamp: number;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  screen: {
    width: number;
    height: number;
    pixelRatio: number;
    colorDepth: number;
  };
  viewport: {
    width: number;
    height: number;
  };
  touchSupport: boolean;
  performanceCapabilities?: PerformanceCapabilities;
}

export interface BrowserInfo {
  name: string;
  version: string;
  engine: string;
  engineVersion: string;
  webglSupport: boolean;
  webgl2Support: boolean;
  performanceAPISupport: boolean;
}

export interface EnvironmentalFactors {
  timezone: string;
  locale: string;
  connectionType?: string;
  batteryLevel?: number;
  isCharging?: boolean;
  lightLevel?: number;
  noiseLevel?: number;
}

export interface PerformanceCapabilities {
  maxTextureSize: number;
  maxRenderBufferSize: number;
  webglRenderer: string;
  webglVendor: string;
  hardwareConcurrency: number;
  deviceMemory?: number;
}

// ============================================================================
// Statistical Analysis Types
// ============================================================================

export interface StatisticalSummary {
  count: number;
  mean: number;
  median: number;
  mode: number[];
  standardDeviation: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  quartiles: {
    q1: number;
    q2: number;
    q3: number;
  };
  percentiles: Record<number, number>;
  skewness: number;
  kurtosis: number;
  outliers: number[];
}

export interface CorrelationAnalysis {
  coefficient: number;
  pValue: number;
  significance: number;
  confidenceInterval: [number, number];
  method: 'pearson' | 'spearman' | 'kendall';
}

export interface TTestResult {
  statistic: number;
  pValue: number;
  degreesOfFreedom: number;
  confidenceInterval: [number, number];
  effectSize: number;
  power: number;
  type: 'one-sample' | 'two-sample-independent' | 'two-sample-paired';
}

export interface AnovaResult {
  fStatistic: number;
  pValue: number;
  degreesOfFreedomBetween: number;
  degreesOfFreedomWithin: number;
  meanSquareBetween: number;
  meanSquareWithin: number;
  etaSquared: number;
  groups: AnovaGroup[];
}

export interface AnovaGroup {
  name: string;
  count: number;
  mean: number;
  standardDeviation: number;
}

export interface RegressionResult {
  coefficients: number[];
  intercept: number;
  rSquared: number;
  adjustedRSquared: number;
  fStatistic: number;
  pValue: number;
  residuals: number[];
  standardErrors: number[];
  tStatistics: number[];
  pValues: number[];
}

export interface ReliabilityAnalysis {
  cronbachAlpha: number;
  itemTotalCorrelations: Record<string, number>;
  alphaIfItemDeleted: Record<string, number>;
  meanInterItemCorrelation: number;
  splitHalfReliability: number;
}

export interface FactorAnalysis {
  eigenvalues: number[];
  explainedVariance: number[];
  cumulativeVariance: number[];
  factorLoadings: Record<string, number[]>;
  communalities: Record<string, number>;
  factorScores?: number[][];
  method: 'pca' | 'efa' | 'cfa';
  rotation?: 'varimax' | 'quartimax' | 'oblimin';
}

// ============================================================================
// Real-time Analytics Types
// ============================================================================

export interface RealtimeConfig {
  endpoint: string;
  fallbackToSSE: boolean;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  bufferSize: number;
  flushInterval: number;
  compression?: boolean;
  authentication?: {
    type: 'bearer' | 'api-key' | 'session';
    token: string;
  };
}

export interface RealtimeEvent {
  type: RealtimeEventType;
  timestamp: number;
  data: any;
  sessionId: string;
  questionnaireId: string;
}

export type RealtimeEventType = 
  | 'response_submitted'
  | 'question_viewed'
  | 'session_started'
  | 'session_completed'
  | 'error_occurred'
  | 'performance_metric'
  | 'interaction_logged'
  | 'analytics_computed';

export interface RealtimeBuffer {
  events: RealtimeEvent[];
  lastFlush: number;
  maxSize: number;
  autoFlush: boolean;
}

export interface ConnectionStatus {
  connected: boolean;
  connectionType: 'websocket' | 'sse' | 'polling' | 'offline';
  lastConnected?: number;
  reconnectAttempts: number;
  latency?: number;
  errors: string[];
}

// ============================================================================
// Data Visualization Types
// ============================================================================

export interface ChartConfig {
  type: ChartType;
  data: ChartData;
  options: ChartOptions;
  responsive: boolean;
  maintainAspectRatio: boolean;
  devicePixelRatio?: number;
}

export type ChartType = 
  | 'histogram'
  | 'time_series'
  | 'scatter'
  | 'heatmap'
  | 'box_plot'
  | 'violin_plot'
  | 'bar'
  | 'line'
  | 'pie'
  | 'radar'
  | 'polar';

export interface ChartData {
  labels: string[];
  datasets: Dataset[];
}

export interface Dataset {
  label: string;
  data: number[] | ChartPoint[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  pointRadius?: number;
  pointHoverRadius?: number;
  fill?: boolean;
  tension?: number;
}

export interface ChartPoint {
  x: number | string | Date;
  y: number;
  z?: number; // For bubble charts
  metadata?: Record<string, any>;
}

export interface ChartOptions {
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  scales?: {
    x?: ScaleConfig;
    y?: ScaleConfig;
  };
  plugins?: {
    legend?: LegendConfig;
    title?: TitleConfig;
    tooltip?: TooltipConfig;
  };
  animation?: AnimationConfig;
  interaction?: InteractionConfig;
}

export interface ScaleConfig {
  type?: 'linear' | 'logarithmic' | 'category' | 'time' | 'timeseries';
  position?: 'top' | 'left' | 'bottom' | 'right';
  title?: {
    display: boolean;
    text: string;
  };
  min?: number;
  max?: number;
  ticks?: {
    stepSize?: number;
    precision?: number;
    callback?: (value: any, index: number, values: any[]) => string;
  };
}

export interface LegendConfig {
  display: boolean;
  position: 'top' | 'left' | 'bottom' | 'right' | 'chartArea';
  align: 'start' | 'center' | 'end';
}

export interface TitleConfig {
  display: boolean;
  text: string | string[];
  position: 'top' | 'left' | 'bottom' | 'right';
}

export interface TooltipConfig {
  enabled: boolean;
  mode: 'point' | 'nearest' | 'index' | 'dataset' | 'x' | 'y';
  intersect: boolean;
  callbacks?: {
    title?: (context: any[]) => string;
    label?: (context: any) => string;
    footer?: (context: any[]) => string;
  };
}

export interface AnimationConfig {
  duration: number;
  easing: 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad';
  delay?: number;
  loop?: boolean;
}

export interface InteractionConfig {
  mode: 'point' | 'nearest' | 'index' | 'dataset' | 'x' | 'y';
  intersect: boolean;
}

// ============================================================================
// Export Types
// ============================================================================

export interface ExportConfig {
  format: ExportFormat;
  includeMetadata: boolean;
  includeRawData: boolean;
  includeStatistics: boolean;
  compression?: 'gzip' | 'zip';
  encoding?: 'utf-8' | 'utf-16' | 'latin1';
  delimiter?: string; // For CSV
  dateFormat?: string;
  numberFormat?: {
    decimals: number;
    thousandsSeparator: string;
    decimalSeparator: string;
  };
}

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'spss' | 'r' | 'python' | 'stata' | 'sas';

export interface ExportResult {
  success: boolean;
  filename: string;
  size: number;
  downloadUrl?: string;
  error?: string;
  metadata: {
    recordCount: number;
    columnCount: number;
    exportTime: number;
    format: ExportFormat;
  };
}

export interface DataTransformation {
  type: TransformationType;
  column?: string;
  parameters: Record<string, any>;
}

export type TransformationType = 
  | 'normalize'
  | 'standardize'
  | 'log_transform'
  | 'square_root'
  | 'reciprocal'
  | 'bin'
  | 'categorize'
  | 'outlier_removal'
  | 'missing_data_imputation';

// ============================================================================
// Dashboard Types
// ============================================================================

export interface DashboardConfig {
  refreshInterval: number;
  autoRefresh: boolean;
  defaultTimeRange: TimeRange;
  displayMetrics: DisplayMetric[];
  chartTypes: ChartType[];
  exportFormats: ExportFormat[];
  filters: FilterConfig[];
}

export interface TimeRange {
  start: Date;
  end: Date;
  preset?: 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'last_90_days' | 'custom';
}

export type DisplayMetric = 
  | 'response_count'
  | 'completion_rate'
  | 'average_response_time'
  | 'median_response_time'
  | 'abandonment_rate'
  | 'error_rate'
  | 'unique_participants'
  | 'response_rate_by_question'
  | 'time_to_complete'
  | 'performance_metrics';

export interface FilterConfig {
  field: string;
  operator: FilterOperator;
  value: any;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
  options?: { value: any; label: string }[];
}

export type FilterOperator = 
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'is_null'
  | 'is_not_null';

// ============================================================================
// Performance Metrics Types
// ============================================================================

export interface PerformanceMetrics {
  responseTime: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  };
  renderingPerformance: {
    frameRate: number;
    averageFrameTime: number;
    droppedFrames: number;
    renderTime: number;
  };
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  networkMetrics: {
    latency: number;
    bandwidth: number;
    packetsLost: number;
    reconnections: number;
  };
  userEngagement: {
    timeOnPage: number;
    interactionCount: number;
    scrollDepth: number;
    focusTime: number;
  };
}

// ============================================================================
// Error Handling Types
// ============================================================================

export interface AnalyticsError {
  code: string;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  stack?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ErrorHandler {
  onError: (error: AnalyticsError) => void;
  onWarning: (warning: AnalyticsError) => void;
  retryLogic?: RetryConfig;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay: number;
}