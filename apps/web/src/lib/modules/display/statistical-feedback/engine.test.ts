import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('resolves a namespaced subscale score field (score.<scaleId>.<field>)', async () => {
    // E-FEEDBACK-1: the runtime writes the computed scale score under a FLAT key
    // `score.anxiety` whose value is an object; a feedback widget binds to a field of it.
    const series = await resolveStatisticalFeedbackSeries(
      {
        ...defaultStatisticalFeedbackConfig,
        sourceMode: 'current-session',
        metric: 'mean',
        dataSource: {
          ...defaultStatisticalFeedbackConfig.dataSource,
          currentVariable: 'score.anxiety.tScore',
          key: 'score.anxiety.tScore',
        },
      },
      {
        'score.anxiety': { value: 18, tScore: 60, percentile: 84.1, band: 'Above Average' },
      }
    );

    expect(series.points[0]).toEqual({ label: 'score.anxiety.tScore', value: 60 });
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

  it('uses the authenticated analytics API for cohort mode in the designer (edit)', async () => {
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
      {},
      'edit'
    );

    expect(aggregateSpy).toHaveBeenCalledTimes(1);
    expect(series.points[0]).toEqual({ label: 'Cohort', value: 75 });
  });

  describe('F060 anonymous-safe cohort path (runtime)', () => {
    const cohortStatsPayload = {
      questionnaire_id: 'q1',
      source: 'variable',
      key: 'score',
      participant_count: 6,
      stats: {
        sample_count: 6,
        mean: 35,
        median: 35,
        std_dev: 10,
        min: 10,
        max: 60,
        p90: 55,
        p95: 58,
        p99: 60,
      },
    };

    function mockCohortFetch() {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => cohortStatsPayload,
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('cohort mode hits the public endpoint with NO Authorization header', async () => {
      const fetchMock = mockCohortFetch();
      const aggregateSpy = vi.spyOn(sessionAnalyticsService, 'aggregate');

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
        {},
        'runtime'
      );

      // Public endpoint, not the authenticated aggregate service.
      expect(aggregateSpy).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0] ?? [];
      const url = call[0];
      const init = call[1] as RequestInit | undefined;
      expect(String(url)).toContain('/api/questionnaires/q1/cohort-stats');
      expect(String(url)).toContain('key=score');
      // No init (or no headers) means no Authorization header is sent.
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization ?? headers.authorization).toBeUndefined();
      expect(series.mode).toBe('cohort');
      expect(series.points[0]).toEqual({ label: 'Cohort', value: 35 });
    });

    it('participant-vs-cohort builds the participant point from LOCAL variables + public cohort', async () => {
      const fetchMock = mockCohortFetch();

      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'participant-vs-cohort',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            questionnaireId: 'q1',
            key: 'score',
            currentVariable: 'score',
          },
        },
        { score: 45 },
        'runtime'
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(series.mode).toBe('participant-vs-cohort');
      // Participant point is the participant's own local score (45), NOT a
      // server read-back; Cohort is the public mean (35).
      expect(series.points).toEqual([
        { label: 'Participant', value: 45 },
        { label: 'Cohort', value: 35 },
      ]);
      // zScore = (45 - 35) / 10 = 1.
      expect(series.summary?.zScore).toBe(1);
    });

    it('participant-vs-participant is refused at runtime with the researcher-only message', async () => {
      const compareSpy = vi.spyOn(sessionAnalyticsService, 'compare');

      await expect(
        resolveStatisticalFeedbackSeries(
          {
            ...defaultStatisticalFeedbackConfig,
            sourceMode: 'participant-vs-participant',
            metric: 'mean',
            dataSource: {
              ...defaultStatisticalFeedbackConfig.dataSource,
              questionnaireId: 'q1',
              key: 'score',
              participantId: 'a',
              comparisonParticipantId: 'b',
            },
          },
          {},
          'runtime'
        )
      ).rejects.toThrow(/signed-in researcher/i);

      expect(compareSpy).not.toHaveBeenCalled();
    });
  });
});
