import { browser } from '$app/environment';
import { api } from '$lib/services/api';
import type { SharedResource } from '$lib/services/api/shares';
import type { TimeSeriesBucket } from '$lib/shared/types/api';
import type { PageLoad } from './$types';

export interface SharedAnalyticsData {
  questionnaireId: string;
  /**
   * false when the share was revoked, expired, or was never granted to this
   * user — the grantee-safe endpoints all 403 in that case, so the page shows a
   * friendly "no longer available" state instead of a raw error.
   */
  available: boolean;
  share: SharedResource | null;
  timeseries: TimeSeriesBucket[];
  armCounts: Record<string, number>;
}

export const load: PageLoad = async ({ params }): Promise<SharedAnalyticsData> => {
  const questionnaireId = params.id;
  const unavailable: SharedAnalyticsData = {
    questionnaireId,
    available: false,
    share: null,
    timeseries: [],
    armCounts: {},
  };

  // The (app) layout guards auth and the API needs a browser-held token, so
  // there is nothing to load during SSR.
  if (!browser) {
    return { ...unavailable, available: true };
  }

  // The share row is the source of truth for the questionnaire name (a
  // questionnaire share does not grant project read, so we can't fetch the
  // questionnaire itself). A revoked/expired grant drops out of this list.
  let share: SharedResource | null = null;
  try {
    const shared = await api.shares.sharedWithMe();
    share =
      shared.find(
        (s) => s.resource_type === 'questionnaire' && s.resource_id === questionnaireId
      ) ?? null;
  } catch {
    return unavailable;
  }

  if (!share) {
    return unavailable;
  }

  // Timeseries is grantee-safe (verify_questionnaire_access). A 403 here means
  // the grant was revoked between the list and this call — degrade gracefully.
  let timeseries: TimeSeriesBucket[] = [];
  try {
    timeseries = await api.sessions.timeseries({ questionnaireId, interval: 'day' });
  } catch {
    return unavailable;
  }

  // Arm balance is best-effort: no between-subjects design ⇒ empty, not fatal.
  let armCounts: Record<string, number> = {};
  try {
    armCounts = await api.questionnaires.armCounts(questionnaireId);
  } catch {
    armCounts = {};
  }

  return { questionnaireId, available: true, share, timeseries, armCounts };
};
