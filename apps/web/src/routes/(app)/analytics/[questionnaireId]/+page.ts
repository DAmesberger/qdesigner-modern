import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { api } from '$lib/services/api';
import type {
  QuestionnaireSummary,
  TimeSeriesBucket,
  SessionAggregateData,
  ExportRow,
} from '$lib/shared/types/api';

export interface QuestionnaireAnalyticsData {
  questionnaireId: string;
  summary: QuestionnaireSummary | null;
  timeseries: TimeSeriesBucket[];
  aggregate: SessionAggregateData | null;
  /** Raw per-session/question responses used to derive psychometrics (client-loaded). */
  exportRows: ExportRow[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- parent layout data shape
export const load = async ({ params, parent }: { params: { questionnaireId: string }; parent: () => Promise<any> }) => {
  const { session, user, organizationId } = await parent();

  if (!browser) {
    return {
      questionnaireId: params.questionnaireId,
      summary: null,
      timeseries: [],
      aggregate: null,
      exportRows: [],
    } satisfies QuestionnaireAnalyticsData;
  }

  if (!session || !user) {
    throw redirect(302, '/login');
  }

  if (!organizationId) {
    throw redirect(302, '/onboarding/organization');
  }

  const questionnaireId = params.questionnaireId;

  let summary: QuestionnaireSummary | null = null;
  let timeseries: TimeSeriesBucket[] = [];
  let aggregate: SessionAggregateData | null = null;
  let exportRows: ExportRow[] = [];

  try {
    // Load dashboard to find this questionnaire's summary
    const dashboard = await api.sessions.dashboard(organizationId);
    summary = dashboard.questionnaires.find((q) => q.id === questionnaireId) ?? null;

    // Load time-series data
    timeseries = await api.sessions.timeseries({
      questionnaireId,
      interval: 'day',
    });

    // Load raw responses for psychometrics (needs the owning project id from summary).
    if (summary?.project_id) {
      try {
        exportRows = await api.questionnaires.export(summary.project_id, questionnaireId, 'json');
      } catch (exportErr) {
        // Psychometrics is best-effort; the rest of the page still renders.
        console.error('Error loading responses for psychometrics:', exportErr);
      }
    }
  } catch (err) {
    console.error('Error loading questionnaire analytics:', err);
  }

  return {
    questionnaireId,
    summary,
    timeseries,
    aggregate,
    exportRows,
  } satisfies QuestionnaireAnalyticsData;
};
