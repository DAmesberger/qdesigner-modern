<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { AnswerTypes } from '../shared/answerTypes';

  interface NumberInputConfig {
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
    decimalPlaces?: number;
    prefix?: string;
    suffix?: string;
    showSpinButtons?: boolean;
  }

  interface Props extends QuestionProps {
    question: Question & { config: NumberInputConfig };
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

  let inputElement = $state<HTMLInputElement>();
  let validationMessage = $state('');
  let rawInputValue = $state('');

  // Sync rawInputValue when value changes externally
  $effect(() => {
    if (value !== null && value !== undefined) {
      rawInputValue = formatDisplayValue(value);
    } else {
      rawInputValue = '';
    }
  });

  // Set answer type
  $effect(() => {
    if ('answerType' in question) {
      (question as any).answerType = AnswerTypes.NUMBER;
    }
  });

  // Validation
  $effect(() => {
    if (value !== null && value !== undefined) {
      validateInput(value);
    } else {
      validationMessage = '';
      onValidation?.({ valid: true, errors: [] });
    }
  });

  function formatDisplayValue(val: number): string {
    if (question.config.decimalPlaces !== undefined && question.config.decimalPlaces !== null) {
      return val.toFixed(question.config.decimalPlaces);
    }
    return String(val);
  }

  function clampValue(val: number): number {
    let clamped = val;
    if (question.config.min !== undefined && question.config.min !== null) {
      clamped = Math.max(question.config.min, clamped);
    }
    if (question.config.max !== undefined && question.config.max !== null) {
      clamped = Math.min(question.config.max, clamped);
    }
    return clamped;
  }

  function roundToStep(val: number): number {
    if (question.config.decimalPlaces !== undefined && question.config.decimalPlaces !== null) {
      const factor = Math.pow(10, question.config.decimalPlaces);
      return Math.round(val * factor) / factor;
    }
    return val;
  }

  function validateInput(val: number) {
    validationMessage = '';

    if (isNaN(val)) {
      validationMessage = 'Please enter a valid number';
    } else if (question.config.min !== undefined && question.config.min !== null && val < question.config.min) {
      validationMessage = `Value must be at least ${question.config.min}`;
    } else if (question.config.max !== undefined && question.config.max !== null && val > question.config.max) {
      validationMessage = `Value must be at most ${question.config.max}`;
    }

    onValidation?.({
      valid: !validationMessage,
      errors: validationMessage ? [validationMessage] : [],
    });
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    rawInputValue = target.value;

    if (target.value === '' || target.value === '-') {
      value = null;
      onResponse?.(null);
      return;
    }

    const parsed = parseFloat(target.value);
    if (!isNaN(parsed)) {
      const rounded = roundToStep(parsed);
      value = rounded;
      onResponse?.(rounded);
      onInteraction?.({
        type: 'change',
        timestamp: Date.now(),
        data: { value: rounded },
      });
    }
  }

  function handleBlur() {
    if (value !== null && value !== undefined) {
      const clamped = clampValue(value);
      const rounded = roundToStep(clamped);
      if (rounded !== value) {
        value = rounded;
        rawInputValue = formatDisplayValue(rounded);
        onResponse?.(rounded);
      } else {
        rawInputValue = formatDisplayValue(value);
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;

    const step = question.config.step ?? 1;

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      stepValue(step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      stepValue(-step);
    }
  }

  function stepValue(delta: number) {
    if (disabled) return;

    const current = value ?? question.config.min ?? 0;
    const newValue = roundToStep(clampValue(current + delta));
    value = newValue;
    rawInputValue = formatDisplayValue(newValue);
    onResponse?.(newValue);
    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { value: newValue, type: 'spin' },
    });
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
  <div class="number-input-container">
    {#if question.config.prefix}
      <span class="addon prefix">{question.config.prefix}</span>
    {/if}

    <div class="input-wrapper">
      <input
        bind:this={inputElement}
        type="text"
        inputmode="decimal"
        role="spinbutton"
        value={rawInputValue}
        placeholder={question.config.placeholder}
        {disabled}
        oninput={handleInput}
        onblur={handleBlur}
        onkeydown={handleKeyDown}
        class="number-input"
        class:has-prefix={!!question.config.prefix}
        class:has-suffix={!!question.config.suffix}
        class:has-spin={question.config.showSpinButtons !== false}
        aria-label="Number input"
        aria-valuemin={question.config.min}
        aria-valuemax={question.config.max}
        aria-valuenow={value ?? undefined}
      />

      {#if question.config.showSpinButtons !== false}
        <div class="spin-buttons">
          <button
            type="button"
            class="spin-button spin-up"
            onclick={() => stepValue(question.config.step ?? 1)}
            {disabled}
            tabindex={-1}
            aria-label="Increment"
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 5L5 1L9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button
            type="button"
            class="spin-button spin-down"
            onclick={() => stepValue(-(question.config.step ?? 1))}
            {disabled}
            tabindex={-1}
            aria-label="Decrement"
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>

    {#if question.config.suffix}
      <span class="addon suffix">{question.config.suffix}</span>
    {/if}
  </div>

  {#if question.config.min !== undefined || question.config.max !== undefined}
    <div class="range-hint">
      {#if question.config.min !== undefined && question.config.max !== undefined}
        Range: {question.config.min} &ndash; {question.config.max}
      {:else if question.config.min !== undefined}
        Minimum: {question.config.min}
      {:else if question.config.max !== undefined}
        Maximum: {question.config.max}
      {/if}
    </div>
  {/if}
</BaseQuestion>

<style>
  .number-input-container {
    display: flex;
    align-items: stretch;
    width: 100%;
  }

  .addon {
    display: flex;
    align-items: center;
    padding: 0 0.75rem;
    background: #f3f4f6;
    border: 2px solid #e5e7eb;
    color: #6b7280;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    user-select: none;
  }

  .prefix {
    border-right: none;
    border-radius: 0.5rem 0 0 0.5rem;
  }

  .suffix {
    border-left: none;
    border-radius: 0 0.5rem 0.5rem 0;
  }

  .input-wrapper {
    position: relative;
    flex: 1;
    display: flex;
  }

  .number-input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-family: inherit;
    background: white;
    transition: all 0.2s;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .number-input.has-prefix {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .number-input.has-suffix {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .number-input.has-spin {
    padding-right: 2.5rem;
  }

  .number-input:hover:not(:disabled) {
    border-color: #d1d5db;
  }

  .number-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .number-input:disabled {
    background: #f9fafb;
    color: #9ca3af;
    cursor: not-allowed;
  }

  .number-input::placeholder {
    color: #9ca3af;
  }

  /* Spin buttons */
  .spin-buttons {
    position: absolute;
    right: 2px;
    top: 2px;
    bottom: 2px;
    display: flex;
    flex-direction: column;
    width: 2rem;
    border-left: 1px solid #e5e7eb;
  }

  .spin-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: #f9fafb;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
    padding: 0;
  }

  .spin-up {
    border-radius: 0 0.375rem 0 0;
    border-bottom: 0.5px solid #e5e7eb;
  }

  .spin-down {
    border-radius: 0 0 0.375rem 0;
    border-top: 0.5px solid #e5e7eb;
  }

  .spin-button:hover:not(:disabled) {
    background: #e5e7eb;
    color: #374151;
  }

  .spin-button:active:not(:disabled) {
    background: #d1d5db;
  }

  .spin-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Range hint */
  .range-hint {
    margin-top: 0.375rem;
    font-size: 0.75rem;
    color: #9ca3af;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .number-input {
      padding: 0.625rem 0.875rem;
      font-size: 0.875rem;
    }

    .addon {
      padding: 0 0.5rem;
      font-size: 0.8125rem;
    }
  }
</style>
