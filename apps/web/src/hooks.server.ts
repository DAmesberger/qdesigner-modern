import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';

// Paraglide (ADR 0019): resolve the request locale from the cookie /
// Accept-Language strategy and expose it to server-rendered `m.*()` calls via
// AsyncLocalStorage, so SSR matches the client-side (cookie-persisted) locale
// and returning non-English users see localized auth pages without a hydration
// mismatch. No URL-locale routing is configured, so this performs no redirects.
const paraglideHandle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ locale }) =>
    resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),
    })
  );

const appHandle: Handle = async ({ event, resolve }) => {
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

export const handle: Handle = sequence(paraglideHandle, appHandle);
