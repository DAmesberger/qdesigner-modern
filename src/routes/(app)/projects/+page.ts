import type { PageLoad } from './$types';
import { supabase } from '$lib/services/supabase';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';

export const ssr = false;

export const load: PageLoad = async ({ parent }) => {
  const { organizationId, user, session } = await parent();
  
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
        
      if (orgMembers && orgMembers.length > 0) {
        actualOrganizationId = orgMembers[0].organization_id;
      }
    }
  }
  
  if (!actualOrganizationId) {
    throw error(403, 'No organization found');
  }
  
  // Fetch projects for the organization
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select(`
      *,
      questionnaire_definitions(count)
    `)
    .eq('organization_id', actualOrganizationId)
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
    organizationId: actualOrganizationId
  };
};