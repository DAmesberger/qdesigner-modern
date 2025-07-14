import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { supabase } from '$lib/services/supabase';
import { browser } from '$app/environment';

export const load: LayoutLoad = async ({ url, route }) => {
  // Only check auth on client side
  if (browser) {
    const { data: { session } } = await supabase.auth.getSession();
    
    // Special handling for routes that need client-side auth
    const protectedRoutes = ['/designer', '/admin', '/dashboard'];
    const isProtectedRoute = protectedRoutes.some(r => url.pathname.startsWith(r));
    
    if (!session && isProtectedRoute) {
      throw redirect(303, '/login');
    }
    
    return {
      session,
      user: session?.user
    };
  }
  
  // During SSR, return empty data - will be handled client-side
  return {
    session: null,
    user: null
  };
};