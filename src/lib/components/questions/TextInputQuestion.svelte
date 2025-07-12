<script lang="ts">
  import BaseQuestion from './BaseQuestion.svelte';
  import type { ExtendedQuestion, TextInputConfig } from './types';
  import { createEventDispatcher } from 'svelte';
  
  export let question: ExtendedQuestion & { config: TextInputConfig };
  export let mode: 'edit' | 'preview' | 'runtime' = 'runtime';
  export let value: string = '';
  export let disabled: boolean = false;
  
  const dispatch = createEventDispatcher();
  
  let inputElement: HTMLInputElement | HTMLTextAreaElement;
  let showSuggestions = false;
  let selectedSuggestionIndex = -1;
  let validationMessage = '';
  
  // Filter suggestions based on current input
  $: filteredSuggestions = question.config.suggestions
    ?.filter(s => s.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 5) || [];
  
  // Validation
  $: validateInput(value);
  
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
  }
  
  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    value = target.value;
    
    if (question.config.autoResize && target instanceof HTMLTextAreaElement) {
      target.style.height = 'auto';
      target.style.height = target.scrollHeight + 'px';
    }
    
    showSuggestions = filteredSuggestions.length > 0 && value.length > 0;
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
  {value} 
  {disabled}
  showError={!!validationMessage}
  errors={validationMessage ? [validationMessage] : []}
  on:edit
  on:delete
  on:duplicate
  on:response
  on:interaction
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
      />
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
        autocomplete={question.config.autoComplete}
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
  
  {#if mode === 'edit'}
    <div class="edit-hints">
      <p class="hint">
        Type: <strong>{question.config.inputType}</strong>
        {#if question.config.pattern}
          | Pattern: <code>{question.config.pattern}</code>
        {/if}
      </p>
    </div>
  {/if}
</BaseQuestion>

<style>
  .input-container {
    position: relative;
    width: 100%;
  }
  
  .text-input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 2px solid var(--color-gray-300);
    border-radius: 0.5rem;
    font-size: 1rem;
    font-family: inherit;
    background: white;
    transition: all 0.2s;
  }
  
  .text-input:hover:not(:disabled) {
    border-color: var(--color-gray-400);
  }
  
  .text-input:focus {
    outline: none;
    border-color: var(--color-blue-500);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .text-input:disabled {
    background: var(--color-gray-50);
    color: var(--color-gray-500);
    cursor: not-allowed;
  }
  
  .text-input::placeholder {
    color: var(--color-gray-400);
  }
  
  /* Number input specific */
  input[type="number"] {
    -moz-appearance: textfield;
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
    color: var(--color-gray-500);
    background: white;
    padding: 0 0.25rem;
    pointer-events: none;
  }
  
  .char-counter.warning {
    color: var(--color-orange-600);
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
    border: 2px solid var(--color-gray-300);
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
    background: var(--color-gray-100);
  }
  
  .suggestion-item.selected {
    background: var(--color-blue-50);
    color: var(--color-blue-700);
  }
  
  /* Edit mode hints */
  .edit-hints {
    margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-gray-50);
    border-radius: 0.375rem;
    font-size: 0.75rem;
  }
  
  .hint {
    margin: 0;
    color: var(--color-gray-600);
  }
  
  .hint strong {
    color: var(--color-gray-700);
  }
  
  .hint code {
    padding: 0.125rem 0.25rem;
    background: var(--color-gray-200);
    border-radius: 0.125rem;
    font-family: var(--font-mono);
    font-size: 0.875em;
  }
  
  /* Validation styles */
  :global(.has-error) .text-input {
    border-color: var(--color-red-500);
  }
  
  :global(.has-error) .text-input:focus {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
  }
  
  /* Type-specific styles */
  input[type="email"],
  input[type="url"],
  input[type="tel"] {
    font-family: var(--font-mono);
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