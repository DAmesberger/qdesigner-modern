<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { AnswerTypes } from '../shared/answerTypes';

  interface ScaleConfig {
    min: number;
    max: number;
    step: number;
    labels?: ScaleLabel[];
    displayType: 'slider' | 'buttons' | 'stars' | 'visual-analog';
    showValue?: boolean;
    showLabels?: boolean;
    orientation?: 'horizontal' | 'vertical';
    defaultValue?: number;
  }

  interface ScaleLabel {
    value: number;
    label: string;
    description?: string;
  }

  interface Props extends QuestionProps {
    question: Question & { config: ScaleConfig };
  }

  let {
    question,
    mode = 'runtime',
    value = $bindable(question.config.defaultValue || null),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  let sliderElement: HTMLInputElement;
  let isDragging = $state(false);
  let hoverValue = $state<number | null>(null);

  // Calculate scale points
  const scalePoints = $derived(
    generateScalePoints(question.config.min, question.config.max, question.config.step)
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
    const label = question.config.labels?.find((l) => l.value === val);
    return label?.label || val.toString();
  }

  function getDescription(val: number): string | undefined {
    const label = question.config.labels?.find((l) => l.value === val);
    return label?.description;
  }

  function handleSliderInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const newValue = parseFloat(target.value);
    value = newValue;
    onResponse?.(newValue);
    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { value: newValue, type: 'slider' },
    });
  }

  function handleButtonClick(val: number) {
    if (!disabled) {
      value = val;
      onResponse?.(val);
      onInteraction?.({
        type: 'change',
        timestamp: Date.now(),
        data: { value: val, type: 'button' },
      });
    }
  }

  function handleStarClick(rating: number) {
    if (!disabled) {
      value = value === rating ? null : rating;
      onResponse?.(value);
      onInteraction?.({
        type: 'change',
        timestamp: Date.now(),
        data: { value, type: 'star' },
      });
    }
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (disabled) return;

    let newValue = value || question.config.min;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        newValue = Math.max(question.config.min, newValue - question.config.step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        newValue = Math.min(question.config.max, newValue + question.config.step);
        break;
      case 'Home':
        newValue = question.config.min;
        break;
      case 'End':
        newValue = question.config.max;
        break;
      default:
        return;
    }

    event.preventDefault();
    value = newValue;
    onResponse?.(newValue);
  }

  // Visual analog scale helpers
  function getSliderPercentage(val: number): number {
    return ((val - question.config.min) / (question.config.max - question.config.min)) * 100;
  }

  // Set answer type
  $effect(() => {
    if ('answerType' in question) {
      (question as any).answerType = AnswerTypes.LIKERT_SCALE;
    }
  });
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div
    class="scale-container display-{question.config.displayType} orientation-{question.config
      .orientation || 'horizontal'}"
    onkeydown={handleKeyPress}
    tabindex="0"
    role="slider"
    aria-valuemin={question.config.min}
    aria-valuemax={question.config.max}
    aria-valuenow={value || question.config.min}
    aria-label="Rating scale"
  >
    {#if question.config.displayType === 'slider'}
      <div class="slider-container">
        <input
          bind:this={sliderElement}
          type="range"
          min={question.config.min}
          max={question.config.max}
          step={question.config.step}
          bind:value
          oninput={handleSliderInput}
          onmousedown={() => (isDragging = true)}
          onmouseup={() => (isDragging = false)}
          {disabled}
          class="slider"
        />

        {#if question.config.showLabels}
          <div class="slider-labels">
            {#each scalePoints as point}
              {@const label = question.config.labels?.find((l) => l.value === point)}
              {#if label || point === question.config.min || point === question.config.max}
                <div class="slider-label" style="left: {getSliderPercentage(point)}%">
                  <span class="label-text">{getLabel(point)}</span>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        {#if question.config.showValue && value !== null}
          {@const desc = getDescription(value)}
          <div class="value-display">
            <span class="value-number">{value}</span>
            {#if desc}
              <span class="value-description">{desc}</span>
            {/if}
          </div>
        {/if}
      </div>
    {:else if question.config.displayType === 'buttons'}
      <div class="buttons-container">
        {#each scalePoints as point}
          <button
            class="scale-button"
            class:selected={value === point}
            onclick={() => handleButtonClick(point)}
            onmouseenter={() => (hoverValue = point)}
            onmouseleave={() => (hoverValue = null)}
            {disabled}
            aria-pressed={value === point}
          >
            <span class="button-value">{point}</span>
            {#if question.config.showLabels}
              {@const label = getLabel(point)}
              {#if label !== point.toString()}
                <span class="button-label">{label}</span>
              {/if}
            {/if}
          </button>
        {/each}
      </div>

      {#if hoverValue !== null && getDescription(hoverValue)}
        <div class="hover-description">
          {getDescription(hoverValue)}
        </div>
      {/if}
    {:else if question.config.displayType === 'stars'}
      <div class="stars-container">
        {#each scalePoints as point}
          <button
            class="star-button"
            class:filled={value !== null && point <= value}
            onclick={() => handleStarClick(point)}
            {disabled}
            aria-label={`Rate ${point} out of ${question.config.max}`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              />
            </svg>
          </button>
        {/each}
      </div>

      {#if question.config.showValue && value !== null}
        <div class="stars-value">
          {value} / {question.config.max}
        </div>
      {/if}
    {:else if question.config.displayType === 'visual-analog'}
      <div class="visual-analog-container">
        <div class="va-track">
          <div
            class="va-fill"
            style="width: {value !== null ? getSliderPercentage(value) : 0}%"
          ></div>

          <input
            type="range"
            min={question.config.min}
            max={question.config.max}
            step={question.config.step}
            bind:value
            oninput={handleSliderInput}
            {disabled}
            class="va-slider"
          />
        </div>

        {#if question.config.showLabels}
          <div class="va-labels">
            <span class="va-label-min">{getLabel(question.config.min)}</span>
            <span class="va-label-max">{getLabel(question.config.max)}</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .scale-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.5rem 0;
  }

  .scale-container:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
    border-radius: 0.375rem;
  }

  /* Slider styles */
  .slider-container {
    position: relative;
    padding: 2rem 0;
  }

  .slider {
    width: 100%;
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    background: #3b82f6;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  }

  .slider:disabled::-webkit-slider-thumb {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .slider-labels {
    position: relative;
    height: 2rem;
    margin-top: 0.5rem;
  }

  .slider-label {
    position: absolute;
    transform: translateX(-50%);
    text-align: center;
  }

  .label-text {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .value-display {
    text-align: center;
    margin-top: 1rem;
  }

  .value-number {
    font-size: 1.5rem;
    font-weight: 600;
    color: #111827;
  }

  .value-description {
    display: block;
    font-size: 0.875rem;
    color: #6b7280;
    margin-top: 0.25rem;
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
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
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
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .scale-button.selected {
    border-color: #3b82f6;
    background: #3b82f6;
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
    opacity: 0.8;
  }

  .hover-description {
    text-align: center;
    font-size: 0.875rem;
    color: #6b7280;
    padding: 0.5rem;
    background: #f9fafb;
    border-radius: 0.375rem;
  }

  /* Star styles */
  .stars-container {
    display: flex;
    gap: 0.25rem;
  }

  .star-button {
    padding: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    color: #d1d5db;
  }

  .star-button:hover:not(:disabled) {
    transform: scale(1.1);
  }

  .star-button.filled {
    color: #fbbf24;
  }

  .star-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .star-button svg {
    width: 2rem;
    height: 2rem;
  }

  .stars-value {
    text-align: center;
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Visual analog scale */
  .visual-analog-container {
    padding: 1rem 0;
  }

  .va-track {
    position: relative;
    height: 2rem;
    background: #e5e7eb;
    border-radius: 1rem;
    overflow: hidden;
  }

  .va-fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: linear-gradient(to right, #dbeafe, #3b82f6);
    transition: width 0.2s;
  }

  .va-slider {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .va-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .buttons-container {
      gap: 0.375rem;
    }

    .scale-button {
      min-width: 2.5rem;
      padding: 0.5rem;
    }
  }
</style>
