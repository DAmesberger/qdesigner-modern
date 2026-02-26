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

describe('ReactionEngine', () => {
  it('captures keyboard responses with reaction time', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    vi.spyOn(canvas, 'getContext').mockImplementation((contextId: string) => {
      if (contextId === 'webgl2') {
        return createWebGL2Mock(canvas);
      }
      return null;
    });

    const engine = new ReactionEngine({ canvas, eventTarget: document });

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

  it('returns timeout when no response is captured', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    vi.spyOn(canvas, 'getContext').mockImplementation((contextId: string) => {
      if (contextId === 'webgl2') {
        return createWebGL2Mock(canvas);
      }
      return null;
    });

    const engine = new ReactionEngine({ canvas, eventTarget: document });

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
});
