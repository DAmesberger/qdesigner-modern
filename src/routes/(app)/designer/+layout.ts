import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent }) => {
  // Get auth data from parent layout
  const parentData = await parent();
  
  return {
    ...parentData
  };
};