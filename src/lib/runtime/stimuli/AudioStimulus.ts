import { BaseStimulus } from './Stimulus';
import type { StimulusConfig, RenderContext } from './Stimulus';
import type { ResourceManager } from '../resources/ResourceManager';

export interface AudioStimulusConfig extends StimulusConfig {
  audioUrl: string;
  volume?: number;
  showWaveform?: boolean;
  waveformColor?: [number, number, number, number];
}

/**
 * Audio stimulus with optional waveform visualization
 */
export class AudioStimulus extends BaseStimulus {
  private audioConfig: AudioStimulusConfig;
  private audioBuffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startTime: number = 0;
  
  constructor(config: AudioStimulusConfig) {
    super(config.id, 'audio', config);
    this.audioConfig = config;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    resourceManager.registerResource(this.audioConfig.audioUrl, 'audio', this.audioConfig.audioUrl);
    this.ready = true;
  }
  
  public prepare(gl: WebGL2RenderingContext, config: StimulusConfig): void {
    this.config = { ...this.config, ...config };
    
    // Get audio buffer from resource manager
    const resourceManager = (gl as any).resourceManager as ResourceManager;
    if (resourceManager) {
      this.audioBuffer = resourceManager.getAudioBuffer(this.audioConfig.audioUrl) || null;
    }
    
    // Prepare waveform visualization if enabled
    if (this.audioConfig.showWaveform && this.audioBuffer) {
      // Create waveform texture
      // ... waveform visualization setup ...
    }
  }
  
  protected renderStimulus(gl: WebGL2RenderingContext, context: RenderContext): void {
    // Start audio playback on first render
    if (!this.source && this.audioBuffer) {
      const resourceManager = (gl as any).resourceManager as ResourceManager;
      const audioContext = resourceManager.getAudioContext();
      
      this.source = audioContext.createBufferSource();
      this.source.buffer = this.audioBuffer;
      
      // Apply volume
      if (this.audioConfig.volume !== undefined) {
        const gainNode = audioContext.createGain();
        gainNode.gain.value = this.audioConfig.volume;
        this.source.connect(gainNode);
        gainNode.connect(audioContext.destination);
      } else {
        this.source.connect(audioContext.destination);
      }
      
      this.source.start(0);
      this.startTime = context.time;
    }
    
    // Render waveform visualization if enabled
    if (this.audioConfig.showWaveform) {
      // ... render waveform ...
    }
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Already stopped
      }
      this.source = null;
    }
  }
}