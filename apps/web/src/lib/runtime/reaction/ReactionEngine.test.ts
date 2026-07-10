import { describe, it, expect, vi } from 'vitest';
import { ReactionEngine } from './ReactionEngine';
import { createPvtTrials } from './presets/pvt';
import type { ReactionTrialConfig } from './types';
import type { WebGLRenderer } from '$lib/renderer';
import type { FrameSample, FrameStats } from '$lib/shared';
import type { ResourceManager } from '../resources/ResourceManager';

function createWebGL2Mock(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const context = {
    canvas,
    getExtension: vi.fn(),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    bindBuffer: vi.fn(),
    vertexAttribPointer: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    useProgram: vi.fn(),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    activeTexture: vi.fn(),
    uniform1i: vi.fn(),
    uniform4fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    bufferData: vi.fn(),
    drawArrays: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteProgram: vi.fn(),
    deleteTexture: vi.fn(),
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    FLOAT: 5126,
    BLEND: 3042,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    COLOR_BUFFER_BIT: 16384,
    TRIANGLES: 4,
    TRIANGLE_FAN: 6,
    DYNAMIC_DRAW: 35048,
    TEXTURE_2D: 3553,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    CLAMP_TO_EDGE: 33071,
    LINEAR: 9729,
    TEXTURE0: 33984,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
  };

  return context as unknown as WebGL2RenderingContext;
}

function createEngine(opts?: { eventTarget?: Document | HTMLElement }) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;

  vi.spyOn(canvas, 'getContext').mockImplementation((contextId: string) => {
    if (contextId === 'webgl2') {
      return createWebGL2Mock(canvas);
    }
    return null;
  });

  const engine = new ReactionEngine({
    canvas,
    eventTarget: opts?.eventTarget ?? document,
  });

  return { engine, canvas };
}

describe('ReactionEngine', () => {

  // ---- Keyboard response ----

  it('captures keyboard responses with reaction time', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-1',
      responseMode: 'keyboard',
      validKeys: ['f', 'j'],
      fixation: { enabled: false },
      stimulus: { kind: 'text', text: 'GO' },
      responseTimeoutMs: 400,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }, 60);

    const result = await resultPromise;

    expect(result.timeout).toBe(false);
    expect(result.response?.value).toBe('f');
    expect((result.response?.reactionTimeMs || 0) >= 0).toBe(true);
    expect(result.frameLog.length > 0).toBe(true);

    engine.destroy();
  });

  it('ignores keys not in validKeys', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-invalid-key',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle' },
      responseTimeoutMs: 200,
      targetFPS: 120,
    });

    // Press an invalid key first
    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    }, 30);

    // Then valid key
    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }, 80);

    const result = await resultPromise;

    expect(result.timeout).toBe(false);
    expect(result.response?.value).toBe('f');

    engine.destroy();
  });

  // ---- Timeout ----

  it('returns timeout when no response is captured', async () => {
    const { engine } = createEngine();

    const result = await engine.runTrial({
      id: 'trial-timeout',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle' },
      responseTimeoutMs: 120,
      targetFPS: 120,
    });

    expect(result.timeout).toBe(true);
    expect(result.response).toBeNull();

    engine.destroy();
  });

  // ---- Mouse response ----

  it('captures mouse click responses', async () => {
    const { engine, canvas } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-mouse',
      responseMode: 'mouse',
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'square' },
      responseTimeoutMs: 400,
      targetFPS: 120,
    });

    setTimeout(() => {
      // Simulate click on canvas at center
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      canvas.dispatchEvent(
        new MouseEvent('click', { clientX: 400, clientY: 300, bubbles: true })
      );
    }, 60);

    const result = await resultPromise;

    expect(result.timeout).toBe(false);
    expect(result.response?.source).toBe('mouse');
    expect(typeof result.response?.value).toBe('object');
    const pos = result.response?.value as { x: number; y: number };
    expect(pos.x).toBe(0.5);
    expect(pos.y).toBe(0.5);

    engine.destroy();
  });

  // ---- Touch response ----

  it('captures touch responses', async () => {
    const { engine, canvas } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-touch',
      responseMode: 'touch',
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle' },
      responseTimeoutMs: 400,
      targetFPS: 120,
    });

    setTimeout(() => {
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      const touch = { clientX: 200, clientY: 150 } as Touch;
      const touchEvent = new TouchEvent('touchstart', {
        touches: [touch],
        bubbles: true,
      });
      canvas.dispatchEvent(touchEvent);
    }, 60);

    const result = await resultPromise;

    expect(result.timeout).toBe(false);
    expect(result.response?.source).toBe('touch');

    engine.destroy();
  });

  // ---- Fixation phase ----

  it('runs fixation phase when enabled', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-fixation',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: true, durationMs: 50, type: 'cross', sizePx: 20 },
      stimulus: { kind: 'text', text: 'X' },
      responseTimeoutMs: 200,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }, 100);

    const result = await resultPromise;

    const fixationPhase = result.phaseTimeline.find((p) => p.name === 'fixation');
    expect(fixationPhase).toBeDefined();
    expect(fixationPhase!.endTime).toBeGreaterThanOrEqual(fixationPhase!.startTime);

    engine.destroy();
  });

  it('skips fixation when not enabled', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-no-fixation',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle' },
      responseTimeoutMs: 120,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }, 30);

    const result = await resultPromise;

    const fixationPhase = result.phaseTimeline.find((p) => p.name === 'fixation');
    expect(fixationPhase).toBeUndefined();

    engine.destroy();
  });

  // ---- Pre-stimulus delay ----

  it('inserts pre-stimulus delay', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-delay',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      preStimulusDelayMs: 50,
      stimulus: { kind: 'text', text: 'GO' },
      responseTimeoutMs: 400,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }, 120);

    const result = await resultPromise;

    const delayPhase = result.phaseTimeline.find((p) => p.name === 'pre-stimulus-delay');
    expect(delayPhase).toBeDefined();

    engine.destroy();
  });

  // ---- W-4: PVT foreperiod presses are RECORDED, not vanished ----

  it('records a PVT foreperiod press as an anticipatory false start (W-4)', async () => {
    const [trial] = createPvtTrials({
      trialCount: 1,
      isi: 300, // fixed foreperiod
      responseKey: ' ',
      responseTimeoutMs: 200,
      seed: 'w4',
    });
    expect(trial!.allowResponseDuringPreStimulus).toBe(true);

    const { engine } = createEngine();
    const resultPromise = engine.runTrial({ ...trial!, targetFPS: 120 });

    // Press SPACE ~100 ms in — well inside the 300 ms foreperiod, before onset.
    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    }, 100);

    const result = await resultPromise;

    // Recorded (counted + provenance-flagged), not silently dropped, and it did
    // NOT resolve the trial (no valid post-onset response ⇒ the window timed out).
    expect(result.falseStartCount).toBeGreaterThanOrEqual(1);
    expect(result.anticipatory).toBe(true);
    expect(result.provenance.falseStart).toBe(true);
    expect(result.response).toBeNull();
    expect(result.timeout).toBe(true);

    engine.destroy();
  });

  it('without the foreperiod flag the same pre-onset press vanishes (W-4 control)', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'no-flag',
      responseMode: 'keyboard',
      validKeys: [' '],
      fixation: { enabled: false },
      preStimulusDelayMs: 300,
      // allowResponseDuringPreStimulus omitted → foreperiod presses are not armed.
      stimulus: { kind: 'shape', shape: 'circle' },
      responseTimeoutMs: 200,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    }, 100);

    const result = await resultPromise;
    expect(result.falseStartCount).toBe(0);
    expect(result.anticipatory).toBe(false);

    engine.destroy();
  });

  // ---- Abort signal ----

  it('aborts trial via AbortSignal', async () => {
    const { engine } = createEngine();

    const controller = new AbortController();

    const resultPromise = engine.runTrial(
      {
        id: 'trial-abort',
        responseMode: 'keyboard',
        validKeys: ['f'],
        fixation: { enabled: false },
        stimulus: { kind: 'text', text: 'STOP' },
        responseTimeoutMs: 2000,
        targetFPS: 120,
      },
      controller.signal
    );

    setTimeout(() => {
      controller.abort();
    }, 50);

    const result = await resultPromise;

    expect(result.response).toBeNull();
    expect(result.timeout).toBe(true);

    engine.destroy();
  });

  // ---- Correctness evaluation ----

  it('evaluates correct response', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-correct',
      responseMode: 'keyboard',
      validKeys: ['f', 'j'],
      correctResponse: 'f',
      requireCorrect: true,
      fixation: { enabled: false },
      stimulus: { kind: 'text', text: 'LEFT' },
      responseTimeoutMs: 400,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }, 60);

    const result = await resultPromise;

    expect(result.isCorrect).toBe(true);

    engine.destroy();
  });

  it('evaluates incorrect response', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-incorrect',
      responseMode: 'keyboard',
      validKeys: ['f', 'j'],
      correctResponse: 'f',
      requireCorrect: true,
      fixation: { enabled: false },
      stimulus: { kind: 'text', text: 'LEFT' },
      responseTimeoutMs: 400,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    }, 60);

    const result = await resultPromise;

    expect(result.isCorrect).toBe(false);

    engine.destroy();
  });

  it('evaluates no response as incorrect when requireCorrect is true', async () => {
    const { engine } = createEngine();

    const result = await engine.runTrial({
      id: 'trial-no-resp-incorrect',
      responseMode: 'keyboard',
      validKeys: ['f'],
      correctResponse: 'f',
      requireCorrect: true,
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle' },
      responseTimeoutMs: 100,
      targetFPS: 120,
    });

    expect(result.isCorrect).toBe(false);
    expect(result.timeout).toBe(true);

    engine.destroy();
  });

  it('returns null correctness when requireCorrect is false', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-no-correct-check',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle' },
      responseTimeoutMs: 400,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }, 60);

    const result = await resultPromise;

    expect(result.isCorrect).toBeNull();

    engine.destroy();
  });

  // ---- Frame logging ----

  it('records frame log entries during trial', async () => {
    const { engine } = createEngine();

    const result = await engine.runTrial({
      id: 'trial-frames',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'square' },
      responseTimeoutMs: 150,
      targetFPS: 120,
    });

    expect(result.frameLog).toBeDefined();
    expect(Array.isArray(result.frameLog)).toBe(true);

    engine.destroy();
  });

  // ---- Phase timeline completeness ----

  it('includes stimulus phase in timeline', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-timeline',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: true, durationMs: 30 },
      preStimulusDelayMs: 20,
      stimulus: { kind: 'text', text: 'X' },
      responseTimeoutMs: 200,
      interTrialIntervalMs: 20,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }, 120);

    const result = await resultPromise;

    const phaseNames = result.phaseTimeline.map((p) => p.name);
    expect(phaseNames).toContain('fixation');
    expect(phaseNames).toContain('pre-stimulus-delay');
    expect(phaseNames).toContain('stimulus');
    expect(phaseNames).toContain('inter-trial');

    // All phases should have valid start/end times
    for (const phase of result.phaseTimeline) {
      expect(phase.endTime).toBeGreaterThanOrEqual(phase.startTime);
    }

    engine.destroy();
  });

  // ---- Feedback phase (E-REACT-4) ----

  it('renders a feedback phase after the response window when feedback.show is set', async () => {
    const { engine } = createEngine();

    const resultPromise = engine.runTrial({
      id: 'trial-feedback',
      responseMode: 'keyboard',
      validKeys: ['f'],
      correctResponse: 'f',
      requireCorrect: true,
      fixation: { enabled: false },
      stimulus: { kind: 'text', text: 'GO' },
      responseTimeoutMs: 200,
      feedback: { show: true, mode: 'accuracy', durationMs: 20 },
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }, 40);

    const result = await resultPromise;

    const phaseNames = result.phaseTimeline.map((p) => p.name);
    expect(phaseNames).toContain('feedback');
    // The feedback phase comes after the stimulus phase.
    expect(phaseNames.indexOf('feedback')).toBeGreaterThan(phaseNames.indexOf('stimulus'));
    expect(result.isCorrect).toBe(true);

    engine.destroy();
  });

  it('does not render a feedback phase when no feedback config is present', async () => {
    const { engine } = createEngine();

    const result = await engine.runTrial({
      id: 'trial-no-feedback',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'text', text: 'GO' },
      responseTimeoutMs: 60,
      targetFPS: 120,
    });

    expect(result.phaseTimeline.map((p) => p.name)).not.toContain('feedback');

    engine.destroy();
  });

  // ---- Trial result structure ----

  it('returns complete trial result structure', async () => {
    const { engine } = createEngine();

    const result = await engine.runTrial({
      id: 'trial-structure',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle' },
      responseTimeoutMs: 100,
      targetFPS: 120,
    });

    expect(result.trialId).toBe('trial-structure');
    expect(typeof result.startedAt).toBe('number');
    expect(Array.isArray(result.frameLog)).toBe(true);
    expect(Array.isArray(result.phaseTimeline)).toBe(true);
    expect(result.stats).toBeDefined();

    engine.destroy();
  });

  // ---- Hooks ----

  it('calls onPhaseChange hook', async () => {
    const onPhaseChange = vi.fn();
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    vi.spyOn(canvas, 'getContext').mockImplementation((contextId: string) => {
      if (contextId === 'webgl2') return createWebGL2Mock(canvas);
      return null;
    });

    const engine = new ReactionEngine({
      canvas,
      eventTarget: document,
      hooks: { onPhaseChange },
    });

    const resultPromise = engine.runTrial({
      id: 'trial-hooks',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: true, durationMs: 20 },
      stimulus: { kind: 'text', text: 'X' },
      responseTimeoutMs: 200,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }, 80);

    await resultPromise;

    expect(onPhaseChange).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock call args
    const phaseNames = onPhaseChange.mock.calls.map((call: any[]) => call[0]);
    expect(phaseNames).toContain('fixation');
    expect(phaseNames).toContain('stimulus');

    engine.destroy();
  });

  it('calls onResponse hook', async () => {
    const onResponse = vi.fn();
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    vi.spyOn(canvas, 'getContext').mockImplementation((contextId: string) => {
      if (contextId === 'webgl2') return createWebGL2Mock(canvas);
      return null;
    });

    const engine = new ReactionEngine({
      canvas,
      eventTarget: document,
      hooks: { onResponse },
    });

    const resultPromise = engine.runTrial({
      id: 'trial-resp-hook',
      responseMode: 'keyboard',
      validKeys: ['j'],
      fixation: { enabled: false },
      stimulus: { kind: 'text', text: 'GO' },
      responseTimeoutMs: 400,
      targetFPS: 120,
    });

    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    }, 60);

    await resultPromise;

    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse.mock.calls[0]![0].value).toBe('j');

    engine.destroy();
  });

  // ---- Shape stimulus variants ----

  it('renders dot fixation type', async () => {
    const { engine } = createEngine();

    const result = await engine.runTrial({
      id: 'trial-dot-fixation',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: true, durationMs: 30, type: 'dot', sizePx: 10 },
      stimulus: { kind: 'shape', shape: 'circle' },
      responseTimeoutMs: 100,
      targetFPS: 120,
    });

    expect(result.phaseTimeline.some((p) => p.name === 'fixation')).toBe(true);

    engine.destroy();
  });

  it('renders triangle shape stimulus', async () => {
    const { engine } = createEngine();

    const result = await engine.runTrial({
      id: 'trial-triangle',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'triangle', widthPx: 100 },
      responseTimeoutMs: 100,
      targetFPS: 120,
    });

    expect(result.trialId).toBe('trial-triangle');

    engine.destroy();
  });

  it('renders rectangle shape stimulus', async () => {
    const { engine } = createEngine();

    const result = await engine.runTrial({
      id: 'trial-rect',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'rectangle', widthPx: 200, heightPx: 100 },
      responseTimeoutMs: 100,
      targetFPS: 120,
    });

    expect(result.trialId).toBe('trial-rect');

    engine.destroy();
  });

  // ---- Destroy ----

  it('can be destroyed safely', () => {
    const { engine } = createEngine();
    expect(() => engine.destroy()).not.toThrow();
  });

  it('can be destroyed after a trial', async () => {
    const { engine } = createEngine();

    await engine.runTrial({
      id: 'trial-then-destroy',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle' },
      responseTimeoutMs: 100,
      targetFPS: 120,
    });

    expect(() => engine.destroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Deterministic timing-correctness tests (mock renderer + injected clock).
//
// The existing suite above drives the real WebGLRenderer and only asserts
// `reactionTimeMs >= 0` — which passes even when onset never sets. These tests
// control frame presentation, the clock, and response timestamps directly so
// onset method selection, duration concurrency, false starts, and the audio /
// video onset clocks can be asserted exactly.
// ---------------------------------------------------------------------------

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type EmitFrame = (sample: { now: number; presented: boolean; index?: number; delta?: number }) => void;

function createMockRenderer() {
  let frameCb:
    | ((sample: FrameSample, stats: FrameStats, context: unknown) => void)
    | null = null;
  let errorCb: ((info: { source: string; error: unknown }) => void) | null = null;
  const added: string[] = [];
  const removed: string[] = [];
  const stats: FrameStats = {
    fps: 120,
    frameTime: 8.3,
    droppedFrames: 0,
    targetFPS: 120,
    totalFrames: 1,
    jitter: 0.1,
  };

  const renderer = {
    setTargetFPS: vi.fn(),
    setVSync: vi.fn(),
    setBackgroundColor: vi.fn(),
    clearRenderables: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    executeCommand: vi.fn(),
    addRenderable: vi.fn((renderable: { id: string }) => {
      added.push(renderable.id);
    }),
    removeRenderable: vi.fn((id: string) => {
      removed.push(id);
    }),
    markStimulusOnset: vi.fn(),
    getStats: () => stats,
    onFrame: (cb: (sample: FrameSample, stats: FrameStats, context: unknown) => void) => {
      frameCb = cb;
      return () => {
        frameCb = null;
      };
    },
    // CONTRACT-ERR: the WebGLRenderer slice exposes onError(cb): () => void and
    // fires it when a texture upload throws. The engine subscribes per-trial.
    onError: (cb: (info: { source: string; error: unknown }) => void) => {
      errorCb = cb;
      return () => {
        errorCb = null;
      };
    },
  };

  const emitFrame: EmitFrame = (sample) => {
    frameCb?.(
      {
        index: sample.index ?? 0,
        now: sample.now,
        delta: sample.delta ?? 8,
        presented: sample.presented,
        droppedSinceLast: 0,
      },
      stats,
      {}
    );
  };

  const emitError = (info: { source: string; error: unknown }) => {
    errorCb?.(info);
  };

  return { renderer: renderer as unknown as WebGLRenderer, emitFrame, emitError, added, removed };
}

function createMockEngine(opts?: {
  gatekeeper?: ConstructorParameters<typeof ReactionEngine>[0]['gatekeeper'];
  clock?: () => number;
  hooks?: ConstructorParameters<typeof ReactionEngine>[0]['hooks'];
  gamepadSource?: ConstructorParameters<typeof ReactionEngine>[0]['gamepadSource'];
  requestFrame?: ConstructorParameters<typeof ReactionEngine>[0]['requestFrame'];
  cancelFrame?: ConstructorParameters<typeof ReactionEngine>[0]['cancelFrame'];
}) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const target = document.createElement('div');
  const mock = createMockRenderer();
  const engine = new ReactionEngine({
    canvas,
    renderer: mock.renderer,
    eventTarget: target,
    gatekeeper: opts?.gatekeeper,
    clock: opts?.clock,
    hooks: opts?.hooks,
    gamepadSource: opts?.gamepadSource,
    requestFrame: opts?.requestFrame,
    cancelFrame: opts?.cancelFrame,
  });
  return { engine, target, canvas, ...mock };
}

function dispatchKey(target: HTMLElement, key: string, timeStamp?: number) {
  const event = new KeyboardEvent('keydown', { key });
  if (timeStamp !== undefined) {
    Object.defineProperty(event, 'timeStamp', { value: timeStamp, configurable: true });
  }
  target.dispatchEvent(event);
}

function dispatchKeyUp(target: HTMLElement, key: string, timeStamp?: number) {
  const event = new KeyboardEvent('keyup', { key });
  if (timeStamp !== undefined) {
    Object.defineProperty(event, 'timeStamp', { value: timeStamp, configurable: true });
  }
  target.dispatchEvent(event);
}

function fakeGatekeeper(displayLatencyMs: number) {
  // Structural gatekeeper (matches the engine's ReactionGatekeeper option): only
  // qualify() + getEstimatedDisplayLatencyMs() are consumed. Returned directly so
  // the test can both pass it to the engine and assert on qualify() calls.
  return {
    qualify: vi.fn(async () => {}),
    getEstimatedDisplayLatencyMs: () => displayLatencyMs,
  };
}

function seedAudioBuffer(engine: ReactionEngine, src: string) {
  const rm = {
    getImageCache: () => new Map<string, HTMLImageElement>(),
    getVideoCache: () => new Map<string, HTMLVideoElement>(),
    getAudioBufferCache: () => new Map<string, AudioBuffer>([[src, {} as AudioBuffer]]),
  } as unknown as ResourceManager;
  engine.seedFromResourceManager(rm);
}

function seedVideo(engine: ReactionEngine, src: string, video: HTMLVideoElement) {
  const rm = {
    getImageCache: () => new Map<string, HTMLImageElement>(),
    getVideoCache: () => new Map<string, HTMLVideoElement>([[src, video]]),
    getAudioBufferCache: () => new Map<string, AudioBuffer>(),
  } as unknown as ResourceManager;
  engine.seedFromResourceManager(rm);
}

function installMockAudioContext(opts?: { state?: string; resume?: () => Promise<void> }) {
  const g = globalThis as { AudioContext?: typeof AudioContext };
  const original = g.AudioContext;
  const onResume = opts?.resume ?? (async () => {});
  const initialState = opts?.state ?? 'running';

  class MockAudioContext {
    state = initialState;
    currentTime = 5;
    baseLatency = 0.01;
    outputLatency = 0.02;
    destination = {};
    resume = async () => {
      this.state = 'running';
      await onResume();
    };
    close = async () => {};
    getOutputTimestamp() {
      // Representative: contextTime (sample AT the DAC) lags currentTime by the
      // output latency, per the W3C spec. contextTime === currentTime is the one
      // degenerate case that hides a double-counted output latency.
      return { contextTime: this.currentTime - this.outputLatency, performanceTime: 10000 };
    }
    createBufferSource() {
      return {
        buffer: null as AudioBuffer | null,
        connect() {},
        start() {},
      };
    }
    createGain() {
      return { gain: { value: 1 }, connect() {} };
    }
    decodeAudioData = async () => ({}) as AudioBuffer;
  }

  g.AudioContext = MockAudioContext as unknown as typeof AudioContext;
  return () => {
    g.AudioContext = original;
  };
}

interface RvfcMeta {
  expectedDisplayTime: number;
  presentationTime: number;
  mediaTime: number;
  presentedFrames: number;
  width: number;
  height: number;
}

function createRvfcVideo() {
  let cb: VideoFrameRequestCallback | null = null;
  const video = {
    src: '',
    crossOrigin: '',
    playsInline: false,
    muted: false,
    videoWidth: 640,
    videoHeight: 360,
    play: () => Promise.resolve(),
    requestVideoFrameCallback: (c: VideoFrameRequestCallback) => {
      cb = c;
      return 1;
    },
    cancelVideoFrameCallback: vi.fn(),
  };
  return {
    video: video as unknown as HTMLVideoElement,
    triggerFrame: (meta: RvfcMeta) =>
      cb?.(meta.expectedDisplayTime, meta as unknown as VideoFrameCallbackMetadata),
  };
}

describe('ReactionEngine — timing correctness', () => {
  // ---- Onset method selection: visual (raf) ----

  it('records a raf onset for a visual stimulus on the first presented frame', async () => {
    const { engine, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'visual-onset',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 60,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });

    const result = await resultPromise;

    expect(result.stimulusTimingMethod).toBe('raf');
    expect(result.stimulusOnsetTime).toBe(1000);
    expect(result.stimulusOnsetRawTime).toBe(1000);
    expect(result.provenance.onsetMethod).toBe('raf');

    engine.destroy();
  });

  it('does not stamp onset on a non-presented frame', async () => {
    const { engine, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'no-present',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'square', id: 'stim' },
      responseTimeoutMs: 40,
    });

    await flush();
    emitFrame({ now: 900, presented: false });

    const result = await resultPromise;

    expect(result.stimulusOnsetTime).toBeNull();
    expect(result.timeout).toBe(true);

    engine.destroy();
  });

  // ---- CONTRACT-CAL: gatekeeper display-latency compensation ----

  it('runs qualify() once and applies display latency to the visual onset (CONTRACT-CAL)', async () => {
    const gatekeeper = fakeGatekeeper(7);
    const { engine, emitFrame } = createMockEngine({ gatekeeper });

    const resultPromise = engine.runTrial({
      id: 'cal',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'square', id: 'stim' },
      responseTimeoutMs: 60,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });

    const result = await resultPromise;

    expect((gatekeeper.qualify as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    // recorded onset = rafFrameTime + displayLatencyMs; both are surfaced.
    expect(result.stimulusOnsetRawTime).toBe(1000);
    expect(result.stimulusOnsetTime).toBe(1007);
    expect(result.stimulusTimingMethod).toBe('raf');
    expect(result.displayLatencyMs).toBe(7);
    expect(result.provenance.displayLatencyMs).toBe(7);

    engine.destroy();
  });

  // ---- RT math + signed rawRtMs ----

  it('computes RT against the corrected onset and exposes a signed rawRtMs', async () => {
    const { engine, target, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'rt-math',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 300,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });
    await flush();
    dispatchKey(target, 'f', 1207);

    const result = await resultPromise;

    expect(result.response?.timingMethod).toBe('event.timeStamp');
    expect(result.response?.timestamp).toBe(1207);
    expect(result.response?.reactionTimeMs).toBe(207);
    expect(result.response?.rawRtMs).toBe(207);
    expect(result.anticipatory).toBe(false);
    expect(result.provenance.rawRtMs).toBe(207);

    engine.destroy();
  });

  // ---- W-2 / W-3 / W-14 environment + robustness provenance ----

  it('stamps crossOriginIsolated and a timer-resolution estimate into provenance (W-2)', async () => {
    const { engine, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'env',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 40,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });

    const result = await resultPromise;

    expect(typeof result.provenance.crossOriginIsolated).toBe('boolean');
    expect(typeof result.provenance.timerResolutionMs).toBe('number');
    expect(result.provenance.timerResolutionMs).toBeGreaterThanOrEqual(0);

    engine.destroy();
  });

  it('flags a visibility loss during a trial but records + completes it (W-3)', async () => {
    const { engine, target, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'vis',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 120,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });
    await flush();
    // Backgrounding / focus loss mid-trial: record mode flags but never aborts.
    window.dispatchEvent(new Event('blur'));
    dispatchKey(target, 'f', 1050);

    const result = await resultPromise;

    expect(result.invalid).toBe(false);
    expect(result.response?.reactionTimeMs).toBe(50);
    expect(result.provenance.invalidated).toBe('visibility');
    expect(result.provenance.visibilityLossCount).toBeGreaterThanOrEqual(1);
    expect(result.provenance.visibilityLossPhases).toBeDefined();
    expect(result.provenance.visibilityLossPhases!.length).toBeGreaterThanOrEqual(1);

    engine.destroy();
  });

  it('leaves invalidated null for a clean trial with no focus loss (W-3)', async () => {
    const { engine, target, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'clean',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 120,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });
    await flush();
    dispatchKey(target, 'f', 1040);

    const result = await resultPromise;

    expect(result.provenance.invalidated).toBeNull();
    expect(result.provenance.visibilityLossCount).toBe(0);

    engine.destroy();
  });

  it('ignores OS auto-repeat keydown events on the response path (W-14)', async () => {
    const { engine, target, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'repeat',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 120,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });
    await flush();

    // A held key fires an auto-repeat keydown (event.repeat === true) — it must be
    // ignored, so the genuine keypress at 1050 is the captured response, not 1020.
    const repeat = new KeyboardEvent('keydown', { key: 'f' });
    Object.defineProperty(repeat, 'repeat', { value: true });
    Object.defineProperty(repeat, 'timeStamp', { value: 1020, configurable: true });
    target.dispatchEvent(repeat);
    dispatchKey(target, 'f', 1050);

    const result = await resultPromise;

    expect(result.response?.timestamp).toBe(1050);
    expect(result.falseStartCount).toBe(0);

    engine.destroy();
  });

  // ---- 3.2 stimulus-duration concurrency ----

  it('runs the stimulus-duration timer concurrently with the response window (3.2)', async () => {
    const { engine, target, emitFrame, removed } = createMockEngine();

    let resolved = false;
    const resultPromise = engine
      .runTrial({
        id: 'duration',
        responseMode: 'keyboard',
        validKeys: ['f'],
        fixation: { enabled: false },
        stimulus: { kind: 'shape', shape: 'square', id: 'stim' },
        stimulusDurationMs: 40,
        responseTimeoutMs: 1000,
      })
      .then((r) => {
        resolved = true;
        return r;
      });

    await flush();
    emitFrame({ now: 1000, presented: true });

    // Wait past the stimulus duration WITHOUT responding.
    await delay(90);

    // The stimulus must already be removed while the response window is open —
    // the buggy ordering only removed it after (response + duration).
    expect(removed).toContain('stim');
    expect(resolved).toBe(false);

    // Now respond: the trial ends at the response, not response + duration.
    dispatchKey(target, 'f', 2000);
    const result = await resultPromise;

    expect(result.timeout).toBe(false);
    expect(result.response?.value).toBe('f');
    expect(result.stimulusOffsetTime).not.toBeNull();

    engine.destroy();
  });

  // ---- 3.5 anticipatory / false-start handling ----

  it('discards anticipatory responses, flags falseStart, and captures the later valid response (3.5)', async () => {
    const falseStarts: Array<{ timestamp: number }> = [];
    const { engine, target, emitFrame } = createMockEngine({
      hooks: { onFalseStart: (info) => falseStarts.push({ timestamp: info.timestamp }) },
    });

    const resultPromise = engine.runTrial({
      id: 'false-start',
      responseMode: 'keyboard',
      validKeys: ['a', 'b'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 300,
    });

    await flush();
    // Pre-onset response — must be discarded, must NOT end the trial or yield RT 0.
    dispatchKey(target, 'a', 500);
    await flush();

    emitFrame({ now: 1000, presented: true });
    await flush();
    dispatchKey(target, 'b', 1150);

    const result = await resultPromise;

    expect(result.anticipatory).toBe(true);
    expect(result.falseStart).toBe(true);
    expect(result.falseStartCount).toBe(1);
    expect(result.response?.value).toBe('b');
    expect(result.response?.reactionTimeMs).toBe(150);
    expect(result.response?.rawRtMs).toBe(150);
    expect(falseStarts).toEqual([{ timestamp: 500 }]);

    engine.destroy();
  });

  // ---- 3.1 audio output-latency compensation ----

  it('compensates the audio onset for output latency and records outputLatencyMs (3.1)', async () => {
    const restore = installMockAudioContext();
    try {
      const { engine } = createMockEngine();
      seedAudioBuffer(engine, 'a.mp3');

      const result = await engine.runTrial({
        id: 'audio',
        responseMode: 'keyboard',
        validKeys: ['f'],
        fixation: { enabled: false },
        stimulus: { kind: 'audio', src: 'a.mp3', autoplay: true },
        responseTimeoutMs: 40,
      });

      // onset = performanceTime + (currentTime + outputLatency - contextTime) * 1000
      //       = 10000 + (5 + 0.02 - 5) * 1000 = 10020
      expect(result.stimulusTimingMethod).toBe('audioContext');
      expect(result.stimulusOnsetTime).toBe(10020);
      expect(result.outputLatencyMs).toBe(20);
      expect(result.displayLatencyMs).toBeUndefined();
      expect(result.provenance.outputLatencyMs).toBe(20);

      engine.destroy();
    } finally {
      restore();
    }
  });

  it('primeAudio lazily creates and resumes a suspended AudioContext (CONTRACT-AUDIO)', async () => {
    const resume = vi.fn(async () => {});
    const restore = installMockAudioContext({ state: 'suspended', resume });
    try {
      const { engine } = createMockEngine();
      await engine.primeAudio();
      expect(resume).toHaveBeenCalledTimes(1);
      engine.destroy();
    } finally {
      restore();
    }
  });

  it('primeAudio resolves without deadlocking when resume() never settles (W-1)', async () => {
    // A resume() that never resolves models the no-user-activation / mobile audio
    // state that used to hang prepare() → run() forever (black canvas). primeAudio
    // must race it against the internal timeout and still resolve.
    vi.useFakeTimers();
    const resume = vi.fn(() => new Promise<void>(() => {})); // never settles
    const restore = installMockAudioContext({ state: 'suspended', resume });
    try {
      const { engine } = createMockEngine();
      const primed = engine.primeAudio();
      let settled = false;
      void primed.then(() => {
        settled = true;
      });
      // Advance past the resume timeout; the race resolves via the timeout branch.
      await vi.advanceTimersByTimeAsync(600);
      await primed;
      expect(settled).toBe(true);
      expect(resume).toHaveBeenCalledTimes(1);
      engine.destroy();
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it('primeAudio swallows errors when no AudioContext is available', async () => {
    const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: unknown };
    const originalAC = g.AudioContext;
    const originalWebkit = g.webkitAudioContext;
    g.AudioContext = undefined;
    g.webkitAudioContext = undefined;
    try {
      const { engine } = createMockEngine();
      await expect(engine.primeAudio()).resolves.toBeUndefined();
      engine.destroy();
    } finally {
      g.AudioContext = originalAC;
      g.webkitAudioContext = originalWebkit;
    }
  });

  // ---- 3.3 rVFC video onset ownership ----

  it('lets requestVideoFrameCallback own the video onset via expectedDisplayTime, not raf (3.3)', async () => {
    const { engine, emitFrame } = createMockEngine();
    const { video, triggerFrame } = createRvfcVideo();
    seedVideo(engine, 'v.mp4', video);

    const resultPromise = engine.runTrial({
      id: 'video-rvfc',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'video', src: 'v.mp4', id: 'stim' },
      responseTimeoutMs: 60,
    });

    await flush();
    // A raf frame must NOT steal the onset for a video stimulus (the old bug).
    emitFrame({ now: 999, presented: true });
    // rVFC owns the onset, using expectedDisplayTime.
    triggerFrame({
      expectedDisplayTime: 12345,
      presentationTime: 12300,
      mediaTime: 0.5,
      presentedFrames: 3,
      width: 640,
      height: 360,
    });

    const result = await resultPromise;

    expect(result.stimulusTimingMethod).toBe('rvfc');
    expect(result.stimulusOnsetTime).toBe(12345);
    expect(result.videoFrames.length).toBeGreaterThan(0);
    expect(result.videoFrames[0]?.expectedDisplayTime).toBe(12345);
    expect(result.videoFrames[0]?.mediaTime).toBe(0.5);
    expect(result.videoFrames[0]?.presentedFrames).toBe(3);

    engine.destroy();
  });

  it('falls back to raf onset for video when rVFC is unavailable (3.3)', async () => {
    const { engine, emitFrame } = createMockEngine();
    const video = {
      src: '',
      crossOrigin: '',
      playsInline: false,
      muted: false,
      videoWidth: 640,
      videoHeight: 360,
      play: () => Promise.resolve(),
    } as unknown as HTMLVideoElement;
    seedVideo(engine, 'v2.mp4', video);

    const resultPromise = engine.runTrial({
      id: 'video-no-rvfc',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'video', src: 'v2.mp4', id: 'stim' },
      responseTimeoutMs: 60,
    });

    await flush();
    emitFrame({ now: 500, presented: true });

    const result = await resultPromise;

    expect(result.stimulusTimingMethod).toBe('raf');
    expect(result.stimulusOnsetTime).toBe(500);

    engine.destroy();
  });

  it('falls back to raf for video if rVFC has not fired within ~2 frames (3.3)', async () => {
    const { engine, emitFrame } = createMockEngine();
    const { video } = createRvfcVideo(); // rVFC present but never triggered
    seedVideo(engine, 'v3.mp4', video);

    const resultPromise = engine.runTrial({
      id: 'video-rvfc-slow',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'video', src: 'v3.mp4', id: 'stim' },
      responseTimeoutMs: 60,
    });

    await flush();
    emitFrame({ now: 700, presented: true }); // frame 1 — onset still deferred to rVFC
    emitFrame({ now: 716, presented: true }); // frame 2 — raf fallback takes over

    const result = await resultPromise;

    expect(result.stimulusTimingMethod).toBe('raf');
    expect(result.stimulusOnsetTime).toBe(716);

    engine.destroy();
  });

  // ---- 3.8 marksStimulusOnset reset semantic ----

  it('re-marks the stimulus onset when a scheduled phase sets marksStimulusOnset (3.8)', async () => {
    const { engine, target, emitFrame } = createMockEngine();

    engine.schedulePhase({
      name: 'remark',
      durationMs: 30,
      allowResponse: true,
      marksStimulusOnset: true,
    });

    const resultPromise = engine.runTrial({
      id: 'remark',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 40,
    });

    await flush();
    // First onset (primary stimulus phase).
    emitFrame({ now: 1000, presented: true });
    // Let the response window time out so the scheduled phase runs.
    await delay(60);
    // The scheduled phase reset the onset; a new frame during it re-marks onset.
    emitFrame({ now: 5000, presented: true });

    const result = await resultPromise;

    // The re-mark discarded the 1000 onset in favour of the phase's frame.
    expect(result.stimulusOnsetTime).toBe(5000);
    expect(result.stimulusOnsetRawTime).toBe(5000);

    engine.clearScheduledPhases();
    engine.destroy();
    void target;
  });
});

// ---------------------------------------------------------------------------
// Robustness (4.1 render-error abort, 4.2 crossOrigin ordering).
// ---------------------------------------------------------------------------

describe('ReactionEngine — robustness', () => {
  // ---- 4.2 crossOrigin must be set BEFORE src ----

  it('sets crossOrigin=anonymous before src when loading an image (4.2)', async () => {
    const order: string[] = [];

    class MockImage {
      private _src = '';
      private _crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set crossOrigin(value: string) {
        order.push('crossOrigin');
        this._crossOrigin = value;
      }
      get crossOrigin(): string {
        return this._crossOrigin;
      }
      set src(value: string) {
        order.push('src');
        this._src = value;
        // Resolve the load asynchronously, like a real image.
        setTimeout(() => this.onload?.(), 0);
      }
      get src(): string {
        return this._src;
      }
    }

    const g = globalThis as { Image?: typeof Image };
    const original = g.Image;
    g.Image = MockImage as unknown as typeof Image;
    try {
      const { engine } = createMockEngine();
      await engine.warmUpStimuli([{ kind: 'image', src: 'https://cdn.example/x.png' }]);

      expect(order).toContain('crossOrigin');
      expect(order).toContain('src');
      // crossOrigin only takes effect if assigned before the load begins.
      expect(order.indexOf('crossOrigin')).toBeLessThan(order.indexOf('src'));

      engine.destroy();
    } finally {
      g.Image = original;
    }
  });

  it('sets crossOrigin=anonymous before src when loading a video (4.2)', async () => {
    const order: string[] = [];
    const realCreateElement = document.createElement.bind(document);

    const spy = vi.spyOn(document, 'createElement');
    spy.mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'video') {
        const listeners = new Map<string, EventListener>();
        const el = {
          _src: '',
          _crossOrigin: '',
          playsInline: false,
          muted: false,
          set crossOrigin(value: string) {
            order.push('crossOrigin');
            this._crossOrigin = value;
          },
          get crossOrigin(): string {
            return this._crossOrigin;
          },
          set src(value: string) {
            order.push('src');
            this._src = value;
          },
          get src(): string {
            return this._src;
          },
          addEventListener(type: string, cb: EventListener) {
            listeners.set(type, cb);
          },
          removeEventListener() {},
          load() {
            // Fire loadeddata asynchronously so loadVideo resolves.
            setTimeout(() => listeners.get('loadeddata')?.(new Event('loadeddata')), 0);
          },
        };
        return el as unknown as HTMLElement;
      }
      return realCreateElement(tagName, options);
    }) as unknown as typeof document.createElement);

    try {
      const { engine } = createMockEngine();
      await engine.warmUpStimuli([{ kind: 'video', src: 'https://cdn.example/v.mp4' }]);

      expect(order).toContain('crossOrigin');
      expect(order).toContain('src');
      expect(order.indexOf('crossOrigin')).toBeLessThan(order.indexOf('src'));

      engine.destroy();
    } finally {
      spy.mockRestore();
    }
  });

  // ---- 4.1 render-error aborts the trial (CONTRACT-ERR) ----

  it('aborts the trial and marks it invalid when a render error fires mid-trial (4.1)', async () => {
    const renderErrors: Array<{ source: string; error: unknown }> = [];
    const { engine, target, emitFrame, emitError } = createMockEngine({
      hooks: { onRenderError: (info) => renderErrors.push(info) },
    });

    const resultPromise = engine.runTrial({
      id: 'render-error',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'text', text: 'GO', id: 'stim' },
      responseTimeoutMs: 500,
    });

    await flush();
    // Onset is recorded — without the abort, a later keypress would time an RT
    // against a stimulus that never actually made it onto the screen.
    emitFrame({ now: 1000, presented: true });
    await flush();

    const securityError = new DOMException('The canvas has been tainted', 'SecurityError');
    emitError({ source: 'drawTexture', error: securityError });
    // A keypress arriving after the render error must NOT be recorded.
    dispatchKey(target, 'f', 1200);

    const result = await resultPromise;

    expect(result.invalid).toBe(true);
    expect(result.invalidReason).toBe('stimulus-render-failed');
    expect(result.response).toBeNull();
    expect(result.timeout).toBe(true);
    expect(result.isCorrect).toBeNull();
    expect(result.provenance.rawRtMs).toBeNull();
    expect(renderErrors).toEqual([{ source: 'drawTexture', error: securityError }]);

    engine.destroy();
  });

  it('leaves a normally-completed trial not invalid (4.1)', async () => {
    const { engine, target, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'render-ok',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 300,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });
    await flush();
    dispatchKey(target, 'f', 1120);

    const result = await resultPromise;

    expect(result.invalid).toBe(false);
    expect(result.invalidReason).toBeUndefined();
    expect(result.response?.value).toBe('f');

    engine.destroy();
  });
});

// ---------------------------------------------------------------------------
// Multi-channel precision response capture (E-REACT-1): gamepad, key-hold /
// release timing, and spatial-response scoring.
// ---------------------------------------------------------------------------

describe('ReactionEngine — multi-channel capture (E-REACT-1)', () => {
  // ---- Gamepad: onset → response with method 'gamepad.timestamp' ----

  it('captures a gamepad response on a mapped-button rising edge', async () => {
    let clock = 1000;
    const pump: { poll: ((time: number) => void) | null } = { poll: null };
    let pressed = false;

    const { engine, emitFrame } = createMockEngine({
      clock: () => clock,
      gamepadSource: () => ({ buttons: [{ pressed }] }),
      requestFrame: (cb) => {
        pump.poll = cb;
        return 1;
      },
      cancelFrame: () => {
        pump.poll = null;
      },
    });

    const resultPromise = engine.runTrial({
      id: 'gamepad',
      responseMode: 'gamepad',
      gamepadButtonMap: { 0: 'go' },
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 500,
    });

    await flush();
    // Visual onset at raf time 1000.
    emitFrame({ now: 1000, presented: true });
    await flush();

    // Poll frame 1: button still up — no response.
    pump.poll?.(0);
    // Press the button and advance the clock; poll frame 2 detects the edge.
    pressed = true;
    clock = 1180;
    pump.poll?.(0);

    const result = await resultPromise;

    expect(result.response?.source).toBe('gamepad');
    expect(result.response?.responseDevice).toBe('gamepad');
    expect(result.response?.gamepadButtonIndex).toBe(0);
    expect(result.response?.value).toBe('go');
    expect(result.response?.timingMethod).toBe('gamepad.timestamp');
    expect(result.response?.timestamp).toBe(1180);
    expect(result.response?.reactionTimeMs).toBe(180);
    expect(result.provenance.responseMethod).toBe('gamepad.timestamp');

    engine.destroy();
  });

  // ---- Keyboard hold/release: holdDurationMs = release − press ----

  it('captures key-hold duration on release when captureKeyUp is set', async () => {
    const { engine, target, emitFrame } = createMockEngine({});

    const resultPromise = engine.runTrial({
      id: 'key-hold',
      responseMode: 'keyboard',
      validKeys: ['f'],
      captureKeyUp: true,
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 500,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });
    await flush();

    // Key DOWN does not resolve the trial yet (RT anchor = 1100).
    dispatchKey(target, 'f', 1100);
    // Key UP finalizes the response and records the hold duration.
    dispatchKeyUp(target, 'f', 1350);

    const result = await resultPromise;

    expect(result.response?.value).toBe('f');
    expect(result.response?.responseDevice).toBe('keyboard');
    // RT is measured from the key-DOWN onset, not the release.
    expect(result.response?.timestamp).toBe(1100);
    expect(result.response?.reactionTimeMs).toBe(100);
    expect(result.response?.releaseTimestamp).toBe(1350);
    expect(result.response?.holdDurationMs).toBe(250);

    engine.destroy();
  });

  // ---- Spatial scoring: normalized click vs targetRegion ----

  it('scores a spatial click inside the target region as correct', async () => {
    const { engine, canvas, emitFrame } = createMockEngine({});

    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const resultPromise = engine.runTrial({
      id: 'spatial-hit',
      responseMode: 'mouse',
      requireCorrect: true,
      targetRegion: { x: 0.5, y: 0.5, radius: 0.2 },
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 400,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });
    await flush();

    // Click dead centre → normalized (0.5, 0.5), inside the region.
    const event = new MouseEvent('click', { clientX: 400, clientY: 300, bubbles: true });
    Object.defineProperty(event, 'timeStamp', { value: 1120, configurable: true });
    canvas.dispatchEvent(event);

    const result = await resultPromise;

    expect(result.response?.source).toBe('mouse');
    expect(result.isCorrect).toBe(true);
    expect(result.response?.reactionTimeMs).toBe(120);

    engine.destroy();
  });

  it('scores a spatial click outside the target region as incorrect', async () => {
    const { engine, canvas, emitFrame } = createMockEngine({});

    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const resultPromise = engine.runTrial({
      id: 'spatial-miss',
      responseMode: 'mouse',
      requireCorrect: true,
      targetRegion: { x: 0.5, y: 0.5, radius: 0.1 },
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 400,
    });

    await flush();
    emitFrame({ now: 1000, presented: true });
    await flush();

    // Click near the corner → normalized (~0.88, ~0.83), well outside the region.
    const event = new MouseEvent('click', { clientX: 700, clientY: 500, bubbles: true });
    Object.defineProperty(event, 'timeStamp', { value: 1120, configurable: true });
    canvas.dispatchEvent(event);

    const result = await resultPromise;

    expect(result.response?.source).toBe('mouse');
    expect(result.isCorrect).toBe(false);

    engine.destroy();
  });
});

// ---------------------------------------------------------------------------
// Frame-accurate stimulus offset + frame-count durations (E-REACT-3).
//
// Onset is already frame-exact; these tests pin the OFFSET to an exact presented
// (vsync) frame rather than a drifting setTimeout, and assert the exposure is
// verifiable per-trial via provenance (offsetMethod / actualDurationFrames).
// ---------------------------------------------------------------------------

/** Gatekeeper mock exposing a measured mean frame interval (calibrated device). */
function fakeCalibratedGatekeeper(opts: { displayLatencyMs: number; meanFrameIntervalMs: number }) {
  return {
    qualify: vi.fn(async () => {}),
    getEstimatedDisplayLatencyMs: () => opts.displayLatencyMs,
    getMeanFrameIntervalMs: () => opts.meanFrameIntervalMs,
  };
}

describe('ReactionEngine — frame-accurate offset (E-REACT-3)', () => {
  it('removes a 3-frame stimulus on exactly the 3rd presented frame after onset', async () => {
    const { engine, target, emitFrame, removed } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'frame-offset',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'square', id: 'stim' },
      stimulusDurationFrames: 3,
      responseTimeoutMs: 1000,
    });

    await flush();
    // Onset frame (frame 0 of the exposure).
    emitFrame({ now: 1000, presented: true, index: 0 });

    // Two more presented frames — the stimulus is STILL shown (3-frame exposure).
    emitFrame({ now: 1016, presented: true, index: 1 });
    emitFrame({ now: 1032, presented: true, index: 2 });
    expect(removed).not.toContain('stim');

    // The 3rd presented frame after onset removes it on the vsync boundary.
    emitFrame({ now: 1048, presented: true, index: 3 });
    expect(removed).toContain('stim');

    // End the trial with a response so we can inspect the result.
    dispatchKey(target, 'f', 2000);
    const result = await resultPromise;

    expect(result.offsetMethod).toBe('raf');
    expect(result.actualDurationFrames).toBe(3);
    // Offset stamped from the presenting frame's time, not a wall-clock timer.
    expect(result.stimulusOffsetTime).toBe(1048);
    expect(result.provenance.offsetMethod).toBe('raf');
    expect(result.provenance.actualDurationFrames).toBe(3);

    engine.destroy();
  });

  it('does not remove the stimulus before its frame count elapses even past the ms-equivalent time', async () => {
    const { engine, emitFrame, removed } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'frame-offset-hold',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      stimulusDurationFrames: 5,
      responseTimeoutMs: 60,
    });

    await flush();
    emitFrame({ now: 1000, presented: true, index: 0 });
    // Only 3 presented frames arrive — fewer than the 5-frame budget.
    emitFrame({ now: 1016, presented: true, index: 1 });
    emitFrame({ now: 1032, presented: true, index: 2 });
    emitFrame({ now: 1048, presented: true, index: 3 });

    const result = await resultPromise;

    // Frame-count offset never fired (too few frames); the stimulus was removed
    // at response-window close instead — offsetMethod falls back to 'none'.
    expect(removed).toContain('stim');
    expect(result.offsetMethod).toBe('none');
    expect(result.actualDurationFrames).toBeNull();

    engine.destroy();
  });

  it('converts a ms duration to a vsync-aligned frame budget on a calibrated device', async () => {
    // displayLatency 0 keeps the onset unshifted; meanFrameInterval 16ms means a
    // 48ms duration → 3 frames, removed on the raf path (not setTimeout).
    const gatekeeper = fakeCalibratedGatekeeper({ displayLatencyMs: 0, meanFrameIntervalMs: 16 });
    const { engine, target, emitFrame, removed } = createMockEngine({ gatekeeper });

    const resultPromise = engine.runTrial({
      id: 'ms-calibrated',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'square', id: 'stim' },
      stimulusDurationMs: 48,
      responseTimeoutMs: 1000,
    });

    await flush();
    emitFrame({ now: 1000, presented: true, index: 0 });
    emitFrame({ now: 1016, presented: true, index: 1 });
    emitFrame({ now: 1032, presented: true, index: 2 });
    expect(removed).not.toContain('stim');
    emitFrame({ now: 1048, presented: true, index: 3 });
    expect(removed).toContain('stim');

    dispatchKey(target, 'f', 2000);
    const result = await resultPromise;

    expect(result.offsetMethod).toBe('raf');
    expect(result.actualDurationFrames).toBe(3);

    engine.destroy();
  });

  it('falls back to a setTimeout offset for a ms duration on an uncalibrated device', async () => {
    const { engine, target, emitFrame, removed } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'ms-uncalibrated',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'square', id: 'stim' },
      stimulusDurationMs: 30,
      responseTimeoutMs: 1000,
    });

    await flush();
    emitFrame({ now: 1000, presented: true, index: 0 });
    // No gatekeeper → no calibrated frame interval → setTimeout removes it.
    await delay(60);
    expect(removed).toContain('stim');

    dispatchKey(target, 'f', 2000);
    const result = await resultPromise;

    expect(result.offsetMethod).toBe('timeout');
    expect(result.actualDurationFrames).toBeNull();

    engine.destroy();
  });

  it('advances a scheduled phase off the presented-frame counter when durationFrames is set', async () => {
    const { engine, target, emitFrame } = createMockEngine();

    engine.schedulePhase({ name: 'rsvp-item', durationMs: 0, durationFrames: 2, allowResponse: false });

    const resultPromise = engine.runTrial({
      id: 'phase-frames',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 1000,
    });

    await flush();
    emitFrame({ now: 1000, presented: true, index: 0 });
    await flush();
    // Respond to close the response window so the scheduled phase runs next.
    dispatchKey(target, 'f', 1100);
    await flush();
    await flush();

    // The scheduled phase now waits for exactly 2 presented frames.
    emitFrame({ now: 1200, presented: true, index: 1 });
    emitFrame({ now: 1216, presented: true, index: 2 });

    const result = await resultPromise;

    const phase = result.phaseTimeline.find((p) => p.name === 'rsvp-item');
    expect(phase).toBeDefined();
    expect(phase!.endTime).toBeGreaterThanOrEqual(phase!.startTime);

    engine.clearScheduledPhases();
    engine.destroy();
  });

  it('records offsetMethod=none for an open-ended stimulus with no duration', async () => {
    const { engine, target, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial({
      id: 'open-ended',
      responseMode: 'keyboard',
      validKeys: ['f'],
      fixation: { enabled: false },
      stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
      responseTimeoutMs: 300,
    });

    await flush();
    emitFrame({ now: 1000, presented: true, index: 0 });
    await flush();
    dispatchKey(target, 'f', 1150);

    const result = await resultPromise;

    expect(result.offsetMethod).toBe('none');
    expect(result.actualDurationFrames).toBeNull();

    engine.destroy();
  });
});

// ---------------------------------------------------------------------------
// ResponseSet model (RT-1a, ADR 0024).
//
// The engine works internally only with ResponseSets: an explicit set wins,
// else the legacy fields compile into one. These pin compile-legacy
// equivalence, concurrent multi-source arming (first-wins), the key-up edge,
// optionId-based correctness, and the preserved W-14 auto-repeat guard.
// ---------------------------------------------------------------------------

/** Mock `getBoundingClientRect` so normalized pointer/touch coords are stable. */
function mockRect(canvas: HTMLCanvasElement) {
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

function dispatchClick(canvas: HTMLCanvasElement, clientX: number, clientY: number, timeStamp: number) {
  const event = new MouseEvent('click', { clientX, clientY, bubbles: true });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp, configurable: true });
  canvas.dispatchEvent(event);
}

/** A keydown carrying `repeat: true` (OS auto-repeat), for the W-14 guard. */
function dispatchRepeatKey(target: HTMLElement, key: string, timeStamp: number) {
  const event = new KeyboardEvent('keydown', { key, repeat: true });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp, configurable: true });
  target.dispatchEvent(event);
}

/**
 * Start a trial, drive a single presented frame so the visual onset stamps at
 * raf time 1000, then run `act` (which typically dispatches the response). The
 * returned promise settles when the trial finishes.
 */
function runTrialToResult(
  engine: ReactionEngine,
  config: ReactionTrialConfig,
  emitFrame: EmitFrame,
  act: () => void
) {
  const resultPromise = engine.runTrial(config);
  return (async () => {
    await flush();
    emitFrame({ now: 1000, presented: true, index: 0 });
    await flush();
    act();
    return resultPromise;
  })();
}

const baseTrial = (overrides: Partial<ReactionTrialConfig>): ReactionTrialConfig => ({
  id: 'rs-trial',
  fixation: { enabled: false },
  stimulus: { kind: 'shape', shape: 'circle', id: 'stim' },
  responseTimeoutMs: 400,
  ...overrides,
});

describe('ReactionEngine — ResponseSet model (RT-1a, ADR 0024)', () => {
  // ---- Compile-legacy equivalence (table-driven over the win/correct outcomes). ----

  it('compiles legacy keyboard validKeys/correctResponse to an equivalent set', async () => {
    const cases: Array<{ key: string; expectCorrect: boolean }> = [
      { key: 'f', expectCorrect: true },
      { key: 'j', expectCorrect: false },
    ];

    for (const { key, expectCorrect } of cases) {
      const { engine, target, emitFrame } = createMockEngine();
      const result = await runTrialToResult(
        engine,
        baseTrial({
          id: `legacy-${key}`,
          responseMode: 'keyboard',
          validKeys: ['f', 'j'],
          correctResponse: 'f',
          requireCorrect: true,
        }),
        emitFrame,
        () => dispatchKey(target, key, 1150)
      );

      expect(result.response?.value).toBe(key);
      expect(result.response?.optionId).toBe(key);
      expect(result.response?.responseSource).toBe('keyboard');
      expect(result.isCorrect).toBe(expectCorrect);
      engine.destroy();
    }
  });

  it('preserves the legacy "any key" behaviour when validKeys is empty (wildcard)', async () => {
    const { engine, target, emitFrame } = createMockEngine();
    const result = await runTrialToResult(
      engine,
      baseTrial({ id: 'wildcard', responseMode: 'keyboard' }),
      emitFrame,
      () => dispatchKey(target, 'q', 1150)
    );

    expect(result.response?.value).toBe('q');
    expect(result.response?.optionId).toBe('q');
    expect(result.response?.responseSource).toBe('keyboard');
    engine.destroy();
  });

  // ---- Concurrent multi-source arming (first-wins, source recorded). ----

  it('arms keyboard and pointer concurrently; a key press wins and records its source', async () => {
    const { engine, target, canvas, emitFrame } = createMockEngine();
    mockRect(canvas);

    const result = await runTrialToResult(
      engine,
      baseTrial({
        id: 'concurrent-key',
        responseSet: {
          options: [
            { id: 'go', bindings: [{ source: 'keyboard', key: 'f' }, { source: 'pointer' }] },
          ],
        },
      }),
      emitFrame,
      () => dispatchKey(target, 'f', 1150)
    );

    expect(result.response?.responseSource).toBe('keyboard');
    expect(result.response?.source).toBe('keyboard');
    expect(result.response?.optionId).toBe('go');
    expect(result.response?.value).toBe('f');
    engine.destroy();
  });

  it('arms keyboard and pointer concurrently; a click wins and records the pointer source', async () => {
    const { engine, canvas, emitFrame } = createMockEngine();
    mockRect(canvas);

    const result = await runTrialToResult(
      engine,
      baseTrial({
        id: 'concurrent-click',
        responseSet: {
          options: [
            { id: 'go', bindings: [{ source: 'keyboard', key: 'f' }, { source: 'pointer' }] },
          ],
        },
      }),
      emitFrame,
      () => dispatchClick(canvas, 400, 300, 1180)
    );

    expect(result.response?.responseSource).toBe('pointer');
    // `source` stays the legacy ReactionResponseMode (pointer ⇒ mouse).
    expect(result.response?.source).toBe('mouse');
    expect(result.response?.optionId).toBe('go');
    expect(result.response?.reactionTimeMs).toBe(180);
    engine.destroy();
  });

  it('first event wins across concurrent sources; the later one is suppressed', async () => {
    const { engine, target, canvas, emitFrame } = createMockEngine();
    mockRect(canvas);

    const result = await runTrialToResult(
      engine,
      baseTrial({
        id: 'first-wins',
        responseSet: {
          options: [
            { id: 'go', bindings: [{ source: 'keyboard', key: 'f' }, { source: 'pointer' }] },
          ],
        },
      }),
      emitFrame,
      () => {
        dispatchKey(target, 'f', 1150); // wins
        dispatchClick(canvas, 400, 300, 1200); // suppressed (resolver already nulled)
      }
    );

    expect(result.response?.responseSource).toBe('keyboard');
    expect(result.response?.value).toBe('f');
    expect(result.response?.timestamp).toBe(1150);
    engine.destroy();
  });

  // ---- Key-up edge: an on:'up' binding resolves on release, not press. ----

  it('resolves an on:"up" keyboard binding on release (RT anchored on the key-up)', async () => {
    const { engine, target, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial(
      baseTrial({
        id: 'keyup-binding',
        responseSet: {
          options: [{ id: 'release', bindings: [{ source: 'keyboard', key: 'f', on: 'up' }] }],
        },
      })
    );

    await flush();
    emitFrame({ now: 1000, presented: true, index: 0 });
    await flush();

    // Press does NOT resolve the trial (only the release does).
    dispatchKey(target, 'f', 1100);
    dispatchKeyUp(target, 'f', 1250);

    const result = await resultPromise;

    expect(result.response?.value).toBe('f');
    expect(result.response?.optionId).toBe('release');
    expect(result.response?.responseSource).toBe('keyboard');
    // RT anchored on the key-UP (1250), not the press (which would be 1100 → 100).
    expect(result.response?.timestamp).toBe(1250);
    expect(result.response?.reactionTimeMs).toBe(250);
    engine.destroy();
  });

  // ---- Correctness via correctOptionIds. ----

  it('scores correctness by the winning option id when correctOptionIds is set', async () => {
    const cases: Array<{ key: string; optionId: string; expectCorrect: boolean }> = [
      { key: 'j', optionId: 'right', expectCorrect: true },
      { key: 'f', optionId: 'left', expectCorrect: false },
    ];

    for (const { key, optionId, expectCorrect } of cases) {
      const { engine, target, emitFrame } = createMockEngine();
      const result = await runTrialToResult(
        engine,
        baseTrial({
          id: `option-correct-${key}`,
          requireCorrect: true,
          correctOptionIds: ['right'],
          responseSet: {
            options: [
              { id: 'left', bindings: [{ source: 'keyboard', key: 'f' }] },
              { id: 'right', bindings: [{ source: 'keyboard', key: 'j' }] },
            ],
          },
        }),
        emitFrame,
        () => dispatchKey(target, key, 1150)
      );

      expect(result.response?.optionId).toBe(optionId);
      expect(result.isCorrect).toBe(expectCorrect);
      engine.destroy();
    }
  });

  // ---- W-14 auto-repeat guard still holds under the ResponseSet path. ----

  it('ignores OS auto-repeat keydowns (no phantom false start, no phantom response)', async () => {
    const { engine, target, emitFrame } = createMockEngine();

    const resultPromise = engine.runTrial(
      baseTrial({ id: 'repeat-guard', responseMode: 'keyboard', validKeys: ['f'] })
    );

    await flush();
    // Pre-onset auto-repeat keydown: must be ignored, NOT counted as a false start.
    dispatchRepeatKey(target, 'f', 500);
    emitFrame({ now: 1000, presented: true, index: 0 });
    await flush();
    // A genuine (non-repeat) press resolves the trial.
    dispatchKey(target, 'f', 1150);

    const result = await resultPromise;

    expect(result.falseStartCount).toBe(0);
    expect(result.anticipatory).toBe(false);
    expect(result.response?.value).toBe('f');
    expect(result.response?.timestamp).toBe(1150);
    engine.destroy();
  });
});
