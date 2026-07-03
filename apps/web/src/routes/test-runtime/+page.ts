import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * BUILD GUARD for the reaction-time e2e harness.
 *
 * The predecessor `/test-runtime` route was deleted in commit 81bc0de because
 * it shipped to production with no environment guard. This route only exists
 * for automated testing and must never be reachable in a production build.
 *
 * `import.meta.env.DEV` is statically replaced by Vite: in a production build
 * the expression collapses to `false`, so `load` always throws 404 and the
 * page body is inert. Set `VITE_ENABLE_TEST_RUNTIME=true` to opt the harness
 * into a non-dev (e.g. preview) build explicitly for a CI e2e job.
 */
const HARNESS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_RUNTIME === 'true';

// Never SSR (the harness touches `window`) and never prerender into the build.
export const ssr = false;
export const prerender = false;

export const load: PageLoad = ({ url }) => {
  if (!HARNESS_ENABLED) {
    throw error(404, 'Not found');
  }

  return {
    scenario: url.searchParams.get('scenario') ?? 'stroop',
    seed: url.searchParams.get('seed') ?? undefined,
  };
};
