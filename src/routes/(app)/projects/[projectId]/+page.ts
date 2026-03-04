import type { PageLoad } from './$types';
import { api } from '$lib/services/api';
import { error } from '@sveltejs/kit';

export const ssr = false;

export const load: PageLoad = async ({ params, parent }) => {
  const { organizationId } = await parent();

  if (!organizationId) {
    throw error(403, 'No organization found');
  }

  try {
    const project = await api.projects.get(params.projectId);

    if (!project) {
      throw error(404, 'Project not found');
    }

    const questionnaires = await api.questionnaires.list(params.projectId);

    return {
      project,
      questionnaires,
      organizationId,
    };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      throw error(404, 'Project not found');
    }
    console.error('Error loading project:', err);
    throw error(500, 'Failed to load project');
  }
};
