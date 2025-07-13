import type { IStimulus } from './Stimulus';
import type { Stimulus as StimulusConfig } from '$lib/shared';
import { TextStimulus } from './TextStimulus';
import { ImageStimulus } from './ImageStimulus';
import { VideoStimulus } from './VideoStimulus';
import { AudioStimulus } from './AudioStimulus';
import { CanvasStimulus } from './CanvasStimulus';
import { CompositeStimulus } from './CompositeStimulus';

/**
 * Factory for creating stimulus instances
 */
export class StimulusFactory {
  private static customStimuli: Map<string, new (config: any) => IStimulus> = new Map();
  
  /**
   * Register a custom stimulus type
   */
  public static registerCustomStimulus(
    type: string,
    stimulusClass: new (config: any) => IStimulus
  ): void {
    this.customStimuli.set(type, stimulusClass);
  }
  
  /**
   * Create a stimulus instance from configuration
   */
  public static createStimulus(config: StimulusConfig): IStimulus {
    const baseConfig = {
      id: `stimulus_${Date.now()}`,
      duration: config.duration,
      delay: config.delay,
      transition: config.transition,
      position: config.content.position,
      size: config.content.size,
      style: config.content.style
    };
    
    switch (config.type) {
      case 'text':
        return new TextStimulus({
          id: baseConfig.id,
          duration: baseConfig.duration,
          delay: baseConfig.delay,
          transition: baseConfig.transition ? { in: baseConfig.transition, out: baseConfig.transition } : undefined,
          position: baseConfig.position,
          size: baseConfig.size,
          style: baseConfig.style,
          text: config.content.text || '',
          fontSize: config.content.style?.fontSize,
          fontFamily: config.content.style?.fontFamily,
          color: this.parseColor(config.content.style?.color),
          backgroundColor: this.parseColor(config.content.style?.backgroundColor),
          align: config.content.style?.textAlign,
          padding: config.content.style?.padding
        });
        
      case 'image':
        return new ImageStimulus({
          id: baseConfig.id,
          duration: baseConfig.duration,
          delay: baseConfig.delay,
          transition: baseConfig.transition ? { in: baseConfig.transition, out: baseConfig.transition } : undefined,
          position: baseConfig.position,
          size: baseConfig.size,
          style: baseConfig.style,
          imageUrl: config.content.imageUrl || '',
          fit: config.content.style?.objectFit || 'contain',
          opacity: config.content.style?.opacity
        });
        
      case 'video':
        return new VideoStimulus({
          id: baseConfig.id,
          duration: baseConfig.duration,
          delay: baseConfig.delay,
          transition: baseConfig.transition ? { in: baseConfig.transition, out: baseConfig.transition } : undefined,
          position: baseConfig.position,
          size: baseConfig.size,
          style: baseConfig.style,
          videoUrl: config.content.videoUrl || '',
          autoplay: true,
          loop: config.content.style?.loop,
          muted: config.content.style?.muted !== false,
          playbackRate: config.content.style?.playbackRate
        });
        
      case 'audio':
        return new AudioStimulus({
          id: baseConfig.id,
          duration: baseConfig.duration,
          delay: baseConfig.delay,
          transition: baseConfig.transition ? { in: baseConfig.transition, out: baseConfig.transition } : undefined,
          position: baseConfig.position,
          size: baseConfig.size,
          style: baseConfig.style,
          audioUrl: config.content.audioUrl || '',
          volume: config.content.style?.volume,
          showWaveform: config.content.style?.showWaveform,
          waveformColor: this.parseColor(config.content.style?.waveformColor)
        });
        
      case 'html':
        // For HTML content, we render it to canvas then display as texture
        return new CanvasStimulus({
          id: baseConfig.id,
          duration: baseConfig.duration,
          delay: baseConfig.delay,
          transition: baseConfig.transition ? { in: baseConfig.transition, out: baseConfig.transition } : undefined,
          position: baseConfig.position,
          size: baseConfig.size,
          style: baseConfig.style,
          renderFunction: (ctx, width, height, time) => {
            // Custom HTML rendering logic
            // This would use a library like html2canvas or custom rendering
          }
        });
        
      case 'composite':
        if (!config.content.components) {
          throw new Error('Composite stimulus must have components');
        }
        
        const components = config.content.components.map((component, index) => ({
          stimulus: this.createStimulus(component),
          offset: component.content.position,
          scale: component.content.style?.scale,
          opacity: component.content.style?.opacity,
          layer: index
        }));
        
        return new CompositeStimulus({
          id: baseConfig.id,
          duration: baseConfig.duration,
          delay: baseConfig.delay,
          transition: baseConfig.transition ? { in: baseConfig.transition, out: baseConfig.transition } : undefined,
          position: baseConfig.position,
          size: baseConfig.size,
          style: baseConfig.style,
          components
        });
        
      default:
        // Check for custom stimulus
        const CustomClass = this.customStimuli.get(config.type);
        if (CustomClass) {
          return new CustomClass({ ...baseConfig, ...config.content });
        }
        
        throw new Error(`Unknown stimulus type: ${config.type}`);
    }
  }
  
  /**
   * Parse color from various formats to RGBA array
   */
  private static parseColor(color?: string | number[]): [number, number, number, number] | undefined {
    if (!color) return undefined;
    
    if (Array.isArray(color)) {
      return color as [number, number, number, number];
    }
    
    // Parse CSS color string
    if (typeof color === 'string') {
      // This is a simplified parser - in production use a proper CSS color parser
      if (color.startsWith('#')) {
        const hex = color.slice(1);
        if (hex.length === 3) {
          return [
            parseInt(hex![0] + hex![0], 16) / 255,
            parseInt(hex![1] + hex![1], 16) / 255,
            parseInt(hex![2] + hex![2], 16) / 255,
            1
          ];
        } else if (hex.length === 6) {
          return [
            parseInt(hex.slice(0, 2), 16) / 255,
            parseInt(hex.slice(2, 4), 16) / 255,
            parseInt(hex.slice(4, 6), 16) / 255,
            1
          ];
        }
      } else if (color.startsWith('rgb')) {
        const match = color.match(/rgba?\(([^)]+)\)/);
        if (match) {
          const values = match[1].split(',').map(v => parseFloat(v.trim()));
          return [
            values[0] / 255,
            values[1] / 255,
            values[2] / 255,
            values[3] ?? 1
          ];
        }
      }
    }
    
    return [0, 0, 0, 1]; // Default to black
  }
  
  /**
   * Create stimuli for a question
   */
  public static createQuestionStimuli(question: any): IStimulus[] {
    const stimuli: IStimulus[] = [];
    
    // Main stimulus
    if (question.stimulus) {
      stimuli.push(this.createStimulus(question.stimulus));
    }
    
    // Prompt as text stimulus
    if (question.prompt?.text) {
      stimuli.push(new TextStimulus({
        id: `prompt_${question.id}`,
        text: question.prompt.text,
        fontSize: 32,
        color: [1, 1, 1, 1],
        position: { x: 0.5, y: 0.3 },
        align: 'center'
      }));
    }
    
    return stimuli;
  }
}