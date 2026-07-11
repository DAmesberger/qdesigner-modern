import { api } from './api';
import type {
  SessionAggregateData,
  SessionCompareData,
  SessionStatsSummary,
  SessionData,
} from '$lib/shared/types/api';

export type AggregateSourceType = 'variable' | 'response';
export type AnalyticsMetric =
  | 'count'
  | 'mean'
  | 'median'
  | 'std_dev'
  | 'p90'
  | 'p95'
  | 'p99'
  | 'z_score';

export interface ChartPoint {
  label: string;
  value: number | null;
}

export interface ChartSeriesContract {
  mode:
    | 'current-session'
    | 'cohort'
    | 'participant-vs-cohort'
    | 'participant-vs-participant'
    | 'norm-table'
    | 'self-baseline'
    // E-FEEDBACK-3: the offline server-variable error fallback echoes the source
    // mode; the successful path materializes as 'participant-vs-cohort'.
    | 'server-variable';
  metric: AnalyticsMetric;
  points: ChartPoint[];
  /**
   * Numeric summary tiles. Norm/baseline modes (E-FEEDBACK-2) populate the
   * canonical keys `tScore`, `percentile`, `deltaFromBaseline`, and `rci`
   * (reliable-change index) here so charts/summary tiles render them without a
   * bespoke contract.
   */
  summary?: Record<string, number | null>;
  /**
   * Human-readable provenance of the norm used (norm-table mode) — e.g.
   * "GAD-7 general population (Löwe et al., 2008)". A string, so it rides
   * alongside the numeric `summary` map rather than inside it.
   */
  normSource?: string;
  /** Distribution data for bell curve / histogram visualizations */
  distribution?: {
    mean: number;
    stdDev: number;
    n: number;
    values?: number[];
  };
  /**
   * Precomputed cohort quartiles (F-16) for a box-whisker rendered from an
   * already-aggregated cohort (server-variable / trial-cohort modes) — the
   * participant never holds the cohort's raw values, so the box draws these
   * directly. `min`/`max` are the whisker caps.
   */
  cohortQuartiles?: {
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
  } | null;
}

const PUBLIC_API_BASE = import.meta.env.VITE_API_URL || '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response with snake_case/camelCase fields
function mapPublicStats(raw: any): SessionStatsSummary {
  const stats = raw || {};
  return {
    sampleCount: Number(stats.sample_count ?? stats.sampleCount ?? 0),
    mean: stats.mean ?? null,
    median: stats.median ?? null,
    stdDev: stats.std_dev ?? stats.stdDev ?? null,
    min: stats.min ?? null,
    max: stats.max ?? null,
    p10: stats.p10 ?? null,
    p25: stats.p25 ?? null,
    p50: stats.p50 ?? null,
    p75: stats.p75 ?? null,
    p90: stats.p90 ?? null,
    p95: stats.p95 ?? null,
    p99: stats.p99 ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response with snake_case/camelCase fields
function mapPublicAggregate(raw: any): SessionAggregateData {
  return {
    questionnaireId: String(raw.questionnaire_id ?? raw.questionnaireId ?? ''),
    source: (raw.source ?? 'variable') as 'variable' | 'response',
    key: String(raw.key ?? ''),
    participantCount: Number(raw.participant_count ?? raw.participantCount ?? 0),
    stats: mapPublicStats(raw.stats),
  };
}

function metricFromStats(stats: SessionStatsSummary, metric: AnalyticsMetric): number | null {
  switch (metric) {
    case 'count':
      return stats.sampleCount;
    case 'mean':
      return stats.mean;
    case 'median':
      return stats.median;
    case 'std_dev':
      return stats.stdDev;
    case 'p90':
      return stats.p90;
    case 'p95':
      return stats.p95;
    case 'p99':
      return stats.p99;
    default:
      return null;
  }
}

export const sessionAnalyticsService = {
  listSessions(params?: {
    questionnaireId?: string;
    participantId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<SessionData[]> {
    return api.sessions.list(params);
  },

  aggregate(params: {
    questionnaireId: string;
    source?: AggregateSourceType;
    key: string;
    participantId?: string;
  }): Promise<SessionAggregateData> {
    return api.sessions.aggregate(params);
  },

  /**
   * Public, anonymous-safe cohort aggregate (F060). Raw fetch with NO
   * Authorization header against the public `/cohort-stats` endpoint — the
   * participant fillout runtime is never authenticated, so it can't use the
   * `AuthenticatedUser`-gated `aggregate()` above. Raw fetch (like
   * QuotaService) avoids an OpenAPI contract regen. The server floors the
   * cohort at n < 5 → null stats, so a small cohort returns a count with no
   * moments.
   */
  async aggregatePublic(params: {
    questionnaireId: string;
    source?: AggregateSourceType;
    key: string;
  }): Promise<SessionAggregateData> {
    const qs = new URLSearchParams();
    qs.set('key', params.key);
    if (params.source) {
      qs.set('source', params.source);
    }
    const res = await fetch(
      `${PUBLIC_API_BASE}/api/questionnaires/${params.questionnaireId}/cohort-stats?${qs.toString()}`
    );
    if (!res.ok) {
      throw new Error(`Cohort stats request failed: ${res.status}`);
    }
    return mapPublicAggregate(await res.json());
  },

  compare(params: {
    questionnaireId: string;
    source?: AggregateSourceType;
    key: string;
    leftParticipantId: string;
    rightParticipantId: string;
  }): Promise<SessionCompareData> {
    return api.sessions.compare(params);
  },

  async buildParticipantVsCohortSeries(params: {
    questionnaireId: string;
    source?: AggregateSourceType;
    key: string;
    participantId: string;
    metric: AnalyticsMetric;
  }): Promise<ChartSeriesContract> {
    const [participant, cohort] = await Promise.all([
      this.aggregate({
        questionnaireId: params.questionnaireId,
        source: params.source,
        key: params.key,
        participantId: params.participantId,
      }),
      this.aggregate({
        questionnaireId: params.questionnaireId,
        source: params.source,
        key: params.key,
      }),
    ]);

    const participantValue = metricFromStats(participant.stats, params.metric);
    const cohortValue = metricFromStats(cohort.stats, params.metric);

    const zScore =
      participant.stats.mean !== null &&
      cohort.stats.mean !== null &&
      cohort.stats.stdDev !== null &&
      cohort.stats.stdDev > 0
        ? (participant.stats.mean - cohort.stats.mean) / cohort.stats.stdDev
        : null;

    return {
      mode: 'participant-vs-cohort',
      metric: params.metric,
      points: [
        { label: 'Participant', value: participantValue },
        { label: 'Cohort', value: cohortValue },
      ],
      summary: {
        participantMean: participant.stats.mean,
        cohortMean: cohort.stats.mean,
        cohortStdDev: cohort.stats.stdDev,
        cohortN: cohort.stats.sampleCount,
        zScore,
      },
      distribution:
        cohort.stats.mean !== null && cohort.stats.stdDev !== null && cohort.stats.stdDev > 0
          ? {
              mean: cohort.stats.mean,
              stdDev: cohort.stats.stdDev,
              n: cohort.stats.sampleCount ?? 0,
            }
          : undefined,
    };
  },

  /**
   * Anonymous-safe participant-vs-cohort series (F060). The participant point
   * is the participant's OWN locally-computed score (a scalar from the runtime
   * `variables`), NOT a server read-back — an anonymous caller could never read
   * their per-session value via `/aggregate`. Cohort stats come from
   * `aggregatePublic`. zScore is computed exactly as
   * `buildParticipantVsCohortSeries` does, against the participant scalar.
   */
  buildParticipantVsCohortSeriesLocal(params: {
    participantValue: number | null;
    cohort: SessionAggregateData;
    metric: AnalyticsMetric;
  }): ChartSeriesContract {
    const cohortValue = metricFromStats(params.cohort.stats, params.metric);

    const zScore =
      params.participantValue !== null &&
      params.cohort.stats.mean !== null &&
      params.cohort.stats.stdDev !== null &&
      params.cohort.stats.stdDev > 0
        ? (params.participantValue - params.cohort.stats.mean) / params.cohort.stats.stdDev
        : null;

    return {
      mode: 'participant-vs-cohort',
      metric: params.metric,
      points: [
        { label: 'Participant', value: params.participantValue },
        { label: 'Cohort', value: cohortValue },
      ],
      summary: {
        participantValue: params.participantValue,
        cohortMean: params.cohort.stats.mean,
        cohortStdDev: params.cohort.stats.stdDev,
        cohortN: params.cohort.stats.sampleCount,
        zScore,
      },
      distribution:
        params.cohort.stats.mean !== null &&
        params.cohort.stats.stdDev !== null &&
        params.cohort.stats.stdDev > 0
          ? {
              mean: params.cohort.stats.mean,
              stdDev: params.cohort.stats.stdDev,
              n: params.cohort.stats.sampleCount ?? 0,
            }
          : undefined,
    };
  },

  buildCohortSeries(params: {
    metric: AnalyticsMetric;
    aggregate: SessionAggregateData;
  }): ChartSeriesContract {
    return {
      mode: 'cohort',
      metric: params.metric,
      points: [{ label: 'Cohort', value: metricFromStats(params.aggregate.stats, params.metric) }],
      summary: {
        participantCount: params.aggregate.participantCount,
        sampleCount: params.aggregate.stats.sampleCount,
      },
    };
  },

  buildParticipantComparisonSeries(params: {
    metric: AnalyticsMetric;
    comparison: SessionCompareData;
  }): ChartSeriesContract {
    const metric = params.metric;

    return {
      mode: 'participant-vs-participant',
      metric,
      points: [
        {
          label: params.comparison.left.participantId,
          value: metricFromStats(params.comparison.left.stats, metric),
        },
        {
          label: params.comparison.right.participantId,
          value: metricFromStats(params.comparison.right.stats, metric),
        },
      ],
      summary: {
        meanDelta: params.comparison.delta.meanDelta,
        medianDelta: params.comparison.delta.medianDelta,
        zScore: params.comparison.delta.zScore,
      },
    };
  },

  metricFromStats,
};
