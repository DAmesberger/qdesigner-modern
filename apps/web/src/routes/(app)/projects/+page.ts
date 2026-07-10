import type { PageLoad } from './$types';
import { api } from '$lib/services/api';
import { error } from '@sveltejs/kit';

export const ssr = false;

export const load: PageLoad = async ({ parent }) => {
  const { organizationId, user } = await parent();

  if (!organizationId) {
    throw error(403, 'No organization found');
  }

  try {
    // Org owners/admins may manage (rename/archive/delete) every project in the
    // org; the per-card action menu is gated on this. Project-scoped owners who
    // are plain org members manage from the project detail page, which loads the
    // full project + org role context.
    const [projects, orgMembers] = await Promise.all([
      api.projects.list(organizationId),
      api.organizations.members.list(organizationId).catch(() => []),
    ]);

    const orgRole = orgMembers.find((m) => m.userId === user?.id)?.role ?? null;

    return {
      projects,
      organizationId,
      orgRole
    };
  } catch (err) {
    console.error('Error fetching projects:', err);
    throw error(500, 'Failed to load projects');
  }
};
