import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionAnalyticsService } from './sessionAnalytics';
import { api } from './api';

const aggregateMock = vi.spyOn(api.sessions, 'aggregate');
const compareMock = vi.spyOn(api.sessions, 'compare');

describe('sessionAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds participant-vs-cohort series with computed z-score', async () => {
    aggregateMock.mockResolvedValueOnce({
      questionnaireId: 'q1',
      source: 'variable',
      key: 'score',
      participantCount: 1,
      stats: {
        sampleCount: 1,
        mean: 84,
        median: 84,
        stdDev: 0,
        min: 84,
        max: 84,
        p10: 84,
        p25: 84,
        p50: 84,
        p75: 84,
        p90: 84,
        p95: 84,
        p99: 84,
      },
    });

    aggregateMock.mockResolvedValueOnce({
      questionnaireId: 'q1',
      source: 'variable',
      key: 'score',
      participantCount: 20,
      stats: {
        sampleCount: 20,
        mean: 70,
        median: 69,
        stdDev: 7,
        min: 40,
        max: 95,
        p10: 55,
        p25: 63,
        p50: 69,
        p75: 76,
        p90: 82,
        p95: 88,
        p99: 94,
      },
    });

    const series = await sessionAnalyticsService.buildParticipantVsCohortSeries({
      questionnaireId: 'q1',
      source: 'variable',
      key: 'score',
      participantId: 'p1',
      metric: 'mean',
    });

    expect(series.mode).toBe('participant-vs-cohort');
    expect(series.points).toEqual([
      { label: 'Participant', value: 84 },
      { label: 'Cohort', value: 70 },
    ]);
    expect(series.summary?.zScore).toBeCloseTo(2);
  });

  it('maps participant comparison into chart series', () => {
    const series = sessionAnalyticsService.buildParticipantComparisonSeries({
      metric: 'median',
      comparison: {
        questionnaireId: 'q2',
        source: 'response',
        key: 'q_rt',
        left: {
          participantId: 'left',
          stats: {
            sampleCount: 10,
            mean: 420,
            median: 410,
            stdDev: 30,
            min: 350,
            max: 500,
            p10: 360,
            p25: 390,
            p50: 410,
            p75: 445,
            p90: 470,
            p95: 490,
            p99: 499,
          },
        },
        right: {
          participantId: 'right',
          stats: {
            sampleCount: 10,
            mean: 510,
            median: 505,
            stdDev: 45,
            min: 430,
            max: 620,
            p10: 450,
            p25: 480,
            p50: 505,
            p75: 535,
            p90: 575,
            p95: 600,
            p99: 618,
          },
        },
        delta: {
          meanDelta: -90,
          medianDelta: -95,
          zScore: -2,
        },
      },
    });

    expect(series.mode).toBe('participant-vs-participant');
    expect(series.points[0]).toEqual({ label: 'left', value: 410 });
    expect(series.points[1]).toEqual({ label: 'right', value: 505 });
    expect(series.summary?.meanDelta).toBe(-90);
  });

  it('delegates compare requests to API session compare endpoint', async () => {
    compareMock.mockResolvedValueOnce({
      questionnaireId: 'q3',
      source: 'variable',
      key: 'score',
      left: {
        participantId: 'p1',
        stats: {
          sampleCount: 1,
          mean: 10,
          median: 10,
          stdDev: 0,
          min: 10,
          max: 10,
          p10: 10,
          p25: 10,
          p50: 10,
          p75: 10,
          p90: 10,
          p95: 10,
          p99: 10,
        },
      },
      right: {
        participantId: 'p2',
        stats: {
          sampleCount: 1,
          mean: 11,
          median: 11,
          stdDev: 0,
          min: 11,
          max: 11,
          p10: 11,
          p25: 11,
          p50: 11,
          p75: 11,
          p90: 11,
          p95: 11,
          p99: 11,
        },
      },
      delta: {
        meanDelta: -1,
        medianDelta: -1,
        zScore: null,
      },
    });

    const response = await sessionAnalyticsService.compare({
      questionnaireId: 'q3',
      source: 'variable',
      key: 'score',
      leftParticipantId: 'p1',
      rightParticipantId: 'p2',
    });

    expect(compareMock).toHaveBeenCalledTimes(1);
    expect(response.delta.meanDelta).toBe(-1);
  });
});
