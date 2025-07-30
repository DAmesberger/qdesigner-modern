import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // For now, just add a dummy getSession method
  // The actual authentication is handled client-side
  event.locals.getSession = async () => null;
  
  const response = await resolve(event);
  return response;
};