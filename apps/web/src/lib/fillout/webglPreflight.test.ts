import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  definitionNeedsWebGL,
  isWebGLUnavailableError,
  probeWebGL2Support,
} from './webglPreflight';
import { WebGLUnavailableError } from '$lib/renderer';
import type { FilloutDefinition } from '$lib/fillout/types';

// definitionNeedsWebGL reads the module registry; stub it so the predicate is exercised
// without pulling in (or depending on the population of) the real module graph.
vi.mock('$lib/modules/registry', () => ({
  moduleRegistry: {
    get: (type: string) =>
      type === 'reaction-time' || type === 'reaction-experiment' || type === 'webgl'
        ? { questionRuntime: { contract: 'v1' } }
        : type === 'text' || type === 'multiple-choice'
          ? { category: 'question' }
          : undefined,
  },
}));

function def(types: string[]): FilloutDefinition {
  return { questions: types.map((type, i) => ({ id: `q${i}`, type })) } as unknown as FilloutDefinition;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('probeWebGL2Support', () => {
  it('returns true when a webgl2 context is obtained (and releases it)', () => {
    const loseContext = vi.fn();
    const getExtension = vi.fn(() => ({ loseContext }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      getExtension,
    } as unknown as WebGL2RenderingContext);

    expect(probeWebGL2Support()).toBe(true);
    // The probe context is explicitly released rather than leaked to GC.
    expect(getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('returns false when getContext yields null (unsupported)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(probeWebGL2Support()).toBe(false);
  });

  it('returns false when getContext throws (blocked / blacklisted)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('context creation refused');
    });
    expect(probeWebGL2Support()).toBe(false);
  });
});

describe('definitionNeedsWebGL', () => {
  it('is true when any item registers the v1 WebGL contract', () => {
    expect(definitionNeedsWebGL(def(['text', 'reaction-time']))).toBe(true);
    expect(definitionNeedsWebGL(def(['reaction-experiment']))).toBe(true);
    expect(definitionNeedsWebGL(def(['webgl']))).toBe(true);
  });

  it('is false for a form-only definition', () => {
    expect(definitionNeedsWebGL(def(['text', 'multiple-choice']))).toBe(false);
  });

  it('is false for an empty / unknown-type definition', () => {
    expect(definitionNeedsWebGL(def([]))).toBe(false);
    expect(definitionNeedsWebGL(def(['not-a-real-type']))).toBe(false);
  });
});

describe('isWebGLUnavailableError', () => {
  it('matches the renderer construction failure', () => {
    expect(isWebGLUnavailableError(new Error('WebGL 2.0 is required but not supported'))).toBe(
      true
    );
    expect(isWebGLUnavailableError(new Error('Failed to create WebGL program'))).toBe(true);
  });

  it('matches the WebGLUnavailableError marker regardless of message (W-11)', () => {
    // ensureRenderer now wraps shader/link/buffer failures — whose raw messages
    // don't contain "webgl" — in this marker so they still route to the gate screen.
    expect(
      isWebGLUnavailableError(
        new WebGLUnavailableError('This study could not initialize graphics on your device.')
      )
    ).toBe(true);
    // A structural marker (cross-realm instanceof safety) is honoured too.
    expect(isWebGLUnavailableError({ webglUnavailable: true })).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isWebGLUnavailableError(new Error('Failed to preload media'))).toBe(false);
    expect(isWebGLUnavailableError(undefined)).toBe(false);
  });
});
