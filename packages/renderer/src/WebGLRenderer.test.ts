import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebGLRenderer } from './WebGLRenderer';

describe('WebGLRenderer', () => {
  let canvas: HTMLCanvasElement;
  let renderer: WebGLRenderer | null;

  beforeEach(() => {
    // Create a mock canvas
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    // Mock WebGL2 context
    const mockContext = {
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
      deleteBuffer: vi.fn(),
      deleteProgram: vi.fn(),
      deleteShader: vi.fn(),
      getShaderInfoLog: vi.fn(() => ''),
      getProgramInfoLog: vi.fn(() => ''),
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
    };

    // Mock getContext to return our mock WebGL2 context
    vi.spyOn(canvas, 'getContext').mockReturnValue(mockContext as any);
  });

  afterEach(() => {
    if (renderer) {
      renderer.destroy();
      renderer = null;
    }
    vi.restoreAllMocks();
  });

  it('should initialize without errors', () => {
    expect(() => {
      renderer = new WebGLRenderer({ canvas });
    }).not.toThrow();
  });

  it('should throw error when WebGL 2.0 is not supported', () => {
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);

    expect(() => {
      renderer = new WebGLRenderer({ canvas });
    }).toThrow('WebGL 2.0 is required but not supported');
  });

  it('should respect target FPS setting', () => {
    renderer = new WebGLRenderer({ canvas, targetFPS: 120 });
    const stats = renderer.getStats();
    expect(stats.targetFPS).toBe(120);
  });

  it('should start and stop rendering', () => {
    renderer = new WebGLRenderer({ canvas });
    
    // Should be able to start
    expect(() => renderer!.start()).not.toThrow();
    
    // Should be able to stop
    expect(() => renderer!.stop()).not.toThrow();
  });

  it('should handle resize', () => {
    renderer = new WebGLRenderer({ canvas });
    
    expect(() => renderer!.resize(1920, 1080)).not.toThrow();
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
  });

  it('should provide frame statistics', () => {
    renderer = new WebGLRenderer({ canvas, targetFPS: 60 });
    const stats = renderer.getStats();

    expect(stats).toHaveProperty('fps');
    expect(stats).toHaveProperty('frameTime');
    expect(stats).toHaveProperty('droppedFrames');
    expect(stats).toHaveProperty('targetFPS');
    expect(stats.targetFPS).toBe(60);
  });
});