import type { PageLoad } from './$types';
import { supabase } from '$lib/services/supabase';
import { error } from '@sveltejs/kit';

export const ssr = false;

export const load: PageLoad = async ({ params, parent }) => {
  const { organizationId, session } = await parent();
  
  let actualOrganizationId = organizationId;
  
  // If no organizationId from parent, try to fetch it directly
  if (!actualOrganizationId && session?.user) {
    // Get the public user ID
    const { data: publicUser } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', session.user.id)
      .single();
      
    if (publicUser) {
      // Get the first organization
      const { data: orgMembers } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', publicUser.id)
        .eq('status', 'active')
        .limit(1);
        
      if (orgMembers && orgMembers.length > 0 && orgMembers[0]) {
        actualOrganizationId = orgMembers[0].organization_id;
      }
    }
  }
  
  if (!actualOrganizationId) {
    throw error(403, 'No organization found');
  }
  
  // Fetch project details
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.projectId)
    .eq('organization_id', actualOrganizationId)
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
      response_count: responseCounts ? responseCounts.filter(r => r.questionnaire_id === q.id).length : 0,
      avg_completion: (function() {
        const counts = responseCounts?.filter(r => r.questionnaire_id === q.id) || [];
        if (counts.length === 0) return 0;
        return counts.reduce((sum, r) => sum + (r.completion_percentage || 0), 0) / counts.length;
      })()
    }));
  }
  
  return {
    project,
    questionnaires: questionnairesWithCount,
    organizationId: actualOrganizationId
  };
};