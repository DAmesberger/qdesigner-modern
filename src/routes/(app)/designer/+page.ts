import type { PageLoad } from './$types';

// Disable SSR for the designer - it needs to run fully client-side for offline support
export const ssr = false;

// Disable prerendering as this is a dynamic app
export const prerender = false;

export const load: PageLoad = async ({ parent }) => {
  // Get auth data from parent layout
  const parentData = await parent();
  
  return {
    ...parentData
  };
};