<script lang="ts">
  import type { ChoiceOption } from '$lib/shared/types/questions-v2';
  
  interface Props {
    options: ChoiceOption[];
    value?: string | string[];
    layout?: 'vertical' | 'horizontal' | 'grid';
    columns?: number;
    multiselect?: boolean;
    disabled?: boolean;
    onChange?: (value: string | string[]) => void;
    showOther?: boolean;
    otherValue?: string;
    onOtherChange?: (value: string) => void;
    class?: string;
  }
  
  let {
    options = [],
    value = $bindable(),
    layout = 'vertical',
    columns = 2,
    multiselect = false,
    disabled = false,
    onChange,
    showOther = false,
    otherValue = $bindable(''),
    onOtherChange,
    class: className = ''
  }: Props = $props();
  
  function handleSingleChange(optionValue: string | number) {
    const stringValue = String(optionValue);
    
    if (multiselect) {
      const currentValues = Array.isArray(value) ? value : [];
      const index = currentValues.indexOf(stringValue);
      
      let newValues: string[];
      if (index > -1) {
        newValues = currentValues.filter(v => v !== stringValue);
      } else {
        // Check if this option is exclusive
        const option = options.find(o => String(o.value) === stringValue);
        if (option?.exclusive) {
          newValues = [stringValue];
        } else {
          // Remove any exclusive options
          newValues = [...currentValues.filter(v => {
            const opt = options.find(o => String(o.value) === v);
            return !opt?.exclusive;
          }), stringValue];
        }
      }
      
      value = newValues;
      onChange?.(newValues);
    } else {
      value = stringValue;
      onChange?.(stringValue);
    }
  }
  
  function isChecked(optionValue: string | number): boolean {
    const stringValue = String(optionValue);
    if (multiselect) {
      return Array.isArray(value) && value.includes(stringValue);
    }
    return value === stringValue;
  }
  
  $: gridClass = layout === 'grid' ? `grid-cols-${columns}` : '';
  $: containerClass = `option-list ${layout} ${gridClass} ${className}`;
</script>

<div class={containerClass} role="group">
  {#each options as option (option.id)}
    <label class="option-item" class:disabled>
      <input
        type={multiselect ? 'checkbox' : 'radio'}
        name={multiselect ? undefined : `option-group-${$$restProps.name || 'default'}`}
        value={option.value}
        checked={isChecked(option.value)}
        {disabled}
        onchange={() => handleSingleChange(option.value)}
      />
      
      <span class="option-content">
        {#if option.image}
          <img 
            src={option.image.url} 
            alt={option.image.alt || option.label}
            class="option-image"
          />
        {/if}
        
        <span class="option-label">
          {option.label}
          {#if option.hotkey}
            <kbd class="option-hotkey">{option.hotkey}</kbd>
          {/if}
        </span>
      </span>
    </label>
  {/each}
  
  {#if showOther}
    <label class="option-item other-option" class:disabled>
      <input
        type={multiselect ? 'checkbox' : 'radio'}
        name={multiselect ? undefined : `option-group-${$$restProps.name || 'default'}`}
        value="__other__"
        checked={isChecked('__other__')}
        {disabled}
        onchange={() => handleSingleChange('__other__')}
      />
      
      <span class="option-content">
        <span class="option-label">Other:</span>
        <input
          type="text"
          class="other-input"
          bind:value={otherValue}
          oninput={() => onOtherChange?.(otherValue)}
          disabled={disabled || !isChecked('__other__')}
          placeholder="Please specify..."
        />
      </span>
    </label>
  {/if}
</div>

<style>
  .option-list {
    display: flex;
    gap: 0.75rem;
  }
  
  .option-list.vertical {
    flex-direction: column;
  }
  
  .option-list.horizontal {
    flex-direction: row;
    flex-wrap: wrap;
  }
  
  .option-list.grid {
    display: grid;
    gap: 0.75rem;
  }
  
  .option-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    cursor: pointer;
    padding: 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    transition: all 0.15s ease;
  }
  
  .option-item:hover:not(.disabled) {
    background-color: rgba(0, 0, 0, 0.02);
    border-color: rgba(0, 0, 0, 0.1);
  }
  
  .option-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  input[type="radio"],
  input[type="checkbox"] {
    flex-shrink: 0;
    margin-top: 0.125rem;
    cursor: inherit;
  }
  
  .option-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }
  
  .option-image {
    width: 3rem;
    height: 3rem;
    object-fit: cover;
    border-radius: 0.25rem;
  }
  
  .option-label {
    flex: 1;
  }
  
  .option-hotkey {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.125rem 0.375rem;
    background-color: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family: monospace;
  }
  
  .other-option .option-content {
    flex-wrap: wrap;
  }
  
  .other-input {
    flex: 1;
    min-width: 200px;
    padding: 0.25rem 0.5rem;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }
  
  .other-input:disabled {
    background-color: rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.1);
  }
  
  /* Grid column utilities */
  .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
  .grid-cols-5 { grid-template-columns: repeat(5, 1fr); }
  .grid-cols-6 { grid-template-columns: repeat(6, 1fr); }
</style>