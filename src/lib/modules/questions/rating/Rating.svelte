<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { AnswerTypes } from '../shared/answerTypes';

  type RatingStyle = 'stars' | 'hearts' | 'thumbs' | 'numeric';

  interface RatingConfig {
    levels: number;
    style: RatingStyle;
    allowHalf?: boolean;
    showValue?: boolean;
    labels?: string[];
  }

  interface Props extends QuestionProps {
    question: Question & { config: RatingConfig };
  }

  let {
    question,
    mode = 'runtime',
    value = $bindable<number | null>(null),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  let hoverValue = $state<number | null>(null);
  let containerElement = $state<HTMLDivElement>();

  const levels = $derived(question.config.levels || 5);
  const allowHalf = $derived(question.config.allowHalf ?? false);
  const style = $derived(question.config.style || 'stars');
  const showValue = $derived(question.config.showValue ?? true);

  // The display value: hover takes precedence over selected value
  const displayValue = $derived(hoverValue ?? value);

  // Get label for current value
  const currentLabel = $derived.by(() => {
    if (!question.config.labels || !question.config.labels.length) return '';
    if (displayValue === null) return '';
    const index = Math.ceil(displayValue) - 1;
    return question.config.labels[index] ?? '';
  });

  // Set answer type
  $effect(() => {
    if ('answerType' in question) {
      (question as any).answerType = AnswerTypes.LIKERT_SCALE;
    }
  });

  function getRatingFromEvent(event: MouseEvent, index: number): number {
    if (!allowHalf) return index + 1;

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const isLeftHalf = x < rect.width / 2;

    return isLeftHalf ? index + 0.5 : index + 1;
  }

  function handleClick(event: MouseEvent, index: number) {
    if (disabled) return;

    const rating = getRatingFromEvent(event, index);

    // Toggle off if clicking the same value
    if (value === rating) {
      value = null;
      onResponse?.(null);
    } else {
      value = rating;
      onResponse?.(rating);
    }

    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { value, style },
    });
  }

  function handleMouseMove(event: MouseEvent, index: number) {
    if (disabled) return;
    hoverValue = getRatingFromEvent(event, index);
  }

  function handleMouseLeave() {
    hoverValue = null;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;

    const step = allowHalf ? 0.5 : 1;
    let newValue = value ?? 0;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        newValue = Math.min(levels, newValue + step);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        newValue = Math.max(allowHalf ? 0.5 : 1, newValue - step);
        break;
      case 'Home':
        event.preventDefault();
        newValue = allowHalf ? 0.5 : 1;
        break;
      case 'End':
        event.preventDefault();
        newValue = levels;
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        value = null;
        onResponse?.(null);
        return;
      default:
        // Number keys 1-9
        if (event.key >= '1' && event.key <= '9') {
          const num = parseInt(event.key);
          if (num <= levels) {
            newValue = num;
          }
        } else {
          return;
        }
    }

    value = newValue;
    onResponse?.(newValue);
    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { value: newValue, type: 'keyboard' },
    });
  }

  /**
   * Get the fill state for each rating item.
   * Returns 'full', 'half', or 'empty'.
   */
  function getFillState(index: number): 'full' | 'half' | 'empty' {
    const val = displayValue;
    if (val === null) return 'empty';

    const itemValue = index + 1;
    if (val >= itemValue) return 'full';
    if (allowHalf && val >= itemValue - 0.5) return 'half';
    return 'empty';
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
  <div
    bind:this={containerElement}
    class="rating-container style-{style}"
    onkeydown={handleKeyDown}
    onmouseleave={handleMouseLeave}
    tabindex="0"
    role="slider"
    aria-valuemin={allowHalf ? 0.5 : 1}
    aria-valuemax={levels}
    aria-valuenow={value ?? undefined}
    aria-valuetext={value !== null ? `${value} out of ${levels}` : 'No rating selected'}
    aria-label="Rating"
  >
    <div class="rating-items">
      {#each Array(levels) as _, index}
        {@const fill = getFillState(index)}
        <button
          type="button"
          class="rating-item"
          class:full={fill === 'full'}
          class:half={fill === 'half'}
          class:empty={fill === 'empty'}
          {disabled}
          onclick={(e) => handleClick(e, index)}
          onmousemove={(e) => handleMouseMove(e, index)}
          aria-label={`Rate ${index + 1} out of ${levels}`}
          tabindex={-1}
        >
          {#if style === 'stars'}
            <svg class="rating-icon" viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id="star-half-{question.id}-{index}">
                  <stop offset="50%" stop-color="currentColor" />
                  <stop offset="50%" stop-color="transparent" />
                </linearGradient>
              </defs>
              {#if fill === 'half'}
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill="url(#star-half-{question.id}-{index})"
                  stroke="currentColor"
                  stroke-width="1"
                />
              {:else}
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill={fill === 'full' ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  stroke-width="1"
                />
              {/if}
            </svg>
          {:else if style === 'hearts'}
            <svg class="rating-icon" viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id="heart-half-{question.id}-{index}">
                  <stop offset="50%" stop-color="currentColor" />
                  <stop offset="50%" stop-color="transparent" />
                </linearGradient>
              </defs>
              {#if fill === 'half'}
                <path
                  d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  fill="url(#heart-half-{question.id}-{index})"
                  stroke="currentColor"
                  stroke-width="1"
                />
              {:else}
                <path
                  d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  fill={fill === 'full' ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  stroke-width="1"
                />
              {/if}
            </svg>
          {:else if style === 'thumbs'}
            <svg class="rating-icon" viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id="thumb-half-{question.id}-{index}">
                  <stop offset="50%" stop-color="currentColor" />
                  <stop offset="50%" stop-color="transparent" />
                </linearGradient>
              </defs>
              {#if fill === 'half'}
                <path
                  d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
                  fill="url(#thumb-half-{question.id}-{index})"
                  stroke="currentColor"
                  stroke-width="1"
                />
              {:else}
                <path
                  d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
                  fill={fill === 'full' ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  stroke-width="1"
                />
              {/if}
            </svg>
          {:else}
            <!-- numeric style -->
            <span class="rating-number">{index + 1}</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if showValue || currentLabel}
      <div class="rating-footer">
        {#if showValue && displayValue !== null}
          <span class="rating-value">{displayValue} / {levels}</span>
        {/if}
        {#if currentLabel}
          <span class="rating-label">{currentLabel}</span>
        {/if}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .rating-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem 0;
  }

  .rating-container:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 4px;
    border-radius: 0.375rem;
  }

  .rating-items {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .rating-item {
    padding: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    transition: transform 0.15s ease, color 0.15s ease;
    line-height: 1;
  }

  .rating-item:hover:not(:disabled) {
    transform: scale(1.15);
  }

  .rating-item:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* Star colors */
  .style-stars .rating-item {
    color: #d1d5db;
  }

  .style-stars .rating-item.full,
  .style-stars .rating-item.half {
    color: #fbbf24;
  }

  /* Heart colors */
  .style-hearts .rating-item {
    color: #d1d5db;
  }

  .style-hearts .rating-item.full,
  .style-hearts .rating-item.half {
    color: #ef4444;
  }

  /* Thumbs colors */
  .style-thumbs .rating-item {
    color: #d1d5db;
  }

  .style-thumbs .rating-item.full,
  .style-thumbs .rating-item.half {
    color: #3b82f6;
  }

  /* Numeric style */
  .style-numeric .rating-item {
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
    background: white;
    transition: all 0.15s;
  }

  .style-numeric .rating-item:hover:not(:disabled) {
    transform: none;
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .style-numeric .rating-item.full {
    border-color: #3b82f6;
    background: #3b82f6;
    color: white;
  }

  .style-numeric .rating-item.half {
    border-color: #3b82f6;
    background: linear-gradient(90deg, #3b82f6 50%, white 50%);
    color: #1e40af;
  }

  .rating-number {
    font-size: 1rem;
    font-weight: 600;
  }

  /* Icon sizing */
  .rating-icon {
    width: 2rem;
    height: 2rem;
  }

  /* Footer */
  .rating-footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 1.25rem;
  }

  .rating-value {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }

  .rating-label {
    font-size: 0.875rem;
    color: #374151;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .rating-icon {
      width: 1.75rem;
      height: 1.75rem;
    }

    .style-numeric .rating-item {
      width: 2.25rem;
      height: 2.25rem;
    }

    .rating-number {
      font-size: 0.875rem;
    }
  }
</style>
