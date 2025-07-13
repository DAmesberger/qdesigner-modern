import { BaseRenderer } from './QuestionRenderer';
import type { RendererConfig, RenderContext } from './QuestionRenderer';
import type { ResourceManager } from '../resources/ResourceManager';

export interface VideoRendererConfig extends RendererConfig {
  src: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  playbackRate?: number;
  startTime?: number;
  endTime?: number;
}

/**
 * Renders video content to WebGL texture with frame-accurate timing
 */
export class VideoRenderer extends BaseRenderer {
  private videoConfig: VideoRendererConfig;
  private video: HTMLVideoElement | null = null;
  private texture: WebGLTexture | null = null;
  private playing: boolean = false;
  private frameCallbackId: number | null = null;
  
  constructor(config: VideoRendererConfig) {
    super(config.id, 'video', config);
    this.videoConfig = config;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    // Register video with resource manager
    resourceManager.registerResource(
      this.videoConfig.id,
      'video',
      this.videoConfig.src
    );
    this.ready = true;
  }
  
  public prepare(gl: WebGL2RenderingContext, config: RendererConfig): void {
    this.config = { ...this.config, ...config };
    
    // Get video from resource manager
    const resourceManager = (gl as any).resourceManager as ResourceManager;
    if (resourceManager) {
      this.video = resourceManager.getVideo(this.videoConfig.id) || null;
    }
    
    if (!this.video) {
      console.warn('Video not loaded yet');
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
    
    // Initialize texture with empty data
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.video.videoWidth || 1,
      this.video.videoHeight || 1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
  }
  
  protected renderContent(gl: WebGL2RenderingContext, context: RenderContext): void {
    if (!this.texture || !this.video) return;
    
    // Start playback on first render
    if (!this.playing && this.videoConfig.autoplay !== false) {
      this.video.play().catch(err => {
        console.warn('Video autoplay failed:', err);
      });
      this.playing = true;
      
      // Mark onset time
      if (!this.onsetTime) {
        this.onsetTime = performance.now();
      }
    }
    
    // Check if we should stop at endTime
    if (this.videoConfig.endTime && this.video.currentTime >= this.videoConfig.endTime) {
      if (this.videoConfig.loop) {
        this.video.currentTime = this.videoConfig.startTime || 0;
      } else {
        this.video.pause();
        this.playing = false;
      }
    }
    
    // Update texture with current video frame
    if (this.playing && this.video.readyState >= this.video.HAVE_CURRENT_DATA) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
    }
    
    // Render texture (actual WebGL rendering would happen here)
  }
  
  /**
   * Control video playback
   */
  public play(): void {
    if (this.video && !this.playing) {
      this.video.play();
      this.playing = true;
    }
  }
  
  public pause(): void {
    if (this.video && this.playing) {
      this.video.pause();
      this.playing = false;
    }
  }
  
  public seek(time: number): void {
    if (this.video) {
      this.video.currentTime = time;
    }
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
    
    if (this.video) {
      this.video.pause();
      this.video.src = '';
      this.video = null;
    }
    
    if (this.frameCallbackId !== null) {
      cancelAnimationFrame(this.frameCallbackId);
      this.frameCallbackId = null;
    }
    
    this.playing = false;
  }
}