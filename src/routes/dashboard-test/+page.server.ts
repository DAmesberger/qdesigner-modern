import type { PageServerLoad } from './$types';
import { supabase } from '$lib/services/supabase';

export const load: PageServerLoad = async () => {
  // For testing, we'll use the test user ID directly
  const testUserId = '00000000-0000-0000-0000-000000000001';

  // Get dashboard statistics using our database function
  const { data: questionnaires, error: questionnairesError } = await supabase
    .rpc('get_questionnaire_dashboard_stats', { p_user_id: testUserId });

  if (questionnairesError) {
    console.error('Error fetching questionnaires:', questionnairesError);
  }

  // Get recent activity
  const { data: recentActivity, error: activityError } = await supabase
    .rpc('get_user_recent_activity', { 
      p_user_id: testUserId,
      p_limit: 10 
    });

  if (activityError) {
    console.error('Error fetching recent activity:', activityError);
  }

  // Calculate summary statistics
  const totalQuestionnaires = questionnaires?.length || 0;
  const totalResponses = questionnaires?.reduce((sum: number, q: any) => sum + Number(q.total_responses || 0), 0) || 0;
  const activeQuestionnaires = questionnaires?.filter((q: any) => q.status === 'published').length || 0;
  const avgCompletionRate = questionnaires?.length > 0
    ? questionnaires.reduce((sum: number, q: any) => {
        const rate = q.total_responses > 0 
          ? (Number(q.completed_responses) / Number(q.total_responses)) * 100 
          : 0;
        return sum + rate;
      }, 0) / questionnaires.length
    : 0;

  // Mock user data for testing
  const userData = {
    id: testUserId,
    email: 'test@example.com',
    full_name: 'Test User',
    role: 'admin',
    organizations: {
      name: 'Test Organization'
    }
  };

  return {
    user: userData,
    questionnaires: questionnaires || [],
    recentActivity: recentActivity || [],
    stats: {
      totalQuestionnaires,
      totalResponses,
      activeQuestionnaires,
      avgCompletionRate: Math.round(avgCompletionRate)
    }
  };
};