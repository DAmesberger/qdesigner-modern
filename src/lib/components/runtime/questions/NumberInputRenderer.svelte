<script lang="ts">
  import type { NumberInputQuestion } from '$lib/shared/types/questions-v2';
  import QuestionHeader from '$lib/components/shared/questions/QuestionHeader.svelte';
  import NavigationButtons from '$lib/components/shared/questions/NavigationButtons.svelte';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  
  interface Props {
    question: NumberInputQuestion;
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
  let inputValue = $state(value?.toString() || '');
  
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
  
  // Update input when value changes externally
  $effect(() => {
    if (value !== undefined && value !== null) {
      inputValue = value.toString();
    } else {
      inputValue = '';
    }
  });
  
  function handleInput(event: Event) {
    touched = true;
    const target = event.target as HTMLInputElement;
    inputValue = target.value;
    
    // Parse the number
    const numValue = parseFloat(target.value);
    
    if (target.value === '' || target.value === '-') {
      // Allow empty or just minus sign
      value = undefined;
      onChange?.(undefined);
    } else if (!isNaN(numValue)) {
      // Apply constraints
      let constrainedValue = numValue;
      
      if (question.display.min !== undefined && numValue < question.display.min) {
        constrainedValue = question.display.min;
      }
      if (question.display.max !== undefined && numValue > question.display.max) {
        constrainedValue = question.display.max;
      }
      
      // Apply decimal precision
      if (question.display.decimals !== undefined && question.display.decimals >= 0) {
        constrainedValue = Math.round(constrainedValue * Math.pow(10, question.display.decimals)) / Math.pow(10, question.display.decimals);
      }
      
      value = constrainedValue;
      onChange?.(constrainedValue);
      
      if (question.response.trackTiming) {
        // TODO: Track response time
      }
    }
  }
  
  function handleBlur() {
    // Format the number on blur
    if (value !== undefined) {
      if (question.display.decimals !== undefined && question.display.decimals >= 0) {
        inputValue = value.toFixed(question.display.decimals);
      } else {
        inputValue = value.toString();
      }
    }
  }
  
  function handleNext() {
    touched = true;
    if (!question.required || value !== undefined) {
      onNext?.();
    }
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;
    
    const step = question.display.step || 1;
    
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        incrementValue(step);
        break;
        
      case 'ArrowDown':
        event.preventDefault();
        incrementValue(-step);
        break;
        
      case 'Enter':
        if (!question.required || value !== undefined) {
          event.preventDefault();
          handleNext();
        }
        break;
    }
  }
  
  function incrementValue(delta: number) {
    const currentValue = value ?? 0;
    let newValue = currentValue + delta;
    
    // Apply constraints
    if (question.display.min !== undefined && newValue < question.display.min) {
      newValue = question.display.min;
    }
    if (question.display.max !== undefined && newValue > question.display.max) {
      newValue = question.display.max;
    }
    
    // Apply decimal precision
    if (question.display.decimals !== undefined && question.display.decimals >= 0) {
      newValue = Math.round(newValue * Math.pow(10, question.display.decimals)) / Math.pow(10, question.display.decimals);
      inputValue = newValue.toFixed(question.display.decimals);
    } else {
      inputValue = newValue.toString();
    }
    
    value = newValue;
    onChange?.(newValue);
    touched = true;
  }
  
  // Validation for current value
  let valueErrors = $derived(() => {
    if (!showValidation || !touched || value === undefined) return [];
    
    const errors: { field: string; message: string }[] = [];
    
    if (question.validation?.min !== undefined && value < question.validation.min) {
      errors.push({
        field: 'value',
        message: `Value must be at least ${question.validation.min}`
      });
    }
    
    if (question.validation?.max !== undefined && value > question.validation.max) {
      errors.push({
        field: 'value',
        message: `Value must be at most ${question.validation.max}`
      });
    }
    
    if (question.validation?.integer && !Number.isInteger(value)) {
      errors.push({
        field: 'value',
        message: 'Value must be a whole number'
      });
    }
    
    return errors.map(e => ({ ...e, severity: 'error' as const }));
  });
</script>

<article class="number-input-question">
  <QuestionHeader
    prompt={question.display.prompt}
    instruction={question.display.instruction}
    required={question.required}
  />
  
  <div class="input-container">
    <div class="input-wrapper">
      {#if question.display.prefix}
        <span class="input-addon prefix">{question.display.prefix}</span>
      {/if}
      
      <input
        type="number"
        bind:value={inputValue}
        placeholder={question.display.placeholder}
        min={question.display.min}
        max={question.display.max}
        step={question.display.step || 'any'}
        {disabled}
        oninput={handleInput}
        onblur={handleBlur}
        onkeydown={handleKeyDown}
        class="number-input"
        class:error={showValidation && touched && (!validation.valid || valueErrors.length > 0)}
        class:has-prefix={!!question.display.prefix}
        class:has-suffix={!!question.display.suffix}
      />
      
      {#if question.display.suffix}
        <span class="input-addon suffix">{question.display.suffix}</span>
      {/if}
    </div>
    
    {#if question.display.min !== undefined || question.display.max !== undefined}
      <div class="constraints">
        {#if question.display.min !== undefined && question.display.max !== undefined}
          <span>Range: {question.display.min} - {question.display.max}</span>
        {:else if question.display.min !== undefined}
          <span>Minimum: {question.display.min}</span>
        {:else if question.display.max !== undefined}
          <span>Maximum: {question.display.max}</span>
        {/if}
      </div>
    {/if}
  </div>
  
  {#if showValidation && touched && (!validation.valid || valueErrors.length > 0)}
    <ValidationMessage errors={[...fieldErrors, ...valueErrors]} />
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
  .number-input-question {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .input-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .input-wrapper {
    display: flex;
    align-items: stretch;
    width: 100%;
    max-width: 20rem;
  }
  
  .number-input {
    flex: 1;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    line-height: 1.5rem;
    color: #1f2937;
    background-color: white;
    border: 1px solid #d1d5db;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    font-family: inherit;
    -moz-appearance: textfield; /* Remove spinner in Firefox */
  }
  
  /* Remove spinner in Chrome, Safari, Edge */
  .number-input::-webkit-outer-spin-button,
  .number-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  
  .number-input.has-prefix {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  
  .number-input.has-suffix {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  
  .number-input:not(.has-prefix):not(.has-suffix) {
    border-radius: 0.375rem;
  }
  
  .number-input::placeholder {
    color: #9ca3af;
  }
  
  .number-input:hover:not(:disabled) {
    border-color: #9ca3af;
  }
  
  .number-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .number-input:disabled {
    background-color: #f9fafb;
    cursor: not-allowed;
    opacity: 0.75;
  }
  
  .number-input.error {
    border-color: #ef4444;
  }
  
  .number-input.error:focus {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
  }
  
  .input-addon {
    display: flex;
    align-items: center;
    padding: 0 1rem;
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    color: #6b7280;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
  }
  
  .input-addon.prefix {
    border-right: none;
    border-top-left-radius: 0.375rem;
    border-bottom-left-radius: 0.375rem;
  }
  
  .input-addon.suffix {
    border-left: none;
    border-top-right-radius: 0.375rem;
    border-bottom-right-radius: 0.375rem;
  }
  
  .constraints {
    font-size: 0.75rem;
    color: #6b7280;
  }
</style>