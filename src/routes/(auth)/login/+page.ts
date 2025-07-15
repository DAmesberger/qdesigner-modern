import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { browser } from '$app/environment';
import { supabase } from '$lib/services/supabase';

export const load: PageLoad = async ({ url }) => {
  // Check if already logged in
  if (browser) {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // User is already logged in, redirect to dashboard
      throw redirect(303, '/dashboard');
    }
  }
  
  return {};
};