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

    // Project + org role feed the lifecycle action menu (rename/archive/delete),
    // gated client-side and enforced server-side. Failures here are non-fatal —
    // the menu just stays hidden.
    const [questionnaires, members, orgMembers] = await Promise.all([
      api.questionnaires.list(params.projectId),
      api.projects.members.list(params.projectId).catch(() => []),
      api.organizations.members.list(organizationId).catch(() => []),
    ]);

    return {
      project,
      questionnaires,
      members,
      orgMembers,
      organizationId,
      currentUserId: user?.id ?? null,
    };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      throw error(404, 'Project not found');
    }
    console.error('Error loading project:', err);
    throw error(500, 'Failed to load project');
  }
};
