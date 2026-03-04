import { describe, it, expect, vi } from 'vitest';
import { ReactionEngine } from './ReactionEngine';

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
