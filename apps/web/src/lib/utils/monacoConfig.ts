/**
 * Monaco Editor worker wiring for Vite.
 *
 * Monaco runs its language services (TypeScript diagnostics, IntelliSense
 * completions, format-document) inside dedicated Web Workers. The previous
 * config pointed `MonacoEnvironment.getWorkerUrl` at `/monaco/vs/...` static
 * paths that nothing under Vite ever serves, so every worker request 404'd. The
 * editor kept rendering — Monaco falls back to a worker-less mode — but the
 * language services died silently: no completions, no validation, and the
 * Format button did nothing. The old CDN `data:`-URL fallback was dead code too
 * (guarded behind `!window.MonacoEnvironment`, which the module's own top-level
 * assignment had already made truthy) and would have violated the app's
 * offline/CSP posture regardless.
 *
 * The Vite-idiomatic fix is `MonacoEnvironment.getWorker` returning Workers that
 * Vite bundles from the monaco-editor ESM worker entrypoints (the `?worker`
 * suffix). Those imports live in `./monacoWorkers` and are pulled in lazily so
 * the `?worker` specifiers stay out of any module the vitest transform loads
 * (vitest cannot resolve `?worker`). Monaco supports a `Promise<Worker>` return
 * — it wraps the result in `Promise.resolve` — so the async import is safe.
 */

/**
 * Install `MonacoEnvironment.getWorker` on the window global. Idempotent — safe
 * to call from every editor's `onMount` before `import('monaco-editor')`.
 */
export function setupMonacoEnvironment(): void {
  if (typeof window === 'undefined') return;
  window.MonacoEnvironment = {
    getWorker: async (_workerId: string, label: string): Promise<Worker> => {
      const { createMonacoWorker } = await import('./monacoWorkers');
      return createMonacoWorker(label);
    },
  };
}
