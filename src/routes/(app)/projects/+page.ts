import type { PageLoad } from './$types';
import { api } from '$lib/services/api';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';

export const ssr = false;

export const load: PageLoad = async ({ parent }) => {
  const { organizationId } = await parent();

  if (!organizationId) {
    throw error(403, 'No organization found');
  }

  try {
    const projects = await api.projects.list(organizationId);

    return {
      projects,
      organizationId
    };
  } catch (err) {
    console.error('Error fetching projects:', err);
    throw error(500, 'Failed to load projects');
  }
};