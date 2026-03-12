import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { api } from '$lib/services/api';
import type { QuestionnaireSummary } from '$lib/types/api';

export interface AnalyticsPageData {
  organizationId: string;
  questionnaires: (QuestionnaireSummary & { project_name: string })[];
  projects: { id: string; name: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- parent layout data shape
export const load = async ({ parent, depends }: { parent: () => Promise<any>; depends: (dep: string) => void }) => {
  depends('app:organization');

  const { organizationId, user, session } = await parent();

  if (!browser) {
    return { organizationId: '', questionnaires: [], projects: [] } satisfies AnalyticsPageData;
  }

  if (!session || !user) {
    throw redirect(302, '/login');
  }

  if (!organizationId) {
    throw redirect(302, '/onboarding/organization');
  }

  let questionnaires: (QuestionnaireSummary & { project_name: string })[] = [];
  let projects: { id: string; name: string }[] = [];

  try {
    // Load dashboard data to get questionnaire summaries
    const dashboard = await api.sessions.dashboard(organizationId);
    // Load projects to get project names
    const projectList = await api.projects.list(organizationId);

    const projectMap = new Map(projectList.map((p) => [p.id, p.name]));
    projects = projectList.map((p) => ({ id: p.id, name: p.name }));

    questionnaires = dashboard.questionnaires.map((q) => ({
      ...q,
      project_name: projectMap.get(q.project_id) || 'Unknown',
    }));
  } catch (err) {
    console.error('Error loading analytics data:', err);
  }

  return { organizationId, questionnaires, projects } satisfies AnalyticsPageData;
};
