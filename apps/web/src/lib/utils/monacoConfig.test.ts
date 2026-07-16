import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupMonacoEnvironment } from './monacoConfig';

// Regression guard for the Monaco worker 404 bug.
//
// The broken config installed `MonacoEnvironment.getWorkerUrl` pointing at
// `/monaco/vs/...` static paths that nothing under Vite serves, so every worker
// request 404'd and Monaco's language services (completions, diagnostics,
// format-document) silently died. The fix installs `getWorker` instead — a
// factory that returns Workers Vite bundles from the monaco-editor ESM
// entrypoints. This test pins the Vite-idiomatic contract: after setup, the
// environment resolves workers through `getWorker`, never through a 404ing
// `getWorkerUrl`.

describe('setupMonacoEnvironment', () => {
  beforeEach(() => {
    delete (window as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment;
  });
  afterEach(() => {
    delete (window as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment;
  });

  it('installs a getWorker factory (not a static getWorkerUrl that 404s)', () => {
    setupMonacoEnvironment();

    const env = (window as unknown as { MonacoEnvironment?: Record<string, unknown> })
      .MonacoEnvironment;
    expect(env).toBeDefined();
    // Vite-idiomatic wiring: workers come from getWorker (Worker constructors
    // Vite bundles), NOT getWorkerUrl pointing at /monaco/vs/... which nothing
    // serves and which 404s at runtime.
    expect(typeof env?.getWorker).toBe('function');
    expect(env?.getWorkerUrl).toBeUndefined();
  });
});
