import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { cspHeaderFor } from '$lib/server/csp';

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

  return resolve(event);
};

/**
 * The route-id prefix that must be served cross-origin isolated. Exported so
 * `hooks.server.test.ts` can check it against the route ids SvelteKit actually
 * generates from `src/routes/(fillout)/**`, rather than against a copy of this
 * string.
 */
export const ISOLATED_ROUTE_PREFIX = '/(fillout)';

/**
 * Serve the fillout document cross-origin isolated.
 *
 * Without COOP `same-origin` + COEP `require-corp`, browsers clamp
 * `performance.now()` from ~5µs to ~100µs as a Spectre mitigation — measured on
 * this app at 0.005 ms isolated vs 0.100 ms non-isolated. That 20x clamp is the
 * difference between the platform's stated timing guarantee (frame-accurate
 * onset, sub-millisecond relative precision on reaction-time difference scores)
 * and a coarse stopwatch, so these two headers are load-bearing, not hardening.
 *
 * Losing them is silent: per ADR 0027 a non-isolated run still completes and
 * merely stamps the degradation into per-trial `timing_provenance`. Nothing else
 * in the app would notice. `hooks.server.test.ts` is the failure signal.
 *
 * Scoped to fillout on purpose: COEP `require-corp` constrains what a document
 * may embed, and the designer/app shell has no reason to pay that cost.
 *
 * NOTE: this only runs when a *server* adapter serves the app. A static/edge
 * deployment must reproduce these headers at the CDN/host layer — see the
 * adapter comment in `svelte.config.js`.
 */
export const crossOriginIsolationHandle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  if ((event.route.id ?? '').startsWith(ISOLATED_ROUTE_PREFIX)) {
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  return response;
};

/**
 * Tighten the Content-Security-Policy per route.
 *
 * `kit.csp` (in `svelte.config.js`) emits ONE global policy on every document,
 * carrying the per-request nonce it stamped into the inline scripts. This hook
 * rewrites that already-nonced header instead of rebuilding it — see
 * `cspHeaderFor` — so the fillout route gets same-origin-only `img-src`/`media-src`
 * (participant route, the one place study data lives) while the designer keeps the
 * `https:`/localhost breadth its presigned S3 media needs.
 *
 * Runs after `crossOriginIsolationHandle` so both header layers coexist. Only page
 * documents carry a CSP header; endpoint/data responses have none and are skipped.
 */
export const cspHandle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  const existing = response.headers.get('content-security-policy');
  if (existing) {
    const isFillout = (event.route.id ?? '').startsWith(ISOLATED_ROUTE_PREFIX);
    response.headers.set('content-security-policy', cspHeaderFor(existing, isFillout, dev));
  }

  return response;
};

export const handle: Handle = sequence(
  paraglideHandle,
  appHandle,
  crossOriginIsolationHandle,
  cspHandle
);
