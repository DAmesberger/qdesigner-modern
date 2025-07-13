import { BaseRenderer } from './QuestionRenderer';
import type { RendererConfig, RenderContext } from './QuestionRenderer';
import type { ResourceManager } from '../resources/ResourceManager';

export interface AudioRendererConfig extends RendererConfig {
  src: string;
  autoplay?: boolean;
  loop?: boolean;
  volume?: number;
  playbackRate?: number;
  startTime?: number;
  endTime?: number;
  visualizer?: 'waveform' | 'spectrum' | 'none';
  visualizerColor?: string;
}

/**
 * Renders audio with optional visualization to WebGL texture
 */
export class AudioRenderer extends BaseRenderer {
  private audioConfig: AudioRendererConfig;
  private audio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private playing: boolean = false;
  private animationId: number | null = null;
  
  constructor(config: AudioRendererConfig) {
    super(config.id, 'audio', config);
    this.audioConfig = config;
    
    // Create canvas for visualization
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d')!;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    // Register audio with resource manager
    resourceManager.registerResource(
      this.audioConfig.id,
      'audio',
      this.audioConfig.src
    );
    this.ready = true;
  }
  
  private setupAudioVisualization(): void {
    if (!this.audio) return;
    
    // Create audio context and analyser
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    
    // Connect audio element to analyser
    this.source = this.audioContext.createMediaElementSource(this.audio);
    this.source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
  }
  
  public prepare(gl: WebGL2RenderingContext, config: RendererConfig): void {
    this.config = { ...this.config, ...config };
    
    // Get audio from resource manager (as AudioBuffer)
    const resourceManager = (gl as any).resourceManager as ResourceManager;
    if (resourceManager) {
      const audioBuffer = resourceManager.getAudioBuffer(this.audioConfig.id);
      if (audioBuffer) {
        // Create audio element and set up with audio buffer
        this.audio = new Audio();
        this.audio.loop = this.audioConfig.loop ?? false;
        this.audio.volume = this.audioConfig.volume ?? 1.0;
        this.audio.playbackRate = this.audioConfig.playbackRate ?? 1.0;
        
        // Set up audio visualization if requested
        if (this.audioConfig.visualizer && this.audioConfig.visualizer !== 'none') {
          this.setupAudioVisualization();
        }
      }
    }
    
    if (!this.audio) {
      console.warn('Audio not loaded yet');
      return;
    }
    
    // Create texture for visualization
    if (this.audioConfig.visualizer && this.audioConfig.visualizer !== 'none') {
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      
      // Initialize with empty canvas
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    }
  }
  
  protected renderContent(gl: WebGL2RenderingContext, context: RenderContext): void {
    if (!this.audio) return;
    
    // Start playback on first render
    if (!this.playing && this.audioConfig.autoplay !== false) {
      // Resume audio context if needed (browser policy)
      if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume();
      }
      
      this.audio.play().catch(err => {
        console.warn('Audio autoplay failed:', err);
      });
      this.playing = true;
      
      // Mark onset time
      if (!this.onsetTime) {
        this.onsetTime = performance.now();
      }
      
      // Start visualization
      if (this.audioConfig.visualizer && this.audioConfig.visualizer !== 'none') {
        this.startVisualization();
      }
    }
    
    // Check if we should stop at endTime
    if (this.audioConfig.endTime && this.audio.currentTime >= this.audioConfig.endTime) {
      if (this.audioConfig.loop) {
        this.audio.currentTime = this.audioConfig.startTime || 0;
      } else {
        this.audio.pause();
        this.playing = false;
      }
    }
    
    // Update visualization texture
    if (this.texture && this.playing) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    }
  }
  
  private startVisualization(): void {
    if (!this.analyser || this.animationId !== null) return;
    
    const draw = () => {
      if (!this.playing || !this.analyser) {
        this.animationId = null;
        return;
      }
      
      this.animationId = requestAnimationFrame(draw);
      
      if (this.audioConfig.visualizer === 'waveform') {
        this.drawWaveform();
      } else if (this.audioConfig.visualizer === 'spectrum') {
        this.drawSpectrum();
      }
    };
    
    draw();
  }
  
  private drawWaveform(): void {
    if (!this.analyser) return;
    
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);
    
    // Clear canvas
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw waveform
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = this.audioConfig.visualizerColor || '#00ff00';
    this.ctx.beginPath();
    
    const sliceWidth = this.canvas.width / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i]! / 128.0;
      const y = v * this.canvas.height / 2;
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    this.ctx.stroke();
  }
  
  private drawSpectrum(): void {
    if (!this.analyser) return;
    
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Clear canvas
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw spectrum bars
    const barWidth = (this.canvas.width / bufferLength) * 2.5;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i]! / 255) * this.canvas.height;
      
      this.ctx.fillStyle = this.audioConfig.visualizerColor || '#00ff00';
      this.ctx.fillRect(x, this.canvas.height - barHeight, barWidth, barHeight);
      
      x += barWidth + 1;
    }
  }
  
  /**
   * Control audio playback
   */
  public play(): void {
    if (this.audio && !this.playing) {
      this.audio.play();
      this.playing = true;
      if (this.audioConfig.visualizer && this.audioConfig.visualizer !== 'none') {
        this.startVisualization();
      }
    }
  }
  
  public pause(): void {
    if (this.audio && this.playing) {
      this.audio.pause();
      this.playing = false;
    }
  }
  
  public seek(time: number): void {
    if (this.audio) {
      this.audio.currentTime = time;
    }
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
    
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.playing = false;
  }
}