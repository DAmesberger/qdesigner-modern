import type { PageLoad } from './$types';
import { supabase } from '$lib/services/supabase';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ parent }) => {
  const { organizationId, user } = await parent();
  
  if (!organizationId) {
    throw error(403, 'No organization found');
  }
  
  // Fetch projects for the organization
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select(`
      *,
      questionnaire_definitions(count)
    `)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
    
  if (projectsError) {
    console.error('Error fetching projects:', projectsError);
    throw error(500, 'Failed to load projects');
  }
  
  // Transform the data to include questionnaire count
  const projectsWithCount = projects?.map(project => ({
    ...project,
    questionnaire_count: project.questionnaire_definitions?.[0]?.count || 0
  })) || [];
  
  return {
    projects: projectsWithCount,
    organizationId
  };
};