/**
 * Completion rate — one definition, so the product stops contradicting itself.
 *
 * The denominator is **sessions started**. It is never a response-row count:
 * `total_responses` in the dashboard/analytics payloads is `COUNT(DISTINCT r.id)`,
 * one row per *answered question*, so a ten-question questionnaire yields roughly
 * ten response rows per session. Dividing completed sessions by that reported a
 * study every participant finished as ~10% complete.
 *
 * The server computes the same quantity the same way
 * (`api/sessions/models.rs::completion_rate`).
 */

/** Fraction in [0, 1]. Zero sessions → `null`: no evidence, which is not 0%. */
export function completionRate(
  completedSessions: number,
  totalSessions: number
): number | null {
  if (!Number.isFinite(totalSessions) || totalSessions <= 0) return null;
  return completedSessions / totalSessions;
}

/** Rounded percentage for display; `'-'` when there are no sessions to rate. */
export function formatCompletionRate(
  completedSessions: number,
  totalSessions: number
): string {
  const rate = completionRate(completedSessions, totalSessions);
  if (rate === null) return '-';
  return `${Math.round(rate * 100)}%`;
}
