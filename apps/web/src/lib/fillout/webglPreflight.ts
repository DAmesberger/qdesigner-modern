import { moduleRegistry } from '$lib/modules/registry';
import type { FilloutDefinition } from '$lib/fillout/types';

/**
 * Cheap WebGL 2.0 capability probe (R2-4). Creates a throwaway `<canvas>` and asks for a
 * `webgl2` context; a null context — or a thrown context-creation error, which some
 * browsers raise instead of returning null when WebGL is blocked/blacklisted — means the
 * device can't run the WebGL reaction stimuli. Runs BEFORE session creation so an
 * unsupported device is turned away without ever leaving an orphan session behind.
 *
 * SSR-safe: returns `true` (assume supported) when there is no `document`, so the probe
 * never blocks on the server; the client re-runs it before any session start.
 */
export function probeWebGL2Support(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    // Release the probe context promptly — browsers cap concurrent GL contexts, and the
    // real runtime renderer needs one of its own moments later.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether any item in the definition draws through WebGL — i.e. registers the v1
 * question-runtime contract (reaction-time, reaction-experiment, webgl). This is the SAME
 * predicate the runtime uses to fork WebGL vs the DOM overlay (see
 * QuestionnaireRuntime.itemNeedsWebGL / isFormStyle: `questionRuntime.contract === 'v1'`),
 * read here up front so the preflight demands exactly what the runtime will demand.
 *
 * The module registry must be populated first (ensureModulesRegistered); an unregistered
 * type contributes no WebGL requirement — it surfaces loudly later in showCurrentItem().
 */
export function definitionNeedsWebGL(definition: FilloutDefinition): boolean {
  const questions = definition?.questions ?? [];
  return questions.some((q) => moduleRegistry.get(q?.type)?.questionRuntime?.contract === 'v1');
}

/**
 * Whether an error thrown during runtime/renderer construction is a WebGL-unavailability
 * failure. The WebGLRenderer throws `WebGL 2.0 is required but not supported`, but a
 * context can also be lost or blacklisted AFTER a passing probe; both should route to the
 * honest gate screen rather than dumping a raw error string on the generic error screen.
 */
export function isWebGLUnavailableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /webgl/i.test(message);
}
