import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { browser } from '$app/environment';
import { supabase } from '$lib/services/supabase';

export const load: PageLoad = async ({ url }) => {
  // Check if already logged in
  if (browser) {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // Check if user has an organization
      const { data: publicUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', session.user.id)
        .single();
      
      if (publicUser) {
        const { data: orgMembers } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', publicUser.id)
          .limit(1);
        
        if (orgMembers && orgMembers.length > 0) {
          // Has organization, go to dashboard
          throw redirect(303, '/dashboard');
        } else {
          // No organization, go to onboarding
          throw redirect(303, '/onboarding/organization');
        }
      } else {
        // No public user record - this is an orphaned session
        // Sign out to clear it and stay on login page
        await supabase.auth.signOut();
        return {};
      }
    }
  }
  
  return {};
};