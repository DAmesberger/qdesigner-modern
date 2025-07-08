import type { ResourceManager } from '../resources/ResourceManager';

export interface StimulusConfig {
  id: string;
  duration?: number; // ms, undefined = manual advance
  delay?: number; // ms before showing
  transition?: {
    in?: TransitionConfig;
    out?: TransitionConfig;
  };
  position?: { x: number; y: number; z?: number };
  size?: { width: number; height: number };
  style?: Record<string, any>;
}

export interface TransitionConfig {
  type: 'fade' | 'slide' | 'zoom' | 'none';
  duration: number;
  easing?: string;
}

export interface RenderContext {
  time: number; // Current time in ms
  deltaTime: number; // Time since last frame
  stimulusTime: number; // Time since stimulus onset
  transitionProgress?: number; // 0-1 for transitions
  width: number;
  height: number;
  pixelRatio: number;
}

/**
 * Base interface for all stimulus types
 */
export interface IStimulus {
  readonly id: string;
  readonly type: string;
  
  /**
   * Preload any required resources
   */
  preload(resourceManager: ResourceManager): Promise<void>;
  
  /**
   * Prepare for rendering (called once before first render)
   */
  prepare(gl: WebGL2RenderingContext, config: StimulusConfig): void;
  
  /**
   * Render the stimulus
   */
  render(gl: WebGL2RenderingContext, context: RenderContext): void;
  
  /**
   * Clean up resources
   */
  cleanup(gl: WebGL2RenderingContext): void;
  
  /**
   * Check if stimulus is ready to render
   */
  isReady(): boolean;
  
  /**
   * Get the onset time (when stimulus became visible)
   */
  getOnsetTime(): number | null;
  
  /**
   * Mark the onset time
   */
  markOnset(time: number): void;
}

/**
 * Base class for stimulus implementations
 */
export abstract class BaseStimulus implements IStimulus {
  public readonly id: string;
  public readonly type: string;
  
  protected config: StimulusConfig;
  protected ready: boolean = false;
  protected onsetTime: number | null = null;
  protected visible: boolean = false;
  
  constructor(id: string, type: string, config: StimulusConfig) {
    this.id = id;
    this.type = type;
    this.config = config;
  }
  
  public abstract preload(resourceManager: ResourceManager): Promise<void>;
  
  public abstract prepare(gl: WebGL2RenderingContext, config: StimulusConfig): void;
  
  public render(gl: WebGL2RenderingContext, context: RenderContext): void {
    // Handle transitions and timing
    if (!this.visible && context.stimulusTime >= (this.config.delay || 0)) {
      this.visible = true;
      this.onsetTime = performance.now();
    }
    
    if (!this.visible) return;
    
    // Calculate transition progress
    let transitionProgress = 1;
    if (this.config.transition?.in && context.stimulusTime < this.config.transition.in.duration) {
      transitionProgress = context.stimulusTime / this.config.transition.in.duration;
    }
    
    // Apply transition
    const renderContext = { ...context, transitionProgress };
    
    // Call implementation-specific render
    this.renderStimulus(gl, renderContext);
  }
  
  protected abstract renderStimulus(gl: WebGL2RenderingContext, context: RenderContext): void;
  
  public abstract cleanup(gl: WebGL2RenderingContext): void;
  
  public isReady(): boolean {
    return this.ready;
  }
  
  public getOnsetTime(): number | null {
    return this.onsetTime;
  }
  
  public markOnset(time: number): void {
    this.onsetTime = time;
  }
  
  /**
   * Convert normalized position to pixel coordinates
   */
  protected getPixelPosition(context: RenderContext): { x: number; y: number } {
    const pos = this.config.position || { x: 0.5, y: 0.5 };
    return {
      x: pos.x * context.width,
      y: pos.y * context.height
    };
  }
  
  /**
   * Convert normalized size to pixel dimensions
   */
  protected getPixelSize(context: RenderContext): { width: number; height: number } {
    const size = this.config.size || { width: 1, height: 1 };
    return {
      width: size.width * context.width,
      height: size.height * context.height
    };
  }
  
  /**
   * Apply transition effects
   */
  protected applyTransition(value: number, progress: number, type: string): number {
    switch (type) {
      case 'fade':
        return value * progress;
      case 'slide':
        return value * this.easeOutCubic(progress);
      case 'zoom':
        return value * this.easeOutElastic(progress);
      default:
        return value;
    }
  }
  
  // Easing functions
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
  
  private easeOutElastic(t: number): number {
    const p = 0.3;
    return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
  }
}