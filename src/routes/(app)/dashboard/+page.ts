import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { api } from '$lib/services/api';
import type { DashboardData, DashboardQuestionnaire } from '$lib/types/dashboard';

export const load: PageLoad = async ({ parent, depends }) => {
  depends('app:organization');

  const { organizationId, user, session } = await parent();

  // During SSR, return empty defaults
  if (!browser) {
    return {
      user: null,
      questionnaires: [],
      recentActivity: [],
      stats: {
        totalQuestionnaires: 0,
        totalResponses: 0,
        activeQuestionnaires: 0,
        avgCompletionRate: 0
      }
    };
  }

  if (!session || !user) {
    throw redirect(302, '/login');
  }

  if (!organizationId) {
    throw redirect(302, '/onboarding/organization');
  }

  // Fetch real data from the API
  let questionnaires: DashboardQuestionnaire[] = [];

  try {
    // Get all projects for this organization
    const projects = await api.projects.list(organizationId);

    // Fetch questionnaires from each project
    const allQuestionnaires = await Promise.all(
      projects.map(async (project) => {
        try {
          const qs = await api.questionnaires.list(project.id);
          return qs.map((q) => ({
            questionnaire_id: q.id,
            project_id: project.id,
            name: q.name,
            description: q.description,
            status: (q.status || 'draft') as 'draft' | 'published' | 'archived',
            total_responses: 0, // TODO: add response count API
            completed_responses: 0,
            avg_completion_time: undefined,
            response_rate_7d: 0,
            created_at: q.created_at || new Date().toISOString(),
            updated_at: q.updated_at || new Date().toISOString()
          }));
        } catch {
          return [];
        }
      })
    );

    questionnaires = allQuestionnaires.flat();
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
  }

  const totalQuestionnaires = questionnaires.length;
  const activeQuestionnaires = questionnaires.filter((q) => q.status === 'published').length;
  const totalResponses = questionnaires.reduce((sum, q) => sum + q.total_responses, 0);
  const avgCompletionRate =
    totalResponses > 0
      ? Math.round(
          (questionnaires.reduce((sum, q) => sum + q.completed_responses, 0) / totalResponses) * 100
        )
      : 0;

  const dashboardData: DashboardData = {
    user,
    questionnaires,
    recentActivity: [], // TODO: add activity API endpoint
    stats: {
      totalQuestionnaires,
      totalResponses,
      activeQuestionnaires,
      avgCompletionRate
    }
  };

  return dashboardData;
};
