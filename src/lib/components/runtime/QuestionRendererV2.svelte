<script lang="ts">
  import type { Question } from '$lib/shared/types/questionnaire';
  import { getRuntimeComponent } from './questions';
  
  interface Props {
    question: Question;
    value?: any;
    onChange?: (value: any) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    disabled?: boolean;
    showValidation?: boolean;
  }
  
  let {
    question,
    value = $bindable(),
    onChange,
    onNext,
    onPrevious,
    disabled = false,
    showValidation = false
  }: Props = $props();
  
  $: Component = getRuntimeComponent(question.type);
  
  // Performance monitoring for 120+ FPS
  let frameTime = $state(0);
  let fps = $state(0);
  let lastTime = performance.now();
  let frames = 0;
  
  function measurePerformance() {
    const now = performance.now();
    frameTime = now - lastTime;
    lastTime = now;
    frames++;
    
    // Calculate FPS every second
    if (frames % 60 === 0) {
      fps = Math.round(1000 / frameTime);
    }
    
    requestAnimationFrame(measurePerformance);
  }
  
  // Start performance monitoring in development
  if (import.meta.env.DEV) {
    measurePerformance();
  }
</script>

<div class="question-renderer">
  {#if Component}
    <Component
      {question}
      bind:value
      {onChange}
      {onNext}
      {onPrevious}
      {disabled}
      {showValidation}
    />
  {:else}
    <div class="error-state">
      <h3>Unsupported Question Type</h3>
      <p>The question type "{question.type}" is not yet implemented.</p>
      {#if onNext}
        <button onclick={onNext} class="skip-button">
          Skip Question
        </button>
      {/if}
    </div>
  {/if}
  
  {#if import.meta.env.DEV}
    <div class="performance-monitor">
      FPS: {fps} | Frame: {frameTime.toFixed(2)}ms
    </div>
  {/if}
</div>

<style>
  .question-renderer {
    position: relative;
    width: 100%;
    min-height: 100px;
    /* Optimize rendering performance */
    contain: layout style;
    will-change: contents;
  }
  
  .error-state {
    text-align: center;
    padding: 2rem;
    background-color: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    max-width: 32rem;
    margin: 0 auto;
  }
  
  .error-state h3 {
    margin: 0 0 0.5rem;
    color: #991b1b;
    font-size: 1.125rem;
    font-weight: 600;
  }
  
  .error-state p {
    margin: 0 0 1rem;
    color: #7f1d1d;
  }
  
  .skip-button {
    padding: 0.5rem 1rem;
    background-color: #dc2626;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  
  .skip-button:hover {
    background-color: #b91c1c;
  }
  
  .performance-monitor {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    padding: 0.5rem 0.75rem;
    background-color: rgba(0, 0, 0, 0.8);
    color: #10b981;
    font-family: monospace;
    font-size: 0.75rem;
    border-radius: 0.25rem;
    z-index: 9999;
  }
</style>