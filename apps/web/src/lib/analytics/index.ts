/**
 * QDesigner Modern analytics barrel.
 *
 * Re-exports the analytics modules that are wired into a route or consumed by
 * the runtime. Everything here is reachable; hollow/duplicate widgets and the
 * unused engine + helper cruft were removed in the R3-5 wire-or-delete pass.
 */

// Core engines
export { StatisticalEngine } from './StatisticalEngine';
export { NormativeScoreInterpreter, normalCDF } from './NormativeScoreInterpreter';
export { MissingDataHandler } from './MissingDataHandler';
export { RealtimeAnalyticsClient } from './RealtimeAnalyticsClient.svelte';

// Derivation helpers
export { buildPsychometrics } from './psychometrics';
export {
  pivotParticipants,
  describeFields,
  applyFilter,
  numericValues,
  compareCohorts,
} from './advancedAnalytics';

// Svelte components
export { default as StatisticsCard } from './components/StatisticsCard.svelte';
export { default as DescriptiveStatsWidget } from './components/DescriptiveStatsWidget.svelte';
export { default as HistogramWidget } from './components/HistogramWidget.svelte';
export { default as FilterBuilder } from './components/FilterBuilder.svelte';
export { default as CohortComparison } from './components/CohortComparison.svelte';
export { default as AdvancedAnalytics } from './components/AdvancedAnalytics.svelte';

// Shared analytics types
export type {
  AnalyticsData,
  StatisticalSummary,
  CorrelationAnalysis,
  TTestResult,
  AnovaResult,
  AnovaGroup,
  RegressionResult,
  ReliabilityAnalysis,
  RealtimeConfig,
  RealtimeEvent,
  RealtimeEventType,
  ConnectionStatus,
} from './types';

export type {
  NormativeScoreInterpretation as AnalyticsScoreInterpretation,
  NormativeComparison,
  ConfidenceInterval,
  FeedbackConfig,
  ScoreRange,
  NormData,
  SubscaleScore,
  SubscaleConfig,
} from './NormativeScoreInterpreter';

export type {
  ImputationMethod,
  MissingDataReport,
  VariableMissingInfo,
  CaseMissingInfo,
  MissingPattern,
  MultipleImputationResult,
} from './MissingDataHandler';

export type {
  AnalyticsMetrics,
  AnalyticsEvent,
} from './RealtimeAnalyticsClient.svelte';

export type {
  ParticipantRecord,
  FieldMeta,
  Cohort,
  CohortComparisonResult,
} from './advancedAnalytics';

export type {
  FilterOperator,
  FilterRule,
  FilterGroup,
  FilterQuery,
} from './types/filter';
