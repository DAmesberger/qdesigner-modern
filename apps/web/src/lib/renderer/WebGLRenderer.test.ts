import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebGLRenderer } from './WebGLRenderer';

type MockGl = ReturnType<typeof createMockGl>;

/**
 * A reasonably complete WebGL2 mock. Every method is a spy so tests can assert
 * call counts (rebuild-after-restore, video-only re-upload) or override behaviour
 * (a throwing texImage2D for the upload-error path).
 */
function createMockGl() {
  return {
    // renderFrame reads gl.canvas.width/height — filled in by setup().
    canvas: undefined as unknown as HTMLCanvasElement,
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
}

function drawTexture(
  renderer: WebGLRenderer,
  texture: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
) {
  renderer.executeCommand({
    type: 'drawTexture',
    params: { texture, x: 0, y: 0, width: 10, height: 10 },
  });
}

describe('WebGLRenderer', () => {
  let canvas: HTMLCanvasElement;
  let gl: MockGl;
  let renderer: WebGLRenderer | null;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    gl = createMockGl();
    gl.canvas = canvas;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock/test fixture with dynamic shape
    vi.spyOn(canvas, 'getContext').mockReturnValue(gl as any);
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

    expect(() => renderer!.start()).not.toThrow();
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

  it('should not report a fake gpuTime stat (4.8)', () => {
    renderer = new WebGLRenderer({ canvas });
    const stats = renderer.getStats();
    // gpuTime was always 0 (timer query never issued); it is now omitted rather
    // than reported as a real measurement.
    expect(stats.gpuTime).toBeUndefined();
  });

  // ---- 4.1 error surfacing (CONTRACT-ERR) ----

  it('fires onError when a texture upload throws instead of swallowing it', () => {
    const uploadError = new DOMException('tainted canvas', 'SecurityError');
    gl.texImage2D = vi.fn(() => {
      throw uploadError;
    });
    renderer = new WebGLRenderer({ canvas });

    const errors: Array<{ source: string; error: unknown }> = [];
    const unsubscribe = renderer.onError((info) => errors.push(info));

    const img = document.createElement('img');
    img.src = 'https://cross-origin.example/stimulus.png';

    // Rendering stays resilient — the failing upload must NOT throw out of the call.
    expect(() => drawTexture(renderer!, img)).not.toThrow();

    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toBe(uploadError);
    expect(typeof errors[0]!.source).toBe('string');
    expect(errors[0]!.source.length).toBeGreaterThan(0);

    unsubscribe();
    drawTexture(renderer, img);
    // Cached source is not a video and not dirty → no second upload, no second error.
    expect(errors).toHaveLength(1);
  });

  it('rejects custom shaders via onError rather than silently drawing (4.8)', () => {
    renderer = new WebGLRenderer({ canvas });

    const errors: Array<{ source: string }> = [];
    renderer.onError((info) => errors.push(info));
    gl.drawArrays.mockClear();

    renderer.executeCommand({
      type: 'customShader',
      params: { shader: 'my-shader', vertices: [0, 0, 1, 0, 0, 1] },
    });

    expect(errors.some((e) => e.source === 'customShader')).toBe(true);
    // The old stub drew white fallback geometry; the correct behaviour draws nothing.
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });

  // ---- 4.3 context loss / restore ----

  it('marks the context lost, preventing default, and notifies subscribers', () => {
    renderer = new WebGLRenderer({ canvas });

    const lost: number[] = [];
    const errors: Array<{ source: string }> = [];
    renderer.onContextLost(() => lost.push(1));
    renderer.onError((info) => errors.push(info));

    renderer.start();

    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);

    expect(renderer.isContextLost()).toBe(true);
    // preventDefault() is required for the browser to fire webglcontextrestored.
    expect(event.defaultPrevented).toBe(true);
    expect(lost).toHaveLength(1);
    expect(errors.some((e) => e.source === 'webglcontextlost')).toBe(true);
  });

  it('rebuilds program, buffers and textures on context restore', () => {
    renderer = new WebGLRenderer({ canvas });

    // Create a texture before loss so restore has something to re-upload.
    const img = document.createElement('img');
    img.src = 'https://example.test/stimulus.png';
    drawTexture(renderer, img);

    const restored: number[] = [];
    renderer.onContextRestored(() => restored.push(1));

    const programsBefore = gl.createProgram.mock.calls.length;
    const buffersBefore = gl.createBuffer.mock.calls.length;
    const texturesBefore = gl.createTexture.mock.calls.length;
    const uploadsBefore = gl.texImage2D.mock.calls.length;

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(renderer.isContextLost()).toBe(true);

    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(renderer.isContextLost()).toBe(false);
    expect(restored).toHaveLength(1);
    // Program + buffers rebuilt, textures re-created and re-uploaded.
    expect(gl.createProgram.mock.calls.length).toBeGreaterThan(programsBefore);
    expect(gl.createBuffer.mock.calls.length).toBeGreaterThan(buffersBefore);
    expect(gl.createTexture.mock.calls.length).toBeGreaterThan(texturesBefore);
    expect(gl.texImage2D.mock.calls.length).toBeGreaterThan(uploadsBefore);
  });

  it('removes context-loss listeners on destroy', () => {
    renderer = new WebGLRenderer({ canvas });
    renderer.destroy();

    const lost: number[] = [];
    renderer.onContextLost(() => lost.push(1));
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));

    // Listener was removed in destroy(): dispatch is a no-op.
    expect(lost).toHaveLength(0);
    renderer = null; // already destroyed
  });

  // ---- 4.4 DPR-aware resize ----

  it('applies devicePixelRatio in resizeToDisplaySize (4.4)', () => {
    Object.defineProperty(canvas, 'clientWidth', { value: 500, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 400, configurable: true });

    renderer = new WebGLRenderer({ canvas });
    gl.viewport.mockClear();

    renderer.resizeToDisplaySize(2);

    // Backing store = CSS size * DPR, so it matches physical pixels on HiDPI.
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(800);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 1000, 800);
  });

  it('uses the construction-time pixelRatio as the resizeToDisplaySize default', () => {
    Object.defineProperty(canvas, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 200, configurable: true });

    renderer = new WebGLRenderer({ canvas, pixelRatio: 3 });
    renderer.resizeToDisplaySize();

    expect(canvas.width).toBe(900);
    expect(canvas.height).toBe(600);
  });

  // ---- 4.5 video-only re-upload + texture freeing ----

  it('re-uploads video textures every draw but static textures only once (4.5)', () => {
    renderer = new WebGLRenderer({ canvas });

    const staticCanvas = document.createElement('canvas');
    gl.texImage2D.mockClear();
    drawTexture(renderer, staticCanvas);
    drawTexture(renderer, staticCanvas);
    // Uploaded once on creation; the cache hit skips re-upload for a static source.
    expect(gl.texImage2D).toHaveBeenCalledTimes(1);

    const video = document.createElement('video');
    gl.texImage2D.mockClear();
    drawTexture(renderer, video);
    drawTexture(renderer, video);
    // Video advances per frame — every draw re-uploads.
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
  });

  it('re-uploads a static texture after invalidateTexture', () => {
    renderer = new WebGLRenderer({ canvas });

    const staticCanvas = document.createElement('canvas');
    gl.texImage2D.mockClear();
    drawTexture(renderer, staticCanvas);
    expect(gl.texImage2D).toHaveBeenCalledTimes(1);

    renderer.invalidateTexture(staticCanvas);
    drawTexture(renderer, staticCanvas);
    // Dirty flag forces one re-upload, then reverts to cached.
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
    drawTexture(renderer, staticCanvas);
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
  });

  it('frees textures created since a marker (4.5)', () => {
    renderer = new WebGLRenderer({ canvas });

    const marker = renderer.markTextures();
    const img = document.createElement('img');
    img.src = 'https://example.test/a.png';
    drawTexture(renderer, img);

    gl.deleteTexture.mockClear();
    renderer.deleteTexturesSince(marker);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);

    // The cache entry was evicted, so the next draw re-creates the texture.
    const createdBefore = gl.createTexture.mock.calls.length;
    drawTexture(renderer, img);
    expect(gl.createTexture.mock.calls.length).toBe(createdBefore + 1);
  });

  it('deletes a texture for a specific source', () => {
    renderer = new WebGLRenderer({ canvas });

    const img = document.createElement('img');
    img.src = 'https://example.test/b.png';
    drawTexture(renderer, img);

    gl.deleteTexture.mockClear();
    expect(renderer.deleteTexture(img)).toBe(true);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    // Already freed → no-op the second time.
    expect(renderer.deleteTexture(img)).toBe(false);
  });

  // ---- F106 hoisted allocations ----

  it('keeps the cached sortedLayers ascending across add/remove/clear (F106)', () => {
    renderer = new WebGLRenderer({ canvas });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reads the private cache
    const layersOf = () => (renderer as any).sortedLayers as number[];
    const mk = (id: string, layer: number) => ({ id, layer, render: () => {} });

    renderer.addRenderable(mk('a', 5));
    renderer.addRenderable(mk('b', 1));
    renderer.addRenderable(mk('c', 3));
    expect(layersOf()).toEqual([1, 3, 5]);

    // Reusing an existing layer key does not change the order.
    renderer.addRenderable(mk('d', 3));
    expect(layersOf()).toEqual([1, 3, 5]);

    // Removing one of two renderables on layer 3 keeps the key (set non-empty).
    renderer.removeRenderable('c');
    expect(layersOf()).toEqual([1, 3, 5]);

    // Emptying layer 3 drops the key and refreshes the cache.
    renderer.removeRenderable('d');
    expect(layersOf()).toEqual([1, 5]);

    renderer.clearRenderables();
    expect(layersOf()).toEqual([]);
  });

  it('drawGeometry writes clip-space positions identical to the old path (F106)', () => {
    // Canvas is 800x600 (beforeEach). clipX=(x/w)*2-1, clipY=-((y/h)*2-1).
    renderer = new WebGLRenderer({ canvas });
    gl.bufferData.mockClear();

    renderer.executeCommand({
      type: 'drawRect',
      params: { x: 0, y: 0, width: 800, height: 600, color: [1, 0, 0, 1] },
    });

    // First bufferData call uploads positions (the second uploads texcoords).
    const positions = gl.bufferData.mock.calls[0]![1] as Float32Array;
    expect(positions).toBeInstanceOf(Float32Array);
    // Rect pixel verts: (0,0)(800,0)(0,600)(0,600)(800,0)(800,600).
    expect(Array.from(positions)).toEqual([
      -1, 1, // (0,0)
      1, 1, // (800,0)
      -1, -1, // (0,600)
      -1, -1, // (0,600)
      1, 1, // (800,0)
      1, -1, // (800,600)
    ]);
  });

  it('delivers a distinct FrameSample object to subscribers on each frame (F106)', () => {
    renderer = new WebGLRenderer({ canvas });

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const samples: unknown[] = [];
    renderer.onFrame((sample) => samples.push(sample));

    renderer.start();
    // start() scheduled the first render; each render re-schedules the next.
    rafCallbacks.shift()!(16);
    rafCallbacks.shift()!(32);

    expect(samples).toHaveLength(2);
    // Fresh allocation per frame is a retention contract: ReactionEngine pushes
    // each sample into its frameLog, so a pooled/reused object would corrupt it.
    expect(samples[0]).not.toBe(samples[1]);
  });

  it('counts drops against the MEASURED refresh, not the 120fps target (W-6)', () => {
    // targetFPS 120 (the reaction default) on a 60Hz panel used to mark ~1 fake
    // drop per real frame because expectedFrames divided by the 8.33ms target.
    renderer = new WebGLRenderer({ canvas, targetFPS: 120, vsync: true });
    renderer.setMeasuredRefreshInterval(1000 / 60); // ~16.67ms — a real 60Hz display

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    renderer.start();
    // Present frames at the true 60Hz cadence: no drops should be recorded.
    let t = 0;
    for (let i = 0; i < 5; i++) {
      t += 1000 / 60;
      rafCallbacks.shift()!(t);
    }
    expect(renderer.getStats().droppedFrames).toBe(0);

    // A genuine missed vsync (a ~2x-refresh gap) is counted as exactly one drop.
    t += (1000 / 60) * 2;
    rafCallbacks.shift()!(t);
    expect(renderer.getStats().droppedFrames).toBe(1);
  });
});
