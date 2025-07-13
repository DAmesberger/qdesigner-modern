import { BaseRenderer } from './QuestionRenderer';
import type { RendererConfig, RenderContext, IQuestionRenderer } from './QuestionRenderer';
import type { ResourceManager } from '../resources/ResourceManager';

export interface CompositeRendererConfig extends RendererConfig {
  children: IQuestionRenderer[];
  layout?: 'stack' | 'grid' | 'custom';
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'add';
}

/**
 * Combines multiple renderers into a single composite renderer
 * Useful for complex stimuli with multiple elements
 */
export class CompositeRenderer extends BaseRenderer {
  private compositeConfig: CompositeRendererConfig;
  private framebuffer: WebGLFramebuffer | null = null;
  private texture: WebGLTexture | null = null;
  
  constructor(config: CompositeRendererConfig) {
    super(config.id, 'composite', config);
    this.compositeConfig = config;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    // Preload all child renderers in parallel
    const preloadPromises = this.compositeConfig.children.map(child => 
      child.preload(resourceManager)
    );
    
    await Promise.all(preloadPromises);
    this.ready = true;
  }
  
  public prepare(gl: WebGL2RenderingContext, config: RendererConfig): void {
    this.config = { ...this.config, ...config };
    
    // Prepare all child renderers
    this.compositeConfig.children.forEach(child => {
      child.prepare(gl, config);
    });
    
    // Create framebuffer for off-screen rendering
    this.framebuffer = gl.createFramebuffer();
    this.texture = gl.createTexture();
    
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      config.size?.width || 1024,
      config.size?.height || 768,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // Attach texture to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texture,
      0
    );
    
    // Check framebuffer completeness
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Framebuffer not complete:', status);
    }
    
    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  
  protected renderContent(gl: WebGL2RenderingContext, context: RenderContext): void {
    if (!this.framebuffer || !this.texture) return;
    
    // Mark onset time on first render
    if (!this.onsetTime) {
      this.onsetTime = performance.now();
      
      // Mark onset for all children
      this.compositeConfig.children.forEach(child => {
        child.markOnset(this.onsetTime!);
      });
    }
    
    // Render to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    
    // Clear framebuffer
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Set up blending
    this.setupBlending(gl);
    
    // Render all children based on layout
    switch (this.compositeConfig.layout) {
      case 'stack':
        this.renderStack(gl, context);
        break;
      case 'grid':
        this.renderGrid(gl, context);
        break;
      case 'custom':
      default:
        this.renderCustom(gl, context);
        break;
    }
    
    // Restore default blending
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    // Render the composite texture to screen
    // (Actual WebGL rendering would happen here)
  }
  
  private setupBlending(gl: WebGL2RenderingContext): void {
    gl.enable(gl.BLEND);
    
    switch (this.compositeConfig.blendMode) {
      case 'multiply':
        gl.blendFunc(gl.DST_COLOR, gl.ZERO);
        break;
      case 'screen':
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        break;
      case 'overlay':
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        break;
      case 'add':
        gl.blendFunc(gl.ONE, gl.ONE);
        break;
      case 'normal':
      default:
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        break;
    }
  }
  
  private renderStack(gl: WebGL2RenderingContext, context: RenderContext): void {
    // Render children in order, one on top of another
    this.compositeConfig.children.forEach(child => {
      if (child.isReady()) {
        child.render(gl, context);
      }
    });
  }
  
  private renderGrid(gl: WebGL2RenderingContext, context: RenderContext): void {
    const childCount = this.compositeConfig.children.length;
    const cols = Math.ceil(Math.sqrt(childCount));
    const rows = Math.ceil(childCount / cols);
    const cellWidth = context.width / cols;
    const cellHeight = context.height / rows;
    
    this.compositeConfig.children.forEach((child, index) => {
      if (!child.isReady()) return;
      
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      // Create context for grid cell
      const cellContext: RenderContext = {
        ...context,
        width: cellWidth,
        height: cellHeight,
        // Transform would be applied here in actual WebGL implementation
      };
      
      // Save transform state, translate to cell position, render, restore
      // (In actual WebGL, this would use matrix transformations)
      child.render(gl, cellContext);
    });
  }
  
  private renderCustom(gl: WebGL2RenderingContext, context: RenderContext): void {
    // Render children with their individual positions and transforms
    this.compositeConfig.children.forEach(child => {
      if (child.isReady()) {
        child.render(gl, context);
      }
    });
  }
  
  /**
   * Get all child renderers
   */
  public getChildren(): IQuestionRenderer[] {
    return this.compositeConfig.children;
  }
  
  /**
   * Add a child renderer
   */
  public addChild(renderer: IQuestionRenderer): void {
    this.compositeConfig.children.push(renderer);
  }
  
  /**
   * Remove a child renderer
   */
  public removeChild(id: string): void {
    const index = this.compositeConfig.children.findIndex(child => child.id === id);
    if (index !== -1) {
      this.compositeConfig.children.splice(index, 1);
    }
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    // Clean up all child renderers
    this.compositeConfig.children.forEach(child => {
      child.cleanup(gl);
    });
    
    // Clean up framebuffer and texture
    if (this.framebuffer) {
      gl.deleteFramebuffer(this.framebuffer);
      this.framebuffer = null;
    }
    
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }
}