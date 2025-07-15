<script lang="ts">
  import type { DateTimeQuestion } from '$lib/shared/types/questionnaire';
  import QuestionHeader from '$lib/components/shared/questions/QuestionHeader.svelte';
  import NavigationButtons from '$lib/components/shared/questions/NavigationButtons.svelte';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  
  interface Props {
    question: DateTimeQuestion;
    value?: string;
    onChange?: (value: string) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    disabled?: boolean;
    showValidation?: boolean;
  }
  
  let {
    question,
    value = $bindable(''),
    onChange,
    onNext,
    onPrevious,
    disabled = false,
    showValidation = false
  }: Props = $props();
  
  let touched = $state(false);
  let showCalendar = $state(false);
  
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
  
  // Compute input type based on mode
  let inputType = $derived(() => {
    switch (question.display.mode) {
      case 'date':
        return 'date';
      case 'time':
        return 'time';
      case 'datetime':
        return 'datetime-local';
      default:
        return 'date';
    }
  });
  
  // Format value for display
  let displayValue = $derived(() => {
    if (!value) return '';
    
    if (question.display.format) {
      // TODO: Apply custom format
      return value;
    }
    
    return value;
  });
  
  function handleInput(event: Event) {
    touched = true;
    const target = event.target as HTMLInputElement;
    value = target.value;
    
    if (question.response.trackChanges) {
      // TODO: Track change event
    }
    
    onChange?.(value);
  }
  
  function handleNext() {
    touched = true;
    if (!question.required || value) {
      onNext?.();
    }
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;
    
    if (event.key === 'Enter') {
      event.preventDefault();
      handleNext();
    }
  }
  
  // Get today's date for default min/max
  let today = $derived(new Date().toISOString().split('T')[0]);
</script>

<article class="datetime-question">
  <QuestionHeader
    prompt={question.display.prompt}
    instruction={question.display.instruction}
    required={question.required}
  />
  
  <div class="input-container">
    <input
      type={inputType()}
      bind:value
      min={question.display.minDate}
      max={question.display.maxDate}
      {disabled}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      class="datetime-input"
      class:error={showValidation && touched && !validation.valid}
    />
    
    {#if question.display.showCalendar && question.display.mode === 'date'}
      <button
        type="button"
        class="calendar-button"
        onclick={() => showCalendar = !showCalendar}
        {disabled}
        aria-label="Toggle calendar"
      >
        📅
      </button>
    {/if}
  </div>
  
  {#if question.display.minDate || question.display.maxDate}
    <div class="constraints">
      {#if question.display.minDate && question.display.maxDate}
        <span>Between {question.display.minDate} and {question.display.maxDate}</span>
      {:else if question.display.minDate}
        <span>After {question.display.minDate}</span>
      {:else if question.display.maxDate}
        <span>Before {question.display.maxDate}</span>
      {/if}
    </div>
  {/if}
  
  {#if showValidation && touched && !validation.valid}
    <ValidationMessage errors={fieldErrors} />
  {/if}
  
  <NavigationButtons
    config={question.navigation}
    canGoBack={!!onPrevious}
    canGoNext={!question.required || !!value}
    {onPrevious}
    onNext={handleNext}
    {disabled}
  />
</article>

<style>
  .datetime-question {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .input-container {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    max-width: 24rem;
  }
  
  .datetime-input {
    flex: 1;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    line-height: 1.5rem;
    color: #1f2937;
    background-color: white;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    font-family: inherit;
  }
  
  .datetime-input:hover:not(:disabled) {
    border-color: #9ca3af;
  }
  
  .datetime-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .datetime-input:disabled {
    background-color: #f9fafb;
    cursor: not-allowed;
    opacity: 0.75;
  }
  
  .datetime-input.error {
    border-color: #ef4444;
  }
  
  .datetime-input.error:focus {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
  }
  
  /* Style the native date/time inputs */
  .datetime-input::-webkit-calendar-picker-indicator {
    cursor: pointer;
    padding: 0.25rem;
  }
  
  .datetime-input::-webkit-datetime-edit {
    padding: 0;
  }
  
  .datetime-input::-webkit-datetime-edit-fields-wrapper {
    padding: 0;
  }
  
  .calendar-button {
    padding: 0 1rem;
    font-size: 1.25rem;
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .calendar-button:hover:not(:disabled) {
    background-color: #e5e7eb;
  }
  
  .calendar-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .constraints {
    font-size: 0.75rem;
    color: #6b7280;
  }
</style>