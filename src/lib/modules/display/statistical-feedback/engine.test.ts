import { describe, expect, it, vi } from 'vitest';
import {
  defaultStatisticalFeedbackConfig,
  normalizeStatisticalFeedbackConfig,
  resolveStatisticalFeedbackSeries,
  validateStatisticalFeedbackConfig,
} from './engine';
import { sessionAnalyticsService } from '$lib/services/sessionAnalytics';

describe('statistical feedback engine', () => {
  it('normalizes missing config with defaults', () => {
    const config = normalizeStatisticalFeedbackConfig({});

    expect(config.chartType).toBe(defaultStatisticalFeedbackConfig.chartType);
    expect(config.sourceMode).toBe('current-session');
    expect(config.dataSource.source).toBe('variable');
  });

  it('validates required cohort fields', () => {
    const errors = validateStatisticalFeedbackConfig({
      ...defaultStatisticalFeedbackConfig,
      sourceMode: 'cohort',
      dataSource: {
        ...defaultStatisticalFeedbackConfig.dataSource,
        questionnaireId: '',
        key: '',
      },
    });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('resolves current-session series from local variables', async () => {
    const series = await resolveStatisticalFeedbackSeries(
      {
        ...defaultStatisticalFeedbackConfig,
        sourceMode: 'current-session',
        metric: 'mean',
        dataSource: {
          ...defaultStatisticalFeedbackConfig.dataSource,
          currentVariable: 'score',
          key: 'score',
        },
      },
      { score: 88 }
    );

    expect(series.mode).toBe('current-session');
    expect(series.points[0]).toEqual({ label: 'score', value: 88 });
  });

  it('resolves nested current-session variable paths', async () => {
    const series = await resolveStatisticalFeedbackSeries(
      {
        ...defaultStatisticalFeedbackConfig,
        sourceMode: 'current-session',
        metric: 'mean',
        dataSource: {
          ...defaultStatisticalFeedbackConfig.dataSource,
          currentVariable: 'q_rt_value.derived.congruencyEffectMs',
          key: 'q_rt_value.derived.congruencyEffectMs',
        },
      },
      {
        q_rt_value: {
          derived: {
            congruencyEffectMs: 42.5,
          },
        },
      }
    );

    expect(series.points[0]).toEqual({ label: 'q_rt_value.derived.congruencyEffectMs', value: 42.5 });
  });

  it('resolves grouped current-session objects into chart points', async () => {
    const series = await resolveStatisticalFeedbackSeries(
      {
        ...defaultStatisticalFeedbackConfig,
        sourceMode: 'current-session',
        metric: 'mean',
        dataSource: {
          ...defaultStatisticalFeedbackConfig.dataSource,
          currentVariable: 'q_rt_value.byCondition',
          key: 'q_rt_value.byCondition',
        },
      },
      {
        q_rt_value: {
          byCondition: {
            congruent: { meanRT: 310, count: 12 },
            incongruent: { meanRT: 355, count: 12 },
          },
        },
      }
    );

    expect(series.points).toEqual([
      { label: 'congruent', value: 310 },
      { label: 'incongruent', value: 355 },
    ]);
  });

  it('uses analytics API for cohort mode', async () => {
    const aggregateSpy = vi.spyOn(sessionAnalyticsService, 'aggregate').mockResolvedValueOnce({
      questionnaireId: 'q1',
      source: 'variable',
      key: 'score',
      participantCount: 4,
      stats: {
        sampleCount: 4,
        mean: 75,
        median: 74,
        stdDev: 5,
        min: 68,
        max: 82,
        p10: 69,
        p25: 72,
        p50: 74,
        p75: 78,
        p90: 80,
        p95: 81,
        p99: 82,
      },
    });

    const series = await resolveStatisticalFeedbackSeries(
      {
        ...defaultStatisticalFeedbackConfig,
        sourceMode: 'cohort',
        metric: 'mean',
        dataSource: {
          ...defaultStatisticalFeedbackConfig.dataSource,
          questionnaireId: 'q1',
          key: 'score',
        },
      },
      {}
    );

    expect(aggregateSpy).toHaveBeenCalledTimes(1);
    expect(series.points[0]).toEqual({ label: 'Cohort', value: 75 });
  });
});
