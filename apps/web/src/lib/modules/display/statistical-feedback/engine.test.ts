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

  describe('norm-table mode (E-FEEDBACK-2, offline)', () => {
    it('a participant value AT the norm mean yields 50th percentile / T=50', async () => {
      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'norm-table',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            currentVariable: 'anxiety',
            key: 'anxiety',
            // GAD-7 general population: mean 2.95.
            normTableId: 'gad7-general-population',
          },
        },
        { anxiety: 2.95 },
        'runtime'
      );

      expect(series.mode).toBe('norm-table');
      expect(series.summary?.percentile).toBeCloseTo(50, 4);
      expect(series.summary?.tScore).toBeCloseTo(50, 4);
      expect(series.summary?.zScore).toBeCloseTo(0, 6);
      expect(series.normSource).toContain('GAD-7');
      // Two points: the participant and the norm mean.
      expect(series.points[0]).toEqual({ label: 'You', value: 2.95 });
      expect(series.points[1]?.value).toBeCloseTo(2.95, 6);
    });

    it('a value +1 SD above the mean yields ~84th percentile / T=60', async () => {
      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'norm-table',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            currentVariable: 'anxiety',
            key: 'anxiety',
            // Custom norm: mean 10, sd 3 -> value 13 is +1 SD.
            normTableId: '__custom__',
            customNorm: { label: 'Adult community norm', mean: 10, sd: 3 },
          },
        },
        { anxiety: 13 },
        'runtime'
      );

      expect(series.summary?.zScore).toBeCloseTo(1, 6);
      expect(series.summary?.tScore).toBeCloseTo(60, 6);
      expect(series.summary?.percentile).toBeGreaterThan(83);
      expect(series.summary?.percentile).toBeLessThan(85);
      expect(series.normSource).toBe('Adult community norm');
    });

    it('throws when no norm is selected', async () => {
      await expect(
        resolveStatisticalFeedbackSeries(
          {
            ...defaultStatisticalFeedbackConfig,
            sourceMode: 'norm-table',
            metric: 'mean',
            dataSource: {
              ...defaultStatisticalFeedbackConfig.dataSource,
              currentVariable: 'anxiety',
              key: 'anxiety',
              normTableId: '',
            },
          },
          { anxiety: 5 },
          'runtime'
        )
      ).rejects.toThrow(/norm/i);
    });
  });

  describe('self-baseline mode (E-FEEDBACK-2, offline)', () => {
    it('emits [Baseline, Current] with a positive delta and RCI when a norm is referenced', async () => {
      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'self-baseline',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            currentVariable: 'post',
            key: 'post',
            baselineVariable: 'pre',
            // Custom norm with reliability enables the RCI: SD 10, rel 0.84 -> SEM 4.
            normTableId: '__custom__',
            customNorm: { label: 'norm', mean: 20, sd: 10, reliability: 0.84 },
          },
        },
        { pre: 20, post: 28 },
        'runtime'
      );

      expect(series.mode).toBe('self-baseline');
      expect(series.points).toEqual([
        { label: 'Baseline', value: 20 },
        { label: 'Current', value: 28 },
      ]);
      expect(series.summary?.deltaFromBaseline).toBe(8);
      // RCI = (28 - 20) / (sqrt(2) * 4) ≈ 1.414, sign follows post - pre.
      expect(series.summary?.rci).toBeGreaterThan(0);
      expect(series.summary?.rci).toBeCloseTo(8 / (Math.SQRT2 * 4), 6);
    });

    it('a decline flips the delta and RCI sign', async () => {
      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'self-baseline',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            currentVariable: 'post',
            key: 'post',
            baselineVariable: 'pre',
            normTableId: '__custom__',
            customNorm: { label: 'norm', mean: 20, sd: 10, reliability: 0.84 },
          },
        },
        { pre: 28, post: 20 },
        'runtime'
      );

      expect(series.summary?.deltaFromBaseline).toBe(-8);
      expect(series.summary?.rci).toBeLessThan(0);
    });

    it('delta only (rci null) when no norm reliability is available', async () => {
      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'self-baseline',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            currentVariable: 'post',
            key: 'post',
            baselineVariable: 'pre',
            normTableId: '',
          },
        },
        { pre: 10, post: 15 },
        'runtime'
      );

      expect(series.summary?.deltaFromBaseline).toBe(5);
      expect(series.summary?.rci).toBeNull();
    });

    it('throws when no baseline variable is configured', async () => {
      await expect(
        resolveStatisticalFeedbackSeries(
          {
            ...defaultStatisticalFeedbackConfig,
            sourceMode: 'self-baseline',
            metric: 'mean',
            dataSource: {
              ...defaultStatisticalFeedbackConfig.dataSource,
              currentVariable: 'post',
              key: 'post',
              baselineVariable: '',
            },
          },
          { post: 15 },
          'runtime'
        )
      ).rejects.toThrow(/baseline/i);
    });
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

  describe('server-variable mode (E-FEEDBACK-3, offline / zero-fetch)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    // A synced object bundle exactly as the runtime injects it (server-sync).
    const cohortBundle = {
      n: 142,
      mean: 40,
      sd: 8,
      min: 12,
      max: 68,
      p10: 30,
      p25: 35,
      median: 40,
      p75: 45,
      p90: 50,
      p95: 54,
      p99: 60,
      computedAt: '2026-07-04T12:00:00.000Z',
    };

    it('builds a participant-vs-cohort series from the injected bundle with NO fetch', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const aggregateSpy = vi.spyOn(sessionAnalyticsService, 'aggregate');
      const aggregatePublicSpy = vi.spyOn(sessionAnalyticsService, 'aggregatePublic');

      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'server-variable',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            currentVariable: 'score_anxiety',
            key: 'score_anxiety',
            serverVariable: 'cohortAnxiety',
          },
        },
        { score_anxiety: 48, cohortAnxiety: cohortBundle },
        'runtime'
      );

      // Zero network of any kind.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(aggregateSpy).not.toHaveBeenCalled();
      expect(aggregatePublicSpy).not.toHaveBeenCalled();

      expect(series.mode).toBe('participant-vs-cohort');
      expect(series.points).toEqual([
        { label: 'Participant', value: 48 },
        { label: 'Cohort', value: 40 },
      ]);
      // zScore = (48 - 40) / 8 = 1.
      expect(series.summary?.zScore).toBe(1);
      expect(series.summary?.cohortN).toBe(142);
      expect(series.distribution).toEqual({ mean: 40, stdDev: 8, n: 142 });
      expect(series.normSource).toContain('n=142');
    });

    it('walks into a dotted server-variable field caption but reads the whole bundle by name', async () => {
      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'server-variable',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            currentVariable: 'score.anxiety.value',
            key: 'score.anxiety.value',
            serverVariable: 'cohortAnxiety',
          },
        },
        {
          'score.anxiety': { value: 32, tScore: 45 },
          cohortAnxiety: cohortBundle,
        },
        'runtime'
      );

      expect(series.points[0]).toEqual({ label: 'Participant', value: 32 });
      expect(series.points[1]).toEqual({ label: 'Cohort', value: 40 });
    });

    it('below the anonymity floor (n<5, stats withheld) falls back to a bundled norm table', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'server-variable',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            currentVariable: 'anxiety',
            key: 'anxiety',
            serverVariable: 'cohortAnxiety',
            fallbackNormTableId: 'gad7-general-population',
          },
        },
        // Bundle present but below floor: n=3, numeric stats undefined.
        { anxiety: 2.95, cohortAnxiety: { n: 3, computedAt: '2026-07-04T12:00:00.000Z' } },
        'runtime'
      );

      expect(fetchMock).not.toHaveBeenCalled();
      // Fell through to the offline norm-table path.
      expect(series.mode).toBe('norm-table');
      expect(series.normSource).toContain('GAD-7');
    });

    it('below the floor with no fallback yields an honest empty cohort carrying cohortN', async () => {
      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'server-variable',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            currentVariable: 'anxiety',
            key: 'anxiety',
            serverVariable: 'cohortAnxiety',
          },
        },
        { anxiety: 55, cohortAnxiety: { n: 3, computedAt: '2026-07-04T12:00:00.000Z' } },
        'runtime'
      );

      expect(series.mode).toBe('participant-vs-cohort');
      expect(series.points).toEqual([
        { label: 'Participant', value: 55 },
        { label: 'Cohort', value: null },
      ]);
      expect(series.summary?.cohortN).toBe(3);
      expect(series.summary?.cohortMean).toBeNull();
    });

    it('never-synced server variable (undefined) yields an empty cohort with null n', async () => {
      const series = await resolveStatisticalFeedbackSeries(
        {
          ...defaultStatisticalFeedbackConfig,
          sourceMode: 'server-variable',
          metric: 'mean',
          dataSource: {
            ...defaultStatisticalFeedbackConfig.dataSource,
            currentVariable: 'anxiety',
            key: 'anxiety',
            serverVariable: 'cohortAnxiety',
          },
        },
        { anxiety: 55 /* cohortAnxiety never injected */ },
        'runtime'
      );

      expect(series.points[0]).toEqual({ label: 'Participant', value: 55 });
      expect(series.points[1]).toEqual({ label: 'Cohort', value: null });
      expect(series.summary?.cohortN).toBeNull();
    });

    it('validates that a current variable and a server variable are configured', () => {
      const errors = validateStatisticalFeedbackConfig({
        ...defaultStatisticalFeedbackConfig,
        sourceMode: 'server-variable',
        dataSource: {
          ...defaultStatisticalFeedbackConfig.dataSource,
          currentVariable: '',
          key: '',
          serverVariable: '',
        },
      });

      expect(errors.some((e) => /current variable/i.test(e))).toBe(true);
      expect(errors.some((e) => /server variable/i.test(e))).toBe(true);
    });
  });
});
