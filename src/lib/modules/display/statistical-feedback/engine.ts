import {
  sessionAnalyticsService,
  type AggregateSourceType,
  type AnalyticsMetric,
  type ChartSeriesContract,
} from '$lib/services/sessionAnalytics';
import type {
  ScoreInterpreterConfig,
  ScoreInterpretationRange,
} from '$lib/runtime/feedback/ScoreInterpreter';

export type StatisticalSourceMode =
  | 'current-session'
  | 'cohort'
  | 'participant-vs-cohort'
  | 'participant-vs-participant';

export interface StatisticalFeedbackDataSourceConfig {
  questionnaireId: string;
  source: AggregateSourceType;
  key: string;
  currentVariable: string;
  participantId: string;
  comparisonParticipantId: string;
}

export interface StatisticalFeedbackConfig {
  title: string;
  subtitle: string;
  chartType: 'bar' | 'line';
  sourceMode: StatisticalSourceMode;
  metric: AnalyticsMetric;
  showPercentile: boolean;
  showSummary: boolean;
  refreshMs: number;
  dataSource: StatisticalFeedbackDataSourceConfig;
  /** Score interpretation scales (optional) */
  scoreInterpretation?: ScoreInterpreterConfig[];
  /** Whether to show a "Download Report" button at runtime */
  enableReportDownload?: boolean;
  /** Custom report title (falls back to config.title) */
  reportTitle?: string;
}

export const defaultStatisticalFeedbackConfig: StatisticalFeedbackConfig = {
  title: 'Statistical Feedback',
  subtitle: 'Instant metrics from your questionnaire data',
  chartType: 'bar',
  sourceMode: 'current-session',
  metric: 'mean',
  showPercentile: true,
  showSummary: true,
  refreshMs: 0,
  dataSource: {
    questionnaireId: '',
    source: 'variable',
    key: '',
    currentVariable: '',
    participantId: '',
    comparisonParticipantId: '',
  },
  scoreInterpretation: [],
  enableReportDownload: false,
  reportTitle: '',
};

export type { ScoreInterpreterConfig, ScoreInterpretationRange };

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  return null;
}

function resolveParticipantId(raw: string, variables: Record<string, unknown>): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
    const variableName = trimmed.slice(2, -2).trim();
    const resolved = variables[variableName];
    return resolved === undefined || resolved === null ? '' : String(resolved);
  }

  return trimmed;
}

export function normalizeStatisticalFeedbackConfig(candidate: any): StatisticalFeedbackConfig {
  const config = candidate?.config || candidate || {};
  const nestedDataSource = config.dataSource || candidate?.dataSource || {};

  return {
    ...defaultStatisticalFeedbackConfig,
    ...config,
    dataSource: {
      ...defaultStatisticalFeedbackConfig.dataSource,
      ...nestedDataSource,
      source:
        nestedDataSource.source === 'response' || config.source === 'response'
          ? 'response'
          : 'variable',
    },
    scoreInterpretation: Array.isArray(config.scoreInterpretation)
      ? config.scoreInterpretation
      : [],
    enableReportDownload: config.enableReportDownload ?? false,
    reportTitle: config.reportTitle ?? '',
  };
}

export function validateStatisticalFeedbackConfig(config: StatisticalFeedbackConfig): string[] {
  const errors: string[] = [];

  if (config.sourceMode !== 'current-session' && !config.dataSource.questionnaireId) {
    errors.push('Questionnaire ID is required for cohort/comparison modes.');
  }

  if (config.sourceMode !== 'current-session' && !config.dataSource.key) {
    errors.push('Variable/question key is required for cohort/comparison modes.');
  }

  if (config.sourceMode === 'participant-vs-participant') {
    if (!config.dataSource.participantId) {
      errors.push('Primary participant ID is required for participant comparison mode.');
    }

    if (!config.dataSource.comparisonParticipantId) {
      errors.push('Comparison participant ID is required for participant comparison mode.');
    }
  }

  return errors;
}

export async function resolveStatisticalFeedbackSeries(
  config: StatisticalFeedbackConfig,
  variables: Record<string, unknown>
): Promise<ChartSeriesContract> {
  if (config.sourceMode === 'current-session') {
    const variableName = config.dataSource.currentVariable || config.dataSource.key;
    const rawValue = variables[variableName];
    const value = parseNumeric(rawValue);

    return {
      mode: 'current-session',
      metric: config.metric,
      points: [{ label: variableName || 'Current', value }],
      summary: {
        currentValue: value,
      },
    };
  }

  if (!config.dataSource.questionnaireId || !config.dataSource.key) {
    throw new Error('Missing questionnaireId/key for analytics query.');
  }

  if (config.sourceMode === 'cohort') {
    const aggregate = await sessionAnalyticsService.aggregate({
      questionnaireId: config.dataSource.questionnaireId,
      source: config.dataSource.source,
      key: config.dataSource.key,
    });

    return sessionAnalyticsService.buildCohortSeries({
      metric: config.metric,
      aggregate,
    });
  }

  if (config.sourceMode === 'participant-vs-cohort') {
    const participantId =
      resolveParticipantId(config.dataSource.participantId, variables) ||
      resolveParticipantId('{{participantId}}', variables) ||
      resolveParticipantId('{{_participantId}}', variables);

    if (!participantId) {
      throw new Error('Participant ID is required for participant-vs-cohort mode.');
    }

    const series = await sessionAnalyticsService.buildParticipantVsCohortSeries({
      questionnaireId: config.dataSource.questionnaireId,
      source: config.dataSource.source,
      key: config.dataSource.key,
      participantId,
      metric: config.metric,
    });

    if (config.metric === 'z_score') {
      return {
        ...series,
        points: [{ label: 'Z-Score', value: series.summary?.zScore ?? null }],
      };
    }

    return series;
  }

  const leftParticipantId = resolveParticipantId(config.dataSource.participantId, variables);
  const rightParticipantId = resolveParticipantId(
    config.dataSource.comparisonParticipantId,
    variables
  );

  if (!leftParticipantId || !rightParticipantId) {
    throw new Error('Both participant IDs are required for participant-vs-participant mode.');
  }

  const comparison = await sessionAnalyticsService.compare({
    questionnaireId: config.dataSource.questionnaireId,
    source: config.dataSource.source,
    key: config.dataSource.key,
    leftParticipantId,
    rightParticipantId,
  });

  const series = sessionAnalyticsService.buildParticipantComparisonSeries({
    metric: config.metric,
    comparison,
  });

  if (config.metric === 'z_score') {
    return {
      ...series,
      points: [{ label: 'Z-Score', value: series.summary?.zScore ?? null }],
    };
  }

  return series;
}
