import type { TimeSeriesBucket } from '$lib/shared/types/api';

/**
 * Headline metrics for the guest (share-grantee) analytics view.
 *
 * A questionnaire-share grantee cannot reach the org dashboard summary or the
 * project-scoped export, so the guest view derives everything it can from the
 * one series it *is* allowed to read: `GET /api/sessions/timeseries`.
 */
export interface GuestAnalyticsSummary {
  totalSessions: number;
  totalCompleted: number;
  /** Completion percentage in the 0–100 range (0 when no sessions started). */
  completionRate: number;
  /** Mean of the per-bucket averages, or null when no bucket carries a time. */
  avgCompletionMs: number | null;
}

export function deriveGuestSummary(timeseries: TimeSeriesBucket[]): GuestAnalyticsSummary {
  const totalSessions = timeseries.reduce((sum, b) => sum + b.sessions_started, 0);
  const totalCompleted = timeseries.reduce((sum, b) => sum + b.sessions_completed, 0);
  const completionRate = totalSessions > 0 ? (totalCompleted / totalSessions) * 100 : 0;

  const withTime = timeseries.filter((b) => b.avg_completion_ms !== null);
  const avgCompletionMs =
    withTime.length === 0
      ? null
      : withTime.reduce((sum, b) => sum + (b.avg_completion_ms ?? 0), 0) / withTime.length;

  return { totalSessions, totalCompleted, completionRate, avgCompletionMs };
}
