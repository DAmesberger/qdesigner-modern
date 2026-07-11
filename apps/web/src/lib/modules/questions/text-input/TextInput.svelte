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
    value = $bindable(),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  if (value === undefined) value = '';

  let inputElement = $state<HTMLInputElement | HTMLTextAreaElement>();
  let showSuggestions = $state(false);
  let selectedSuggestionIndex = $state(-1);
  let validationMessage = $state('');
  // Last validity we surfaced, tracked OUTSIDE reactive state so the validation effect stays
  // idempotent: it re-emits only when the verdict changes. Without this the effect writes
  // `validationMessage` every run, which (once a defined `onValidation` is wired in, ADR 0029)
  // feeds a render→effect cascade that trips Svelte's update-depth guard.
  let lastEmittedMessage: string | undefined = undefined;

  // Filter suggestions based on current input
  const filteredSuggestions = $derived(
    question.config.suggestions
      ?.filter((s) => s.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 5) || []
  );

  // Validation (idempotent: emits only when the verdict changes — see lastEmittedMessage).
  $effect(() => {
    const msg = computeValidationMessage(value);
    if (msg === lastEmittedMessage) return;
    lastEmittedMessage = msg;
    validationMessage = msg;
    onValidation?.({ valid: !msg, errors: msg ? [msg] : [] });
  });

  // Set answer type
  $effect(() => {
    if ('answerType' in question) {
      (question as any).answerType =
        question.config.inputType === 'number' ? AnswerTypes.NUMBER : AnswerTypes.TEXT;
    }
  });

  /** Pure: the validation message for a value, or '' when it satisfies every rule. */
  function computeValidationMessage(val: string): string {
    // minLength / pattern constrain the SHAPE of a non-empty answer; an empty value's
    // presence is governed centrally by `required` (ADR 0029). So an optional field left
    // blank passes here (and a required-but-blank one is held by the central gate, not by
    // a spurious "minimum N characters" error). maxLength is safe on empty either way.
    const hasValue = val.length > 0;

    if (hasValue && question.config.minLength && val.length < question.config.minLength) {
      return `Minimum ${question.config.minLength} characters required`;
    }
    if (question.config.maxLength && val.length > question.config.maxLength) {
      return `Maximum ${question.config.maxLength} characters allowed`;
    }
    if (hasValue && question.config.pattern) {
      const regex = new RegExp(question.config.pattern);
      if (!regex.test(val)) {
        return 'Invalid format';
      }
    }

    // Type-specific validation (only meaningful on a non-empty value).
    if (question.config.inputType === 'email' && val) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(val)) {
        return 'Please enter a valid email address';
      }
    } else if (question.config.inputType === 'url' && val) {
      try {
        new URL(val);
      } catch {
        return 'Please enter a valid URL';
      }
    } else if (question.config.inputType === 'tel' && val) {
      const telRegex = /^[\d\s\-+()]+$/;
      if (!telRegex.test(val)) {
        return 'Please enter a valid phone number';
      }
    }

    return '';
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
      data: { value, inputType: question.config.inputType },
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
          const suggestion = filteredSuggestions[selectedSuggestionIndex];
          if (suggestion) selectSuggestion(suggestion);
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
        oninput={handleInput}
        onkeydown={handleKeyDown}
        onblur={handleBlur}
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
        oninput={handleInput}
        onkeydown={handleKeyDown}
        onblur={handleBlur}
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
            onclick={() => selectSuggestion(suggestion)}
            onmouseenter={() => (selectedSuggestionIndex = index)}
          >
            {suggestion}
          </button>
        {/each}
      </div>
    {/if}

    <!-- The module's own minLength/pattern/type verdict. BaseQuestion's
         validationResult only covers required/selection, so without this the
         Continue block (ADR 0029, #33) had no visible explanation. -->
    {#if validationMessage}
      <div
        class="mt-2 text-sm text-destructive"
        role="alert"
        data-testid="text-input-validation-message"
      >
        {validationMessage}
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
    border: 2px solid hsl(var(--border));
    border-radius: 0.5rem;
    font-size: 1rem;
    font-family: inherit;
    background: hsl(var(--background));
    transition: all 0.2s;
  }

  .text-input:hover:not(:disabled) {
    border-color: hsl(var(--border));
  }

  .text-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .text-input:disabled {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    cursor: not-allowed;
  }

  .text-input::placeholder {
    color: hsl(var(--muted-foreground));
  }

  /* Number input specific */
  input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  input[type='number']::-webkit-outer-spin-button,
  input[type='number']::-webkit-inner-spin-button {
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
    color: hsl(var(--muted-foreground));
    background: hsl(var(--background));
    padding: 0 0.25rem;
    pointer-events: none;
  }

  .char-counter.warning {
    color: hsl(var(--warning));
    font-weight: 500;
  }

  /* Suggestions dropdown */
  .suggestions-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    background: hsl(var(--background));
    border: 2px solid hsl(var(--border));
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px hsl(var(--foreground) / 0.1);
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
    background: hsl(var(--muted));
  }

  .suggestion-item.selected {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  /* Type-specific styles */
  input[type='email'],
  input[type='url'],
  input[type='tel'] {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  input[type='password'] {
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
