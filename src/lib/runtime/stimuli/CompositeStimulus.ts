import { BaseStimulus } from './Stimulus';
import type { IStimulus, StimulusConfig, RenderContext } from './Stimulus';
import type { ResourceManager } from '../resources/ResourceManager';

export interface CompositeStimulusConfig extends StimulusConfig {
  components: {
    stimulus: IStimulus;
    offset?: { x: number; y: number }; // Relative offset from composite position
    scale?: number;
    opacity?: number;
    layer?: number; // Rendering order (lower = back)
  }[];
}

/**
 * Composite stimulus that combines multiple stimuli
 */
export class CompositeStimulus extends BaseStimulus {
  private compositeConfig: CompositeStimulusConfig;
  private framebuffer: WebGLFramebuffer | null = null;
  private texture: WebGLTexture | null = null;
  private width: number = 0;
  private height: number = 0;
  
  constructor(config: CompositeStimulusConfig) {
    super(config.id, 'composite', config);
    this.compositeConfig = config;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    // Preload all component stimuli
    const preloadPromises = this.compositeConfig.components.map(
      component => component.stimulus.preload(resourceManager)
    );
    
    await Promise.all(preloadPromises);
    this.ready = true;
  }
  
  public prepare(gl: WebGL2RenderingContext, config: StimulusConfig): void {
    // Update config
    this.config = { ...this.config, ...config };
    
    // Prepare all component stimuli
    this.compositeConfig.components.forEach(component => {
      component.stimulus.prepare(gl, component.stimulus.config);
    });
    
    // Create framebuffer for off-screen rendering
    this.createFramebuffer(gl);
  }
  
  private createFramebuffer(gl: WebGL2RenderingContext): void {
    // Get context dimensions
    this.width = gl.canvas.width;
    this.height = gl.canvas.height;
    
    // Create framebuffer
    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    
    // Create texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.width,
      this.height,
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
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texture,
      0
    );
    
    // Check framebuffer completeness
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Framebuffer is not complete');
    }
    
    // Unbind
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  
  protected renderStimulus(gl: WebGL2RenderingContext, context: RenderContext): void {
    if (!this.framebuffer || !this.texture) return;
    
    // Sort components by layer
    const sortedComponents = [...this.compositeConfig.components].sort(
      (a, b) => (a.layer || 0) - (b.layer || 0)
    );
    
    // Render to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    
    // Clear framebuffer
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Render each component
    sortedComponents.forEach(component => {
      if (component.stimulus.isReady()) {
        // Create modified context for component
        const componentContext: RenderContext = {
          ...context,
          // Adjust position based on component offset
          // This would need more sophisticated transformation
        };
        
        // Save current GL state
        const currentBlend = gl.getParameter(gl.BLEND);
        const currentViewport = gl.getParameter(gl.VIEWPORT);
        
        // Render component
        component.stimulus.render(gl, componentContext);
        
        // Restore GL state
        if (!currentBlend) gl.disable(gl.BLEND);
        gl.viewport(...currentViewport);
      }
    });
    
    // Switch back to main framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, context.width, context.height);
    
    // Now render the composite texture to screen
    // This would use a simple quad shader similar to ImageStimulus
    this.renderCompositeTexture(gl, context);
  }
  
  private renderCompositeTexture(gl: WebGL2RenderingContext, context: RenderContext): void {
    // This would render the framebuffer texture to the screen
    // Implementation similar to ImageStimulus but using the composite texture
    // For brevity, not implementing the full shader setup here
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    // Cleanup component stimuli
    this.compositeConfig.components.forEach(component => {
      component.stimulus.cleanup(gl);
    });
    
    // Cleanup framebuffer resources
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
    
    if (this.framebuffer) {
      gl.deleteFramebuffer(this.framebuffer);
      this.framebuffer = null;
    }
  }
  
  public getOnsetTime(): number | null {
    // Return the earliest onset time from components
    let earliestOnset: number | null = null;
    
    for (const component of this.compositeConfig.components) {
      const onset = component.stimulus.getOnsetTime();
      if (onset !== null && (earliestOnset === null || onset < earliestOnset)) {
        earliestOnset = onset;
      }
    }
    
    return earliestOnset;
  }
}