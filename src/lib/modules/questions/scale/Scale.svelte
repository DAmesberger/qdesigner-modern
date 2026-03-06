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

  let sliderElement = $state<HTMLInputElement>();
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
    class="scale-container flex flex-col gap-4 py-2 display-{question.config.displayType} orientation-{question.config
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
      <div class="relative py-8">
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
          <div class="relative h-8 mt-2">
            {#each scalePoints as point}
              {@const label = question.config.labels?.find((l) => l.value === point)}
              {#if label || point === question.config.min || point === question.config.max}
                <div class="absolute -translate-x-1/2 text-center" style="left: {getSliderPercentage(point)}%">
                  <span class="text-xs text-muted-foreground">{getLabel(point)}</span>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        {#if question.config.showValue && value !== null}
          {@const desc = getDescription(value)}
          <div class="text-center mt-4">
            <span class="text-2xl font-semibold text-foreground">{value}</span>
            {#if desc}
              <span class="block text-sm text-muted-foreground mt-1">{desc}</span>
            {/if}
          </div>
        {/if}
      </div>
    {:else if question.config.displayType === 'buttons'}
      <div class="buttons-container flex gap-2 flex-wrap max-sm:gap-1.5">
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
            <span class="text-lg font-semibold">{point}</span>
            {#if question.config.showLabels}
              {@const label = getLabel(point)}
              {#if label !== point.toString()}
                <span class="text-xs opacity-80">{label}</span>
              {/if}
            {/if}
          </button>
        {/each}
      </div>

      {#if hoverValue !== null && getDescription(hoverValue)}
        <div class="text-center text-sm text-muted-foreground p-2 bg-muted rounded-md">
          {getDescription(hoverValue)}
        </div>
      {/if}
    {:else if question.config.displayType === 'stars'}
      <div class="flex gap-1">
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
        <div class="text-center text-sm text-muted-foreground">
          {value} / {question.config.max}
        </div>
      {/if}
    {:else if question.config.displayType === 'visual-analog'}
      <div class="py-4">
        <div class="va-track relative h-8 bg-border rounded-2xl overflow-hidden">
          <div
            class="absolute left-0 top-0 h-full bg-gradient-to-r from-primary/15 to-primary transition-[width] duration-200"
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
            class="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {#if question.config.showLabels}
          <div class="flex justify-between mt-2 text-sm text-muted-foreground">
            <span>{getLabel(question.config.min)}</span>
            <span>{getLabel(question.config.max)}</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .scale-container:focus {
    outline: 2px solid hsl(var(--primary));
    outline-offset: 2px;
    border-radius: 0.375rem;
  }

  /* Slider — ::-webkit-slider-thumb pseudo-element */
  .slider {
    width: 100%;
    height: 6px;
    background: hsl(var(--border));
    border-radius: 3px;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    background: hsl(var(--primary));
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px hsl(var(--foreground) / 0.1);
    transition: all 0.2s;
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 8px hsl(var(--primary) / 0.3);
  }

  .slider:disabled::-webkit-slider-thumb {
    background: hsl(var(--muted-foreground));
    cursor: not-allowed;
  }

  .orientation-vertical .buttons-container {
    flex-direction: column;
  }

  /* Scale button — .selected, :hover, :disabled */
  .scale-button {
    flex: 1;
    min-width: 3rem;
    padding: 0.75rem;
    border: 2px solid hsl(var(--border));
    background: hsl(var(--background));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .scale-button:hover:not(:disabled) {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.05);
  }

  .scale-button.selected {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary));
    color: hsl(var(--background));
  }

  .scale-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Star button — .filled, :hover, :disabled */
  .star-button {
    padding: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    color: hsl(var(--border));
  }

  .star-button:hover:not(:disabled) {
    transform: scale(1.1);
  }

  .star-button.filled {
    color: hsl(var(--warning, 45 93% 47%));
  }

  .star-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .star-button svg {
    width: 2rem;
    height: 2rem;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .scale-button {
      min-width: 2.5rem;
      padding: 0.5rem;
    }
  }
</style>
