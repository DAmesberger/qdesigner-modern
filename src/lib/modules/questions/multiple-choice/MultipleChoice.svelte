<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { getAnswerType } from './answerType';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';

  interface MultipleChoiceConfig {
    responseType: { type: 'single' | 'multiple' };
    options: ChoiceOption[];
    layout: 'vertical' | 'horizontal' | 'grid';
    columns?: number;
    randomizeOptions?: boolean;
    otherOption?: boolean;
    exclusiveOptions?: string[];
  }

  interface ChoiceOption {
    id: string;
    label: string;
    value: any;
    icon?: string;
    image?: string;
    color?: string;
    description?: string;
    exclusive?: boolean;
    hotkey?: string;
  }

  interface Props extends QuestionProps {
    question: Question & { config: MultipleChoiceConfig };
  }

  let {
    question,
    mode = 'runtime',
    value = $bindable(question.config.responseType.type === 'multiple' ? [] : null),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  let otherValue = $state('');
  let showOtherInput = $state(false);
  let randomizedOptions = $state<ChoiceOption[]>([]);

  // Initialize randomized options
  $effect(() => {
    randomizedOptions = getDisplayOptions(question.config.options);
  });

  // Update answer type based on response type
  $effect(() => {
    if ('answerType' in question) {
      (question as any).answerType = getAnswerType(question.config.responseType.type);
    }
  });

  function getDisplayOptions(options: ChoiceOption[]): ChoiceOption[] {
    if (!question.config.randomizeOptions || mode === 'edit') {
      return options;
    }

    // Fisher-Yates shuffle
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }

    return shuffled;
  }

  function handleSingleChoice(option: ChoiceOption) {
    if (disabled) return;

    value = option.value;
    showOtherInput = option.id === 'other';

    onResponse?.(value);
    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { optionId: option.id, value: option.value },
    });
  }

  function handleMultipleChoice(option: ChoiceOption) {
    if (disabled) return;

    if (!Array.isArray(value)) {
      value = [];
    }

    const currentValues = [...value];
    const index = currentValues.indexOf(option.value);

    if (index > -1) {
      currentValues.splice(index, 1);
    } else {
      // Handle exclusive options
      if (option.exclusive) {
        currentValues.length = 0;
        currentValues.push(option.value);
      } else {
        // Remove exclusive options if selecting non-exclusive
        const exclusiveValues = question.config.options
          .filter((o) => o.exclusive)
          .map((o) => o.value);
        const filtered = currentValues.filter((v) => !exclusiveValues.includes(v));
        filtered.push(option.value);
        currentValues.length = 0;
        currentValues.push(...filtered);
      }
    }

    value = currentValues;
    showOtherInput = option.id === 'other' && currentValues.includes(option.value);

    onResponse?.(value);
    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { optionId: option.id, value: option.value, selected: index === -1 },
    });
  }

  function handleOtherChange() {
    const responseValue = question.config.otherOption
      ? {
          selection: value,
          other: otherValue,
        }
      : value;

    onResponse?.(responseValue);
  }

  function handleKeyPress(event: KeyboardEvent, option: ChoiceOption) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (question.config.responseType.type === 'single') {
        handleSingleChoice(option);
      } else {
        handleMultipleChoice(option);
      }
    }
  }

  // Handle hotkeys
  $effect(() => {
    if (mode !== 'runtime' || disabled) return;

    function handleHotkey(event: KeyboardEvent) {
      const option = randomizedOptions.find((o) => o.hotkey === event.key);
      if (option) {
        event.preventDefault();
        if (question.config.responseType.type === 'single') {
          handleSingleChoice(option);
        } else {
          handleMultipleChoice(option);
        }
      }
    }

    window.addEventListener('keydown', handleHotkey);
    return () => window.removeEventListener('keydown', handleHotkey);
  });

  // Grid layout classes
  const gridClass = $derived(
    question.config.layout === 'grid' ? `grid-cols-${question.config.columns || 2}` : ''
  );
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div
    class="choice-container layout-{question.config.layout} {gridClass}"
    role={question.config.responseType.type === 'single' ? 'radiogroup' : 'group'}
    aria-labelledby="question-{question.id}-title"
  >
    {#each randomizedOptions as option (option.id)}
      <div
        class="choice-item"
        animate:flip={{ duration: 300 }}
        transition:fade|local={{ duration: 200 }}
      >
        <label
          class="choice-label"
          class:selected={question.config.responseType.type === 'single'
            ? value === option.value
            : value?.includes(option.value)}
          class:disabled
          style:border-color={option.color &&
          (question.config.responseType.type === 'single'
            ? value === option.value
            : value?.includes(option.value))
            ? option.color
            : undefined}
        >
          <input
            type={question.config.responseType.type === 'single' ? 'radio' : 'checkbox'}
            name="question-{question.id}"
            value={option.value}
            checked={question.config.responseType.type === 'single'
              ? value === option.value
              : value?.includes(option.value)}
            onchange={() =>
              question.config.responseType.type === 'single'
                ? handleSingleChoice(option)
                : handleMultipleChoice(option)}
            onkeypress={(e) => handleKeyPress(e, option)}
            {disabled}
            class="choice-input"
            aria-label={option.label}
            aria-describedby={option.description ? `option-${option.id}-desc` : undefined}
          />

          <span class="choice-indicator">
            {#if question.config.responseType.type === 'single'}
              <span class="radio-dot"></span>
            {:else}
              <svg class="checkmark" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
            {/if}
          </span>

          <span class="choice-content">
            {#if option.icon}
              <span class="choice-icon">{option.icon}</span>
            {/if}

            {#if option.image}
              <img src={option.image} alt={option.label} class="choice-image" loading="lazy" />
            {/if}

            <span class="choice-text">
              <span class="choice-label-text">{option.label}</span>
              {#if option.description}
                <span class="choice-description" id="option-{option.id}-desc">
                  {option.description}
                </span>
              {/if}
            </span>

            {#if option.hotkey && mode === 'runtime'}
              <kbd class="choice-hotkey">{option.hotkey}</kbd>
            {/if}
          </span>
        </label>

        {#if option.exclusive}
          <span class="exclusive-badge">Exclusive</span>
        {/if}
      </div>
    {/each}

    {#if question.config.otherOption && showOtherInput}
      <div class="other-input-container" transition:fade|local={{ duration: 200 }}>
        <input
          type="text"
          class="other-input"
          placeholder="Please specify..."
          bind:value={otherValue}
          onchange={handleOtherChange}
          {disabled}
          aria-label="Other option text"
        />
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .choice-container {
    display: flex;
    gap: 0.75rem;
  }

  .layout-vertical {
    flex-direction: column;
  }

  .layout-horizontal {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .layout-grid {
    display: grid;
    gap: 1rem;
  }

  .grid-cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  .grid-cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .grid-cols-4 {
    grid-template-columns: repeat(4, 1fr);
  }

  .choice-item {
    position: relative;
  }

  .choice-label {
    display: flex;
    align-items: flex-start;
    padding: 0.75rem 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
    user-select: none;
  }

  .choice-label:hover:not(.disabled) {
    border-color: #d1d5db;
    background: #f9fafb;
  }

  .choice-label.selected {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .choice-label.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .choice-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .choice-indicator {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    margin-right: 0.75rem;
    margin-top: 0.125rem;
    border: 2px solid #9ca3af;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .choice-input[type='checkbox'] ~ .choice-indicator {
    border-radius: 0.25rem;
  }

  .choice-label.selected .choice-indicator {
    border-color: #3b82f6;
    background: #3b82f6;
  }

  .radio-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: white;
    transform: scale(0);
    transition: transform 0.2s;
  }

  .choice-label.selected .radio-dot {
    transform: scale(1);
  }

  .checkmark {
    width: 0.875rem;
    height: 0.875rem;
    color: white;
    opacity: 0;
    transform: scale(0.5);
    transition: all 0.2s;
  }

  .choice-label.selected .checkmark {
    opacity: 1;
    transform: scale(1);
  }

  .choice-content {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .choice-icon {
    font-size: 1.25rem;
    line-height: 1;
  }

  .choice-image {
    width: 3rem;
    height: 3rem;
    object-fit: cover;
    border-radius: 0.25rem;
  }

  .choice-text {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .choice-label-text {
    color: #111827;
    line-height: 1.5;
  }

  .choice-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin-top: 0.25rem;
    line-height: 1.4;
  }

  .choice-hotkey {
    flex-shrink: 0;
    padding: 0.125rem 0.375rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: #4b5563;
  }

  .exclusive-badge {
    position: absolute;
    top: -0.5rem;
    right: 0.5rem;
    padding: 0.125rem 0.5rem;
    background: #fef3c7;
    color: #92400e;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: 0.25rem;
    border: 1px solid #fde68a;
  }

  /* Other input */
  .other-input-container {
    margin-left: 2rem;
  }

  .other-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .other-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .layout-horizontal {
      flex-direction: column;
    }

    .layout-grid {
      grid-template-columns: 1fr !important;
    }
  }
</style>
