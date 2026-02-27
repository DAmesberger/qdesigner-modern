import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { auth } from '$lib/services/auth';
import { api } from '$lib/services/api';
import { browser } from '$app/environment';

export const load: LayoutLoad = async ({ url, route, depends }) => {
  // This ensures the load function re-runs when invalidateAll() is called
  depends('app:organization');

  // Only check auth on client side
  if (browser) {
    let session = await auth.getSession();

    // Check for test mode auto-login
    if (!session && import.meta.env.DEV) {
      const testMode = localStorage.getItem('qdesigner-test-mode');
      if (testMode === 'true') {
        console.log('Test mode enabled - auto-logging in as demo user');
        const { session: newSession, error } = await auth.signIn('demo@example.com', 'demo123456');

        if (error) {
          console.error('Test mode auto-login failed:', error);
          // Clear test mode on failure
          localStorage.removeItem('qdesigner-test-mode');
        } else {
          session = newSession;
          console.log('Test mode auto-login successful');
        }
      }
    }

    // Special handling for routes that need client-side auth
    const protectedRoutes = ['/designer', '/admin', '/dashboard'];
    const isProtectedRoute = protectedRoutes.some(r => url.pathname.startsWith(r));

    if (!session && isProtectedRoute) {
      throw redirect(303, '/login');
    }

    // If we have a session, get the user's organization
    let organizationId = null;

    if (session?.user) {
      console.log('Session user ID:', session.user.id);

      try {
        const orgs = await api.organizations.list();
        const firstOrg = orgs[0];
        if (firstOrg) {
          organizationId = firstOrg.id;
        }
      } catch (err) {
        console.error('Error fetching organizations:', err);
      }
    }

    return {
      session,
      user: session?.user ?? null,
      organizationId
    };
  }

  // During SSR, return empty data - will be handled client-side
  return {
    session: null,
    user: null,
    organizationId: null
  };
};
