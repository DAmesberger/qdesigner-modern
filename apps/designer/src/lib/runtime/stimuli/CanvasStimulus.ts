import { BaseStimulus } from './Stimulus';
import type { StimulusConfig, RenderContext } from './Stimulus';
import type { ResourceManager } from '../resources/ResourceManager';

export interface CanvasStimulusConfig extends StimulusConfig {
  renderFunction: (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => void;
  width?: number;
  height?: number;
  dynamic?: boolean; // If true, re-render each frame
}

/**
 * Canvas stimulus for custom drawing operations
 */
export class CanvasStimulus extends BaseStimulus {
  private canvasConfig: CanvasStimulusConfig;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private needsUpdate: boolean = true;
  
  constructor(config: CanvasStimulusConfig) {
    super(config.id, 'canvas', config);
    this.canvasConfig = config;
    
    // Create offscreen canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = config.width || 800;
    this.canvas.height = config.height || 600;
    this.ctx = this.canvas.getContext('2d')!;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    // Canvas stimulus doesn't need preloading unless the render function does
    this.ready = true;
  }
  
  public prepare(gl: WebGL2RenderingContext, config: StimulusConfig): void {
    this.config = { ...this.config, ...config };
    
    // Create texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Initial render
    this.updateCanvas(0);
  }
  
  private updateCanvas(time: number): void {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Call user render function
    this.canvasConfig.renderFunction(this.ctx, this.canvas.width, this.canvas.height, time);
    
    this.needsUpdate = true;
  }
  
  protected renderStimulus(gl: WebGL2RenderingContext, context: RenderContext): void {
    if (!this.texture) return;
    
    // Update canvas if dynamic
    if (this.canvasConfig.dynamic || this.needsUpdate) {
      this.updateCanvas(context.stimulusTime);
      
      // Upload to texture
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
      
      this.needsUpdate = false;
    }
    
    // Render texture (similar to ImageStimulus)
    // ... rendering code ...
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }
}