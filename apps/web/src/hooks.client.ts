import { browser } from '$app/environment';
import type { HandleClientError } from '@sveltejs/kit';
import { reportClientError, toClientErrorReport } from '$lib/services/errorReporter';

/**
 * Client-side error reporting (see `$lib/services/errorReporter`).
 *
 * Two complementary capture surfaces, because neither covers the other:
 *
 *  - `handleError` catches errors thrown during SvelteKit navigation, `load`,
 *    and render — the ones SvelteKit turns into an error page and otherwise
 *    swallows. This is the only place those become observable.
 *  - The global `window` `error` / `unhandledrejection` listeners catch runtime
 *    throws that happen *outside* SvelteKit's control flow: an async callback in
 *    the fillout runtime, a rejected promise in a designer store, a listener
 *    that throws. `handleError` never sees these.
 *
 * The reporter itself is fail-silent, deduped, and throttled, so wiring it into
 * these hot paths cannot spam the sink or crash the app.
 */

/**
 * SvelteKit client error hook. Must never throw (SvelteKit contract) — the
 * reporter guarantees that, and the return shape satisfies `App.Error`.
 */
export const handleError: HandleClientError = ({ error, status, message }) => {
  // A 404 is an expected, not-thrown navigation outcome; don't report it.
  if (status !== 404) {
    reportClientError(toClientErrorReport(error, 'sveltekit'));
  }
  return { message: message || 'An unexpected error occurred.' };
};

function onWindowError(event: ErrorEvent): void {
  // Prefer the real Error (carries a stack); fall back to the event message.
  const report = event.error
    ? toClientErrorReport(event.error, 'window.onerror')
    : { message: event.message || 'Uncaught error', kind: 'window.onerror' };
  reportClientError(report);
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  reportClientError(toClientErrorReport(event.reason, 'unhandledrejection'));
}

/**
 * Register the global error listeners on `target`. Returns a disposer that
 * removes them. Exported so tests can drive registration explicitly (and clean
 * up) rather than relying on the module-load side effect below.
 */
export function registerGlobalErrorReporting(target: Window): () => void {
  target.addEventListener('error', onWindowError);
  target.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    target.removeEventListener('error', onWindowError);
    target.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}

// Auto-register in the real browser. Skipped under vitest (`MODE === 'test'`) so
// the listeners don't leak onto the shared jsdom `window` across the suite; the
// hooks test registers them explicitly and disposes afterward.
if (browser && import.meta.env.MODE !== 'test') {
  registerGlobalErrorReporting(window);
}
