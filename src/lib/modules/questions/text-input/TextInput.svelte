<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { AnswerTypes } from '../shared/answerTypes';
  
  interface TextInputConfig {
    inputType: 'text' | 'number' | 'email' | 'tel' | 'url' | 'password';
    placeholder?: string;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    multiline?: boolean;
    rows?: number;
    autoResize?: boolean;
    suggestions?: string[];
    spellCheck?: boolean;
    min?: number; // for number type
    max?: number; // for number type
    step?: number; // for number type
  }
  
  interface Props extends QuestionProps {
    question: Question & { config: TextInputConfig };
  }
  
  let {
    question,
    mode = 'runtime',
    value = $bindable(''),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction
  }: Props = $props();
  
  let inputElement: HTMLInputElement | HTMLTextAreaElement;
  let showSuggestions = $state(false);
  let selectedSuggestionIndex = $state(-1);
  let validationMessage = $state('');
  
  // Filter suggestions based on current input
  const filteredSuggestions = $derived(
    question.config.suggestions
      ?.filter(s => s.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 5) || []
  );
  
  // Validation
  $effect(() => {
    validateInput(value);
  });
  
  // Set answer type
  $effect(() => {
    if (question.answerType) {
      question.answerType = question.config.inputType === 'number' ? AnswerTypes.NUMBER : AnswerTypes.TEXT;
    }
  });
  
  function validateInput(val: string) {
    validationMessage = '';
    
    if (question.config.minLength && val.length < question.config.minLength) {
      validationMessage = `Minimum ${question.config.minLength} characters required`;
    } else if (question.config.maxLength && val.length > question.config.maxLength) {
      validationMessage = `Maximum ${question.config.maxLength} characters allowed`;
    } else if (question.config.pattern) {
      const regex = new RegExp(question.config.pattern);
      if (!regex.test(val)) {
        validationMessage = 'Invalid format';
      }
    }
    
    // Type-specific validation
    if (question.config.inputType === 'email' && val) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(val)) {
        validationMessage = 'Please enter a valid email address';
      }
    } else if (question.config.inputType === 'url' && val) {
      try {
        new URL(val);
      } catch {
        validationMessage = 'Please enter a valid URL';
      }
    } else if (question.config.inputType === 'tel' && val) {
      const telRegex = /^[\d\s\-\+\(\)]+$/;
      if (!telRegex.test(val)) {
        validationMessage = 'Please enter a valid phone number';
      }
    }
    
    // Notify validation status
    onValidation?.({
      valid: !validationMessage,
      errors: validationMessage ? [validationMessage] : []
    });
  }
  
  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    value = target.value;
    
    if (question.config.autoResize && target instanceof HTMLTextAreaElement) {
      target.style.height = 'auto';
      target.style.height = target.scrollHeight + 'px';
    }
    
    showSuggestions = filteredSuggestions.length > 0 && value.length > 0;
    
    onResponse?.(value);
    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { value, inputType: question.config.inputType }
    });
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (!showSuggestions) return;
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedSuggestionIndex = Math.min(
          selectedSuggestionIndex + 1,
          filteredSuggestions.length - 1
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        break;
      case 'Enter':
        if (selectedSuggestionIndex >= 0) {
          event.preventDefault();
          selectSuggestion(filteredSuggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        showSuggestions = false;
        selectedSuggestionIndex = -1;
        break;
    }
  }
  
  function selectSuggestion(suggestion: string) {
    value = suggestion;
    showSuggestions = false;
    selectedSuggestionIndex = -1;
    inputElement?.focus();
    onResponse?.(value);
  }
  
  function handleBlur() {
    // Delay to allow clicking on suggestions
    setTimeout(() => {
      showSuggestions = false;
      selectedSuggestionIndex = -1;
    }, 200);
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
  showValidation={!!validationMessage}
>
  <div class="input-container">
    {#if question.config.multiline}
      <textarea
        bind:this={inputElement}
        bind:value
        placeholder={question.config.placeholder}
        rows={question.config.rows || 4}
        maxlength={question.config.maxLength}
        spellcheck={question.config.spellCheck !== false}
        {disabled}
        on:input={handleInput}
        on:keydown={handleKeyDown}
        on:blur={handleBlur}
        class="text-input textarea"
        class:resizable={question.config.autoResize}
      ></textarea>
    {:else}
      <input
        bind:this={inputElement}
        type={question.config.inputType}
        bind:value
        placeholder={question.config.placeholder}
        maxlength={question.config.maxLength}
        min={question.config.inputType === 'number' ? question.config.min : undefined}
        max={question.config.inputType === 'number' ? question.config.max : undefined}
        step={question.config.inputType === 'number' ? question.config.step : undefined}
        pattern={question.config.pattern}
        autocomplete="off"
        spellcheck={question.config.spellCheck !== false}
        {disabled}
        on:input={handleInput}
        on:keydown={handleKeyDown}
        on:blur={handleBlur}
        class="text-input"
      />
    {/if}
    
    {#if question.config.maxLength}
      <div class="char-counter" class:warning={value.length > question.config.maxLength * 0.9}>
        {value.length} / {question.config.maxLength}
      </div>
    {/if}
    
    {#if showSuggestions && filteredSuggestions.length > 0}
      <div class="suggestions-dropdown">
        {#each filteredSuggestions as suggestion, index}
          <button
            class="suggestion-item"
            class:selected={index === selectedSuggestionIndex}
            on:click={() => selectSuggestion(suggestion)}
            on:mouseenter={() => selectedSuggestionIndex = index}
          >
            {suggestion}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .input-container {
    position: relative;
    width: 100%;
  }
  
  .text-input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-family: inherit;
    background: white;
    transition: all 0.2s;
  }
  
  .text-input:hover:not(:disabled) {
    border-color: #d1d5db;
  }
  
  .text-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .text-input:disabled {
    background: #f9fafb;
    color: #9ca3af;
    cursor: not-allowed;
  }
  
  .text-input::placeholder {
    color: #9ca3af;
  }
  
  /* Number input specific */
  input[type="number"] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  
  /* Textarea specific */
  .textarea {
    min-height: 4rem;
    resize: vertical;
  }
  
  .textarea.resizable {
    resize: none;
    overflow: hidden;
  }
  
  /* Character counter */
  .char-counter {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    font-size: 0.75rem;
    color: #6b7280;
    background: white;
    padding: 0 0.25rem;
    pointer-events: none;
  }
  
  .char-counter.warning {
    color: #f97316;
    font-weight: 500;
  }
  
  /* Suggestions dropdown */
  .suggestions-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
  }
  
  .suggestion-item {
    display: block;
    width: 100%;
    padding: 0.75rem 1rem;
    text-align: left;
    border: none;
    background: none;
    cursor: pointer;
    transition: background 0.1s;
    font-size: 0.875rem;
  }
  
  .suggestion-item:hover,
  .suggestion-item.selected {
    background: #f3f4f6;
  }
  
  .suggestion-item.selected {
    background: #eff6ff;
    color: #1e40af;
  }
  
  /* Type-specific styles */
  input[type="email"],
  input[type="url"],
  input[type="tel"] {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }
  
  input[type="password"] {
    letter-spacing: 0.2em;
  }
  
  /* Responsive */
  @media (max-width: 640px) {
    .text-input {
      padding: 0.625rem 0.875rem;
      font-size: 0.875rem;
    }
    
    .char-counter {
      font-size: 0.625rem;
    }
  }
</style>