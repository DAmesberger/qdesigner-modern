<script lang="ts">
  import BaseQuestion from './BaseQuestion.svelte';
  import type { ExtendedQuestion, MultipleChoiceConfig, ChoiceOption } from './types';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  
  export let question: ExtendedQuestion & { config: MultipleChoiceConfig };
  export let mode: 'edit' | 'preview' | 'runtime' = 'runtime';
  export let value: any = question.responseType.type === 'multiple' ? [] : null;
  export let disabled: boolean = false;
  
  let otherValue = '';
  let showOtherInput = false;
  
  // Randomize options if needed
  $: displayOptions = getDisplayOptions(question.config.options);
  
  function getDisplayOptions(options: ChoiceOption[]): ChoiceOption[] {
    if (!question.config.randomizeOptions || mode === 'edit') {
      return options;
    }
    
    // Simple shuffle algorithm
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
  }
  
  function handleSingleChoice(option: ChoiceOption) {
    if (disabled) return;
    
    value = option.value;
    showOtherInput = option.id === 'other';
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
          .filter(o => o.exclusive)
          .map(o => o.value);
        const filtered = currentValues.filter(v => !exclusiveValues.includes(v));
        filtered.push(option.value);
        currentValues.length = 0;
        currentValues.push(...filtered);
      }
    }
    
    value = currentValues;
    showOtherInput = option.id === 'other' && currentValues.includes(option.value);
  }
  
  function handleKeyPress(event: KeyboardEvent, option: ChoiceOption) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (question.responseType.type === 'single') {
        handleSingleChoice(option);
      } else {
        handleMultipleChoice(option);
      }
    }
  }
  
  // Grid layout calculation
  $: gridClass = question.config.layout === 'grid' 
    ? `grid-cols-${question.config.columns || 2}` 
    : '';
</script>

<BaseQuestion 
  {question} 
  {mode} 
  {value} 
  {disabled}
  on:edit
  on:delete
  on:duplicate
  on:response
  on:interaction
  let:handleResponse={baseHandleResponse}
>
  <div 
    class="choice-container layout-{question.config.layout} {gridClass}"
    role={question.responseType.type === 'single' ? 'radiogroup' : 'group'}
    aria-labelledby="question-{question.id}-title"
  >
    {#each displayOptions as option (option.id)}
      <div 
        class="choice-item"
        animate:flip={{ duration: 300 }}
        transition:fade={{ duration: 200 }}
      >
        <label 
          class="choice-label"
          class:selected={question.responseType.type === 'single' 
            ? value === option.value 
            : value?.includes(option.value)}
          class:disabled
        >
          <input
            type={question.responseType.type === 'single' ? 'radio' : 'checkbox'}
            name="question-{question.id}"
            value={option.value}
            checked={question.responseType.type === 'single' 
              ? value === option.value 
              : value?.includes(option.value)}
            on:change={() => question.responseType.type === 'single' 
              ? handleSingleChoice(option) 
              : handleMultipleChoice(option)}
            on:keypress={(e) => handleKeyPress(e, option)}
            {disabled}
            class="choice-input"
          />
          
          <span class="choice-indicator">
            {#if question.responseType.type === 'single'}
              <span class="radio-dot" />
            {:else}
              <svg class="checkmark" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            {/if}
          </span>
          
          <span class="choice-content">
            {#if option.icon}
              <span class="choice-icon">{option.icon}</span>
            {/if}
            
            {#if option.image}
              <img 
                src={option.image} 
                alt={option.label} 
                class="choice-image"
              />
            {/if}
            
            <span class="choice-text">
              {option.label}
              {#if option.description}
                <span class="choice-description">{option.description}</span>
              {/if}
            </span>
            
            {#if option.hotkey}
              <kbd class="choice-hotkey">{option.hotkey}</kbd>
            {/if}
          </span>
        </label>
        
        {#if mode === 'edit'}
          <div class="choice-edit-controls">
            <button 
              class="choice-edit-btn"
              title="Edit option"
              on:click={() => dispatch('editOption', option)}
            >
              ✏️
            </button>
            <button 
              class="choice-edit-btn"
              title="Delete option"
              on:click={() => dispatch('deleteOption', option)}
            >
              🗑️
            </button>
          </div>
        {/if}
      </div>
    {/each}
    
    {#if question.config.otherOption && showOtherInput}
      <div class="other-input-container" transition:fade={{ duration: 200 }}>
        <input
          type="text"
          class="other-input"
          placeholder="Please specify..."
          bind:value={otherValue}
          on:change={() => baseHandleResponse({ 
            selection: value, 
            other: otherValue 
          })}
          {disabled}
        />
      </div>
    {/if}
  </div>
  
  {#if mode === 'edit'}
    <button 
      class="add-option-btn"
      on:click={() => dispatch('addOption')}
    >
      + Add Option
    </button>
  {/if}
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
  
  .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
  
  .choice-item {
    position: relative;
  }
  
  .choice-label {
    display: flex;
    align-items: flex-start;
    padding: 0.75rem 1rem;
    border: 2px solid var(--color-gray-200);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
  }
  
  .choice-label:hover:not(.disabled) {
    border-color: var(--color-gray-300);
    background: var(--color-gray-50);
  }
  
  .choice-label.selected {
    border-color: var(--color-blue-500);
    background: var(--color-blue-50);
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
    border: 2px solid var(--color-gray-400);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .choice-input[type="checkbox"] + .choice-indicator {
    border-radius: 0.25rem;
  }
  
  .choice-label.selected .choice-indicator {
    border-color: var(--color-blue-500);
    background: var(--color-blue-500);
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
  
  .choice-description {
    font-size: 0.875rem;
    color: var(--color-gray-600);
    margin-top: 0.25rem;
  }
  
  .choice-hotkey {
    flex-shrink: 0;
    padding: 0.125rem 0.375rem;
    background: var(--color-gray-100);
    border: 1px solid var(--color-gray-300);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family: var(--font-mono);
  }
  
  /* Edit mode controls */
  .choice-edit-controls {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.2s;
  }
  
  .choice-item:hover .choice-edit-controls {
    opacity: 1;
  }
  
  .choice-edit-btn {
    padding: 0.25rem;
    background: white;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .choice-edit-btn:hover {
    border-color: var(--color-gray-400);
    background: var(--color-gray-50);
  }
  
  /* Other input */
  .other-input-container {
    margin-top: 0.5rem;
    margin-left: 2rem;
  }
  
  .other-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 2px solid var(--color-gray-300);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    transition: all 0.2s;
  }
  
  .other-input:focus {
    outline: none;
    border-color: var(--color-blue-500);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  /* Add option button */
  .add-option-btn {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    border: 2px dashed var(--color-gray-300);
    border-radius: 0.375rem;
    background: transparent;
    color: var(--color-gray-600);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
  }
  
  .add-option-btn:hover {
    border-color: var(--color-blue-400);
    color: var(--color-blue-600);
    background: var(--color-blue-50);
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