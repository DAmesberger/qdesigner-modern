<script lang="ts">
  import BaseQuestion from './BaseQuestion.svelte';
  import type { ExtendedQuestion, ScaleConfig } from './types';
  import { onMount } from 'svelte';
  
  export let question: ExtendedQuestion & { config: ScaleConfig };
  export let mode: 'edit' | 'preview' | 'runtime' = 'runtime';
  export let value: number | null = question.config.defaultValue || null;
  export let disabled: boolean = false;
  
  let sliderElement: HTMLInputElement;
  let isDragging = false;
  
  // Calculate scale points
  $: scalePoints = generateScalePoints(
    question.config.min,
    question.config.max,
    question.config.step
  );
  
  function generateScalePoints(min: number, max: number, step: number): number[] {
    const points = [];
    for (let i = min; i <= max; i += step) {
      points.push(i);
    }
    return points;
  }
  
  // Get label for a value
  function getLabel(val: number): string {
    const label = question.config.labels?.find((l: any) => l.value === val);
    return label?.label || val.toString();
  }
  
  function handleSliderInput(event: Event) {
    const target = event.target as HTMLInputElement;
    value = parseFloat(target.value);
  }
  
  function handleButtonClick(val: number) {
    if (!disabled) {
      value = val;
    }
  }
  
  function handleStarClick(rating: number) {
    if (!disabled) {
      value = value === rating ? null : rating;
    }
  }
  
  function handleKeyPress(event: KeyboardEvent) {
    if (disabled) return;
    
    const step = question.config.step;
    const min = question.config.min;
    const max = question.config.max;
    
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        if (value === null) {
          value = min;
        } else {
          value = Math.max(min, value - step);
        }
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        if (value === null) {
          value = min;
        } else {
          value = Math.min(max, value + step);
        }
        break;
      case 'Home':
        event.preventDefault();
        value = min;
        break;
      case 'End':
        event.preventDefault();
        value = max;
        break;
    }
  }
  
  // Visual analog scale handling
  function handleVASClick(event: MouseEvent) {
    if (disabled || question.config.displayType !== 'visual-analog') return;
    
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = x / rect.width;
    const range = question.config.max - question.config.min;
    value = question.config.min + (range * percentage);
    
    // Snap to grid if configured
    if (question.config.step > 0 && value !== null) {
      value = Math.round(value / question.config.step) * question.config.step;
    }
  }
  
  // Calculate position for visual analog scale
  $: vasPosition = value !== null 
    ? ((value - question.config.min) / (question.config.max - question.config.min)) * 100
    : 50;
</script>

<BaseQuestion 
  {question} 
  {mode} 
  {value} 
  {disabled}
  on:edit
  on:delete
  on:duplicate
  on:response
  on:interaction
  let:handleResponse
>
  <div 
    class="scale-container type-{question.config.displayType} orientation-{question.config.orientation || 'horizontal'}"
    on:keydown={handleKeyPress}
    tabindex="0"
    role="slider"
    aria-valuemin={question.config.min}
    aria-valuemax={question.config.max}
    aria-valuenow={value}
    aria-valuetext={value !== null ? getLabel(value) : 'No value selected'}
  >
    {#if question.config.displayType === 'slider'}
      <!-- Slider Display -->
      <div class="slider-container">
        {#if question.config.showLabels && question.config.labels}
          <div class="slider-labels">
            {#each question.config.labels as label}
              <div 
                class="slider-label"
                style="left: {((label.value - question.config.min) / (question.config.max - question.config.min)) * 100}%"
              >
                <span class="label-text">{label.label}</span>
                {#if label.description}
                  <span class="label-description">{label.description}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
        
        <input
          type="range"
          bind:this={sliderElement}
          min={question.config.min}
          max={question.config.max}
          step={question.config.step}
          {value}
          on:input={handleSliderInput}
          on:mousedown={() => isDragging = true}
          on:mouseup={() => isDragging = false}
          {disabled}
          class="slider"
        />
        
        {#if question.config.showValue && value !== null}
          <div class="slider-value" class:dragging={isDragging}>
            {getLabel(value)}
          </div>
        {/if}
      </div>
      
    {:else if question.config.displayType === 'buttons'}
      <!-- Button Display -->
      <div class="buttons-container">
        {#each scalePoints as point}
          <button
            class="scale-button"
            class:selected={value === point}
            on:click={() => handleButtonClick(point)}
            {disabled}
            title={getLabel(point)}
          >
            <span class="button-value">{point}</span>
            {#if question.config.showLabels}
              <span class="button-label">{getLabel(point)}</span>
            {/if}
          </button>
        {/each}
      </div>
      
    {:else if question.config.displayType === 'stars'}
      <!-- Star Rating Display -->
      <div class="stars-container">
        {#each scalePoints as point}
          <button
            class="star-button"
            class:filled={value !== null && value >= point}
            on:click={() => handleStarClick(point)}
            {disabled}
            title={`${point} star${point > 1 ? 's' : ''}`}
            aria-label={`Rate ${point} star${point > 1 ? 's' : ''}`}
          >
            <svg class="star-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </button>
        {/each}
        
        {#if question.config.showValue && value !== null}
          <span class="stars-value">{value} / {question.config.max}</span>
        {/if}
      </div>
      
    {:else if question.config.displayType === 'visual-analog'}
      <!-- Visual Analog Scale -->
      <div class="vas-container">
        <div 
          class="vas-track"
          on:click={handleVASClick}
          on:keypress={(e) => {
            if (e.key === 'Enter') {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const mockMouseEvent = new MouseEvent('click', {
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2
              });
              Object.defineProperty(mockMouseEvent, 'currentTarget', {
                value: e.currentTarget,
                configurable: true
              });
              handleVASClick(mockMouseEvent);
            }
          }}
          role="slider"
          aria-valuenow={value ?? question.config.min}
          aria-valuemin={question.config.min}
          aria-valuemax={question.config.max}
          aria-label="Visual analog scale"
          tabindex="0"
        >
          <div class="vas-fill" style="width: {vasPosition}%"></div>
          {#if value !== null}
            <div class="vas-handle" style="left: {vasPosition}%">
              {#if question.config.showValue}
                <span class="vas-value">{value.toFixed(1)}</span>
              {/if}
            </div>
          {/if}
        </div>
        
        {#if question.config.showLabels}
          <div class="vas-labels">
            <span class="vas-label-min">
              {question.config.labels?.[0]?.label || question.config.min}
            </span>
            {#if question.config.labels?.find((l: any) => l.value === (question.config.min + question.config.max) / 2)}
              <span class="vas-label-mid">
                {question.config.labels.find((l: any) => l.value === (question.config.min + question.config.max) / 2)?.label}
              </span>
            {/if}
            <span class="vas-label-max">
              {question.config.labels?.[question.config.labels.length - 1]?.label || question.config.max}
            </span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .scale-container {
    padding: 1rem 0;
  }
  
  .scale-container:focus {
    outline: 2px solid var(--color-blue-500);
    outline-offset: 2px;
    border-radius: 0.25rem;
  }
  
  /* Slider styles */
  .slider-container {
    position: relative;
    padding: 2rem 0;
  }
  
  .slider {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--color-gray-200);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }
  
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    background: var(--color-blue-500);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--color-blue-500);
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }
  
  .slider:hover::-webkit-slider-thumb,
  .slider:hover::-moz-range-thumb {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  
  .slider:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .slider-labels {
    position: absolute;
    top: -1.5rem;
    left: 0;
    right: 0;
    height: 1.5rem;
  }
  
  .slider-label {
    position: absolute;
    transform: translateX(-50%);
    text-align: center;
  }
  
  .label-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
  }
  
  .label-description {
    display: block;
    font-size: 0.75rem;
    color: var(--color-gray-500);
  }
  
  .slider-value {
    position: absolute;
    bottom: -1.5rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.25rem 0.5rem;
    background: var(--color-gray-900);
    color: white;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
  }
  
  .slider-value.dragging {
    transform: translateX(-50%) scale(1.1);
  }
  
  /* Button styles */
  .buttons-container {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  
  .orientation-vertical .buttons-container {
    flex-direction: column;
  }
  
  .scale-button {
    flex: 1;
    min-width: 3rem;
    padding: 0.75rem 1rem;
    border: 2px solid var(--color-gray-300);
    background: white;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  
  .scale-button:hover:not(:disabled) {
    border-color: var(--color-blue-400);
    background: var(--color-blue-50);
  }
  
  .scale-button.selected {
    border-color: var(--color-blue-500);
    background: var(--color-blue-500);
    color: white;
  }
  
  .scale-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .button-value {
    font-size: 1.125rem;
    font-weight: 600;
  }
  
  .button-label {
    font-size: 0.75rem;
  }
  
  /* Star rating styles */
  .stars-container {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }
  
  .star-button {
    padding: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .star-button:hover:not(:disabled) {
    transform: scale(1.1);
  }
  
  .star-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .star-icon {
    width: 2rem;
    height: 2rem;
    color: var(--color-gray-300);
    transition: color 0.2s;
  }
  
  .star-button.filled .star-icon {
    color: var(--color-yellow-400);
  }
  
  .star-button:hover .star-icon {
    color: var(--color-yellow-300);
  }
  
  .stars-value {
    margin-left: 1rem;
    font-size: 0.875rem;
    color: var(--color-gray-600);
  }
  
  /* Visual analog scale styles */
  .vas-container {
    padding: 2rem 0;
  }
  
  .vas-track {
    position: relative;
    height: 8px;
    background: var(--color-gray-200);
    border-radius: 4px;
    cursor: pointer;
    overflow: visible;
  }
  
  .vas-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--color-blue-500);
    border-radius: 4px;
    transition: width 0.2s;
  }
  
  .vas-handle {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 24px;
    height: 24px;
    background: var(--color-blue-500);
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: all 0.2s;
  }
  
  .vas-handle:hover {
    transform: translate(-50%, -50%) scale(1.1);
  }
  
  .vas-value {
    position: absolute;
    bottom: -2rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.125rem 0.375rem;
    background: var(--color-gray-900);
    color: white;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
  }
  
  .vas-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-gray-600);
  }
  
  .vas-label-mid {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }
  
  /* Responsive */
  @media (max-width: 640px) {
    .buttons-container {
      gap: 0.25rem;
    }
    
    .scale-button {
      min-width: 2.5rem;
      padding: 0.5rem;
    }
    
    .star-icon {
      width: 1.5rem;
      height: 1.5rem;
    }
  }
</style>