import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabase } from '$lib/services/supabase';

export const load: PageLoad = async () => {
  // Get the current user session (client-side)
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.user) {
    throw redirect(302, '/login');
  }

  // For now, return minimal data to test authentication
  // We'll fetch the actual data from the component
  return {
    user: session.user,
    questionnaires: [],
    recentActivity: [],
    stats: {
      totalQuestionnaires: 0,
      totalResponses: 0,
      activeQuestionnaires: 0,
      avgCompletionRate: 0
    }
  };
};