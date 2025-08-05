import type { Question } from '$lib/shared';
import type { Stimulus } from '../stimuli/Stimulus';
import type { VariableEngine } from '$lib/scripting-engine';
import type { WebGLRenderer } from '$lib/renderer';
import type { ResourceManager } from '../resources/ResourceManager';
import type { ModuleCategory } from '$lib/modules/types';
import { moduleRegistry } from '$lib/modules/registry';
import { TextRenderer } from '../renderers/TextRenderer';
import { ImageRenderer } from '../renderers/ImageRenderer';
import { VideoRenderer } from '../renderers/VideoRenderer';
import { AudioRenderer } from '../renderers/AudioRenderer';
import { HTMLRenderer } from '../renderers/HTMLRenderer';
import { CompositeRenderer } from '../renderers/CompositeRenderer';
import type { IQuestionRenderer, RendererConfig } from '../renderers/QuestionRenderer';

/**
 * Handles presenting questions using the WebGL renderer
 */
export class QuestionPresenter {
  private renderer: WebGLRenderer;
  private resourceManager: ResourceManager;
  private currentRenderer: IQuestionRenderer | null = null;
  private fixationRenderer: IQuestionRenderer | null = null;
  
  constructor(renderer: WebGLRenderer, resourceManager: ResourceManager) {
    this.renderer = renderer;
    this.resourceManager = resourceManager;
    
    // Create default fixation cross
    this.fixationRenderer = new TextRenderer({
      id: 'fixation',
      text: '+',
      fontSize: 48,
      color: '#FFFFFF',
      position: { x: 0.5, y: 0.5 }
    });
  }
  
  /**
   * Present a question with proper timing phases
   */
  public async present(question: Question, variableEngine: VariableEngine): Promise<void> {
    const gl = this.renderer.getContext();
    
    // Build renderer for question
    const renderer = await this.buildQuestionRenderer(question, variableEngine);
    if (!renderer) return;
    
    this.currentRenderer = renderer;
    
    // Prepare renderer
    renderer.prepare(gl, {
      id: question.id,
      position: question.layout?.position || { x: 0.5, y: 0.5 },
      size: question.layout?.size,
      opacity: question.layout?.opacity || 1,
      rotation: question.layout?.rotation || 0
    });
    
    // Handle timing phases
    const timing = question.timing || {};
    
    // 1. Fixation phase
    if (timing.fixationDuration && timing.fixationDuration > 0) {
      await this.showFixation(timing.fixationDuration);
    }
    
    // 2. Pre-stimulus delay
    if (timing.preDelay && timing.preDelay > 0) {
      await this.delay(timing.preDelay);
    }
    
    // 3. Show question content
    this.renderer.addRenderable({
      id: question.id,
      render: (gl, context) => {
        if (this.currentRenderer) {
          this.currentRenderer.render(gl, context);
        }
      },
      layer: 0
    });
    
    // Mark question onset (first frame rendered)
    const onsetTime = performance.now();
    renderer.markOnset(onsetTime);
    
    // 4. Stimulus duration (if specified)
    if (timing.stimulusDuration && timing.stimulusDuration > 0) {
      await this.delay(timing.stimulusDuration);
      
      // Hide question content but keep response collection active
      this.renderer.removeRenderable(question.id);
      
      // 5. Post-stimulus delay
      if (timing.postDelay && timing.postDelay > 0) {
        await this.delay(timing.postDelay);
      }
    }
  }
  
  /**
   * Build renderer for question content
   */
  private async buildQuestionRenderer(question: Question, variableEngine: VariableEngine): Promise<IQuestionRenderer | null> {
    const renderers: IQuestionRenderer[] = [];
    
    // Add question text if present
    if (question.text) {
      const processedText = this.processVariables(question.text, variableEngine);
      renderers.push(new TextRenderer({
        id: `${question.id}_text`,
        text: processedText,
        fontSize: question.style?.fontSize || 24,
        color: question.style?.color || '#FFFFFF',
        position: { x: 0.5, y: 0.3 }
      }));
    }
    
    // Add instruction if present
    if (question.instruction) {
      const processedInstruction = this.processVariables(question.instruction, variableEngine);
      renderers.push(new TextRenderer({
        id: `${question.id}_instruction`,
        text: processedInstruction,
        fontSize: 18,
        color: 'rgba(178, 178, 178, 1)',
        position: { x: 0.5, y: 0.7 }
      }));
    }
    
    // Add media content (single item per business decision)
    if (question.media) {
      const mediaRenderer = await this.createMediaRenderer(question.media, question.id);
      if (mediaRenderer) {
        renderers.push(mediaRenderer);
      }
    }
    
    // Add response options for choice questions
    if (question.responseType.type === 'single' || question.responseType.type === 'multiple') {
      const options = question.responseType.options || [];
      options.forEach((option, index) => {
        const yPos = 0.4 + (index * 0.08);
        renderers.push(new TextRenderer({
          id: `${question.id}_option_${index}`,
          text: `${option.value}: ${option.label}`,
          fontSize: 20,
          color: 'rgba(230, 230, 230, 1)',
          position: { x: 0.5, y: yPos }
        }));
      });
    }
    
    // Add scale visualization for scale questions
    if (question.responseType.type === 'scale') {
      const scale = question.responseType;
      const scaleText = `${scale.min} ${scale.minLabel || ''} ──────── ${scale.maxLabel || ''} ${scale.max}`;
      renderers.push(new TextRenderer({
        id: `${question.id}_scale`,
        text: scaleText,
        fontSize: 20,
        color: 'rgba(204, 204, 204, 1)',
        position: { x: 0.5, y: 0.6 }
      }));
    }
    
    // Return single renderer or composite
    if (renderers.length === 0) {
      return null;
    } else if (renderers.length === 1) {
      return renderers[0]!; // Safe because we checked length === 1
    } else {
      return new CompositeRenderer({
        id: question.id,
        children: renderers
      });
    }
  }
  
  /**
   * Create media renderer from definition
   */
  private async createMediaRenderer(media: any, questionId: string): Promise<IQuestionRenderer | null> {
    switch (media.type) {
      case 'image':
        return new ImageRenderer({
          id: `${questionId}_${media.id}`,
          src: media.content,
          position: media.position,
          size: media.size
        });
        
      case 'video':
        return new VideoRenderer({
          id: `${questionId}_${media.id}`,
          src: media.content,
          autoplay: media.properties?.autoplay !== false,
          loop: media.properties?.loop || false,
          muted: media.properties?.muted !== false,
          position: media.position,
          size: media.size
        });
        
      case 'audio':
        return new AudioRenderer({
          id: `${questionId}_${media.id}`,
          src: media.content,
          volume: media.properties?.volume || 1,
          visualizer: media.properties?.showWaveform ? 'waveform' : 'none',
          position: media.position
        });
        
      case 'text':
        return new TextRenderer({
          id: `${questionId}_${media.id}`,
          text: media.content,
          fontSize: media.properties?.fontSize || 24,
          color: media.properties?.color || '#FFFFFF',
          position: media.position
        });
        
      default:
        return null;
    }
  }
  
  /**
   * Show fixation cross
   */
  private async showFixation(duration: number): Promise<void> {
    if (!this.fixationRenderer) return;
    
    const gl = this.renderer.getContext();
    this.fixationRenderer.prepare(gl, {
      id: 'fixation',
      position: { x: 0.5, y: 0.5 }
    });
    
    this.renderer.addRenderable({
      id: 'fixation',
      render: (gl, context) => {
        if (this.fixationRenderer) {
          this.fixationRenderer.render(gl, context);
        }
      },
      layer: 0
    });
    
    await this.delay(duration);
    this.renderer.removeRenderable('fixation');
  }
  
  /**
   * Clear current presentation
   */
  public async clear(): Promise<void> {
    if (this.currentRenderer) {
      const gl = this.renderer.getContext();
      this.currentRenderer.cleanup(gl);
      this.currentRenderer = null;
    }
    
    // Remove all renderables
    this.renderer.clearRenderables();
  }
  
  /**
   * Process variables in text
   */
  private processVariables(text: string, variableEngine: VariableEngine): string {
    return text.replace(/\{([^}]+)\}/g, (match, varName) => {
      const value = variableEngine.getVariable(varName);
      return value !== null ? String(value) : match;
    });
  }
  
  /**
   * Parse color string to RGBA array
   */
  private parseColor(color: string): [number, number, number, number] {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return [r, g, b, 1];
    }
    return [1, 1, 1, 1];
  }
  
  /**
   * Present a modular item (question/instruction/analytics)
   */
  public async presentModular(item: any, variableEngine: VariableEngine): Promise<void> {
    const gl = this.renderer.getContext();
    
    // Get module metadata
    const metadata = moduleRegistry.get(item.type);
    if (!metadata) {
      console.error(`Module type not found: ${item.type}`);
      return;
    }
    
    // For now, create a simple renderer based on category
    let renderer: IQuestionRenderer | null = null;
    
    switch (metadata.category) {
      case 'instruction':
        // Instructions typically show text/media content
        renderer = await this.buildInstructionRenderer(item, variableEngine);
        break;
        
      case 'analytics':
        // Analytics show data visualizations
        renderer = await this.buildAnalyticsRenderer(item, variableEngine);
        break;
        
      case 'question':
        // Questions use the existing question renderer
        renderer = await this.buildQuestionRenderer(item as Question, variableEngine);
        break;
    }
    
    if (!renderer) return;
    
    this.currentRenderer = renderer;
    
    // Prepare renderer
    renderer.prepare(gl, {
      id: item.id,
      position: item.layout?.position || { x: 0.5, y: 0.5 },
      size: item.layout?.size,
      opacity: item.layout?.opacity || 1,
      rotation: item.layout?.rotation || 0
    });
    
    // Show content
    this.renderer.addRenderable({
      id: item.id,
      render: (gl, context) => {
        if (this.currentRenderer) {
          this.currentRenderer.render(gl, context);
        }
      },
      layer: 0
    });
  }
  
  /**
   * Build renderer for instruction content
   */
  private async buildInstructionRenderer(instruction: any, variableEngine: VariableEngine): Promise<IQuestionRenderer | null> {
    const renderers: IQuestionRenderer[] = [];
    
    // Add instruction text
    if (instruction.text || instruction.content) {
      const text = instruction.text || instruction.content;
      const processedText = this.processVariables(text, variableEngine);
      renderers.push(new TextRenderer({
        id: `${instruction.id}_text`,
        text: processedText,
        fontSize: instruction.style?.fontSize || 28,
        color: instruction.style?.color || '#FFFFFF',
        position: { x: 0.5, y: 0.5 }
      }));
    }
    
    // Add media if present
    if (instruction.media) {
      const mediaRenderer = await this.createMediaRenderer(instruction.media, instruction.id);
      if (mediaRenderer) {
        renderers.push(mediaRenderer);
      }
    }
    
    // Return single renderer or composite
    if (renderers.length === 0) {
      return null;
    } else if (renderers.length === 1) {
      return renderers[0]!;
    } else {
      return new CompositeRenderer({
        id: instruction.id,
        children: renderers
      });
    }
  }
  
  /**
   * Build renderer for analytics visualization
   */
  private async buildAnalyticsRenderer(analytics: any, variableEngine: VariableEngine): Promise<IQuestionRenderer | null> {
    // For analytics, we'll show a placeholder for now
    // In a real implementation, this would create appropriate chart renderers
    const renderers: IQuestionRenderer[] = [];
    
    // Add title
    if (analytics.title) {
      const processedTitle = this.processVariables(analytics.title, variableEngine);
      renderers.push(new TextRenderer({
        id: `${analytics.id}_title`,
        text: processedTitle,
        fontSize: 24,
        color: '#FFFFFF',
        position: { x: 0.5, y: 0.2 }
      }));
    }
    
    // Add placeholder for chart
    renderers.push(new TextRenderer({
      id: `${analytics.id}_chart`,
      text: `[${analytics.type} visualization]`,
      fontSize: 18,
      color: '#CCCCCC',
      position: { x: 0.5, y: 0.5 }
    }));
    
    // Add description if present
    if (analytics.description) {
      const processedDesc = this.processVariables(analytics.description, variableEngine);
      renderers.push(new TextRenderer({
        id: `${analytics.id}_desc`,
        text: processedDesc,
        fontSize: 16,
        color: '#AAAAAA',
        position: { x: 0.5, y: 0.8 }
      }));
    }
    
    return new CompositeRenderer({
      id: analytics.id,
      children: renderers
    });
  }
  
  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}