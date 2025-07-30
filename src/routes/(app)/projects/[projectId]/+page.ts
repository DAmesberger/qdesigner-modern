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
    .select('*')
    .eq('project_id', params.projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
    
  if (questionnairesError) {
    console.error('Error fetching questionnaires:', questionnairesError);
    throw error(500, 'Failed to load questionnaires');
  }
  
  // Get response counts separately
  let questionnairesWithCount = questionnaires || [];
  
  if (questionnaires && questionnaires.length > 0) {
    const questionnaireIds = questionnaires.map(q => q.id);
    
    const { data: responseCounts } = await supabase
      .from('questionnaire_responses')
      .select('questionnaire_id, completion_percentage')
      .in('questionnaire_id', questionnaireIds);
      
    // Add response counts to questionnaires
    questionnairesWithCount = questionnaires.map(q => ({
      ...q,
      response_count: responseCounts?.filter(r => r.questionnaire_id === q.id).length || 0,
      avg_completion: responseCounts
        ?.filter(r => r.questionnaire_id === q.id)
        .reduce((sum, r) => sum + (r.completion_percentage || 0), 0) / 
        (responseCounts?.filter(r => r.questionnaire_id === q.id).length || 1) || 0
    }));
  }
  
  return {
    project,
    questionnaires: questionnairesWithCount,
    organizationId
  };
};