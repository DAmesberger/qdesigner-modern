import type { PageLoad } from './$types';
import { api } from '$lib/services/api';
import { error } from '@sveltejs/kit';

export const ssr = false;

export const load: PageLoad = async ({ params, parent }) => {
  const { organizationId, user } = await parent();

  if (!organizationId) {
    throw error(403, 'No organization found');
  }

  try {
    const project = await api.projects.get(params.projectId);
    if (!project) {
      throw error(404, 'Project not found');
    }

    // Project members are readable by any project reader; the mutation
    // controls are gated client-side (and server-enforced) on the viewer's
    // effective role. Org members feed the add-member picker.
    const [members, orgMembers] = await Promise.all([
      api.projects.members.list(params.projectId),
      api.organizations.members.list(organizationId).catch(() => []),
    ]);

    return {
      project,
      members,
      orgMembers,
      organizationId,
      currentUserId: user?.id ?? null,
    };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'status' in err &&
      (err as { status: number }).status === 404
    ) {
      throw error(404, 'Project not found');
    }
    if (
      err &&
      typeof err === 'object' &&
      'status' in err &&
      (err as { status: number }).status === 403
    ) {
      throw error(403, 'You do not have access to this project');
    }
    console.error('Error loading project members:', err);
    throw error(500, 'Failed to load project members');
  }
};
