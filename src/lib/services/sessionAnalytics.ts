import { api } from './api';
import type {
  SessionAggregateData,
  SessionCompareData,
  SessionStatsSummary,
  SessionData,
} from '$lib/types/api';

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
  mode: 'current-session' | 'cohort' | 'participant-vs-cohort' | 'participant-vs-participant';
  metric: AnalyticsMetric;
  points: ChartPoint[];
  summary?: Record<string, number | null>;
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
        zScore,
      },
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
