import type { RendererOptions, FrameStats, RenderCommand } from '../types/renderer';
import {
  vertexShaderSource,
  fragmentShaderSource,
  createShader,
  createProgram,
} from './shaders';

import type { RenderContext } from '../runtime/stimuli/Stimulus';

export interface Renderable {
  id: string;
  render: (gl: WebGL2RenderingContext, context: RenderContext) => void;
  layer?: number;
}

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private canvas: HTMLCanvasElement;
  private targetFPS: number;
  private frameInterval: number;
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private droppedFrames: number = 0;
  private fpsUpdateInterval: number = 1000; // Update FPS every second
  private lastFPSUpdate: number = 0;
  private currentFPS: number = 0;
  private animationId: number | null = null;
  
  // Renderable management
  private renderables: Map<string, Renderable> = new Map();
  private renderablesByLayer: Map<number, Set<string>> = new Map();
  private stimulusStartTime: number = 0;

  // WebGL resources
  private positionBuffer: WebGLBuffer;
  private texCoordBuffer: WebGLBuffer;
  private matrixLocation: WebGLUniformLocation;
  private colorLocation: WebGLUniformLocation;
  private textureLocation: WebGLUniformLocation;
  private useTextureLocation: WebGLUniformLocation;

  // Performance monitoring
  private ext: any; // WebGL timer extension

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.targetFPS = options.targetFPS || 60;
    this.frameInterval = 1000 / this.targetFPS;

    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: true,
      desynchronized: true,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      throw new Error('WebGL 2.0 is required but not supported');
    }

    this.gl = gl;
    this.initializeWebGL();
    this.setupPerformanceMonitoring();
  }

  private initializeWebGL(): void {
    const gl = this.gl;

    // Create shaders
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
      throw new Error('Failed to create shaders');
    }

    // Create program
    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
      throw new Error('Failed to create WebGL program');
    }

    this.program = program;

    // Get attribute and uniform locations
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');

    this.matrixLocation = gl.getUniformLocation(program, 'u_matrix')!;
    this.colorLocation = gl.getUniformLocation(program, 'u_color')!;
    this.textureLocation = gl.getUniformLocation(program, 'u_texture')!;
    this.useTextureLocation = gl.getUniformLocation(program, 'u_useTexture')!;

    // Create buffers
    this.positionBuffer = gl.createBuffer()!;
    this.texCoordBuffer = gl.createBuffer()!;

    // Set up vertex array object
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Position attribute
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Texture coordinate attribute
    gl.enableVertexAttribArray(texCoordLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Set up blend mode for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private setupPerformanceMonitoring(): void {
    // Try to get timer extension for GPU timing
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  public start(): void {
    if (this.animationId !== null) return;

    const render = (currentTime: number) => {
      // Calculate frame timing
      const deltaTime = currentTime - this.lastFrameTime;

      // Check if we should render this frame (frame pacing)
      if (deltaTime >= this.frameInterval) {
        // Check for dropped frames
        const expectedFrames = Math.floor(deltaTime / this.frameInterval);
        if (expectedFrames > 1) {
          this.droppedFrames += expectedFrames - 1;
        }

        // Render frame
        this.renderFrame();

        // Update frame count
        this.frameCount++;

        // Update FPS counter
        if (currentTime - this.lastFPSUpdate >= this.fpsUpdateInterval) {
          this.currentFPS = (this.frameCount * 1000) / (currentTime - this.lastFPSUpdate);
          this.frameCount = 0;
          this.lastFPSUpdate = currentTime;
        }

        this.lastFrameTime = currentTime - (deltaTime % this.frameInterval);
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

  private renderFrame(): void {
    const gl = this.gl;

    // Set viewport
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Clear canvas
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Use program
    gl.useProgram(this.program);

    // Create render context
    const currentTime = performance.now();
    const context: RenderContext = {
      time: currentTime,
      deltaTime: currentTime - this.lastFrameTime,
      stimulusTime: this.stimulusStartTime > 0 ? currentTime - this.stimulusStartTime : 0,
      width: gl.canvas.width,
      height: gl.canvas.height,
      pixelRatio: window.devicePixelRatio || 1
    };

    // Render all renderables by layer
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
    const gl = this.gl;

    switch (command.type) {
      case 'clear':
        const { r, g, b, a } = command.params;
        gl.clearColor(r, g, b, a);
        gl.clear(gl.COLOR_BUFFER_BIT);
        break;

      case 'drawRect':
        this.drawRect(command.params);
        break;

      case 'drawCircle':
        this.drawCircle(command.params);
        break;

      // Add more command types as needed
    }
  }

  private drawRect(params: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: [number, number, number, number];
  }): void {
    const gl = this.gl;
    const { x, y, width, height, color } = params;

    // Convert to clip space coordinates
    const x1 = (x / gl.canvas.width) * 2 - 1;
    const y1 = -((y / gl.canvas.height) * 2 - 1);
    const x2 = ((x + width) / gl.canvas.width) * 2 - 1;
    const y2 = -(((y + height) / gl.canvas.height) * 2 - 1);

    // Update position buffer
    const positions = new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    // Update texture coordinates
    const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.DYNAMIC_DRAW);

    // Set uniforms
    gl.uniform4fv(this.colorLocation, color);
    gl.uniform1i(this.useTextureLocation, 0);

    // Identity matrix for now
    const matrix = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    gl.uniformMatrix3fv(this.matrixLocation, false, matrix);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private drawCircle(params: {
    x: number;
    y: number;
    radius: number;
    color: [number, number, number, number];
    segments?: number;
  }): void {
    // Circle drawing implementation would go here
    // For now, we'll draw a square as placeholder
    this.drawRect({
      x: params.x - params.radius,
      y: params.y - params.radius,
      width: params.radius * 2,
      height: params.radius * 2,
      color: params.color,
    });
  }

  public getStats(): FrameStats {
    return {
      fps: this.currentFPS,
      frameTime: this.frameInterval,
      droppedFrames: this.droppedFrames,
      targetFPS: this.targetFPS,
    };
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  public destroy(): void {
    this.stop();
    const gl = this.gl;

    // Clean up WebGL resources
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.texCoordBuffer);
    gl.deleteProgram(this.program);
  }

  /**
   * Add a renderable object
   */
  public addRenderable(renderable: Renderable): void {
    this.renderables.set(renderable.id, renderable);
    
    const layer = renderable.layer || 0;
    if (!this.renderablesByLayer.has(layer)) {
      this.renderablesByLayer.set(layer, new Set());
    }
    this.renderablesByLayer.get(layer)!.add(renderable.id);
  }

  /**
   * Remove a renderable object
   */
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

  /**
   * Clear all renderables
   */
  public clearRenderables(): void {
    this.renderables.clear();
    this.renderablesByLayer.clear();
  }

  /**
   * Mark stimulus onset time
   */
  public markStimulusOnset(): void {
    this.stimulusStartTime = performance.now();
  }

  /**
   * Get WebGL context
   */
  public getContext(): WebGL2RenderingContext {
    return this.gl;
  }
}