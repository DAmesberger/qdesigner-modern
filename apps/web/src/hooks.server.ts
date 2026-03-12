import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // For now, just add a dummy getSession method
  // The actual authentication is handled client-side
  event.locals.getSession = async () => null;

  const response = await resolve(event);

  // Add COOP/COEP headers on fillout routes for high-resolution timer precision.
  // Without these, browsers reduce performance.now() precision from ~5μs to ~100μs
  // (Spectre mitigation). Cross-origin isolation restores full precision needed
  // for reaction time measurement in psychological research.
  const routeId = event.route.id ?? '';
  if (routeId.startsWith('/(fillout)')) {
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  return response;
};