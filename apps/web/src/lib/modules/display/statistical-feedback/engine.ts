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
import {
  getNormTable,
  reliableChangeIndex,
  CUSTOM_NORM_TABLE_ID,
  type NormTable,
} from '$lib/runtime/feedback/normTables';
import { NormativeScoreInterpreter } from '$lib/analytics/NormativeScoreInterpreter';
import { parseNumeric } from '$lib/shared/utils/statistics';

export type StatisticalSourceMode =
  | 'current-session'
  | 'cohort'
  | 'participant-vs-cohort'
  | 'participant-vs-participant'
  | 'norm-table'
  | 'self-baseline';

/** Researcher-supplied inline norm used when `normTableId === CUSTOM_NORM_TABLE_ID`. */
export interface CustomNormConfig {
  label: string;
  mean: number;
  sd: number;
  /** Optional test-retest reliability, enabling the reliable-change index. */
  reliability?: number;
}

export interface StatisticalFeedbackDataSourceConfig {
  questionnaireId: string;
  source: AggregateSourceType;
  key: string;
  currentVariable: string;
  participantId: string;
  comparisonParticipantId: string;
  /**
   * Bundled norm id (E-FEEDBACK-2) used by `norm-table` mode — and optionally by
   * `self-baseline` mode to derive the reliable-change index. `CUSTOM_NORM_TABLE_ID`
   * selects the inline {@link CustomNormConfig}.
   */
  normTableId?: string;
  /** Inline norm used when `normTableId === CUSTOM_NORM_TABLE_ID`. */
  customNorm?: CustomNormConfig;
  /**
   * Variable holding the earlier-administration (baseline / pre-test) value for
   * `self-baseline` mode. Typically piped in via urlParams or a prior session
   * variable.
   */
  baselineVariable?: string;
}

export interface StatisticalFeedbackConfig {
  title: string;
  subtitle: string;
  chartType: 'bar' | 'line' | 'radar' | 'scatter' | 'histogram' | 'box' | 'bell-curve' | 'gauge';
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
    normTableId: '',
    baselineVariable: '',
  },
  scoreInterpretation: [],
  enableReportDownload: false,
  reportTitle: '',
};

export type { ScoreInterpreterConfig, ScoreInterpretationRange };

function resolveVariableValue(path: string, variables: Record<string, unknown>): unknown {
  const trimmed = path.trim();
  if (!trimmed) {
    return undefined;
  }

  if (Object.hasOwn(variables, trimmed)) {
    return variables[trimmed];
  }

  if (!trimmed.includes('.')) {
    return variables[trimmed];
  }

  const segments = trimmed.split('.').filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }

  // Resolve against the longest matching flat key first, then walk the remaining
  // segments as member access. This handles both a nested root object
  // (`q_rt_value.derived.congruencyEffectMs`) and a namespaced flat key whose value is
  // an object — e.g. the computed subscale score `score.<scaleId>` holding fields like
  // `tScore` / `percentile` / `band` (E-FEEDBACK-1: `score.<scaleId>.tScore`).
  for (let prefixLength = segments.length - 1; prefixLength >= 1; prefixLength--) {
    const key = segments.slice(0, prefixLength).join('.');
    if (!Object.hasOwn(variables, key)) {
      continue;
    }

    let cursor: unknown = variables[key];
    for (const segment of segments.slice(prefixLength)) {
      if (!cursor || typeof cursor !== 'object') {
        return undefined;
      }
      const record = cursor as Record<string, unknown>;
      if (!Object.hasOwn(record, segment)) {
        return undefined;
      }
      cursor = record[segment];
    }
    return cursor;
  }

  return undefined;
}

function metricValueFromObject(metric: AnalyticsMetric, value: Record<string, unknown>): number | null {
  switch (metric) {
    case 'count':
      return parseNumeric(value.count ?? value.sampleCount ?? value.n);
    case 'mean':
      return parseNumeric(value.mean ?? value.meanRT);
    case 'median':
      return parseNumeric(value.median);
    case 'std_dev':
      return parseNumeric(value.stdDev ?? value.std_dev);
    case 'p90':
      return parseNumeric(value.p90);
    case 'p95':
      return parseNumeric(value.p95);
    case 'p99':
      return parseNumeric(value.p99);
    case 'z_score':
      return parseNumeric(value.zScore ?? value.z_score);
    default:
      return null;
  }
}

function buildCurrentSessionPoints(
  variableName: string,
  rawValue: unknown,
  metric: AnalyticsMetric
): Array<{ label: string; value: number | null }> {
  if (!rawValue || typeof rawValue !== 'object') {
    return [{ label: variableName || 'Current', value: parseNumeric(rawValue) }];
  }

  if (Array.isArray(rawValue)) {
    return rawValue.map((entry, index) => ({
      label: `${variableName || 'Current'}-${index + 1}`,
      value: parseNumeric(entry),
    }));
  }

  const record = rawValue as Record<string, unknown>;
  const directValue = metricValueFromObject(metric, record);
  if (directValue !== null) {
    return [{ label: variableName || 'Current', value: directValue }];
  }

  const grouped = Object.entries(record).map(([label, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { label, value: metricValueFromObject(metric, value as Record<string, unknown>) };
    }
    return { label, value: parseNumeric(value) };
  });

  if (grouped.some((point) => point.value !== null)) {
    return grouped;
  }

  return [{ label: variableName || 'Current', value: null }];
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

/** Coerce a resolved variable value (scalar or metric-bearing object) to a number. */
function resolveNumericValue(
  variableName: string,
  variables: Record<string, unknown>,
  metric: AnalyticsMetric
): number | null {
  const rawValue = resolveVariableValue(variableName, variables);
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return metricValueFromObject(metric, rawValue as Record<string, unknown>);
  }
  return parseNumeric(rawValue);
}

/**
 * The effective norm (bundled or inline custom) for norm/baseline modes.
 * Returns `{ mean, sd, reliability?, label }` or null when unresolvable.
 */
function resolveEffectiveNorm(
  dataSource: StatisticalFeedbackDataSourceConfig
): { mean: number; sd: number; reliability?: number; label: string } | null {
  if (dataSource.normTableId === CUSTOM_NORM_TABLE_ID) {
    const custom = dataSource.customNorm;
    if (!custom || !Number.isFinite(custom.mean) || !Number.isFinite(custom.sd)) {
      return null;
    }
    return {
      mean: custom.mean,
      sd: custom.sd,
      reliability: custom.reliability,
      label: custom.label?.trim() || 'Custom norm',
    };
  }

  const bundled: NormTable | undefined = getNormTable(dataSource.normTableId);
  if (!bundled) return null;
  return {
    mean: bundled.mean,
    sd: bundled.sd,
    reliability: bundled.reliability,
    label: bundled.label,
  };
}

const normInterpreter = new NormativeScoreInterpreter();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- normalizes unknown config shapes
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

  // Cohort/comparison modes hit the analytics API and need a questionnaire + key.
  // Norm-table and self-baseline are fully local and don't.
  const needsQuestionnaire =
    config.sourceMode === 'cohort' ||
    config.sourceMode === 'participant-vs-cohort' ||
    config.sourceMode === 'participant-vs-participant';

  if (needsQuestionnaire && !config.dataSource.questionnaireId) {
    errors.push('Questionnaire ID is required for cohort/comparison modes.');
  }

  if (needsQuestionnaire && !config.dataSource.key) {
    errors.push('Variable/question key is required for cohort/comparison modes.');
  }

  if (config.sourceMode === 'norm-table') {
    if (!config.dataSource.currentVariable && !config.dataSource.key) {
      errors.push('A current variable is required for norm-table mode.');
    }
    if (!config.dataSource.normTableId) {
      errors.push('Select a norm table (or a custom norm) for norm-table mode.');
    } else if (config.dataSource.normTableId === CUSTOM_NORM_TABLE_ID) {
      const custom = config.dataSource.customNorm;
      if (!custom || !Number.isFinite(custom.mean) || !Number.isFinite(custom.sd)) {
        errors.push('Custom norm requires a numeric mean and SD.');
      } else if (custom.sd <= 0) {
        errors.push('Custom norm SD must be greater than 0.');
      }
    }
  }

  if (config.sourceMode === 'self-baseline') {
    if (!config.dataSource.currentVariable && !config.dataSource.key) {
      errors.push('A current variable is required for self-baseline mode.');
    }
    if (!config.dataSource.baselineVariable) {
      errors.push('A baseline (pre-test) variable is required for self-baseline mode.');
    }
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

/**
 * Where the panel is rendering. `runtime` is the anonymous participant fillout
 * path (F060): it can never reach the `AuthenticatedUser`-gated
 * `/api/sessions/aggregate|compare`, so cohort modes route through the public
 * `aggregatePublic` endpoint and participant-vs-participant is refused. `edit`
 * / `preview` are the authenticated designer, which keeps the richer
 * authenticated services.
 */
export type FeedbackRenderMode = 'edit' | 'preview' | 'runtime';

export async function resolveStatisticalFeedbackSeries(
  config: StatisticalFeedbackConfig,
  variables: Record<string, unknown>,
  renderMode: FeedbackRenderMode = 'runtime'
): Promise<ChartSeriesContract> {
  if (config.sourceMode === 'current-session') {
    const variableName = config.dataSource.currentVariable || config.dataSource.key;
    const rawValue = resolveVariableValue(variableName, variables);
    const points = buildCurrentSessionPoints(variableName, rawValue, config.metric);
    const currentValue = points.length === 1 ? points[0]?.value ?? null : null;

    return {
      mode: 'current-session',
      metric: config.metric,
      points,
      summary: {
        currentValue,
        pointCount: points.length,
      },
    };
  }

  // Norm-table mode (E-FEEDBACK-2): compare the participant's OWN local value
  // against a shipped population norm. Fully offline — no network call.
  if (config.sourceMode === 'norm-table') {
    const variableName = config.dataSource.currentVariable || config.dataSource.key;
    const participantValue = resolveNumericValue(variableName, variables, config.metric);
    const norm = resolveEffectiveNorm(config.dataSource);

    if (!norm) {
      throw new Error(
        'No norm selected. Pick a bundled norm table or supply a custom mean/SD.'
      );
    }

    if (participantValue === null) {
      return {
        mode: 'norm-table',
        metric: config.metric,
        points: [
          { label: 'You', value: null },
          { label: norm.label, value: norm.mean },
        ],
        normSource: norm.label,
        summary: { tScore: null, percentile: null, zScore: null },
      };
    }

    const comparison = normInterpreter.generateNormativeComparison(participantValue, {
      mean: norm.mean,
      sd: norm.sd,
      n: 0,
    });

    return {
      mode: 'norm-table',
      metric: config.metric,
      points: [
        { label: 'You', value: participantValue },
        { label: norm.label, value: norm.mean },
      ],
      normSource: norm.label,
      distribution: { mean: norm.mean, stdDev: norm.sd, n: 0 },
      summary: {
        tScore: Number.isFinite(comparison.tScore) ? comparison.tScore : null,
        percentile: Number.isFinite(comparison.percentileRank)
          ? comparison.percentileRank
          : null,
        zScore: Number.isFinite(comparison.zScore) ? comparison.zScore : null,
      },
    };
  }

  // Self-baseline mode (E-FEEDBACK-2): compare the current value against an
  // earlier-administration (pre-test) value piped in as a variable. Emits a
  // two-point [Baseline, Current] series with a delta and, when a norm with a
  // reliability is referenced, a reliable-change index. Fully offline.
  if (config.sourceMode === 'self-baseline') {
    const currentName = config.dataSource.currentVariable || config.dataSource.key;
    const baselineName = config.dataSource.baselineVariable || '';

    if (!baselineName) {
      throw new Error('A baseline variable is required for self-baseline mode.');
    }

    const currentValue = resolveNumericValue(currentName, variables, config.metric);
    const baselineValue = resolveNumericValue(baselineName, variables, config.metric);

    const delta =
      currentValue !== null && baselineValue !== null ? currentValue - baselineValue : null;

    let rci: number | null = null;
    const norm = resolveEffectiveNorm(config.dataSource);
    if (norm && baselineValue !== null && currentValue !== null) {
      rci = reliableChangeIndex(baselineValue, currentValue, {
        sd: norm.sd,
        reliability: norm.reliability,
      });
    }

    return {
      mode: 'self-baseline',
      metric: config.metric,
      points: [
        { label: 'Baseline', value: baselineValue },
        { label: 'Current', value: currentValue },
      ],
      normSource: norm?.label,
      summary: {
        deltaFromBaseline: delta,
        rci,
      },
    };
  }

  if (!config.dataSource.questionnaireId || !config.dataSource.key) {
    throw new Error('Missing questionnaireId/key for analytics query.');
  }

  const isRuntime = renderMode === 'runtime';

  if (config.sourceMode === 'cohort') {
    // Anonymous participant path uses the public cohort endpoint (no auth);
    // the authenticated designer keeps the richer authenticated aggregate.
    const aggregate = isRuntime
      ? await sessionAnalyticsService.aggregatePublic({
          questionnaireId: config.dataSource.questionnaireId,
          source: config.dataSource.source,
          key: config.dataSource.key,
        })
      : await sessionAnalyticsService.aggregate({
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
    if (isRuntime) {
      // The participant point is the participant's OWN locally-computed score
      // (already client-side); cohort stats come from the public endpoint. An
      // anonymous caller could never read their per-session value back via
      // /aggregate anyway (AuthenticatedUser + RLS).
      const variableName = config.dataSource.currentVariable || config.dataSource.key;
      const rawValue = resolveVariableValue(variableName, variables);
      const participantValue =
        rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
          ? metricValueFromObject(config.metric, rawValue as Record<string, unknown>)
          : parseNumeric(rawValue);

      const cohort = await sessionAnalyticsService.aggregatePublic({
        questionnaireId: config.dataSource.questionnaireId,
        source: config.dataSource.source,
        key: config.dataSource.key,
      });

      const series = sessionAnalyticsService.buildParticipantVsCohortSeriesLocal({
        participantValue,
        cohort,
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

  // participant-vs-participant — researcher-only. It reads OTHER participants'
  // per-session values, which the dual-path RLS hides from anonymous callers,
  // so it is refused at runtime with an honest message (surfaced by
  // StatisticalFeedback.svelte's loadError) instead of a null 'No data' point.
  if (isRuntime) {
    throw new Error(
      'Participant comparison requires a signed-in researcher and is not shown to participants'
    );
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
