import { BaseRenderer } from './QuestionRenderer';
import type { RendererConfig, RenderContext } from './QuestionRenderer';
import type { ResourceManager } from '../resources/ResourceManager';

export interface TextRendererConfig extends RendererConfig {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
  baseline?: 'top' | 'middle' | 'bottom';
  maxWidth?: number;
  lineHeight?: number;
}

/**
 * Renders text content to WebGL texture with precise timing
 */
export class TextRenderer extends BaseRenderer {
  private textConfig: TextRendererConfig;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private needsUpdate: boolean = true;
  
  constructor(config: TextRendererConfig) {
    super(config.id, 'text', config);
    this.textConfig = config;
    
    // Create offscreen canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    // Pre-render text
    this.renderText();
    this.ready = true;
  }
  
  private renderText(): void {
    const {
      text,
      fontSize = 48,
      fontFamily = 'Arial, sans-serif',
      color = '#FFFFFF',
      align = 'center',
      baseline = 'middle',
      maxWidth,
      lineHeight = 1.2
    } = this.textConfig;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Set text properties
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    
    // Calculate position
    let x = 0;
    let y = this.canvas.height / 2;
    
    if (align === 'center') {
      x = this.canvas.width / 2;
    } else if (align === 'right') {
      x = this.canvas.width - 20;
    } else {
      x = 20;
    }
    
    // Draw text (with optional wrapping)
    if (maxWidth) {
      this.wrapText(text, x, y, maxWidth, fontSize * lineHeight);
    } else {
      this.ctx.fillText(text, x, y);
    }
    
    this.needsUpdate = true;
  }
  
  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    const words = text.split(' ');
    let line = '';
    let lines: string[] = [];
    
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = this.ctx.measureText(testLine);
      const testWidth = metrics.width;
      
      if (testWidth > maxWidth && i > 0) {
        lines.push(line);
        line = words[i] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    
    // Center vertically if multiple lines
    const totalHeight = lines.length * lineHeight;
    const startY = y - (totalHeight / 2) + (lineHeight / 2);
    
    // Draw each line
    lines.forEach((line, index) => {
      this.ctx.fillText(line, x, startY + (index * lineHeight));
    });
  }
  
  public prepare(gl: WebGL2RenderingContext, config: RendererConfig): void {
    this.config = { ...this.config, ...config };
    
    // Create texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Upload canvas to texture
    if (this.ready) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
      this.needsUpdate = false;
    }
  }
  
  protected renderContent(gl: WebGL2RenderingContext, context: RenderContext): void {
    if (!this.texture) return;
    
    // Upload texture on first render
    if (this.needsUpdate && this.ready) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
      this.needsUpdate = false;
      
      // Mark onset time
      if (!this.onsetTime) {
        this.onsetTime = performance.now();
      }
    }
    
    // Render texture (actual WebGL rendering would happen here)
  }
  
  /**
   * Update text content dynamically
   */
  public updateText(text: string): void {
    this.textConfig.text = text;
    this.renderText();
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }
}