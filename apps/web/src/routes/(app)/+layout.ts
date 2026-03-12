import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { auth } from '$lib/services/auth';
import { api } from '$lib/services/api';
import { browser } from '$app/environment';

export const load: LayoutLoad = async ({ url, depends }) => {
  // This ensures the load function re-runs when invalidateAll() is called
  depends('app:organization');

  // Only check auth on client side
  if (browser) {
    let session = await auth.getSession();

    // Check for test mode auto-login
    if (!session && import.meta.env.DEV) {
      const testMode = localStorage.getItem('qdesigner-test-mode');
      if (testMode === 'true') {
        const testModeEmail = import.meta.env.VITE_TEST_MODE_EMAIL;
        const testModePassword = import.meta.env.VITE_TEST_MODE_PASSWORD;

        if (!testModeEmail || !testModePassword) {
          console.warn(
            'Test mode is enabled but credentials are not configured. Set VITE_TEST_MODE_EMAIL and VITE_TEST_MODE_PASSWORD.'
          );
          localStorage.removeItem('qdesigner-test-mode');
        } else {
          console.log('Test mode enabled - auto-logging in with configured credentials');
          const { session: newSession, error } = await auth.signIn(
            testModeEmail,
            testModePassword
          );

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
