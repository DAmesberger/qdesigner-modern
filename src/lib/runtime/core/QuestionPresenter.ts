import type { Question, Stimulus } from '$lib/questionnaire/types/questionnaire';
import type { VariableEngine } from '$lib/questionnaire/variables/VariableEngine';
import type { WebGLRenderer } from '$lib/renderer/WebGLRenderer';
import type { ResourceManager } from '../resources/ResourceManager';
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
      color: [1, 1, 1, 1],
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
        color: this.parseColor(question.style?.color || '#FFFFFF'),
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
        color: [0.7, 0.7, 0.7, 1],
        position: { x: 0.5, y: 0.7 }
      }));
    }
    
    // Add media content
    for (const media of question.media || []) {
      const mediaRenderer = await this.createMediaRenderer(media, question.id);
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
          color: [0.9, 0.9, 0.9, 1],
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
        color: [0.8, 0.8, 0.8, 1],
        position: { x: 0.5, y: 0.6 }
      }));
    }
    
    // Return single stimulus or composite
    if (stimuli.length === 0) {
      return null;
    } else if (stimuli.length === 1) {
      return stimuli[0];
    } else {
      return new CompositeStimulus({
        id: question.id,
        components: stimuli.map((s, i) => ({ stimulus: s, layer: i }))
      });
    }
  }
  
  /**
   * Create media stimulus from definition
   */
  private async createMediaStimulus(stimulus: Stimulus, questionId: string): Promise<IStimulus | null> {
    switch (stimulus.type) {
      case 'image':
        return new ImageStimulus({
          id: `${questionId}_${stimulus.id}`,
          imageUrl: stimulus.content,
          position: stimulus.position,
          size: stimulus.size
        });
        
      case 'video':
        return new VideoStimulus({
          id: `${questionId}_${stimulus.id}`,
          videoUrl: stimulus.content,
          autoplay: stimulus.properties?.autoplay !== false,
          loop: stimulus.properties?.loop || false,
          muted: stimulus.properties?.muted !== false,
          position: stimulus.position,
          size: stimulus.size
        });
        
      case 'audio':
        return new AudioStimulus({
          id: `${questionId}_${stimulus.id}`,
          audioUrl: stimulus.content,
          volume: stimulus.properties?.volume || 1,
          showWaveform: stimulus.properties?.showWaveform || false,
          position: stimulus.position
        });
        
      case 'text':
        return new TextStimulus({
          id: `${questionId}_${stimulus.id}`,
          text: stimulus.content,
          fontSize: stimulus.properties?.fontSize || 24,
          color: this.parseColor(stimulus.properties?.color || '#FFFFFF'),
          position: stimulus.position
        });
        
      default:
        return null;
    }
  }
  
  /**
   * Show fixation cross
   */
  private async showFixation(duration: number): Promise<void> {
    if (!this.fixationStimulus) return;
    
    const gl = this.renderer.getContext();
    this.fixationStimulus.prepare(gl, {
      position: { x: 0.5, y: 0.5 }
    });
    
    this.renderer.addRenderable({
      id: 'fixation',
      render: (gl, context) => {
        if (this.fixationStimulus) {
          this.fixationStimulus.render(gl, context);
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
    if (this.currentStimulus) {
      const gl = this.renderer.getContext();
      this.currentStimulus.cleanup(gl);
      this.currentStimulus = null;
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
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}