import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabase } from '$lib/services/supabase';
import type { DashboardData, DashboardQuestionnaire, DashboardActivity } from '$lib/types/dashboard';

export const load: PageLoad = async ({ parent, depends }) => {
  // This ensures the load function re-runs when invalidateAll() is called
  depends('app:organization');
  
  // Get data from parent layout
  const { organizationId, user, session } = await parent();
  
  // If no session at all, redirect to login
  if (!session || !user) {
    throw redirect(302, '/login');
  }
  
  // If authenticated but no organization, redirect to onboarding
  if (!organizationId) {
    throw redirect(302, '/onboarding/organization');
  }

  // Mock data with proper types for now
  const mockQuestionnaires: DashboardQuestionnaire[] = [
    {
      questionnaire_id: '1',
      name: 'Customer Satisfaction Survey',
      description: 'Quarterly customer feedback survey',
      status: 'published',
      total_responses: 156,
      completed_responses: 142,
      avg_completion_time: 240000, // 4 minutes in ms
      response_rate_7d: 23,
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-20T14:30:00Z'
    },
    {
      questionnaire_id: '2',
      name: 'Employee Engagement Survey',
      description: 'Annual employee satisfaction and engagement assessment',
      status: 'draft',
      total_responses: 0,
      completed_responses: 0,
      avg_completion_time: undefined,
      response_rate_7d: 0,
      created_at: '2024-01-18T09:00:00Z',
      updated_at: '2024-01-18T09:00:00Z'
    }
  ];

  const mockActivity: DashboardActivity[] = [
    {
      id: '1',
      questionnaire_id: '1',
      questionnaire_name: 'Customer Satisfaction Survey',
      participant_email: 'john.doe@example.com',
      status: 'completed',
      started_at: '2024-01-20T14:00:00Z',
      completed_at: '2024-01-20T14:04:00Z',
      response_time_ms: 240000 // 4 minutes
    },
    {
      id: '2',
      questionnaire_id: '1',
      questionnaire_name: 'Customer Satisfaction Survey',
      participant_email: 'jane.smith@example.com',
      status: 'in_progress',
      started_at: '2024-01-20T15:30:00Z',
      response_time_ms: undefined
    }
  ];

  const dashboardData: DashboardData = {
    user: user,
    questionnaires: mockQuestionnaires,
    recentActivity: mockActivity,
    stats: {
      totalQuestionnaires: 2,
      totalResponses: 156,
      activeQuestionnaires: 1,
      avgCompletionRate: 91
    }
  };

  return dashboardData;
};