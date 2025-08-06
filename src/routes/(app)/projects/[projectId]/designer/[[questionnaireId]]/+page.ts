import type { PageLoad } from './$types';
import { supabase } from '$lib/services/supabase';
import { offlineData } from '$lib/services/offline-data';
import { error } from '@sveltejs/kit';

// Disable SSR for the designer - it needs to run fully client-side for offline support
export const ssr = false;

// Disable prerendering as this is a dynamic app
export const prerender = false;

export const load: PageLoad = async ({ params, parent, url }) => {
  // Get auth data from parent layout
  const parentData = await parent();
  
  // Initialize offline data service
  await offlineData.init();
  
  let project = null;
  let questionnaire = null;
  const questionnaireId = params.questionnaireId;
  const isOnline = offlineData.isOnline();
  
  // Try to load project data
  // Use mock data for test projects
  if (params.projectId === 'test-project-1') {
    project = {
      id: 'test-project-1',
      name: 'Test Project',
      description: 'Test project for media rendering',
      organization_id: parentData.organizationId || 'test-org',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  } else if (isOnline) {
    try {
      // Try network first when online
      const { data: networkProject, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', params.projectId)
        .eq('organization_id', parentData.organizationId)
        .single();
      
      if (networkProject) {
        project = networkProject;
        // Cache for offline use
        await offlineData.cacheProject(project);
      }
    } catch (err) {
      console.warn('Failed to fetch project from network:', err);
    }
  }
  
  // Fall back to cache if no network data
  if (!project) {
    project = await offlineData.getCachedData('project', params.projectId);
    if (!project) {
      throw error(404, isOnline 
        ? 'Project not found' 
        : 'Project not available offline. Please connect to internet and try again.'
      );
    }
  }
  
  // Load questionnaire data
  if (questionnaireId && questionnaireId !== 'new') {
    // Use mock data for test questionnaires
    if (questionnaireId === '1' || questionnaireId === '2') {
      questionnaire = {
        id: questionnaireId,
        name: `Test Questionnaire ${questionnaireId}`,
        description: 'Test questionnaire for media rendering',
        project_id: params.projectId,
        organizationId: parentData.organizationId || project.organization_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        definition: {
          pages: [],
          questions: [],
          settings: {}
        }
      };
    } else if (isOnline) {
      try {
        // Try network first
        const { data: networkQuestionnaire, error: qError } = await supabase
          .from('questionnaire_definitions')
          .select('*')
          .eq('id', questionnaireId)
          .eq('project_id', params.projectId)
          .single();
        
        if (qError) {
          console.error('[DEBUG] Error fetching questionnaire:', qError);
        }
        
        if (networkQuestionnaire) {
          console.log('[DEBUG] Fetched questionnaire from network:', networkQuestionnaire);
          questionnaire = {
            ...networkQuestionnaire,
            organizationId: parentData.organizationId || project.organization_id
          };
          // Cache for offline use
          await offlineData.cacheQuestionnaire(questionnaire);
        }
      } catch (err) {
        console.warn('Failed to fetch questionnaire from network:', err);
      }
    }
    
    // Fall back to cache
    if (!questionnaire) {
      const cachedQuestionnaire = await offlineData.getCachedData('questionnaire', questionnaireId);
      if (!cachedQuestionnaire) {
        throw error(404, isOnline
          ? 'Questionnaire not found'
          : 'Questionnaire not available offline. Please connect to internet and try again.'
        );
      }
      questionnaire = {
        ...cachedQuestionnaire,
        organizationId: parentData.organizationId || project.organization_id
      };
    }
  } else if (questionnaireId === 'new') {
    // Creating a new questionnaire
    const name = url.searchParams.get('name') || 'New Questionnaire';
    const description = url.searchParams.get('description') || '';
    
    questionnaire = {
      id: null,
      name,
      description,
      projectId: params.projectId,
      organizationId: parentData.organizationId || project.organization_id,
      isNew: true
    };
  }
  
  // Save session context for offline use
  await offlineData.saveSessionData('currentProject', {
    projectId: params.projectId,
    organizationId: parentData.organizationId || project.organization_id
  });
  
  return {
    ...parentData,
    project,
    questionnaire,
    projectId: params.projectId,
    isOffline: !isOnline
  };
};