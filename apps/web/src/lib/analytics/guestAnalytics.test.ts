import { describe, it, expect } from 'vitest';
import { deriveGuestSummary } from './guestAnalytics';
import type { TimeSeriesBucket } from '$lib/shared/types/api';

function bucket(partial: Partial<TimeSeriesBucket>): TimeSeriesBucket {
  return {
    timestamp: '2026-07-01T00:00:00Z',
    sessions_started: 0,
    sessions_completed: 0,
    avg_completion_ms: null,
    ...partial,
  };
}

describe('deriveGuestSummary', () => {
  it('returns zeroed metrics for an empty series', () => {
    expect(deriveGuestSummary([])).toEqual({
      totalSessions: 0,
      totalCompleted: 0,
      completionRate: 0,
      avgCompletionMs: null,
    });
  });

  it('sums started/completed across buckets', () => {
    const summary = deriveGuestSummary([
      bucket({ sessions_started: 4, sessions_completed: 2 }),
      bucket({ sessions_started: 6, sessions_completed: 3 }),
    ]);
    expect(summary.totalSessions).toBe(10);
    expect(summary.totalCompleted).toBe(5);
    expect(summary.completionRate).toBe(50);
  });

  it('averages only the buckets that carry a completion time', () => {
    const summary = deriveGuestSummary([
      bucket({ sessions_started: 1, avg_completion_ms: 1000 }),
      bucket({ sessions_started: 1, avg_completion_ms: null }),
      bucket({ sessions_started: 1, avg_completion_ms: 3000 }),
    ]);
    expect(summary.avgCompletionMs).toBe(2000);
  });

  it('avoids divide-by-zero when no sessions started', () => {
    const summary = deriveGuestSummary([bucket({ sessions_started: 0, sessions_completed: 0 })]);
    expect(summary.completionRate).toBe(0);
    expect(summary.avgCompletionMs).toBe(null);
  });
});
