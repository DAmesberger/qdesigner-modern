<script lang="ts">
  import type { MultipleChoiceQuestion } from '$lib/shared/types/questions-v2';
  import QuestionHeader from '$lib/components/shared/questions/QuestionHeader.svelte';
  import OptionList from '$lib/components/shared/questions/OptionList.svelte';
  import NavigationButtons from '$lib/components/shared/questions/NavigationButtons.svelte';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  
  interface Props {
    question: MultipleChoiceQuestion;
    value?: string[];
    onChange?: (value: string[]) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    disabled?: boolean;
    showValidation?: boolean;
  }
  
  let {
    question,
    value = $bindable([]),
    onChange,
    onNext,
    onPrevious,
    disabled = false,
    showValidation = false
  }: Props = $props();
  
  let otherValue = $state('');
  let touched = $state(false);
  
  $: validation = showValidation && touched ? 
    QuestionValidator.validateQuestion(question) : 
    { valid: true, errors: [], warnings: [] };
  
  $: fieldErrors = validation.errors.filter(e => 
    !e.field.startsWith('response.') && !e.field.startsWith('display.')
  );
  
  $: selectionCount = value.length;
  $: minSelections = question.display.minSelections || 0;
  $: maxSelections = question.display.maxSelections || Infinity;
  
  $: canSelectMore = selectionCount < maxSelections;
  $: hasEnoughSelections = selectionCount >= minSelections;
  
  $: selectionMessage = (() => {
    if (minSelections && maxSelections && maxSelections !== Infinity) {
      if (minSelections === maxSelections) {
        return `Select exactly ${minSelections} option${minSelections > 1 ? 's' : ''}`;
      }
      return `Select ${minSelections} to ${maxSelections} options`;
    } else if (minSelections) {
      return `Select at least ${minSelections} option${minSelections > 1 ? 's' : ''}`;
    } else if (maxSelections && maxSelections !== Infinity) {
      return `Select up to ${maxSelections} option${maxSelections > 1 ? 's' : ''}`;
    }
    return null;
  })();
  
  function handleChange(newValue: string | string[]) {
    touched = true;
    const arrayValue = Array.isArray(newValue) ? newValue : [newValue];
    
    // Enforce max selections
    if (arrayValue.length > maxSelections) {
      return;
    }
    
    value = arrayValue;
    
    if (question.response.trackChanges) {
      // TODO: Track change event
    }
    
    onChange?.(arrayValue);
    
    // Auto-advance when reaching max selections
    if (question.navigation?.autoAdvance && arrayValue.length === maxSelections) {
      setTimeout(() => {
        onNext?.();
      }, question.navigation.advanceDelay || 500);
    }
  }
  
  function handleOtherChange(newValue: string) {
    otherValue = newValue;
    if (question.response.saveOtherAs) {
      // TODO: Save other value to variable
    }
  }
  
  function handleNext() {
    touched = true;
    if (!question.required || hasEnoughSelections) {
      onNext?.();
    }
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;
    
    // Check for option hotkeys
    const options = question.display.options;
    const option = options.find(o => 
      o.hotkey?.toLowerCase() === event.key.toLowerCase()
    );
    
    if (option) {
      event.preventDefault();
      const optionValue = String(option.value);
      const currentIndex = value.indexOf(optionValue);
      
      if (currentIndex > -1) {
        // Deselect
        handleChange(value.filter(v => v !== optionValue));
      } else if (canSelectMore) {
        // Select
        handleChange([...value, optionValue]);
      }
    }
    
    // Submit on Enter if valid
    if (event.key === 'Enter' && hasEnoughSelections) {
      event.preventDefault();
      handleNext();
    }
  }
  
  // Handle select all option
  function handleSelectAll() {
    if (value.length === question.display.options.length) {
      // Deselect all
      handleChange([]);
    } else {
      // Select all non-exclusive options
      const allValues = question.display.options
        .filter(o => !o.exclusive)
        .map(o => String(o.value));
      handleChange(allValues);
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<article class="multiple-choice-question">
  <QuestionHeader
    prompt={question.display.prompt}
    instruction={question.display.instruction || selectionMessage}
    required={question.required}
  />
  
  <div class="selection-info">
    <span class="selection-count">
      {selectionCount} selected
      {#if !hasEnoughSelections}
        <span class="error-text">(need {minSelections - selectionCount} more)</span>
      {:else if !canSelectMore}
        <span class="warning-text">(maximum reached)</span>
      {/if}
    </span>
    
    {#if question.display.selectAllOption}
      <button
        type="button"
        class="select-all-button"
        onclick={handleSelectAll}
        {disabled}
      >
        {value.length === question.display.options.length ? 'Deselect All' : 'Select All'}
      </button>
    {/if}
  </div>
  
  <div class="options-container">
    <OptionList
      options={question.display.options}
      bind:value
      layout={question.display.layout}
      columns={question.display.columns}
      multiselect={true}
      disabled={disabled || (!canSelectMore && !value.length)}
      onChange={handleChange}
      showOther={question.display.showOther}
      bind:otherValue
      onOtherChange={handleOtherChange}
    />
  </div>
  
  {#if showValidation && touched && !validation.valid}
    <ValidationMessage errors={fieldErrors} />
  {/if}
  
  <NavigationButtons
    config={question.navigation}
    canGoBack={!!onPrevious}
    canGoNext={!question.required || hasEnoughSelections}
    {onPrevious}
    onNext={handleNext}
    {disabled}
  />
</article>

<style>
  .multiple-choice-question {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .selection-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0;
    font-size: 0.875rem;
    color: #6b7280;
  }
  
  .selection-count {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .error-text {
    color: #ef4444;
    font-weight: 500;
  }
  
  .warning-text {
    color: #f59e0b;
    font-weight: 500;
  }
  
  .select-all-button {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: #3b82f6;
    background: transparent;
    border: 1px solid #3b82f6;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .select-all-button:hover:not(:disabled) {
    background-color: #eff6ff;
  }
  
  .select-all-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .options-container {
    /* Optimize for performance */
    will-change: transform;
    contain: layout style paint;
  }
</style>