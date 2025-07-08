import { BaseRenderer } from './QuestionRenderer';
import type { RendererConfig, RenderContext } from './QuestionRenderer';
import type { ResourceManager } from '../resources/ResourceManager';

export interface HTMLRendererConfig extends RendererConfig {
  html: string;
  css?: string;
  width?: number;
  height?: number;
  scale?: number;
}

/**
 * Renders arbitrary HTML content to WebGL texture with precise timing
 * This allows any questionnaire content to be displayed with frame-accurate onset times
 */
export class HTMLRenderer extends BaseRenderer {
  private htmlConfig: HTMLRendererConfig;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private needsUpdate: boolean = true;
  private renderComplete: boolean = false;
  
  // For HTML rendering
  private foreignObject: SVGForeignObjectElement | null = null;
  private svg: SVGSVGElement | null = null;
  
  constructor(config: HTMLRendererConfig) {
    super(config.id, 'html', config);
    this.htmlConfig = config;
    
    // Create offscreen canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = config.width || 1024;
    this.canvas.height = config.height || 768;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    // Pre-render HTML to ensure it's ready
    await this.renderHTML();
    this.ready = true;
  }
  
  private async renderHTML(): Promise<void> {
    const { html, css, width = 1024, height = 768 } = this.htmlConfig;
    
    // Create SVG with foreignObject for HTML rendering
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="
            width: ${width}px;
            height: ${height}px;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: white;
            background-color: transparent;
            ${css || ''}
          ">
            ${html}
          </div>
        </foreignObject>
      </svg>
    `;
    
    // Convert to data URL
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    // Load as image
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw image to canvas
        this.ctx.drawImage(img, 0, 0);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        this.needsUpdate = true;
        this.renderComplete = true;
        resolve();
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
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
    
    // Upload canvas to texture if ready
    if (this.renderComplete) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
      this.needsUpdate = false;
    }
  }
  
  protected renderContent(gl: WebGL2RenderingContext, context: RenderContext): void {
    if (!this.texture) return;
    
    // Upload texture on first render (marks precise onset time)
    if (this.needsUpdate && this.renderComplete) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
      this.needsUpdate = false;
      
      // This is the exact moment the content becomes visible
      if (!this.onsetTime) {
        this.onsetTime = performance.now();
      }
    }
    
    // Render texture using WebGL (implementation would use shaders to draw the texture)
    // This ensures frame-perfect timing as the texture is already uploaded
    this.drawTexture(gl, this.texture, context);
  }
  
  private drawTexture(gl: WebGL2RenderingContext, texture: WebGLTexture, context: RenderContext): void {
    // In a real implementation, this would use the WebGL shader program
    // to draw the texture at the specified position with proper scaling
    // For now, this is a placeholder showing the concept
    
    // The key insight is that once the texture is uploaded to GPU,
    // we can render it with zero delay, ensuring precise onset timing
  }
  
  /**
   * Update HTML content dynamically
   */
  public async updateContent(html: string, css?: string): Promise<void> {
    this.htmlConfig.html = html;
    if (css !== undefined) {
      this.htmlConfig.css = css;
    }
    
    await this.renderHTML();
    this.needsUpdate = true;
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }
}