import { BaseStimulus } from './Stimulus';
import type { StimulusConfig, RenderContext } from './Stimulus';
import type { ResourceManager } from '../resources/ResourceManager';

export interface VideoStimulusConfig extends StimulusConfig {
  videoUrl: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  playbackRate?: number;
}

/**
 * Video stimulus with frame-accurate WebGL rendering
 */
export class VideoStimulus extends BaseStimulus {
  private videoConfig: VideoStimulusConfig;
  private video: HTMLVideoElement | null = null;
  private texture: WebGLTexture | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private lastUpdateTime: number = 0;
  
  constructor(config: VideoStimulusConfig) {
    super(config.id, 'video', config);
    this.videoConfig = config;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    resourceManager.registerResource(this.videoConfig.videoUrl, 'video', this.videoConfig.videoUrl);
    this.ready = true;
  }
  
  public prepare(gl: WebGL2RenderingContext, config: StimulusConfig): void {
    this.config = { ...this.config, ...config };
    
    // Get video from resource manager
    const resourceManager = (gl as any).resourceManager as ResourceManager;
    if (resourceManager) {
      this.video = resourceManager.getVideo(this.videoConfig.videoUrl) || null;
      
      if (this.video) {
        // Configure video
        this.video.loop = this.videoConfig.loop || false;
        this.video.muted = this.videoConfig.muted !== false;
        this.video.playbackRate = this.videoConfig.playbackRate || 1.0;
        
        // Create texture for video frames
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      }
    }
    
    // Create shader program (similar to ImageStimulus)
    // ... shader setup code ...
  }
  
  protected renderStimulus(gl: WebGL2RenderingContext, context: RenderContext): void {
    if (!this.video || !this.texture) return;
    
    // Start video playback on first render
    if (this.video.paused && this.videoConfig.autoplay !== false) {
      this.video.play().catch(e => console.error('Video play failed:', e));
    }
    
    // Update texture with current video frame
    if (context.time - this.lastUpdateTime > 16) { // ~60fps update rate
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
      this.lastUpdateTime = context.time;
    }
    
    // Render texture (similar to ImageStimulus)
    // ... rendering code ...
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    if (this.video) {
      this.video.pause();
      this.video.currentTime = 0;
    }
    
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
    
    // ... cleanup other resources ...
  }
}