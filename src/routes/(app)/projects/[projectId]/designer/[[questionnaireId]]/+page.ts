import type { PageLoad } from './$types';
import { api } from '$lib/services/api';
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
  const resolveProjectOrganizationId = (input: any): string | null =>
    parentData.organizationId || input?.organizationId || input?.organization_id || null;

  // Try to load project data
  if (isOnline) {
    try {
      // Try network first when online
      const networkProject = await api.projects.get(params.projectId);

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
    if (isOnline) {
      try {
        // Try network first
        const networkQuestionnaire = await api.questionnaires.get(params.projectId, questionnaireId);

        if (networkQuestionnaire) {
          // Ensure we have a definition field with the correct structure
          const definition = (networkQuestionnaire as any).definition || networkQuestionnaire.content || {
            pages: [],
            questions: [],
            blocks: [],
            settings: {}
          };
          questionnaire = {
            ...networkQuestionnaire,
            definition,
            content: definition, // Also provide as content for compatibility
            organizationId: resolveProjectOrganizationId(project),
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
        organizationId: resolveProjectOrganizationId(project),
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
      organizationId: resolveProjectOrganizationId(project),
      isNew: true
    };
  }

  // Save session context for offline use
  await offlineData.saveSessionData('currentProject', {
    projectId: params.projectId,
    organizationId: resolveProjectOrganizationId(project),
  });

  return {
    ...parentData,
    project,
    questionnaire,
    projectId: params.projectId,
    isOffline: !isOnline
  };
};
