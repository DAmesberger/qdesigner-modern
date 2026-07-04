import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { browser } from '$app/environment';
import { auth } from '$lib/services/auth';
import { api } from '$lib/services/api';

// Same-origin relative redirect target (must start with a single '/').
function safeRedirect(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

export const load: PageLoad = async ({ url }) => {
  // Check if already logged in
  if (browser) {
    const session = await auth.getSession();

    if (session) {
      const redirectTarget = safeRedirect(url.searchParams.get('redirect'));

      try {
        const orgs = await api.organizations.list();

        if (redirectTarget) {
          // Honor an explicit post-login destination
          throw redirect(303, redirectTarget);
        } else if (orgs.length > 0) {
          // Has organization, go to dashboard
          throw redirect(303, '/dashboard');
        } else {
          // No organization, go to onboarding
          throw redirect(303, '/onboarding/organization');
        }
      } catch (err) {
        // Re-throw redirects
        if (err && typeof err === 'object' && 'status' in err) {
          throw err;
        }
        // API error likely means invalid session - sign out and stay on login
        await auth.signOut();
        return {};
      }
    }
  }

  return {};
};
