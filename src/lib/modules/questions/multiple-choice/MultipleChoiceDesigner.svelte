<script lang="ts">
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { generateId } from '$lib/shared/utils/id';
  import { moduleRegistry } from '$lib/modules/registry';
  
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
    question: Question & { config?: MultipleChoiceConfig };
    onUpdate?: (updates: any) => void;
  }
  
  let { question, onResponse, onUpdate }: Props = $props();
  
  // Initialize config if it doesn't exist
  $effect(() => {
    if (!question.config) {
      const metadata = moduleRegistry.get('multiple-choice');
      if (metadata?.defaultConfig) {
        const updates = {
          ...question,
          config: metadata.defaultConfig
        };
        (onResponse || onUpdate)?.(updates);
      }
    }
  });
  
  function updateConfig(updates: Partial<MultipleChoiceConfig>) {
    const updatedConfig = {
      ...question.config,
      ...updates
    };
    
    // Sync display.options with config.options
    const updatedDisplay = {
      ...question.display,
      options: updatedConfig.options?.map((opt: ChoiceOption) => ({
        id: opt.id,
        label: opt.label,
        value: opt.value,
        description: opt.description,
        icon: opt.icon,
        image: opt.image,
        color: opt.color
      })) || question.display?.options || []
    };
    
    const updatedQuestion = {
      ...question,
      config: updatedConfig,
      display: updatedDisplay
    };
    
    // Use onResponse if available, otherwise use onUpdate
    (onResponse || onUpdate)?.(updatedQuestion);
  }
  
  function updateResponseType(type: 'single' | 'multiple') {
    updateConfig({
      responseType: { type }
    });
  }
  
  function addOption() {
    const currentOptions = question.config?.options || [];
    const newOption: ChoiceOption = {
      id: generateId(),
      label: `Option ${currentOptions.length + 1}`,
      value: `option_${currentOptions.length + 1}`
    };
    
    updateConfig({
      options: [...currentOptions, newOption]
    });
  }
  
  function updateOption(index: number, updates: Partial<ChoiceOption>) {
    const currentOptions = question.config?.options || [];
    const newOptions = [...currentOptions];
    const option = newOptions[index];
    if (option) {
      newOptions[index] = { ...option, ...updates };
      updateConfig({ options: newOptions });
    }
  }
  
  function removeOption(index: number) {
    const currentOptions = question.config?.options || [];
    if (currentOptions.length <= 2) return; // Keep at least 2 options
    
    const newOptions = currentOptions.filter((_, i) => i !== index);
    updateConfig({ options: newOptions });
  }
  
  function moveOption(index: number, direction: 'up' | 'down') {
    const currentOptions = question.config?.options || [];
    const newOptions = [...currentOptions];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < newOptions.length) {
      [newOptions[index], newOptions[newIndex]] = [newOptions[newIndex]!, newOptions[index]!];
      updateConfig({ options: newOptions });
    }
  }
  
  function toggleExclusive(index: number) {
    const currentOptions = question.config?.options || [];
    const option = currentOptions[index];
    if (option) {
      updateOption(index, { exclusive: !option.exclusive });
    }
  }
</script>

<div class="multiple-choice-designer">
  <div class="form-section">
    <h3>Response Type</h3>
    <div class="radio-group">
      <label>
        <input
          type="radio"
          name="responseType"
          value="single"
          checked={question.config?.responseType?.type === 'single'}
          on:change={() => updateResponseType('single')}
        />
        <span>Single Choice (Radio Buttons)</span>
      </label>
      <label>
        <input
          type="radio"
          name="responseType"
          value="multiple"
          checked={question.config?.responseType?.type === 'multiple'}
          on:change={() => updateResponseType('multiple')}
        />
        <span>Multiple Choice (Checkboxes)</span>
      </label>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Options</h3>
    <div class="options-list">
      {#each (question.config?.options || []) as option, index}
        <div class="option-item">
          <div class="option-header">
            <span class="option-number">{index + 1}</span>
            <div class="option-controls">
              <button
                class="icon-button"
                on:click={() => moveOption(index, 'up')}
                disabled={index === 0}
                title="Move up"
              >
                ↑
              </button>
              <button
                class="icon-button"
                on:click={() => moveOption(index, 'down')}
                disabled={index === (question.config?.options?.length || 0) - 1}
                title="Move down"
              >
                ↓
              </button>
              <button
                class="icon-button danger"
                on:click={() => removeOption(index)}
                disabled={(question.config?.options?.length || 0) <= 2}
                title="Remove option"
              >
                ×
              </button>
            </div>
          </div>
          
          <div class="option-fields">
            <div class="field-row">
              <div class="field flex-1">
                <label>Label</label>
                <input
                  type="text"
                  value={option.label}
                  on:input={(e) => updateOption(index, { label: e.currentTarget.value })}
                  placeholder="Option label"
                />
              </div>
              
              <div class="field" style="width: 120px">
                <label>Value</label>
                <input
                  type="text"
                  value={option.value}
                  on:input={(e) => updateOption(index, { value: e.currentTarget.value })}
                  placeholder="Value"
                />
              </div>
              
              <div class="field" style="width: 80px">
                <label>Icon</label>
                <input
                  type="text"
                  value={option.icon || ''}
                  on:input={(e) => updateOption(index, { icon: e.currentTarget.value || undefined })}
                  placeholder="🔷"
                />
              </div>
            </div>
            
            <div class="field">
              <label>Description (optional)</label>
              <input
                type="text"
                value={option.description || ''}
                on:input={(e) => updateOption(index, { description: e.currentTarget.value || undefined })}
                placeholder="Additional description for this option"
              />
            </div>
            
            <div class="field-row">
              <div class="field">
                <label>Image URL (optional)</label>
                <input
                  type="url"
                  value={option.image || ''}
                  on:input={(e) => updateOption(index, { image: e.currentTarget.value || undefined })}
                  placeholder="https://example.com/image.jpg"
                />
              </div>
              
              <div class="field" style="width: 100px">
                <label>Color</label>
                <input
                  type="color"
                  value={option.color || '#3b82f6'}
                  on:input={(e) => updateOption(index, { color: e.currentTarget.value })}
                />
              </div>
              
              <div class="field" style="width: 80px">
                <label>Hotkey</label>
                <input
                  type="text"
                  value={option.hotkey || ''}
                  on:input={(e) => updateOption(index, { hotkey: e.currentTarget.value || undefined })}
                  placeholder="1"
                  maxlength="1"
                />
              </div>
            </div>
            
            {#if question.config?.responseType?.type === 'multiple'}
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  checked={option.exclusive || false}
                  on:change={() => toggleExclusive(index)}
                />
                <span>Exclusive option (deselects others when selected)</span>
              </label>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    
    <button class="add-button" on:click={addOption}>
      + Add Option
    </button>
  </div>
  
  <div class="form-section">
    <h3>Layout</h3>
    <div class="radio-group">
      <label>
        <input
          type="radio"
          name="layout"
          value="vertical"
          checked={(question.config?.layout || 'vertical') === 'vertical'}
          on:change={() => updateConfig({ layout: 'vertical' })}
        />
        <span>Vertical</span>
      </label>
      <label>
        <input
          type="radio"
          name="layout"
          value="horizontal"
          checked={question.config?.layout === 'horizontal'}
          on:change={() => updateConfig({ layout: 'horizontal' })}
        />
        <span>Horizontal</span>
      </label>
      <label>
        <input
          type="radio"
          name="layout"
          value="grid"
          checked={question.config?.layout === 'grid'}
          on:change={() => updateConfig({ layout: 'grid' })}
        />
        <span>Grid</span>
      </label>
    </div>
    
    {#if question.config?.layout === 'grid'}
      <div class="field">
        <label>Columns</label>
        <input
          type="number"
          min="2"
          max="4"
          value={question.config?.columns || 2}
          on:input={(e) => updateConfig({ columns: parseInt(e.currentTarget.value) || 2 })}
        />
      </div>
    {/if}
  </div>
  
  <div class="form-section">
    <h3>Options</h3>
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={question.config?.randomizeOptions || false}
        on:change={(e) => updateConfig({ randomizeOptions: e.currentTarget.checked })}
      />
      <span>Randomize option order</span>
    </label>
    
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={question.config?.otherOption || false}
        on:change={(e) => updateConfig({ otherOption: e.currentTarget.checked })}
      />
      <span>Include "Other" option with text input</span>
    </label>
  </div>
</div>

<style>
  .multiple-choice-designer {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .form-section {
    background: hsl(var(--muted));
    padding: 1rem;
    border-radius: 0.5rem;
  }
  
  h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin-bottom: 0.75rem;
  }
  
  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .radio-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  
  .options-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .option-item {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    padding: 1rem;
  }
  
  .option-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  
  .option-number {
    font-weight: 600;
    color: hsl(var(--muted-foreground));
  }
  
  .option-controls {
    display: flex;
    gap: 0.25rem;
  }
  
  .icon-button {
    padding: 0.25rem 0.5rem;
    background: hsl(var(--muted));
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s;
  }
  
  .icon-button:hover:not(:disabled) {
    background: hsl(var(--accent));
  }
  
  .icon-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .icon-button.danger:hover:not(:disabled) {
    background: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
  }
  
  .option-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .field-row {
    display: flex;
    gap: 0.75rem;
  }
  
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .field.flex-1 {
    flex: 1;
  }
  
  .field label {
    font-size: 0.75rem;
    font-weight: 500;
    color: hsl(var(--foreground));
  }
  
  .field input {
    padding: 0.5rem;
    border: 1px solid hsl(var(--input));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }
  
  .field input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }
  
  .add-button {
    margin-top: 0.75rem;
    padding: 0.5rem 1rem;
    border: 2px dashed hsl(var(--border));
    border-radius: 0.375rem;
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
  }
  
  .add-button:hover {
    border-color: hsl(var(--primary));
    color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.05);
  }
</style>