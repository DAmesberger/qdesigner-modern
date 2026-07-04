import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { api } from '$lib/services/api';
import { browser } from '$app/environment';

/**
 * Client-side role guard for the /admin surface. The parent (app) layout
 * already enforces authentication; here we additionally require the caller
 * to be an owner or admin of their organization. Non-admins (members,
 * viewers) are redirected to /dashboard. Fails closed: if the role cannot
 * be resolved, access is denied.
 */
export const load: LayoutLoad = async ({ parent }) => {
  // Role resolution needs the authenticated API client, which is only
  // available in the browser. SSR returns no data and the (app) layout
  // handles the client-side auth redirect.
  if (!browser) return {};

  const { user, organizationId } = await parent();

  let role: string | undefined;
  if (user && organizationId) {
    try {
      const members = await api.organizations.members.list(organizationId);
      role = members.find((m) => m.userId === user.id)?.role;
    } catch (err) {
      console.error('Admin guard: failed to resolve organization role', err);
    }
  }

  if (role !== 'owner' && role !== 'admin') {
    throw redirect(303, '/dashboard');
  }

  return { role };
};
