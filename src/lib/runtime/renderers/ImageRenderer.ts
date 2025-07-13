import { BaseRenderer } from './QuestionRenderer';
import type { RendererConfig, RenderContext } from './QuestionRenderer';
import type { ResourceManager } from '../resources/ResourceManager';

export interface ImageRendererConfig extends RendererConfig {
  src: string;
  alt?: string;
  fit?: 'contain' | 'cover' | 'fill' | 'none';
  preloadStrategy?: 'eager' | 'lazy';
}

/**
 * Renders images to WebGL texture with precise timing control
 */
export class ImageRenderer extends BaseRenderer {
  private imageConfig: ImageRendererConfig;
  private image: HTMLImageElement | null = null;
  private texture: WebGLTexture | null = null;
  private needsUpdate: boolean = true;
  
  constructor(config: ImageRendererConfig) {
    super(config.id, 'image', config);
    this.imageConfig = config;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    // Register image with resource manager
    resourceManager.registerResource(
      this.imageConfig.id,
      'image',
      this.imageConfig.src
    );
    this.ready = true;
  }
  
  public prepare(gl: WebGL2RenderingContext, config: RendererConfig): void {
    this.config = { ...this.config, ...config };
    
    // Get image from resource manager
    const resourceManager = (gl as any).resourceManager as ResourceManager;
    if (resourceManager) {
      this.image = resourceManager.getImage(this.imageConfig.id) || null;
    }
    
    if (!this.image) {
      console.warn('Image not loaded yet');
      return;
    }
    
    // Create texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    
    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Upload image to texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
    
    // Generate mipmaps for better quality when scaled
    if (this.isPowerOfTwo(this.image.width) && this.isPowerOfTwo(this.image.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    
    this.needsUpdate = false;
  }
  
  private isPowerOfTwo(value: number): boolean {
    return (value & (value - 1)) === 0;
  }
  
  protected renderContent(gl: WebGL2RenderingContext, context: RenderContext): void {
    if (!this.texture || !this.image) return;
    
    // Mark onset time on first render
    if (!this.onsetTime) {
      this.onsetTime = performance.now();
    }
    
    // Calculate rendering dimensions based on fit mode
    const { width, height } = this.calculateDimensions(context);
    
    // Render texture with calculated dimensions
    // (Actual WebGL rendering with shaders would happen here)
  }
  
  private calculateDimensions(context: RenderContext): { width: number; height: number } {
    if (!this.image) return { width: 0, height: 0 };
    
    const { fit = 'contain' } = this.imageConfig;
    const containerWidth = this.config.size?.width || context.width;
    const containerHeight = this.config.size?.height || context.height;
    const imageAspect = this.image.width / this.image.height;
    const containerAspect = containerWidth / containerHeight;
    
    let width = containerWidth;
    let height = containerHeight;
    
    switch (fit) {
      case 'contain':
        if (imageAspect > containerAspect) {
          height = containerWidth / imageAspect;
        } else {
          width = containerHeight * imageAspect;
        }
        break;
        
      case 'cover':
        if (imageAspect > containerAspect) {
          width = containerHeight * imageAspect;
        } else {
          height = containerWidth / imageAspect;
        }
        break;
        
      case 'fill':
        // Use container dimensions as-is
        break;
        
      case 'none':
        width = this.image.width;
        height = this.image.height;
        break;
    }
    
    return { width, height };
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
    this.image = null;
  }
}