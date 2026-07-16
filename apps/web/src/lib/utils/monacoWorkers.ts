/// <reference types="vite/client" />
/**
 * Vite-bundled Monaco Editor web workers.
 *
 * Loaded lazily (via a dynamic import from `monacoConfig`'s getWorker factory)
 * so the `?worker` specifiers below — which only Vite's dev/build pipeline
 * understands — are never seen by the vitest transform, which cannot resolve
 * them. Vite compiles each `?worker` import into a hashed, self-contained
 * worker bundle and hands back a `Worker` constructor.
 *
 * The designer's editors only ever use the JavaScript/TypeScript language, so
 * this ships exactly two workers: the TypeScript worker (JS + TS language
 * services — completions, diagnostics, format-document) and the base editor
 * worker that Monaco always needs for the work it delegates off the main
 * thread. JSON/CSS/HTML workers are intentionally omitted; those languages are
 * never mounted, and any unmatched label falls back to the base editor worker.
 */
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

export function createMonacoWorker(label: string): Worker {
  if (label === 'typescript' || label === 'javascript') {
    return new TsWorker();
  }
  return new EditorWorker();
}
