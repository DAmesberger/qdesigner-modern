import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { supabase } from '$lib/services/supabase';

export const load: LayoutLoad = async ({ url }) => {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw redirect(303, '/login');
  }
  
  return {
    session,
    user: session.user
  };
};