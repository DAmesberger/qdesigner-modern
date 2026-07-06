import type {
  RendererOptions,
  FrameStats,
  RenderCommand,
  FrameSample,
  RGBAColor,
} from '$lib/shared';
import { vertexShaderSource, fragmentShaderSource, createShader, createProgram } from './shaders';

/**
 * Per-frame context handed to every {@link Renderable.render} and frame callback.
 * Moved here from the deleted `runtime/stimuli/Stimulus` module (Slice 5.2) — the
 * WebGL renderer is now the sole owner of this shape.
 */
export interface RenderContext {
  /** Current time in ms (performance.now()-based). */
  time: number;
  /** Time since the last frame in ms. */
  deltaTime: number;
  /** Time since stimulus onset in ms (0 until markStimulusOnset). */
  stimulusTime: number;
  /** 0-1 progress for in/out transitions, when applicable. */
  transitionProgress?: number;
  /** Backing-store width in physical pixels. */
  width: number;
  /** Backing-store height in physical pixels. */
  height: number;
  /** Physical-to-CSS pixel ratio. */
  pixelRatio: number;
}

export interface Renderable {
  id: string;
  render: (gl: WebGL2RenderingContext, context: RenderContext) => void;
  layer?: number;
}

type TextureSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

export type FrameCallback = (
  sample: FrameSample,
  stats: FrameStats,
  context: RenderContext
) => void;

/** Payload delivered to {@link WebGLRenderer.onError} when a render/upload op fails. */
export interface RendererErrorInfo {
  /** Human-readable label for the failing operation or resource (e.g. an image URL). */
  source: string;
  /** The underlying error thrown by the WebGL/DOM API. */
  error: unknown;
}

export type RendererErrorCallback = (info: RendererErrorInfo) => void;
export type ContextLostCallback = () => void;
export type ContextRestoredCallback = () => void;

const IDENTITY_MATRIX = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export class WebGLRenderer {
  private gl!: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private canvas: HTMLCanvasElement;
  private targetFPS: number;
  private vsync: boolean;
  private frameInterval: number;

  private lastFrameTime = 0;
  private lastPresentedTime = 0;
  private frameCount = 0;
  private droppedFrames = 0;
  private totalFrames = 0;
  private fpsUpdateInterval = 1000;
  private lastFPSUpdate = 0;
  private currentFPS = 0;
  private animationId: number | null = null;
  private recentFrameTimes: number[] = [];
  private readonly maxRecentFrameTimes = 240;

  private renderables: Map<string, Renderable> = new Map();
  private renderablesByLayer: Map<number, Set<string>> = new Map();
  /**
   * Ascending layer keys, rebuilt only when the layer set changes (add/remove/
   * clear). renderFrame iterates this instead of re-sorting the map keys every
   * rAF tick (F106 — no per-frame array rebuild in the steady-state loop).
   */
  private sortedLayers: number[] = [];
  private stimulusStartTime = 0;

  private positionBuffer!: WebGLBuffer;
  private texCoordBuffer!: WebGLBuffer;

  /**
   * Grow-on-demand scratch buffers for drawGeometry (F106). Clip-space positions
   * are written directly into positionScratch (no intermediate number[]); the
   * per-draw texcoords go into texCoordScratch. Both only grow, never shrink, so
   * a session settles at its peak size with zero per-draw allocation thereafter.
   */
  private positionScratch = new Float32Array(0);
  private texCoordScratch = new Float32Array(0);
  /** Default (all-zero) texcoord arrays, cached per vertex count for the fallback path. */
  private defaultTexCoordsCache = new Map<number, Float32Array>();
  private matrixLocation!: WebGLUniformLocation;
  private colorLocation!: WebGLUniformLocation;
  private textureLocation!: WebGLUniformLocation;
  private useTextureLocation!: WebGLUniformLocation;

  private frameCallbacks: Set<FrameCallback> = new Set();
  private errorCallbacks: Set<RendererErrorCallback> = new Set();
  private contextLostCallbacks: Set<ContextLostCallback> = new Set();
  private contextRestoredCallbacks: Set<ContextRestoredCallback> = new Set();
  private backgroundColor: RGBAColor;

  /** Physical-to-CSS pixel ratio applied by resizeToDisplaySize (HiDPI backing store). */
  private pixelRatio: number;

  /** True between webglcontextlost and webglcontextrestored — the loop is paused. */
  private contextLost = false;
  /** Whether the render loop was running when the context was lost (resume on restore). */
  private wasRunningBeforeLoss = false;

  private textureCache = new WeakMap<TextureSource, WebGLTexture>();
  private uploadedTextures = new Set<WebGLTexture>();
  /**
   * Ordered log of every uploaded texture and the source it was created from.
   * Enables marker-based per-trial freeing (markTextures/deleteTexturesSince) and
   * re-upload after a context restore — neither of which the WeakMap can iterate.
   */
  private textureRecords: Array<{ source: TextureSource; texture: WebGLTexture }> = [];
  /** Sources flagged for a one-shot re-upload on their next resolve (explicit dirty bit). */
  private dirtyTextureSources = new WeakSet<TextureSource>();

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.targetFPS = Math.max(1, options.targetFPS || 60);
    this.vsync = options.vsync ?? true;
    this.frameInterval = 1000 / this.targetFPS;
    this.backgroundColor = options.backgroundColor || [0, 0, 0, 1];

    const gl = this.canvas.getContext('webgl2', {
      antialias: options.antialias ?? false,
      depth: false,
      stencil: false,
      alpha: true,
      desynchronized: options.desynchronized ?? true,
      powerPreference: options.powerPreference || 'high-performance',
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });

    if (!gl) {
      throw new Error('WebGL 2.0 is required but not supported');
    }

    this.gl = gl;
    this.pixelRatio =
      options.pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1) ?? 1;
    this.registerContextListeners();
    this.initializeWebGL();
    this.resize(
      this.canvas.width || this.canvas.clientWidth || 1,
      this.canvas.height || this.canvas.clientHeight || 1
    );
  }

  private initializeWebGL(): void {
    const gl = this.gl;

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
      throw new Error('Failed to create shaders');
    }

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
      throw new Error('Failed to create WebGL program');
    }

    this.program = program;

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');

    const matrixLocation = gl.getUniformLocation(program, 'u_matrix');
    const colorLocation = gl.getUniformLocation(program, 'u_color');
    const textureLocation = gl.getUniformLocation(program, 'u_texture');
    const useTextureLocation = gl.getUniformLocation(program, 'u_useTexture');

    if (!matrixLocation || !colorLocation || !textureLocation || !useTextureLocation) {
      throw new Error('Failed to resolve shader uniforms');
    }

    this.matrixLocation = matrixLocation;
    this.colorLocation = colorLocation;
    this.textureLocation = textureLocation;
    this.useTextureLocation = useTextureLocation;

    const positionBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    if (!positionBuffer || !texCoordBuffer) {
      throw new Error('Failed to create WebGL buffers');
    }

    this.positionBuffer = positionBuffer;
    this.texCoordBuffer = texCoordBuffer;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray(texCoordLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private registerContextListeners(): void {
    this.canvas.addEventListener(
      'webglcontextlost',
      this.handleContextLost as EventListener,
      false
    );
    this.canvas.addEventListener(
      'webglcontextrestored',
      this.handleContextRestored as EventListener,
      false
    );
  }

  /**
   * WebGL context loss handler. `preventDefault()` is REQUIRED — without it the
   * browser will not fire `webglcontextrestored`. We pause the loop, flag the
   * lost state, and surface it through both the dedicated hook and `onError` so a
   * consumer that only subscribes to errors (the ReactionEngine, CONTRACT-ERR)
   * still learns the frame it recorded against is invalid.
   */
  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.wasRunningBeforeLoss = this.animationId !== null;
    this.stop();
    this.emitError('webglcontextlost', new Error('WebGL context lost'));
    for (const cb of this.contextLostCallbacks) {
      this.safeInvoke(cb);
    }
  };

  /**
   * WebGL context restored handler. All GPU objects created against the old
   * context (program, uniforms, buffers, VAO, textures) are gone; rebuild them,
   * re-assert the viewport, re-upload every known texture, then resume the loop
   * if it was running when the context was lost.
   */
  private handleContextRestored = (): void => {
    try {
      this.contextLost = false;
      this.initializeWebGL();
      // Canvas backing-store dimensions survive context loss; re-assert the viewport.
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.rebuildTextures();
    } catch (error) {
      this.emitError('webglcontextrestored', error);
      return;
    }

    for (const cb of this.contextRestoredCallbacks) {
      this.safeInvoke(cb);
    }

    if (this.wasRunningBeforeLoss) {
      this.wasRunningBeforeLoss = false;
      this.start();
    }
  };

  private emitError(source: string, error: unknown): void {
    for (const cb of this.errorCallbacks) {
      try {
        cb({ source, error });
      } catch {
        // A misbehaving subscriber must not take down the render loop.
      }
    }
  }

  private safeInvoke(cb: () => void): void {
    try {
      cb();
    } catch {
      // A misbehaving subscriber must not take down the render loop.
    }
  }

  public onFrame(callback: FrameCallback): () => void {
    this.frameCallbacks.add(callback);
    return () => this.frameCallbacks.delete(callback);
  }

  /**
   * Subscribe to render/upload errors (CONTRACT-ERR). Fired when a texture upload
   * throws (e.g. a cross-origin SecurityError), on context loss, and when an
   * unsupported custom shader is requested. Returns an unsubscribe function.
   */
  public onError(callback: RendererErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  /** Subscribe to WebGL context-loss events. Returns an unsubscribe function. */
  public onContextLost(callback: ContextLostCallback): () => void {
    this.contextLostCallbacks.add(callback);
    return () => this.contextLostCallbacks.delete(callback);
  }

  /**
   * Subscribe to context-restore events, fired after the renderer has rebuilt its
   * program/buffers/textures. Returns an unsubscribe function.
   */
  public onContextRestored(callback: ContextRestoredCallback): () => void {
    this.contextRestoredCallbacks.add(callback);
    return () => this.contextRestoredCallbacks.delete(callback);
  }

  /** Whether the WebGL context is currently lost (loop paused, draws are no-ops). */
  public isContextLost(): boolean {
    return this.contextLost;
  }

  public setTargetFPS(targetFPS: number): void {
    this.targetFPS = Math.max(1, targetFPS);
    this.frameInterval = 1000 / this.targetFPS;
  }

  public setVSync(enabled: boolean): void {
    this.vsync = enabled;
  }

  public setBackgroundColor(color: RGBAColor): void {
    this.backgroundColor = color;
  }

  public start(): void {
    if (this.animationId !== null) return;

    const now = performance.now();
    this.lastFrameTime = now;
    this.lastPresentedTime = now;
    this.lastFPSUpdate = now;

    const render = (currentTime: number) => {
      const delta = currentTime - this.lastFrameTime;
      this.lastFrameTime = currentTime;

      const shouldPresent =
        this.vsync || currentTime - this.lastPresentedTime >= this.frameInterval;
      let droppedSinceLast = 0;

      if (shouldPresent) {
        const presentedDelta = currentTime - this.lastPresentedTime;
        const expectedFrames =
          this.frameInterval > 0 ? Math.floor(presentedDelta / this.frameInterval) : 1;
        droppedSinceLast = Math.max(0, expectedFrames - 1);

        if (droppedSinceLast > 0) {
          this.droppedFrames += droppedSinceLast;
        }

        this.lastPresentedTime = currentTime;
        this.totalFrames++;
        this.frameCount++;

        this.recordFrameTime(presentedDelta > 0 ? presentedDelta : delta);
      }

      this.updateFPS(currentTime);

      // Build ONE RenderContext per rAF tick (F106): the render pass and the
      // frame-callback dispatch previously each allocated a near-identical
      // context. Renderables read only width/height/stimulusTime (never
      // deltaTime), so a single object with deltaTime=delta drives both paths
      // with bit-identical rendered output. The context is only built when it is
      // actually consumed — a presented frame or a live subscriber.
      const hasSubscribers = this.frameCallbacks.size > 0;
      if (shouldPresent || hasSubscribers) {
        const context = this.createRenderContext(currentTime, delta);

        if (shouldPresent) {
          this.renderFrame(context);
        }

        // Only allocate FrameSample/FrameStats when someone is subscribed (F106).
        // These MUST stay freshly allocated per frame: ReactionEngine.
        // subscribeFrameLogging pushes the sample into its frameLog for timing
        // provenance, so pooling would corrupt the log.
        if (hasSubscribers) {
          const sample: FrameSample = {
            index: this.totalFrames,
            now: currentTime,
            delta,
            presented: shouldPresent,
            droppedSinceLast,
          };
          const stats = this.getStats();
          for (const callback of this.frameCallbacks) {
            callback(sample, stats, context);
          }
        }
      }

      this.animationId = requestAnimationFrame(render);
    };

    this.animationId = requestAnimationFrame(render);
  }

  public stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private updateFPS(currentTime: number): void {
    if (currentTime - this.lastFPSUpdate >= this.fpsUpdateInterval) {
      const elapsed = currentTime - this.lastFPSUpdate;
      this.currentFPS = elapsed > 0 ? (this.frameCount * 1000) / elapsed : 0;
      this.frameCount = 0;
      this.lastFPSUpdate = currentTime;
    }
  }

  private recordFrameTime(frameTime: number): void {
    this.recentFrameTimes.push(frameTime);
    if (this.recentFrameTimes.length > this.maxRecentFrameTimes) {
      this.recentFrameTimes.shift();
    }
  }

  private createRenderContext(currentTime: number, deltaTime: number): RenderContext {
    return {
      time: currentTime,
      deltaTime,
      stimulusTime: this.stimulusStartTime > 0 ? currentTime - this.stimulusStartTime : 0,
      width: this.canvas.width,
      height: this.canvas.height,
      pixelRatio: window.devicePixelRatio || 1,
    };
  }

  private renderFrame(context: RenderContext): void {
    if (this.contextLost) return;
    const gl = this.gl;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    const [r, g, b, a] = this.backgroundColor;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    const layers = this.sortedLayers;
    for (const layer of layers) {
      const ids = this.renderablesByLayer.get(layer);
      if (!ids) continue;
      for (const id of ids) {
        const renderable = this.renderables.get(id);
        if (renderable) {
          renderable.render(gl, context);
        }
      }
    }
  }

  public executeCommand(command: RenderCommand): void {
    if (this.contextLost) return;
    switch (command.type) {
      case 'clear':
        this.setBackgroundColor([
          command.params.r,
          command.params.g,
          command.params.b,
          command.params.a,
        ]);
        break;
      case 'drawRect':
        this.drawRect(command.params);
        break;
      case 'drawCircle':
        this.drawCircle(command.params);
        break;
      case 'drawTriangle':
        this.drawTriangle(command.params);
        break;
      case 'drawTexture':
        this.drawTexture(command.params);
        break;
      case 'customShader':
        this.executeCustomShader(command.params);
        break;
    }
  }

  private drawRect(params: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: RGBAColor;
  }): void {
    const { x, y, width, height } = params;
    const vertices = [
      x,
      y,
      x + width,
      y,
      x,
      y + height,
      x,
      y + height,
      x + width,
      y,
      x + width,
      y + height,
    ];

    const texCoords = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];

    this.drawGeometry(vertices, params.color, 6, texCoords, false);
  }

  private drawTriangle(params: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3: number;
    y3: number;
    color: RGBAColor;
  }): void {
    const vertices = [params.x1, params.y1, params.x2, params.y2, params.x3, params.y3];
    const texCoords = [0.5, 0, 0, 1, 1, 1];
    this.drawGeometry(vertices, params.color, 3, texCoords, false);
  }

  private drawCircle(params: {
    x: number;
    y: number;
    radius: number;
    color: RGBAColor;
    segments?: number;
  }): void {
    const segments = Math.max(12, params.segments || 32);
    const vertices: number[] = [params.x, params.y];
    const texCoords: number[] = [0.5, 0.5];

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const vx = params.x + params.radius * Math.cos(theta);
      const vy = params.y + params.radius * Math.sin(theta);
      vertices.push(vx, vy);
      texCoords.push(0.5 + Math.cos(theta) * 0.5, 0.5 + Math.sin(theta) * 0.5);
    }

    this.drawGeometry(vertices, params.color, segments + 2, texCoords, false, this.gl.TRIANGLE_FAN);
  }

  private drawTexture(params: {
    texture: WebGLTexture | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity?: number;
  }): void {
    const gl = this.gl;
    const texture = this.resolveTexture(params.texture);
    if (!texture) return;

    const vertices = [
      params.x,
      params.y,
      params.x + params.width,
      params.y,
      params.x,
      params.y + params.height,
      params.x,
      params.y + params.height,
      params.x + params.width,
      params.y,
      params.x + params.width,
      params.y + params.height,
    ];

    const texCoords = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];

    this.drawGeometry(
      vertices,
      [1, 1, 1, params.opacity ?? 1],
      6,
      texCoords,
      true,
      gl.TRIANGLES,
      texture
    );
  }

  /**
   * Custom user-supplied fragment shaders are NOT compiled or executed by this
   * renderer. The previous implementation silently drew white fallback geometry
   * in the stimulus's place — it claimed to render the stimulus but showed the
   * wrong pixels, so a reaction time captured against it would be meaningless.
   * Rather than a silent no-op that lies about drawing, we surface the failure
   * once per shader through onError so the engine can invalidate the trial
   * (CONTRACT-ERR), and we draw nothing.
   */
  private executeCustomShader(_params: {
    shader: string;
    vertices: number[];
    uniforms?: Record<string, number | number[] | boolean>;
  }): void {
    // Emit on EVERY invocation (not deduped for the renderer's lifetime): a
    // reaction block reuses one custom-shader stimulus across many trials, and
    // each such trial must be invalidated (CONTRACT-ERR). The sole subscriber
    // (ReactionEngine) dedupes within a trial, so per-frame re-emits are cheap.
    this.emitError(
      'customShader',
      new Error('Custom shaders are not supported by WebGLRenderer')
    );
  }

  private resolveTexture(
    textureLike: WebGLTexture | TextureSource
  ): WebGLTexture | null {
    if (this.isWebGLTexture(textureLike)) {
      return textureLike;
    }

    const source = textureLike as TextureSource;

    const cached = this.textureCache.get(source);
    if (cached) {
      // Re-upload only when the pixels can change (4.5): a <video> advances every
      // frame, and callers can force a refresh via invalidateTexture. Static
      // images and text/2D canvases are uploaded once on creation — re-uploading
      // them on every cache hit was a needless per-frame GPU transfer.
      if (this.isVideoSource(source) || this.dirtyTextureSources.has(source)) {
        this.uploadTextureSource(cached, source);
        this.dirtyTextureSources.delete(source);
      }
      return cached;
    }

    return this.createTextureForSource(source);
  }

  private createTextureForSource(source: TextureSource): WebGLTexture | null {
    const texture = this.gl.createTexture();
    if (!texture) {
      return null;
    }

    this.configureTexture(texture);
    // Do NOT cache a failed upload (CONTRACT-ERR): a persistently-failing source
    // (cross-origin SecurityError, decode/OOM) would otherwise be served from the
    // cache on trials 2..N with no re-upload and no error — so those trials would
    // draw a blank texture yet not be invalidated. By returning null and not
    // caching, each subsequent draw retries here and re-emits onError, so EVERY
    // trial that uses the bad source is invalidated.
    if (!this.uploadTextureSource(texture, source)) {
      this.gl.deleteTexture(texture);
      return null;
    }
    this.textureCache.set(source, texture);
    this.uploadedTextures.add(texture);
    this.textureRecords.push({ source, texture });

    return texture;
  }

  private isVideoSource(source: TextureSource): boolean {
    return typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
  }

  /**
   * Mark this source's GPU texture stale so the next draw re-uploads its pixels.
   * Use for a 2D canvas whose contents changed between frames (video sources
   * re-upload automatically and do not need this).
   */
  public invalidateTexture(source: TextureSource): void {
    this.dirtyTextureSources.add(source);
  }

  /**
   * Return a marker for the current texture set. Pair with deleteTexturesSince to
   * free every texture uploaded after this point (e.g. a trial's per-trial media).
   */
  public markTextures(): number {
    return this.textureRecords.length;
  }

  /**
   * Delete every texture created since `marker`, releasing GPU memory and dropping
   * the corresponding WeakMap cache entries so a later draw re-creates them.
   */
  public deleteTexturesSince(marker: number): void {
    const from = Math.max(0, Math.min(marker, this.textureRecords.length));
    const removed = this.textureRecords.splice(from);
    for (const { source, texture } of removed) {
      this.gl.deleteTexture(texture);
      this.uploadedTextures.delete(texture);
      this.dirtyTextureSources.delete(source);
      if (this.textureCache.get(source) === texture) {
        this.textureCache.delete(source);
      }
    }
  }

  /**
   * Delete the texture cached for a specific source, freeing its GPU memory. The
   * next draw of that source re-creates the texture. Returns whether one existed.
   */
  public deleteTexture(source: TextureSource): boolean {
    const texture = this.textureCache.get(source);
    if (!texture) {
      return false;
    }

    this.gl.deleteTexture(texture);
    this.uploadedTextures.delete(texture);
    this.dirtyTextureSources.delete(source);
    this.textureCache.delete(source);

    const index = this.textureRecords.findIndex((record) => record.texture === texture);
    if (index !== -1) {
      this.textureRecords.splice(index, 1);
    }

    return true;
  }

  /**
   * Re-create and re-upload every known texture after a context restore. The old
   * WebGLTexture handles died with the context; we drop them and rebuild from the
   * retained sources (the WeakMap cannot be iterated, hence textureRecords).
   */
  private rebuildTextures(): void {
    const records = this.textureRecords;
    this.textureRecords = [];
    this.uploadedTextures.clear();

    for (const { source } of records) {
      this.textureCache.delete(source);
      this.createTextureForSource(source);
    }
  }

  private isWebGLTexture(
    value: WebGLTexture | TextureSource
  ): value is WebGLTexture {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebGL API requires untyped access
    const textureCtor = (globalThis as any).WebGLTexture;
    return Boolean(textureCtor && value instanceof textureCtor);
  }

  private configureTexture(texture: WebGLTexture): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  /** Returns true on a successful upload, false when texImage2D threw. */
  private uploadTextureSource(texture: WebGLTexture, source: TextureSource): boolean {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      return true;
    } catch (error) {
      // Do NOT silently swallow the failure (4.1 / CONTRACT-ERR). A cross-origin
      // (tainted) source throws a SecurityError here; a consumer must be able to
      // observe it and invalidate the trial rather than record a reaction time
      // against a blank screen. Rendering stays resilient — we never rethrow, the
      // loop keeps running.
      this.emitError(this.describeTextureSource(source), error);
      return false;
    }
  }

  private describeTextureSource(source: TextureSource): string {
    if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
      return source.currentSrc || source.src || 'image';
    }
    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
      return source.currentSrc || source.src || 'video';
    }
    if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
      return 'canvas';
    }
    return 'texture';
  }

  private drawGeometry(
    pixelVertices: number[],
    color: RGBAColor,
    vertexCount: number,
    texCoords?: number[],
    useTexture = false,
    primitive: number = this.gl.TRIANGLES,
    texture?: WebGLTexture
  ): void {
    const gl = this.gl;
    const clipCount = this.writeClipSpace(pixelVertices);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positionScratch.subarray(0, clipCount), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    if (texCoords) {
      const texData = this.writeTexCoords(texCoords);
      gl.bufferData(gl.ARRAY_BUFFER, texData, gl.DYNAMIC_DRAW);
    } else {
      gl.bufferData(gl.ARRAY_BUFFER, this.defaultTexCoords(vertexCount), gl.DYNAMIC_DRAW);
    }

    gl.uniform4fv(this.colorLocation, color);
    gl.uniform1i(this.useTextureLocation, useTexture ? 1 : 0);
    gl.uniformMatrix3fv(this.matrixLocation, false, IDENTITY_MATRIX);

    if (useTexture && texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.textureLocation, 0);
    }

    gl.drawArrays(primitive, 0, vertexCount);
  }

  /**
   * Convert pixel-space vertices to clip space, writing the result directly into
   * the grow-on-demand positionScratch buffer (F106 — no intermediate number[]
   * and no per-draw Float32Array). Returns the number of floats written (== the
   * input length). Math is reproduced exactly from the previous toClipSpace:
   * clipX = (x/w)*2-1, clipY = -((y/h)*2-1).
   */
  private writeClipSpace(pixelVertices: number[]): number {
    const width = this.canvas.width || 1;
    const height = this.canvas.height || 1;
    const n = pixelVertices.length;
    const scratch = this.ensurePositionScratch(n);

    for (let i = 0; i < n; i += 2) {
      const x = pixelVertices[i] || 0;
      const y = pixelVertices[i + 1] || 0;
      scratch[i] = (x / width) * 2 - 1;
      scratch[i + 1] = -((y / height) * 2 - 1);
    }

    return n;
  }

  /** Copy caller-supplied texcoords into the grow-on-demand texCoordScratch buffer. */
  private writeTexCoords(texCoords: number[]): Float32Array {
    const n = texCoords.length;
    const scratch = this.ensureTexCoordScratch(n);
    for (let i = 0; i < n; i++) {
      scratch[i] = texCoords[i]!;
    }
    return scratch.subarray(0, n);
  }

  /** Grow positionScratch to hold at least `capacity` floats; never shrinks. */
  private ensurePositionScratch(capacity: number): Float32Array {
    if (this.positionScratch.length < capacity) {
      this.positionScratch = new Float32Array(capacity);
    }
    return this.positionScratch;
  }

  /** Grow texCoordScratch to hold at least `capacity` floats; never shrinks. */
  private ensureTexCoordScratch(capacity: number): Float32Array {
    if (this.texCoordScratch.length < capacity) {
      this.texCoordScratch = new Float32Array(capacity);
    }
    return this.texCoordScratch;
  }

  /**
   * Default (all-zero) texcoords for `vertexCount` vertices, cached per count so
   * the fallback path allocates once per distinct vertex count (F106). The
   * returned Float32Array is exactly `vertexCount * 2` floats of 0 — do not
   * mutate it; callers upload it read-only.
   */
  private defaultTexCoords(vertexCount: number): Float32Array {
    let coords = this.defaultTexCoordsCache.get(vertexCount);
    if (!coords) {
      coords = new Float32Array(vertexCount * 2);
      this.defaultTexCoordsCache.set(vertexCount, coords);
    }
    return coords;
  }

  public getStats(): FrameStats {
    const averageFrameTime =
      this.recentFrameTimes.length > 0
        ? this.recentFrameTimes.reduce((sum, value) => sum + value, 0) /
          this.recentFrameTimes.length
        : this.frameInterval;

    const mean = averageFrameTime;
    const variance =
      this.recentFrameTimes.length > 1
        ? this.recentFrameTimes.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
          this.recentFrameTimes.length
        : 0;

    // NOTE: `gpuTime` (FrameStats' optional field) is intentionally omitted. It
    // was always 0 — EXT_disjoint_timer_query was acquired but never issued a
    // query — so reporting it was a fake stat (4.8). Left out until a real GPU
    // timer-query implementation lands; consumers already treat it as optional.
    return {
      fps: this.currentFPS,
      frameTime: averageFrameTime,
      droppedFrames: this.droppedFrames,
      targetFPS: this.targetFPS,
      totalFrames: this.totalFrames,
      jitter: Math.sqrt(variance),
    };
  }

  public resize(width: number, height: number): void {
    const clampedWidth = Math.max(1, Math.floor(width));
    const clampedHeight = Math.max(1, Math.floor(height));
    this.canvas.width = clampedWidth;
    this.canvas.height = clampedHeight;
    this.gl.viewport(0, 0, clampedWidth, clampedHeight);
  }

  /**
   * DPR-aware resize (4.4). `resize()` takes PHYSICAL (backing-store) pixels; this
   * multiplies the canvas's CSS size by `pixelRatio` so the backing store matches
   * physical pixels on HiDPI displays. All draw math (drawRect/drawCircle/
   * toClipSpace) and the viewport operate in backing-store pixels, so scaling the
   * backing store up here only sharpens output — the pixel-space geometry stays
   * correct. The default ratio is the one captured at construction (options.
   * pixelRatio ?? devicePixelRatio); callers may pass a live devicePixelRatio.
   */
  public resizeToDisplaySize(pixelRatio: number = this.pixelRatio): void {
    this.pixelRatio = pixelRatio;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.resize(width, height);
    }
  }

  public destroy(): void {
    this.stop();
    const gl = this.gl;

    this.canvas.removeEventListener(
      'webglcontextlost',
      this.handleContextLost as EventListener
    );
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored as EventListener
    );

    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.texCoordBuffer);
    gl.deleteProgram(this.program);

    for (const texture of this.uploadedTextures) {
      gl.deleteTexture(texture);
    }
    this.uploadedTextures.clear();
    this.textureRecords = [];
    this.frameCallbacks.clear();
    this.errorCallbacks.clear();
    this.contextLostCallbacks.clear();
    this.contextRestoredCallbacks.clear();
  }

  public addRenderable(renderable: Renderable): void {
    this.renderables.set(renderable.id, renderable);

    const layer = renderable.layer || 0;
    if (!this.renderablesByLayer.has(layer)) {
      this.renderablesByLayer.set(layer, new Set());
      // New layer key → refresh the cached ascending order (F106).
      this.rebuildSortedLayers();
    }
    this.renderablesByLayer.get(layer)!.add(renderable.id);
  }

  public removeRenderable(id: string): void {
    const renderable = this.renderables.get(id);
    if (!renderable) return;

    this.renderables.delete(id);

    const layer = renderable.layer || 0;
    const layerSet = this.renderablesByLayer.get(layer);
    if (layerSet) {
      layerSet.delete(id);
      if (layerSet.size === 0) {
        this.renderablesByLayer.delete(layer);
        // Layer key removed → refresh the cached ascending order (F106).
        this.rebuildSortedLayers();
      }
    }
  }

  public clearRenderables(): void {
    this.renderables.clear();
    this.renderablesByLayer.clear();
    this.rebuildSortedLayers();
  }

  /** Recompute the cached ascending layer keys iterated by renderFrame (F106). */
  private rebuildSortedLayers(): void {
    this.sortedLayers = Array.from(this.renderablesByLayer.keys()).sort((a, b) => a - b);
  }

  public markStimulusOnset(): void {
    this.stimulusStartTime = performance.now();
  }

  /**
   * Total presented (vsync) frames since the loop started (E-REACT-3). Each
   * emitted `FrameSample.index` carries this same running count for the frame it
   * describes; the accessor is provided so a consumer can schedule an action N
   * presented frames after onset (frame-accurate stimulus offset) without
   * threading the sample through.
   */
  public getPresentedFrameCount(): number {
    return this.totalFrames;
  }

  public getContext(): WebGL2RenderingContext {
    return this.gl;
  }
}
