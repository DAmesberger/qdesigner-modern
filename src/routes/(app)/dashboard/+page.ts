import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { api } from '$lib/services/api';
import type {
  DashboardData,
  DashboardQuestionnaire,
  DashboardActivity,
} from '$lib/types/dashboard';

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
        avgCompletionRate: 0,
      },
    };
  }

  if (!session || !user) {
    throw redirect(302, '/login');
  }

  if (!organizationId) {
    throw redirect(302, '/onboarding/organization');
  }

  let questionnaires: DashboardQuestionnaire[] = [];
  let recentActivity: DashboardActivity[] = [];
  let stats = {
    totalQuestionnaires: 0,
    totalResponses: 0,
    activeQuestionnaires: 0,
    avgCompletionRate: 0,
  };

  try {
    const dashboard = await api.sessions.dashboard(organizationId);

    questionnaires = dashboard.questionnaires.map((q) => ({
      questionnaire_id: q.id,
      project_id: q.project_id,
      name: q.name,
      status: (q.status || 'draft') as 'draft' | 'published' | 'archived',
      total_responses: q.total_responses,
      completed_responses: q.completed_sessions,
      avg_completion_time: q.avg_completion_time_ms ?? undefined,
      response_rate_7d: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    recentActivity = dashboard.recent_activity.map((a) => ({
      id: a.session_id,
      questionnaire_id: a.session_id,
      questionnaire_name: a.questionnaire_name,
      participant_id: a.participant_id ?? undefined,
      participant_email: a.participant_id || 'Anonymous',
      status: (a.status === 'active' ? 'in_progress' : a.status) as
        | 'completed'
        | 'in_progress'
        | 'abandoned',
      started_at: a.started_at || new Date().toISOString(),
      completed_at: a.completed_at ?? undefined,
      response_time_ms:
        a.started_at && a.completed_at
          ? new Date(a.completed_at).getTime() - new Date(a.started_at).getTime()
          : undefined,
    }));

    stats = {
      totalQuestionnaires: dashboard.stats.total_questionnaires,
      totalResponses: dashboard.stats.total_responses,
      activeQuestionnaires: dashboard.stats.active_questionnaires,
      avgCompletionRate: Math.round(dashboard.stats.avg_completion_rate * 100),
    };
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
  }

  const dashboardData: DashboardData = {
    user,
    questionnaires,
    recentActivity,
    stats,
  };

  return dashboardData;
};
