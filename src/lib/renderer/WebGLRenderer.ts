import type {
  RendererOptions,
  FrameStats,
  RenderCommand,
  FrameSample,
  RGBAColor,
} from '$lib/shared';
import { vertexShaderSource, fragmentShaderSource, createShader, createProgram } from './shaders';

import type { RenderContext } from '$lib/runtime/stimuli/Stimulus';

export interface Renderable {
  id: string;
  render: (gl: WebGL2RenderingContext, context: RenderContext) => void;
  layer?: number;
}

export type FrameCallback = (
  sample: FrameSample,
  stats: FrameStats,
  context: RenderContext
) => void;

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
  private stimulusStartTime = 0;

  private positionBuffer!: WebGLBuffer;
  private texCoordBuffer!: WebGLBuffer;
  private matrixLocation!: WebGLUniformLocation;
  private colorLocation!: WebGLUniformLocation;
  private textureLocation!: WebGLUniformLocation;
  private useTextureLocation!: WebGLUniformLocation;

  private frameCallbacks: Set<FrameCallback> = new Set();
  private ext: any;
  private gpuTime = 0;
  private backgroundColor: RGBAColor;

  private textureCache = new WeakMap<object, WebGLTexture>();
  private uploadedTextures = new Set<WebGLTexture>();

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
    this.initializeWebGL();
    this.setupPerformanceMonitoring();
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

  private setupPerformanceMonitoring(): void {
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  public onFrame(callback: FrameCallback): () => void {
    this.frameCallbacks.add(callback);
    return () => this.frameCallbacks.delete(callback);
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
        this.renderFrame(currentTime, presentedDelta > 0 ? presentedDelta : delta);
      }

      this.updateFPS(currentTime);

      const context = this.createRenderContext(currentTime, delta);
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

  private renderFrame(currentTime: number, deltaTime: number): void {
    const gl = this.gl;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    const [r, g, b, a] = this.backgroundColor;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    const context = this.createRenderContext(currentTime, deltaTime);

    const layers = Array.from(this.renderablesByLayer.keys()).sort((a, b) => a - b);
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

  private executeCustomShader(params: {
    shader: string;
    vertices: number[];
    uniforms?: Record<string, number | number[] | boolean>;
  }): void {
    if (params.vertices.length < 6) {
      return;
    }

    const fallbackColor: RGBAColor = [1, 1, 1, 1];
    this.drawGeometry(params.vertices, fallbackColor, params.vertices.length / 2);
  }

  private resolveTexture(
    textureLike: WebGLTexture | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
  ): WebGLTexture | null {
    const textureCtor = (globalThis as any).WebGLTexture;
    if (textureCtor && textureLike instanceof textureCtor) {
      return textureLike as WebGLTexture;
    }

    const cached = this.textureCache.get(textureLike);
    if (cached) {
      this.uploadTextureSource(cached, textureLike);
      return cached;
    }

    const texture = this.gl.createTexture();
    if (!texture) {
      return null;
    }

    this.configureTexture(texture);
    this.uploadTextureSource(texture, textureLike);
    this.textureCache.set(textureLike, texture);
    this.uploadedTextures.add(texture);

    return texture;
  }

  private configureTexture(texture: WebGLTexture): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private uploadTextureSource(
    texture: WebGLTexture,
    source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
  ): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      // Ignore transient upload failures (e.g., media not ready yet).
    }
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
    const clipVertices = this.toClipSpace(pixelVertices);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(clipVertices), gl.DYNAMIC_DRAW);

    const fallbackTex = this.defaultTexCoords(vertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords || fallbackTex), gl.DYNAMIC_DRAW);

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

  private toClipSpace(pixelVertices: number[]): number[] {
    const width = this.canvas.width || 1;
    const height = this.canvas.height || 1;
    const clipVertices: number[] = [];

    for (let i = 0; i < pixelVertices.length; i += 2) {
      const x = pixelVertices[i] || 0;
      const y = pixelVertices[i + 1] || 0;
      const clipX = (x / width) * 2 - 1;
      const clipY = -((y / height) * 2 - 1);
      clipVertices.push(clipX, clipY);
    }

    return clipVertices;
  }

  private defaultTexCoords(vertexCount: number): number[] {
    const coords: number[] = [];
    for (let i = 0; i < vertexCount; i++) {
      coords.push(0, 0);
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

    return {
      fps: this.currentFPS,
      frameTime: averageFrameTime,
      droppedFrames: this.droppedFrames,
      targetFPS: this.targetFPS,
      totalFrames: this.totalFrames,
      jitter: Math.sqrt(variance),
      gpuTime: this.gpuTime,
    };
  }

  public resize(width: number, height: number): void {
    const clampedWidth = Math.max(1, Math.floor(width));
    const clampedHeight = Math.max(1, Math.floor(height));
    this.canvas.width = clampedWidth;
    this.canvas.height = clampedHeight;
    this.gl.viewport(0, 0, clampedWidth, clampedHeight);
  }

  public resizeToDisplaySize(pixelRatio = window.devicePixelRatio || 1): void {
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.resize(width, height);
    }
  }

  public destroy(): void {
    this.stop();
    const gl = this.gl;

    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.texCoordBuffer);
    gl.deleteProgram(this.program);

    for (const texture of this.uploadedTextures) {
      gl.deleteTexture(texture);
    }
    this.uploadedTextures.clear();
  }

  public addRenderable(renderable: Renderable): void {
    this.renderables.set(renderable.id, renderable);

    const layer = renderable.layer || 0;
    if (!this.renderablesByLayer.has(layer)) {
      this.renderablesByLayer.set(layer, new Set());
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
      }
    }
  }

  public clearRenderables(): void {
    this.renderables.clear();
    this.renderablesByLayer.clear();
  }

  public markStimulusOnset(): void {
    this.stimulusStartTime = performance.now();
  }

  public getContext(): WebGL2RenderingContext {
    return this.gl;
  }
}
