<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { WebGLRenderer } from '$lib/renderer';
  
  interface WebGLContent {
    type: 'circle' | 'rectangle' | 'triangle' | 'custom';
    properties: {
      radius?: number;
      width?: number;
      height?: number;
      color?: number[];
      shader?: string;
      vertices?: number[];
    };
  }
  
  interface WebGLConfig {
    stimulus: {
      type: 'shape' | 'image' | 'video' | 'custom';
      content: WebGLContent | string;
      fixation?: {
        show: boolean;
        type: 'cross' | 'dot';
        duration: number;
        color: string;
      };
    };
    response: {
      type: 'keyboard' | 'mouse' | 'touch';
      validKeys?: string[];
      requireCorrect?: boolean;
      correctKey?: string;
    };
    timing: {
      preDelay?: number;
      postFixationDelay?: number;
      stimulusDuration?: number;
      responseDuration?: number;
      interTrialInterval?: number;
    };
    rendering: {
      targetFPS?: number;
      vsync?: boolean;
      antialias?: boolean;
    };
  }
  
  interface WebGLValue {
    response: string | null;
    reactionTime: number;
    stimulusOnset: number;
    responseTime: number;
    frameTimings?: number[];
    isCorrect?: boolean;
    timeout?: boolean;
  }
  
  interface Props extends QuestionProps {
    question: Question & { config: WebGLConfig };
  }
  
  let {
    question,
    mode = 'runtime',
    value = $bindable(null),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction
  }: Props = $props();
  
  // Canvas and renderer
  let canvas: HTMLCanvasElement;
  let renderer: WebGLRenderer | null = null;
  
  // Timing state
  let responseStartTime = $state(0);
  let stimulusOnsetTime = $state(0);
  let isPresenting = $state(false);
  let presentationPhase = $state<'waiting' | 'fixation' | 'delay' | 'stimulus' | 'response' | 'complete'>('waiting');
  
  // Response handling
  let keyHandlers = new Map<string, () => void>();
  let timeoutId: number | null = null;
  
  // Configuration
  const config = $derived(question.config);
  const targetFPS = $derived(config.rendering?.targetFPS || 120);
  
  // Initialize value
  $effect(() => {
    if (!value) {
      value = {
        response: null,
        reactionTime: -1,
        stimulusOnset: 0,
        responseTime: 0,
        frameTimings: [],
        timeout: false
      };
    }
  });
  
  // Setup canvas and renderer
  $effect(() => {
    if (canvas && !renderer) {
      setupRenderer();
      
      if (mode === 'runtime' && !disabled) {
        startPresentation();
      }
    }
  });
  
  // Cleanup on unmount
  $effect(() => {
    return () => {
      cleanupPresentation();
      if (renderer) {
        renderer.destroy();
        renderer = null;
      }
    };
  });
  
  // Validation
  $effect(() => {
    const errors: string[] = [];
    let isValid = true;
    
    if (question.required && !value?.response) {
      errors.push('Response is required');
      isValid = false;
    }
    
    if (value?.timeout) {
      errors.push('Response timeout');
      isValid = false;
    }
    
    onValidation?.({ valid: isValid, errors });
  });
  
  async function setupRenderer() {
    if (!canvas) return;
    
    renderer = new WebGLRenderer({
      canvas,
      targetFPS,
      vsync: config.rendering?.vsync ?? true,
      antialias: config.rendering?.antialias ?? true
    });
    
    // Track frame timings for performance analysis
    renderer.onFrame((timing) => {
      if (value && isPresenting) {
        value.frameTimings = [...(value.frameTimings || []), timing];
      }
    });
  }
  
  async function startPresentation() {
    presentationPhase = 'waiting';
    
    const phases = [
      { phase: 'fixation', duration: config.stimulus.fixation?.show ? config.stimulus.fixation.duration : 0 },
      { phase: 'delay', duration: config.timing?.postFixationDelay || 0 },
      { phase: 'stimulus', duration: 0 } // Stimulus stays until response
    ];
    
    // Pre-delay
    if (config.timing?.preDelay) {
      await delay(config.timing.preDelay);
    }
    
    // Execute phases
    for (const { phase, duration } of phases) {
      if (phase === 'fixation' && duration > 0) {
        presentationPhase = 'fixation';
        showFixation();
        await delay(duration);
        hideFixation();
      } else if (phase === 'delay' && duration > 0) {
        presentationPhase = 'delay';
        await delay(duration);
      } else if (phase === 'stimulus') {
        presentationPhase = 'stimulus';
        stimulusOnsetTime = performance.now();
        value.stimulusOnset = stimulusOnsetTime;
        
        renderer?.markStimulusOnset();
        showStimulus();
        
        // Start response collection
        responseStartTime = performance.now();
        setupResponseHandlers();
        
        // Handle stimulus duration
        if (config.timing?.stimulusDuration && config.timing.stimulusDuration > 0) {
          setTimeout(() => {
            hideStimulus();
            presentationPhase = 'response';
          }, config.timing.stimulusDuration);
        }
        
        // Handle response timeout
        if (config.timing?.responseDuration) {
          timeoutId = window.setTimeout(() => {
            if (!value?.response) {
              handleTimeout();
            }
          }, config.timing.responseDuration);
        }
        
        isPresenting = true;
      }
    }
    
    onInteraction?.({
      type: 'presentation-start',
      timestamp: Date.now(),
      data: { targetFPS }
    });
  }
  
  function showFixation() {
    if (!renderer) return;
    
    const fixationType = config.stimulus.fixation?.type || 'cross';
    const color = parseColor(config.stimulus.fixation?.color || '#ffffff');
    
    renderer.addRenderable({
      id: 'fixation',
      layer: 100,
      render: (gl, context) => {
        const centerX = context.width / 2;
        const centerY = context.height / 2;
        
        if (fixationType === 'cross') {
          // Horizontal line
          renderer?.executeCommand({
            type: 'drawRect',
            params: {
              x: centerX - 20,
              y: centerY - 2,
              width: 40,
              height: 4,
              color
            }
          });
          // Vertical line
          renderer?.executeCommand({
            type: 'drawRect',
            params: {
              x: centerX - 2,
              y: centerY - 20,
              width: 4,
              height: 40,
              color
            }
          });
        } else if (fixationType === 'dot') {
          renderer?.executeCommand({
            type: 'drawCircle',
            params: {
              x: centerX,
              y: centerY,
              radius: 5,
              color
            }
          });
        }
      }
    });
    
    renderer.start();
  }
  
  function hideFixation() {
    renderer?.removeRenderable('fixation');
  }
  
  function showStimulus() {
    if (!renderer) return;
    
    const stimulusType = config.stimulus.type;
    const content = config.stimulus.content;
    
    renderer.addRenderable({
      id: 'stimulus',
      layer: 50,
      render: (gl, context) => {
        if (stimulusType === 'shape' && typeof content === 'object') {
          const webglContent = content as WebGLContent;
          
          if (webglContent.type === 'circle') {
            renderer?.executeCommand({
              type: 'drawCircle',
              params: {
                x: context.width / 2,
                y: context.height / 2,
                radius: webglContent.properties.radius || 50,
                color: webglContent.properties.color || [1, 1, 1, 1]
              }
            });
          } else if (webglContent.type === 'rectangle') {
            renderer?.executeCommand({
              type: 'drawRect',
              params: {
                x: (context.width - (webglContent.properties.width || 100)) / 2,
                y: (context.height - (webglContent.properties.height || 100)) / 2,
                width: webglContent.properties.width || 100,
                height: webglContent.properties.height || 100,
                color: webglContent.properties.color || [1, 1, 1, 1]
              }
            });
          } else if (webglContent.type === 'triangle') {
            const size = webglContent.properties.width || 100;
            const centerX = context.width / 2;
            const centerY = context.height / 2;
            
            renderer?.executeCommand({
              type: 'drawTriangle',
              params: {
                x1: centerX,
                y1: centerY - size / 2,
                x2: centerX - size / 2,
                y2: centerY + size / 2,
                x3: centerX + size / 2,
                y3: centerY + size / 2,
                color: webglContent.properties.color || [1, 1, 1, 1]
              }
            });
          } else if (webglContent.type === 'custom' && webglContent.properties.shader) {
            // Custom shader support
            renderer?.executeCommand({
              type: 'customShader',
              params: {
                shader: webglContent.properties.shader,
                vertices: webglContent.properties.vertices || [],
                uniforms: {
                  time: (performance.now() - stimulusOnsetTime) / 1000,
                  resolution: [context.width, context.height]
                }
              }
            });
          }
        }
        // Add support for images/videos via texture rendering
      }
    });
  }
  
  function hideStimulus() {
    renderer?.removeRenderable('stimulus');
  }
  
  function setupResponseHandlers() {
    const responseConfig = config.response;
    
    if (responseConfig.type === 'keyboard' && responseConfig.validKeys) {
      const handleKeypress = (event: KeyboardEvent) => {
        if (!isPresenting && config.timing?.stimulusDuration) {
          // Only accept responses during stimulus presentation if duration is set
          if (presentationPhase !== 'stimulus') return;
        }
        
        if (responseConfig.validKeys?.includes(event.key)) {
          const reactionTime = performance.now() - stimulusOnsetTime;
          
          let isCorrect: boolean | undefined;
          if (responseConfig.requireCorrect && responseConfig.correctKey) {
            isCorrect = event.key === responseConfig.correctKey;
          }
          
          handleResponse({
            response: event.key,
            reactionTime,
            responseTime: performance.now(),
            isCorrect
          });
        }
      };
      
      document.addEventListener('keydown', handleKeypress);
      keyHandlers.set('keydown', () => document.removeEventListener('keydown', handleKeypress));
    }
    
    // TODO: Add mouse/touch handlers
  }
  
  function cleanupResponseHandlers() {
    keyHandlers.forEach(cleanup => cleanup());
    keyHandlers.clear();
    
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }
  
  function handleResponse(response: Partial<WebGLValue>) {
    cleanupResponseHandlers();
    hideStimulus();
    
    value = {
      ...value,
      ...response,
      timeout: false
    };
    
    presentationPhase = 'complete';
    isPresenting = false;
    
    onResponse?.(value);
    onInteraction?.({
      type: 'response',
      timestamp: Date.now(),
      data: {
        key: response.response,
        reactionTime: response.reactionTime,
        isCorrect: response.isCorrect
      }
    });
    
    // Handle inter-trial interval
    if (config.timing?.interTrialInterval) {
      setTimeout(() => {
        // Ready for next trial/question
      }, config.timing.interTrialInterval);
    }
  }
  
  function handleTimeout() {
    cleanupResponseHandlers();
    hideStimulus();
    
    value = {
      ...value,
      response: null,
      reactionTime: -1,
      responseTime: performance.now(),
      timeout: true
    };
    
    presentationPhase = 'complete';
    isPresenting = false;
    
    onResponse?.(value);
    onInteraction?.({
      type: 'timeout',
      timestamp: Date.now()
    });
  }
  
  function cleanupPresentation() {
    cleanupResponseHandlers();
    if (renderer) {
      renderer.stop();
      renderer.clearRenderables();
    }
  }
  
  function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function parseColor(color: string): [number, number, number, number] {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return [r, g, b, 1];
    }
    return [1, 1, 1, 1];
  }
</script>

<BaseQuestion
  {question}
  {mode}
  bind:value
  {disabled}
  {onResponse}
  {onValidation}
  {onInteraction}
>
  <div class="webgl-container">
    <canvas 
      bind:this={canvas}
      class="webgl-canvas"
      class:presenting={isPresenting}
    />
    
    {#if presentationPhase === 'waiting' && !disabled}
      <div class="status-overlay">
        <p>Preparing stimulus...</p>
      </div>
    {/if}
    
    {#if presentationPhase === 'complete'}
      <div class="status-overlay">
        <p>Complete</p>
        {#if value?.reactionTime && value.reactionTime > 0}
          <p class="rt">RT: {value.reactionTime.toFixed(0)}ms</p>
        {/if}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .webgl-container {
    position: relative;
    width: 100%;
    height: 600px;
    background: #000;
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  .webgl-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
  
  .webgl-canvas.presenting {
    cursor: none;
  }
  
  .status-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.8);
    color: white;
  }
  
  .status-overlay p {
    margin: 0.25rem 0;
    font-size: 1.125rem;
  }
  
  .status-overlay .rt {
    font-size: 1.5rem;
    font-weight: 600;
    color: #4ade80;
  }
  
  /* Responsive */
  @media (max-width: 768px) {
    .webgl-container {
      height: 400px;
    }
  }
</style>