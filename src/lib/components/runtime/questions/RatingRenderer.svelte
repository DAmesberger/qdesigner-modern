<script lang="ts">
  import type { RatingQuestion } from '$lib/shared/types/questionnaire';
  import QuestionHeader from '$lib/components/shared/questions/QuestionHeader.svelte';
  import NavigationButtons from '$lib/components/shared/questions/NavigationButtons.svelte';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  
  interface Props {
    question: RatingQuestion;
    value?: number;
    onChange?: (value: number | undefined) => void;
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
  
  let touched = $state(false);
  let hoverValue = $state<number | null>(null);
  
  let validation = $derived(
    showValidation && touched ? 
      QuestionValidator.validateQuestion(question) : 
      { valid: true, errors: [], warnings: [] }
  );
  
  let fieldErrors = $derived(
    validation.errors.filter(e => 
      !e.field.startsWith('response.') && !e.field.startsWith('display.')
    )
  );
  
  let displayValue = $derived(hoverValue !== null ? hoverValue : (value || 0));
  
  function handleRatingClick(rating: number) {
    if (disabled) return;
    
    touched = true;
    
    // Allow deselection by clicking the same rating
    if (value === rating) {
      value = undefined;
      onChange?.(undefined);
    } else {
      value = rating;
      onChange?.(rating);
      
      if (question.response.trackTiming) {
        // TODO: Track response time
      }
      
      // Auto-advance if configured
      if (question.navigation?.autoAdvance) {
        setTimeout(() => {
          onNext?.();
        }, question.navigation.advanceDelay || 300);
      }
    }
  }
  
  function handleHalfClick(rating: number, isFirstHalf: boolean) {
    if (!question.display.allowHalf || disabled) return;
    
    const halfValue = isFirstHalf ? rating - 0.5 : rating;
    handleRatingClick(halfValue);
  }
  
  function handleMouseEnter(rating: number) {
    if (!disabled) {
      hoverValue = rating;
    }
  }
  
  function handleMouseLeave() {
    hoverValue = null;
  }
  
  function handleNext() {
    touched = true;
    if (!question.required || value !== undefined) {
      onNext?.();
    }
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;
    
    const currentValue = value || 0;
    const step = question.display.allowHalf ? 0.5 : 1;
    
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        if (currentValue > step) {
          handleRatingClick(currentValue - step);
        }
        break;
        
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        if (currentValue < question.display.levels) {
          handleRatingClick(currentValue + step);
        }
        break;
        
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        event.preventDefault();
        const numKey = parseInt(event.key);
        if (numKey <= question.display.levels) {
          handleRatingClick(numKey);
        }
        break;
        
      case 'Enter':
        if (value !== undefined) {
          event.preventDefault();
          handleNext();
        }
        break;
    }
  }
  
  function getRatingIcon(style: string) {
    switch (style) {
      case 'stars':
        return '★';
      case 'hearts':
        return '♥';
      case 'thumbs':
        return '👍';
      default:
        return '';
    }
  }
  
  let ratingItems = $derived(Array.from({ length: question.display.levels }, (_, i) => i + 1));
</script>

<svelte:window on:keydown={handleKeyDown} />

<article class="rating-question">
  <QuestionHeader
    prompt={question.display.prompt}
    instruction={question.display.instruction}
    required={question.required}
  />
  
  <div 
    class="rating-container {question.display.style}"
    role="radiogroup"
    aria-label="Rating"
    onmouseleave={handleMouseLeave}
  >
    {#each ratingItems as rating}
      {@const isActive = displayValue >= rating}
      {@const isHalfActive = question.display.allowHalf && displayValue === rating - 0.5}
      
      <div class="rating-item-wrapper">
        {#if question.display.style === 'numeric'}
          <button
            type="button"
            class="rating-button numeric"
            class:active={value === rating}
            onclick={() => handleRatingClick(rating)}
            onmouseenter={() => handleMouseEnter(rating)}
            {disabled}
            aria-label={`Rate ${rating} out of ${question.display.levels}`}
          >
            {rating}
          </button>
        {:else}
          <button
            type="button"
            class="rating-button icon"
            class:active={isActive}
            class:half-active={isHalfActive}
            onclick={() => handleRatingClick(rating)}
            onmouseenter={() => handleMouseEnter(rating)}
            {disabled}
            aria-label={`Rate ${rating} out of ${question.display.levels}`}
          >
            {#if question.display.allowHalf}
              <span 
                class="half-click-area left"
                onclick|stopPropagation={() => handleHalfClick(rating, true)}
              ></span>
              <span 
                class="half-click-area right"
                onclick|stopPropagation={() => handleHalfClick(rating, false)}
              ></span>
            {/if}
            
            <span class="rating-icon" class:filled={isActive || isHalfActive}>
              {getRatingIcon(question.display.style)}
            </span>
          </button>
        {/if}
        
        {#if question.display.labels?.[rating - 1]}
          <span class="rating-label">{question.display.labels[rating - 1]}</span>
        {/if}
      </div>
    {/each}
  </div>
  
  {#if value !== undefined}
    <div class="current-value">
      Current rating: {value}{question.display.allowHalf && value % 1 !== 0 ? '' : '.0'} / {question.display.levels}
    </div>
  {/if}
  
  {#if showValidation && touched && !validation.valid}
    <ValidationMessage errors={fieldErrors} />
  {/if}
  
  <NavigationButtons
    config={question.navigation}
    canGoBack={!!onPrevious}
    canGoNext={!question.required || value !== undefined}
    {onPrevious}
    onNext={handleNext}
    {disabled}
  />
</article>

<style>
  .rating-question {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .rating-container {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    padding: 1rem 0;
  }
  
  .rating-item-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  
  .rating-button {
    position: relative;
    background: none;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
    padding: 0.5rem;
  }
  
  .rating-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  
  .rating-button:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
    border-radius: 0.25rem;
  }
  
  /* Numeric style */
  .rating-button.numeric {
    width: 3rem;
    height: 3rem;
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #6b7280;
    background-color: white;
  }
  
  .rating-button.numeric:hover:not(:disabled) {
    border-color: #3b82f6;
    color: #3b82f6;
    transform: scale(1.05);
  }
  
  .rating-button.numeric.active {
    background-color: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }
  
  /* Icon styles */
  .rating-button.icon {
    font-size: 2rem;
    line-height: 1;
  }
  
  .rating-icon {
    display: block;
    color: #d1d5db;
    transition: all 0.15s ease;
  }
  
  .rating-icon.filled {
    color: #fbbf24;
  }
  
  .rating-container.hearts .rating-icon.filled {
    color: #ef4444;
  }
  
  .rating-container.thumbs .rating-icon.filled {
    color: #10b981;
  }
  
  .rating-button.icon:hover:not(:disabled) .rating-icon {
    transform: scale(1.2);
  }
  
  .rating-button.icon:hover:not(:disabled) {
    filter: drop-shadow(0 0 8px currentColor);
  }
  
  /* Half rating click areas */
  .half-click-area {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 50%;
    z-index: 1;
  }
  
  .half-click-area.left {
    left: 0;
  }
  
  .half-click-area.right {
    right: 0;
  }
  
  .rating-button.half-active .rating-icon {
    background: linear-gradient(to right, #fbbf24 50%, #d1d5db 50%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  .rating-container.hearts .rating-button.half-active .rating-icon {
    background: linear-gradient(to right, #ef4444 50%, #d1d5db 50%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  .rating-label {
    font-size: 0.75rem;
    color: #6b7280;
    text-align: center;
    max-width: 4rem;
  }
  
  .current-value {
    text-align: center;
    font-size: 0.875rem;
    color: #6b7280;
  }
</style>