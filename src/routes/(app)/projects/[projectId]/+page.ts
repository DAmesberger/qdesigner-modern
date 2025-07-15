import type { PageLoad } from './$types';
import { supabase } from '$lib/services/supabase';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, parent }) => {
  const { organizationId } = await parent();
  
  if (!organizationId) {
    throw error(403, 'No organization found');
  }
  
  // Fetch project details
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.projectId)
    .eq('organization_id', organizationId)
    .single();
    
  if (projectError || !project) {
    throw error(404, 'Project not found');
  }
  
  // Fetch questionnaires for this project
  const { data: questionnaires, error: questionnairesError } = await supabase
    .from('questionnaire_definitions')
    .select(`
      *,
      questionnaire_responses(count)
    `)
    .eq('project_id', params.projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
    
  if (questionnairesError) {
    console.error('Error fetching questionnaires:', questionnairesError);
    throw error(500, 'Failed to load questionnaires');
  }
  
  // Transform the data to include response count
  const questionnairesWithCount = questionnaires?.map(q => ({
    ...q,
    response_count: q.questionnaire_responses?.[0]?.count || 0
  })) || [];
  
  return {
    project,
    questionnaires: questionnairesWithCount,
    organizationId
  };
};