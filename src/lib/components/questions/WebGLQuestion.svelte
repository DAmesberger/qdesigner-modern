<script lang="ts">
  import BaseQuestion from './BaseQuestion.svelte';
  import type { ExtendedQuestion, WebGLQuestionConfig, WebGLContent } from './types';
  import { onMount, onDestroy } from 'svelte';
  import { WebGLRenderer } from '$lib/renderer';
  
  export let question: ExtendedQuestion & { config: WebGLQuestionConfig };
  export let mode: 'edit' | 'preview' | 'runtime' = 'runtime';
  export let value: any = null;
  export let disabled: boolean = false;
  export let onResponse: ((value: any) => void) | undefined = undefined;
  export let onValidation: ((isValid: boolean, errors: string[]) => void) | undefined = undefined;
  
  let canvas: HTMLCanvasElement;
  let renderer: WebGLRenderer | null = null;
  let responseStartTime: number = 0;
  let stimulusOnsetTime: number = 0;
  let isPresenting: boolean = false;
  let keyHandlers: Map<string, () => void> = new Map();
  
  onMount(async () => {
    if (mode === 'runtime' && canvas) {
      // Initialize WebGL renderer
      renderer = new WebGLRenderer({
        canvas,
        targetFPS: question.config.rendering.targetFPS || 120
      });
      
      if (mode === 'runtime') {
        await startPresentation();
      }
    }
  });
  
  onDestroy(() => {
    cleanupPresentation();
    if (renderer) {
      renderer.destroy();
    }
  });
  
  async function startPresentation() {
    const config = question.config;
    
    // Pre-delay
    if (config.timing.preDelay) {
      await delay(config.timing.preDelay);
    }
    
    // Show fixation
    if (config.stimulus.fixation?.show) {
      showFixation();
      await delay(config.stimulus.fixation.duration);
      hideFixation();
      
      if (config.timing.postFixationDelay) {
        await delay(config.timing.postFixationDelay);
      }
    }
    
    // Show stimulus
    stimulusOnsetTime = performance.now();
    renderer?.markStimulusOnset();
    showStimulus();
    
    // Start response collection
    responseStartTime = performance.now();
    setupResponseHandlers();
    
    // Handle stimulus duration
    if (config.timing.stimulusDuration && config.timing.stimulusDuration > 0) {
      setTimeout(() => {
        hideStimulus();
      }, config.timing.stimulusDuration);
    }
    
    // Handle response timeout
    if (config.timing.responseDuration) {
      setTimeout(() => {
        if (!value) {
          handleTimeout();
        }
      }, config.timing.responseDuration);
    }
  }
  
  function showFixation() {
    if (!renderer) return;
    
    const fixationType = question.config.stimulus.fixation?.type || 'cross';
    const color = question.config.stimulus.fixation?.color || '#ffffff';
    
    // Add fixation to renderer
    renderer.addRenderable({
      id: 'fixation',
      layer: 100,
      render: (gl, context) => {
        // Render fixation cross/dot
        const centerX = context.width / 2;
        const centerY = context.height / 2;
        
        if (fixationType === 'cross') {
          renderer?.executeCommand({
            type: 'drawRect',
            params: {
              x: centerX - 20,
              y: centerY - 2,
              width: 40,
              height: 4,
              color: [1, 1, 1, 1]
            }
          });
          renderer?.executeCommand({
            type: 'drawRect',
            params: {
              x: centerX - 2,
              y: centerY - 20,
              width: 4,
              height: 40,
              color: [1, 1, 1, 1]
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
    
    const stimulusType = question.config.stimulus.type;
    const content = question.config.stimulus.content;
    
    renderer.addRenderable({
      id: 'stimulus',
      layer: 50,
      render: (gl, context) => {
        // Render based on stimulus type
        if (stimulusType === 'webgl-shape' && typeof content === 'object') {
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
          }
        }
        // Add image/video rendering here
      }
    });
    
    isPresenting = true;
  }
  
  function hideStimulus() {
    renderer?.removeRenderable('stimulus');
    isPresenting = false;
  }
  
  function setupResponseHandlers() {
    const responseConfig = question.config.response;
    
    if (responseConfig.type === 'keyboard' && responseConfig.validKeys) {
      const handleKeypress = (event: KeyboardEvent) => {
        if (!isPresenting && question.config.timing.stimulusDuration) return;
        
        if (responseConfig.validKeys?.includes(event.key)) {
          const reactionTime = performance.now() - stimulusOnsetTime;
          handleResponse({
            key: event.key,
            reactionTime,
            timestamp: performance.now()
          });
        }
      };
      
      document.addEventListener('keydown', handleKeypress);
      keyHandlers.set('keydown', () => document.removeEventListener('keydown', handleKeypress));
    }
    
    // Add mouse/touch handlers as needed
  }
  
  function cleanupResponseHandlers() {
    keyHandlers.forEach(cleanup => cleanup());
    keyHandlers.clear();
  }
  
  function handleResponse(response: any) {
    cleanupResponseHandlers();
    hideStimulus();
    
    value = response;
    onResponse?.(response);
    onValidation?.(true, []);
    
    // Handle inter-trial interval
    if (question.config.timing.interTrialInterval) {
      setTimeout(() => {
        // Ready for next trial/question
      }, question.config.timing.interTrialInterval);
    }
  }
  
  function handleTimeout() {
    cleanupResponseHandlers();
    hideStimulus();
    
    value = { timeout: true, reactionTime: -1 };
    onResponse?.(value);
    onValidation?.(false, ['Response timeout']);
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
  
  // Handle edit mode
  function handleEdit() {
    // Emit edit event for properties panel
  }
</script>

<BaseQuestion 
  {question} 
  {mode} 
  {value} 
  {disabled}
  on:edit={handleEdit}
  on:delete
  on:duplicate
  on:response
  on:interaction
>
  <div class="webgl-question-container">
    <canvas 
      bind:this={canvas}
      class="webgl-canvas"
      class:edit-mode={mode === 'edit'}
    ></canvas>
    
    {#if mode === 'edit'}
      <div class="edit-overlay">
        <div class="edit-info">
          <h3>WebGL Question</h3>
          <p>Stimulus: {question.config.stimulus.type}</p>
          <p>Response: {question.config.response.type}</p>
          <p>Target FPS: {question.config.rendering.targetFPS}</p>
        </div>
      </div>
    {/if}
    
    {#if mode === 'preview'}
      <div class="preview-info">
        <p>WebGL questions run in real-time during the questionnaire</p>
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .webgl-question-container {
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
  
  .webgl-canvas.edit-mode {
    opacity: 0.3;
  }
  
  .edit-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.8);
    border: 2px dashed var(--color-blue-400);
  }
  
  .edit-info {
    text-align: center;
    color: white;
  }
  
  .edit-info h3 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }
  
  .edit-info p {
    margin: 0.5rem 0;
    color: #ccc;
  }
  
  .preview-info {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }
</style>