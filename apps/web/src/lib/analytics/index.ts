/**
 * QDesigner Modern Analytics Module
 * Comprehensive analytics system with statistical analysis, real-time data streaming,
 * data visualization, and export functionality
 */

import { StatisticalEngine } from './StatisticalEngine';
import { DataVisualization } from './DataVisualization';
import { ExportService } from './ExportService';
import { ScoreInterpreter } from './ScoreInterpreter';
import { MissingDataHandler } from './MissingDataHandler';
import { PowerAnalysis } from './PowerAnalysis';
import { RealtimeAnalyticsClient } from './RealtimeAnalyticsClient.svelte';
import { ScoringPipeline } from './ScoringPipeline';

// Re-export Core Classes
export { StatisticalEngine, DataVisualization, ExportService, ScoreInterpreter, MissingDataHandler, PowerAnalysis, RealtimeAnalyticsClient, ScoringPipeline };

// Svelte Components
export { default as AnalyticsDashboard } from './components/AnalyticsDashboard.svelte';
export { default as StatisticsCard } from './components/StatisticsCard.svelte';
export { default as DashboardBuilder } from './components/DashboardBuilder.svelte';
export { default as WidgetPalette } from './components/WidgetPalette.svelte';
export { default as WidgetContainer } from './components/WidgetContainer.svelte';
export { default as DescriptiveStatsWidget } from './components/DescriptiveStatsWidget.svelte';
export { default as HistogramWidget } from './components/HistogramWidget.svelte';
export { default as TimeSeriesWidget } from './components/TimeSeriesWidget.svelte';
export { default as CompletionFunnelWidget } from './components/CompletionFunnelWidget.svelte';
export { default as ReliabilityWidget } from './components/ReliabilityWidget.svelte';
export { default as IRTWidget } from './components/IRTWidget.svelte';
export { default as FilterBuilder } from './components/FilterBuilder.svelte';
export { default as CohortComparison } from './components/CohortComparison.svelte';

// Import types for local usage and re-export
import type {
  // Core Analytics Types
  AnalyticsData,
  AnalyticsMetadata,
  DeviceInfo,
  BrowserInfo,
  EnvironmentalFactors,
  PerformanceCapabilities,

  // Statistical Analysis Types
  StatisticalSummary,
  CorrelationAnalysis,
  TTestResult,
  AnovaResult,
  AnovaGroup,
  RegressionResult,
  ReliabilityAnalysis,
  FactorAnalysis,

  // Real-time Analytics Types
  RealtimeConfig,
  RealtimeEvent,
  RealtimeEventType,
  RealtimeBuffer,
  ConnectionStatus,

  // Data Visualization Types
  ChartConfig,
  ChartType,
  ChartData,
  Dataset,
  ChartPoint,
  ChartOptions,
  ScaleConfig,
  LegendConfig,
  TitleConfig,
  TooltipConfig,
  AnimationConfig,
  InteractionConfig,

  // Export Types
  ExportConfig,
  ExportFormat,
  ExportResult,
  DataTransformation,
  TransformationType,

  // Dashboard Types
  DashboardConfig,
  TimeRange,
  DisplayMetric,
  FilterConfig,
  FilterOperator,

  // Performance Metrics Types
  PerformanceMetrics,

  // Error Handling Types
  AnalyticsError,
  ErrorHandler,
  RetryConfig
} from './types';

export type {
  // Core Analytics Types
  AnalyticsData,
  AnalyticsMetadata,
  DeviceInfo,
  BrowserInfo,
  EnvironmentalFactors,
  PerformanceCapabilities,

  // Statistical Analysis Types
  StatisticalSummary,
  CorrelationAnalysis,
  TTestResult,
  AnovaResult,
  AnovaGroup,
  RegressionResult,
  ReliabilityAnalysis,
  FactorAnalysis,

  // Real-time Analytics Types
  RealtimeConfig,
  RealtimeEvent,
  RealtimeEventType,
  RealtimeBuffer,
  ConnectionStatus,

  // Data Visualization Types
  ChartConfig,
  ChartType,
  ChartData,
  Dataset,
  ChartPoint,
  ChartOptions,
  ScaleConfig,
  LegendConfig,
  TitleConfig,
  TooltipConfig,
  AnimationConfig,
  InteractionConfig,

  // Export Types
  ExportConfig,
  ExportFormat,
  ExportResult,
  DataTransformation,
  TransformationType,

  // Dashboard Types
  DashboardConfig,
  TimeRange,
  DisplayMetric,
  FilterConfig,
  FilterOperator,

  // Performance Metrics Types
  PerformanceMetrics,

  // Error Handling Types
  AnalyticsError,
  ErrorHandler,
  RetryConfig
};

// Utility Functions and Constants
export const ANALYTICS_VERSION = '1.0.0';

export const DEFAULT_REALTIME_CONFIG: Partial<RealtimeConfig> = {
  fallbackToSSE: true,
  reconnectInterval: 5000,
  maxReconnectAttempts: 5,
  bufferSize: 1000,
  flushInterval: 5000,
  compression: false
};

export const DEFAULT_DASHBOARD_CONFIG: Partial<DashboardConfig> = {
  refreshInterval: 30000,
  autoRefresh: false,
  defaultTimeRange: {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    end: new Date(),
    preset: 'last_7_days'
  },
  displayMetrics: [
    'response_count',
    'completion_rate',
    'average_response_time',
    'median_response_time'
  ],
  chartTypes: ['histogram', 'time_series', 'scatter', 'radar'],
  exportFormats: ['csv', 'json', 'xlsx', 'spss', 'r', 'python'],
  filters: []
};

/**
 * Initialize the analytics system with default configurations
 */
export function initializeAnalytics(config?: {
  realtime?: Partial<RealtimeConfig>;
  dashboard?: Partial<DashboardConfig>;
}) {
  const realtimeConfig = { ...DEFAULT_REALTIME_CONFIG, ...config?.realtime };
  const dashboardConfig = { ...DEFAULT_DASHBOARD_CONFIG, ...config?.dashboard };
  
  return {
    statistical: StatisticalEngine.getInstance(),
    visualization: DataVisualization.getInstance(),
    export: ExportService.getInstance(),
    config: {
      realtime: realtimeConfig,
      dashboard: dashboardConfig
    }
  };
}

/**
 * Create a comprehensive analytics report from analytics data
 */
export async function generateAnalyticsReport(
  data: AnalyticsData[],
  options?: {
    includeStatistics?: boolean;
    includeCharts?: boolean;
    includeExport?: boolean;
    exportFormat?: ExportFormat;
  }
) {
  const opts = {
    includeStatistics: true,
    includeCharts: false,
    includeExport: false,
    exportFormat: 'json' as ExportFormat,
    ...options
  };

  const statistical = StatisticalEngine.getInstance();
  const exportService = ExportService.getInstance();
  
  // Basic metrics
  const totalSessions = data.length;
  const completedSessions = data.filter(session => session.endTime).length;
  const completionRate = totalSessions > 0 ? completedSessions / totalSessions : 0;
  const totalResponses = data.reduce((sum, session) => sum + session.responses.length, 0);

  // Response time analysis
  const responseTimes = data.flatMap(session => 
    session.responses
    .filter(r => r.responseTime !== undefined && r.responseTime !== null)
    .map(r => r.responseTime as number)
  );

  const reactionTimes = data.flatMap(session => 
    session.responses
    .filter(r => r.reactionTime !== undefined && r.reactionTime !== null)
    .map(r => r.reactionTime as number)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic analytics report structure
  const report: any = {
    metadata: {
      generatedAt: new Date().toISOString(),
      version: ANALYTICS_VERSION,
      dataRange: {
        from: data.length > 0 ? new Date(Math.min(...data.map(d => d.startTime))).toISOString() : null,
        to: data.length > 0 ? new Date(Math.max(...data.map(d => d.startTime))).toISOString() : null
      }
    },
    summary: {
      totalSessions,
      completedSessions,
      completionRate,
      totalResponses,
      averageResponsesPerSession: totalSessions > 0 ? totalResponses / totalSessions : 0
    }
  };

  // Add statistical analysis if requested
  if (opts.includeStatistics && responseTimes.length > 0) {
    report.statistics = {
      responseTimes: statistical.calculateDescriptiveStats(responseTimes),
      reactionTimes: reactionTimes.length > 0 ? statistical.calculateDescriptiveStats(reactionTimes) : null
    };

    // Add correlation analysis if both response and reaction times are available
    if (reactionTimes.length > 0 && responseTimes.length === reactionTimes.length) {
      report.statistics.correlation = statistical.calculateCorrelation(responseTimes, reactionTimes);
    }
  }

  // Add export if requested
  if (opts.includeExport) {
    const exportResult = await exportService.exportData(data, {
      format: opts.exportFormat,
      includeMetadata: true,
      includeRawData: true,
      includeStatistics: opts.includeStatistics
    });
    
    report.export = exportResult;
  }

  return report;
}

/**
 * Validate analytics data structure
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- validates unknown data structure
export function validateAnalyticsData(data: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!Array.isArray(data)) {
    errors.push('Data must be an array');
    return { valid: false, errors };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown data structure
  data.forEach((session: any, index: number) => {
    if (!session.sessionId || typeof session.sessionId !== 'string') {
      errors.push(`Session ${index}: Missing or invalid sessionId`);
    }
    
    if (!session.questionnaireId || typeof session.questionnaireId !== 'string') {
      errors.push(`Session ${index}: Missing or invalid questionnaireId`);
    }
    
    if (!session.startTime || typeof session.startTime !== 'number') {
      errors.push(`Session ${index}: Missing or invalid startTime`);
    }
    
    if (!Array.isArray(session.responses)) {
      errors.push(`Session ${index}: Responses must be an array`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown data structure
      session.responses.forEach((response: any, responseIndex: number) => {
        if (!response.questionId || typeof response.questionId !== 'string') {
          errors.push(`Session ${index}, Response ${responseIndex}: Missing or invalid questionId`);
        }
        
        if (response.responseTime !== undefined && typeof response.responseTime !== 'number') {
          errors.push(`Session ${index}, Response ${responseIndex}: Invalid responseTime`);
        }
        
        if (response.reactionTime !== undefined && typeof response.reactionTime !== 'number') {
          errors.push(`Session ${index}, Response ${responseIndex}: Invalid reactionTime`);
        }
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate performance metrics from analytics data
 */
export function calculatePerformanceMetrics(data: AnalyticsData[]): PerformanceMetrics | null {
  if (data.length === 0) return null;

  const responseTimes = data.flatMap(session => 
    session.responses
      .filter(r => r.responseTime !== undefined && r.responseTime !== null)
      .map(r => r.responseTime as number)
  );

  const _reactionTimes = data.flatMap(session =>
    session.responses
      .filter(r => r.reactionTime !== undefined && r.reactionTime !== null)
      .map(r => r.reactionTime as number)
  );

  if (responseTimes.length === 0) return null;

  const statistical = StatisticalEngine.getInstance();
  const responseStats = statistical.calculateDescriptiveStats(responseTimes);

  return {
    responseTime: {
      mean: responseStats.mean,
      median: responseStats.median,
      p95: responseStats.percentiles[95] || 0,
      p99: responseStats.percentiles[99] || 0,
      min: responseStats.min,
      max: responseStats.max
    },
    renderingPerformance: {
      frameRate: 60, // Would be measured from actual performance data
      averageFrameTime: 16.67,
      droppedFrames: 0,
      renderTime: 10
    },
    memoryUsage: {
      heapUsed: 0, // Would be measured from actual performance data
      heapTotal: 0,
      external: 0,
      arrayBuffers: 0
    },
    networkMetrics: {
      latency: 0, // Would be measured from actual network data
      bandwidth: 0,
      packetsLost: 0,
      reconnections: 0
    },
    userEngagement: {
      timeOnPage: data.reduce((sum, session) => {
        return sum + ((session.endTime ?? session.startTime) - session.startTime);
      }, 0) / data.length,
      interactionCount: data.reduce((sum, session) => sum + session.interactions.length, 0) / data.length,
      scrollDepth: 0, // Would be measured from actual interaction data
      focusTime: 0 // Would be measured from actual interaction data
    }
  };
}

/**
 * Time range utilities
 */
export const TimeRangePresets = {
  today: (): TimeRange => ({
    start: new Date(new Date().setHours(0, 0, 0, 0)),
    end: new Date(),
    preset: 'today'
  }),
  
  yesterday: (): TimeRange => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      start: new Date(yesterday.setHours(0, 0, 0, 0)),
      end: new Date(yesterday.setHours(23, 59, 59, 999)),
      preset: 'yesterday'
    };
  },
  
  last7Days: (): TimeRange => ({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date(),
    preset: 'last_7_days'
  }),
  
  last30Days: (): TimeRange => ({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(),
    preset: 'last_30_days'
  }),
  
  last90Days: (): TimeRange => ({
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    end: new Date(),
    preset: 'last_90_days'
  })
};

/**
 * Color palette for charts and visualizations
 */
export const ColorPalettes = {
  default: [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ],
  
  accessibility: [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
  ],
  
  pastel: [
    '#FFB3BA', '#BAFFC9', '#BAE1FF', '#FFFFBA', '#FFD3BA',
    '#E1BAFF', '#FFBAF3', '#BAD1FF', '#CAFFBA', '#FFCABA'
  ],
  
  dark: [
    '#1E3A8A', '#7F1D1D', '#064E3B', '#92400E', '#581C87',
    '#86198F', '#164E63', '#365314', '#9A3412', '#3730A3'
  ]
};

/**
 * Error handling utilities
 */
export class AnalyticsErrorHandler {
  private static instance: AnalyticsErrorHandler;
  private errors: AnalyticsError[] = [];
  private maxErrors = 100;

  private constructor() {}

  static getInstance(): AnalyticsErrorHandler {
    if (!AnalyticsErrorHandler.instance) {
      AnalyticsErrorHandler.instance = new AnalyticsErrorHandler();
    }
    return AnalyticsErrorHandler.instance;
  }

  logError(error: AnalyticsError): void {
    this.errors.unshift(error);
    
    // Keep only the most recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Log to console based on severity
    switch (error.severity) {
      case 'critical':
        console.error('[Analytics Critical]', error);
        break;
      case 'high':
        console.error('[Analytics Error]', error);
        break;
      case 'medium':
        console.warn('[Analytics Warning]', error);
        break;
      case 'low':
        console.info('[Analytics Info]', error);
        break;
    }
  }

  getErrors(severity?: AnalyticsError['severity']): AnalyticsError[] {
    if (severity) {
      return this.errors.filter(error => error.severity === severity);
    }
    return [...this.errors];
  }

  clearErrors(): void {
    this.errors = [];
  }

  getErrorCount(): number {
    return this.errors.length;
  }
}

// Export singleton error handler instance
export const analyticsErrorHandler = AnalyticsErrorHandler.getInstance();

// Re-export ScoreInterpreter types
export type {
  ScoreInterpretation as AnalyticsScoreInterpretation,
  NormativeComparison,
  ConfidenceInterval,
  FeedbackConfig,
  ScoreRange,
  NormData,
  SubscaleScore,
  SubscaleConfig,
} from './ScoreInterpreter';

export { normalCDF } from './ScoreInterpreter';

// Re-export MissingDataHandler types
export type {
  ImputationMethod,
  MissingDataReport,
  VariableMissingInfo,
  CaseMissingInfo,
  MissingPattern,
  MultipleImputationResult,
} from './MissingDataHandler';

// Re-export PowerAnalysis types
export type {
  TestType,
  PowerParams,
  TTestPowerParams,
  AnovaPowerParams,
  ChiSquarePowerParams,
  SampleSizeResult,
  ObservedPowerResult,
} from './PowerAnalysis';

// Re-export RealtimeAnalyticsClient types
export type {
  AnalyticsMetrics,
  AnalyticsEvent,
} from './RealtimeAnalyticsClient.svelte';

// Re-export ScoringPipeline types
export type {
  ScoreDefinition,
  ScoreResult,
  PipelineResult,
} from './ScoringPipeline';

// Re-export Dashboard Builder types and utilities
export {
  WIDGET_PALETTE,
  createDefaultLayout,
  createWidget,
} from './types/dashboard-builder';

export type {
  WidgetType,
  WidgetPosition,
  DashboardWidget,
  WidgetConfig,
  DashboardLayout,
  WidgetPaletteItem,
} from './types/dashboard-builder';

// Re-export FilterBuilder types
export type {
  FilterRule,
  FilterGroup,
  FilterQuery,
} from './types/filter';
