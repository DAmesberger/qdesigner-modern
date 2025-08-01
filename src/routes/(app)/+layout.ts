import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { supabase } from '$lib/services/supabase';
import { browser } from '$app/environment';

export const load: LayoutLoad = async ({ url, route, depends }) => {
  // This ensures the load function re-runs when invalidateAll() is called
  depends('app:organization');
  
  // Only check auth on client side
  if (browser) {
    const { data: { session } } = await supabase.auth.getSession();
    
    // Special handling for routes that need client-side auth
    const protectedRoutes = ['/designer', '/admin', '/dashboard'];
    const isProtectedRoute = protectedRoutes.some(r => url.pathname.startsWith(r));
    
    if (!session && isProtectedRoute) {
      throw redirect(303, '/login');
    }
    
    // If we have a session, get the user's organization
    let organizationId = null;
    let publicUser = null;
    
    if (session?.user) {
      console.log('Session user ID (auth):', session.user.id);
      
      // First get the public user record using auth ID
      const { data: publicUserData, error: userError } = await supabase
        .from('users')
        .select('id, auth_id, email, full_name')
        .eq('auth_id', session.user.id)
        .single();
      
      if (userError) {
        console.error('Error fetching public user:', userError);
        // If we can't find a public user for this auth session, the session is orphaned
        // This can happen after database resets during development
        // Sign out the user to clear the invalid session
        if (userError.code === 'PGRST116') {
          console.warn('Orphaned auth session detected, signing out user');
          await supabase.auth.signOut();
          throw redirect(303, '/login');
        }
      } else if (publicUserData) {
        console.log('Public user ID:', publicUserData.id);
        publicUser = publicUserData;
        
        // Now get the organization membership using the public user ID
        const { data: orgMembers, error: orgError } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', publicUserData.id)
          .limit(1);
        
        if (orgError) {
          console.error('Error fetching organization member:', orgError);
        } else if (orgMembers && orgMembers.length > 0) {
          console.log('Organization member data:', orgMembers[0]);
          organizationId = orgMembers[0].organization_id;
        }
      }
    }
    
    return {
      session,
      user: session?.user, // Temporarily revert to auth user
      publicUser, // Also provide public user
      organizationId
    };
  }
  
  // During SSR, return empty data - will be handled client-side
  return {
    session: null,
    user: null,
    publicUser: null,
    organizationId: null
  };
};