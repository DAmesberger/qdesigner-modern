import type {
  SeriesPromptResolution,
  CompletePromptResponse,
} from '$lib/api/generated/types.gen';

/**
 * Participant-facing longitudinal / EMA series client (E-FLOW-2).
 *
 * Anonymous: the unguessable `resume_token` from the reminder link is the
 * credential. Uses raw `fetch` (same as the rest of the fillout loader,
 * which hits `/api/questionnaires/by-code`, `/api/sessions`, branding,
 * etc. directly) rather than the auth-attached generated SDK — a
 * participant has no session/JWT.
 *
 * The server admits these via `set_series_rls_context`, which parses the
 * token out of the URL path into the `app.enrollment_token` GUC.
 */
export class SeriesEnrollmentService {
  /** State-changing fetches carry the CSRF marker the server's csrf layer requires. */
  private static readonly csrfHeaders = { 'X-Requested-With': 'XMLHttpRequest' };

  /**
   * Resolve a reminder-link token to the current wave: which wave, its
   * label, days since enrollment (for `_seriesElapsedDays`), the version
   * to pin, and the enrollment status. Returns null on an unknown/expired
   * token or any network error (the caller falls back to a plain fillout).
   */
  static async resolve(resumeToken: string): Promise<SeriesPromptResolution | null> {
    try {
      const res = await fetch(`/api/series/prompt/${encodeURIComponent(resumeToken)}`);
      if (!res.ok) return null;
      return (await res.json()) as SeriesPromptResolution;
    } catch {
      return null;
    }
  }

  /**
   * Post completion back so the server advances the enrollment and
   * schedules the next wave. Binds `sessionId` to the wave prompt. Returns
   * the new enrollment status + next wave info, or null on failure (the
   * completion is best-effort from the participant's side — the wave's
   * answers are already persisted via the normal fillout write path).
   */
  static async complete(
    resumeToken: string,
    sessionId: string,
    waveIndex?: number
  ): Promise<CompletePromptResponse | null> {
    try {
      const res = await fetch(
        `/api/series/prompt/${encodeURIComponent(resumeToken)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.csrfHeaders },
          body: JSON.stringify({ session_id: sessionId, wave_index: waveIndex }),
        }
      );
      if (!res.ok) return null;
      return (await res.json()) as CompletePromptResponse;
    } catch {
      return null;
    }
  }

  /**
   * Opt the participant out of the series (status → withdrawn). Returns
   * true on success.
   */
  static async unsubscribe(resumeToken: string): Promise<boolean> {
    try {
      const res = await fetch(
        `/api/series/prompt/${encodeURIComponent(resumeToken)}/unsubscribe`,
        { method: 'POST', headers: this.csrfHeaders }
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
