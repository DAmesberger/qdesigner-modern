<script lang="ts">
  import type { TextInputQuestion } from '$lib/shared/types/questionnaire';
  import QuestionHeader from '$lib/components/shared/questions/QuestionHeader.svelte';
  import NavigationButtons from '$lib/components/shared/questions/NavigationButtons.svelte';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  
  interface Props {
    question: TextInputQuestion;
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
  let focused = $state(false);
  let typingStartTime: number | null = null;
  let keystrokes = 0;
  
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
  
  let charCount = $derived(value.length);
  let maxLength = $derived(question.display.maxLength);
  let showCharCount = $derived(question.display.showCharCount && (maxLength || focused));
  
  function transformValue(val: string): string {
    switch (question.response.transform) {
      case 'lowercase':
        return val.toLowerCase();
      case 'uppercase':
        return val.toUpperCase();
      case 'trim':
        return val.trim();
      default:
        return val;
    }
  }
  
  function handleInput(event: Event) {
    touched = true;
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    let newValue = target.value;
    
    // Apply max length constraint
    if (maxLength && newValue.length > maxLength) {
      newValue = newValue.slice(0, maxLength);
      target.value = newValue;
    }
    
    value = newValue;
    
    // Track typing metrics
    if (question.response.saveMetadata) {
      if (!typingStartTime && newValue) {
        typingStartTime = performance.now();
      }
      keystrokes++;
    }
    
    if (question.response.trackChanges) {
      // TODO: Track change event
    }
    
    onChange?.(transformValue(newValue));
  }
  
  function handleBlur() {
    focused = false;
    
    // Apply final transformation
    if (question.response.transform === 'trim') {
      value = value.trim();
      onChange?.(value);
    }
    
    // Save typing metadata
    if (question.response.saveMetadata && typingStartTime) {
      const typingDuration = performance.now() - typingStartTime;
      // TODO: Save metadata
      // - Total typing time
      // - Character count
      // - Keystroke count
      // - Words per minute
    }
  }
  
  function handleNext() {
    touched = true;
    const finalValue = transformValue(value);
    
    if (!question.required || finalValue) {
      if (value !== finalValue) {
        value = finalValue;
        onChange?.(finalValue);
      }
      onNext?.();
    }
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;
    
    // Submit on Enter for single-line inputs
    if (event.key === 'Enter' && !question.display.multiline) {
      event.preventDefault();
      handleNext();
    }
    
    // Submit on Ctrl/Cmd+Enter for multiline
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && question.display.multiline) {
      event.preventDefault();
      handleNext();
    }
  }
</script>

<article class="text-input-question">
  <QuestionHeader
    prompt={question.display.prompt}
    instruction={question.display.instruction}
    required={question.required}
  />
  
  <div class="input-container">
    {#if question.display.multiline}
      <textarea
        bind:value
        placeholder={question.display.placeholder}
        rows={question.display.rows || 4}
        maxlength={maxLength}
        {disabled}
        oninput={handleInput}
        onfocus={() => focused = true}
        onblur={handleBlur}
        onkeydown={handleKeyDown}
        class="text-input multiline"
        class:error={showValidation && touched && !validation.valid}
      />
    {:else}
      <input
        type="text"
        bind:value
        placeholder={question.display.placeholder}
        maxlength={maxLength}
        {disabled}
        oninput={handleInput}
        onfocus={() => focused = true}
        onblur={handleBlur}
        onkeydown={handleKeyDown}
        class="text-input"
        class:error={showValidation && touched && !validation.valid}
      />
    {/if}
    
    {#if showCharCount}
      <div class="char-count" class:warning={maxLength && charCount > maxLength * 0.9}>
        {charCount}{maxLength ? `/${maxLength}` : ''} characters
      </div>
    {/if}
  </div>
  
  {#if showValidation && touched && !validation.valid}
    <ValidationMessage errors={fieldErrors} />
  {/if}
  
  <NavigationButtons
    config={question.navigation}
    canGoBack={!!onPrevious}
    canGoNext={!question.required || !!transformValue(value)}
    {onPrevious}
    onNext={handleNext}
    {disabled}
  />
</article>

<style>
  .text-input-question {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .input-container {
    position: relative;
  }
  
  .text-input {
    width: 100%;
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
  
  .text-input::placeholder {
    color: #9ca3af;
  }
  
  .text-input:hover:not(:disabled) {
    border-color: #9ca3af;
  }
  
  .text-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .text-input:disabled {
    background-color: #f9fafb;
    cursor: not-allowed;
    opacity: 0.75;
  }
  
  .text-input.error {
    border-color: #ef4444;
  }
  
  .text-input.error:focus {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
  }
  
  .text-input.multiline {
    resize: vertical;
    min-height: 6rem;
    max-height: 20rem;
  }
  
  .char-count {
    position: absolute;
    right: 0;
    bottom: -1.5rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .char-count.warning {
    color: #f59e0b;
  }
</style>