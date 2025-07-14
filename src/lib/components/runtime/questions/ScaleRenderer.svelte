<script lang="ts">
  import type { ScaleQuestion } from '$lib/shared/types/questions-v2';
  import QuestionHeader from '$lib/components/shared/questions/QuestionHeader.svelte';
  import ScaleInput from '$lib/components/shared/questions/ScaleInput.svelte';
  import NavigationButtons from '$lib/components/shared/questions/NavigationButtons.svelte';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  
  interface Props {
    question: ScaleQuestion;
    value?: number;
    onChange?: (value: number) => void;
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
  
  function handleChange(newValue: number) {
    touched = true;
    value = newValue;
    
    if (question.response.trackChanges) {
      // TODO: Track change event
    }
    
    if (question.response.savePositionAs) {
      // TODO: Save position as percentage
      const percentage = ((newValue - question.display.min) / 
        (question.display.max - question.display.min)) * 100;
    }
    
    onChange?.(newValue);
    
    if (question.navigation?.autoAdvance) {
      setTimeout(() => {
        onNext?.();
      }, question.navigation.advanceDelay || 300);
    }
  }
  
  function handleNext() {
    touched = true;
    if (!question.required || value !== undefined) {
      onNext?.();
    }
  }
  
  // Keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;
    
    const step = question.display.step || 1;
    const currentValue = value ?? question.display.min;
    
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        if (currentValue > question.display.min) {
          handleChange(Math.max(question.display.min, currentValue - step));
        }
        break;
        
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        if (currentValue < question.display.max) {
          handleChange(Math.min(question.display.max, currentValue + step));
        }
        break;
        
      case 'Home':
        event.preventDefault();
        handleChange(question.display.min);
        break;
        
      case 'End':
        event.preventDefault();
        handleChange(question.display.max);
        break;
        
      case 'Enter':
        if (value !== undefined) {
          event.preventDefault();
          handleNext();
        }
        break;
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<article class="scale-question">
  <QuestionHeader
    prompt={question.display.prompt}
    instruction={question.display.instruction}
    required={question.required}
  />
  
  <div class="scale-container">
    <ScaleInput
      config={question.display}
      bind:value
      {disabled}
      onChange={handleChange}
    />
  </div>
  
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
  .scale-question {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .scale-container {
    padding: 1rem 0;
    /* Optimize for performance */
    will-change: transform;
    contain: layout style paint;
  }
</style>