import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabase } from '$lib/services/supabase';

export const load: PageServerLoad = async ({ locals, url }) => {
  // Get the current user session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.user) {
    throw redirect(302, '/login');
  }

  // Get dashboard statistics using our database function
  const { data: questionnaires, error: questionnairesError } = await supabase
    .rpc('get_questionnaire_dashboard_stats', { p_user_id: session.user.id });

  if (questionnairesError) {
    console.error('Error fetching questionnaires:', questionnairesError);
  }

  // Get recent activity
  const { data: recentActivity, error: activityError } = await supabase
    .rpc('get_user_recent_activity', { 
      p_user_id: session.user.id,
      p_limit: 10 
    });

  if (activityError) {
    console.error('Error fetching recent activity:', activityError);
  }

  // Calculate summary statistics
  const totalQuestionnaires = questionnaires?.length || 0;
  const totalResponses = questionnaires?.reduce((sum, q) => sum + Number(q.total_responses || 0), 0) || 0;
  const activeQuestionnaires = questionnaires?.filter(q => q.status === 'published').length || 0;
  const avgCompletionRate = questionnaires?.length > 0
    ? questionnaires.reduce((sum, q) => {
        const rate = q.total_responses > 0 
          ? (Number(q.completed_responses) / Number(q.total_responses)) * 100 
          : 0;
        return sum + rate;
      }, 0) / questionnaires.length
    : 0;

  // Get user info
  const { data: userData } = await supabase
    .from('users')
    .select('*, organizations(*)')
    .eq('id', session.user.id)
    .single();

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