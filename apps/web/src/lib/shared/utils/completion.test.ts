import { describe, it, expect } from 'vitest';
import { completionRate, formatCompletionRate } from './completion';
import type { QuestionnaireSummary } from '$lib/shared/types/api';

/**
 * The bug this locks down: the analytics dashboard divided completed sessions by
 * `total_responses` — a response-ROW count, one row per answered question. A
 * ten-question questionnaire that every participant completed reported ~10%.
 */
describe('completionRate', () => {
  it('reports a fully-completed 10-question study as 100%, not ~10%', () => {
    // Exactly the payload the dashboard returns for ten completed sessions of a
    // ten-question questionnaire: 10 sessions, 10 completed, ~100 response rows.
    const q: Pick<
      QuestionnaireSummary,
      'total_responses' | 'total_sessions' | 'completed_sessions'
    > = {
      total_responses: 100,
      total_sessions: 10,
      completed_sessions: 10,
    };

    expect(formatCompletionRate(q.completed_sessions, q.total_sessions)).toBe('100%');

    // The old denominator, spelled out, so the failure mode is unmistakable.
    expect(
      formatCompletionRate(q.completed_sessions, q.total_responses)
    ).toBe('10%');
  });

  it('divides by sessions started', () => {
    expect(completionRate(1, 4)).toBe(0.25);
    expect(formatCompletionRate(1, 4)).toBe('25%');
    expect(formatCompletionRate(11, 14)).toBe('79%');
  });

  it('returns null rather than 0 when there are no sessions', () => {
    // No sessions is no evidence — it is not a 0% completion rate.
    expect(completionRate(0, 0)).toBeNull();
    expect(formatCompletionRate(0, 0)).toBe('-');
  });

  it('never exceeds 100% — the denominator cannot be smaller than the numerator', () => {
    // The `.max(completed_sessions)` fudge in the old server code existed only
    // because total_responses could fall below completed_sessions. With a real
    // session count that is impossible: every completed session IS a session.
    expect(completionRate(10, 10)).toBe(1);
    expect(completionRate(3, 10)).toBeLessThan(1);
  });
});
