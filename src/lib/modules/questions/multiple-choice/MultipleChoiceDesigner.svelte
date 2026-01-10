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
          config: metadata.defaultConfig,
        };
        (onResponse || onUpdate)?.(updates);
      }
    }
  });

  function updateConfig(updates: Partial<MultipleChoiceConfig>) {
    const updatedConfig = {
      ...question.config,
      ...updates,
    };

    // Sync display.options with config.options
    const updatedDisplay = {
      ...question.display,
      options:
        updatedConfig.options?.map((opt: ChoiceOption) => ({
          id: opt.id,
          label: opt.label,
          value: opt.value,
          description: opt.description,
          icon: opt.icon,
          image: opt.image,
          color: opt.color,
        })) ||
        (question.display as any)?.options ||
        [],
    };

    const updatedQuestion = {
      ...question,
      config: updatedConfig,
      display: updatedDisplay,
    };

    // Use onResponse if available, otherwise use onUpdate
    (onResponse || onUpdate)?.(updatedQuestion);
  }

  function updateResponseType(type: 'single' | 'multiple') {
    updateConfig({
      responseType: { type },
    });
  }

  function addOption() {
    const currentOptions = question.config?.options || [];
    const newOption: ChoiceOption = {
      id: generateId(),
      label: `Option ${currentOptions.length + 1}`,
      value: `option_${currentOptions.length + 1}`,
    };

    updateConfig({
      options: [...currentOptions, newOption],
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
    <h3>Question Text</h3>
    <div class="field">
      <label for="question-prompt">Prompt</label>
      <textarea
        id="question-prompt"
        value={(question.display as any)?.prompt || (question as any).text || ''}
        oninput={(e) => {
          const updatedQuestion = {
            ...question,
            display: {
              ...question.display,
              prompt: e.currentTarget.value,
            },
            text: e.currentTarget.value,
          };
          (onResponse || onUpdate)?.(updatedQuestion);
        }}
        rows="2"
        placeholder="Enter your question text here"
        class="w-full"
      ></textarea>
    </div>

    <div class="field">
      <label for="question-description">Description (optional)</label>
      <input
        id="question-description"
        type="text"
        value={(question.display as any)?.description || ''}
        oninput={(e) => {
          const updatedQuestion = {
            ...question,
            display: {
              ...question.display,
              description: e.currentTarget.value || undefined,
            },
          };
          (onResponse || onUpdate)?.(updatedQuestion);
        }}
        placeholder="Additional context or instructions"
        class="w-full"
      />
    </div>
  </div>

  <div class="form-section">
    <h3>Response Type</h3>
    <div class="radio-group">
      <label>
        <input
          type="radio"
          name="responseType"
          value="single"
          checked={question.config?.responseType?.type === 'single'}
          onchange={() => updateResponseType('single')}
        />
        <span>Single Choice (Radio Buttons)</span>
      </label>
      <label>
        <input
          type="radio"
          name="responseType"
          value="multiple"
          checked={question.config?.responseType?.type === 'multiple'}
          onchange={() => updateResponseType('multiple')}
        />
        <span>Multiple Choice (Checkboxes)</span>
      </label>
    </div>
  </div>

  <div class="form-section">
    <h3>Options</h3>
    <div class="options-list">
      {#each question.config?.options || [] as option, index}
        <div class="option-item">
          <div class="option-header">
            <span class="option-number">{index + 1}</span>
            <div class="option-controls">
              <button
                class="icon-button"
                onclick={() => moveOption(index, 'up')}
                disabled={index === 0}
                title="Move up"
              >
                ↑
              </button>
              <button
                class="icon-button"
                onclick={() => moveOption(index, 'down')}
                disabled={index === (question.config?.options?.length || 0) - 1}
                title="Move down"
              >
                ↓
              </button>
              <button
                class="icon-button danger"
                onclick={() => removeOption(index)}
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
                <label for={'label-' + index}>Label</label>
                <input
                  id={'label-' + index}
                  type="text"
                  value={option.label}
                  oninput={(e) => updateOption(index, { label: e.currentTarget.value })}
                  placeholder="Option label"
                />
              </div>

              <div class="field" style="width: 120px">
                <label for={'value-' + index}>Value</label>
                <input
                  id={'value-' + index}
                  type="text"
                  value={option.value}
                  oninput={(e) => updateOption(index, { value: e.currentTarget.value })}
                  placeholder="Value"
                />
              </div>

              <div class="field" style="width: 80px">
                <label for={'icon-' + index}>Icon</label>
                <input
                  id={'icon-' + index}
                  type="text"
                  value={option.icon || ''}
                  oninput={(e) => updateOption(index, { icon: e.currentTarget.value || undefined })}
                  placeholder="🔷"
                />
              </div>
            </div>

            <div class="field">
              <label for={'desc-' + index}>Description (optional)</label>
              <input
                id={'desc-' + index}
                type="text"
                value={option.description || ''}
                oninput={(e) =>
                  updateOption(index, { description: e.currentTarget.value || undefined })}
                placeholder="Additional description for this option"
              />
            </div>

            <div class="field-row">
              <div class="field">
                <label for={'img-' + index}>Image URL (optional)</label>
                <input
                  id={'img-' + index}
                  type="url"
                  value={option.image || ''}
                  oninput={(e) =>
                    updateOption(index, { image: e.currentTarget.value || undefined })}
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              <div class="field" style="width: 100px">
                <label for={'color-' + index}>Color</label>
                <input
                  id={'color-' + index}
                  type="color"
                  value={option.color || '#3b82f6'}
                  oninput={(e) => updateOption(index, { color: e.currentTarget.value })}
                />
              </div>

              <div class="field" style="width: 80px">
                <label for={'hotkey-' + index}>Hotkey</label>
                <input
                  id={'hotkey-' + index}
                  type="text"
                  value={option.hotkey || ''}
                  oninput={(e) =>
                    updateOption(index, { hotkey: e.currentTarget.value || undefined })}
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
                  onchange={() => toggleExclusive(index)}
                />
                <span>Exclusive option (deselects others when selected)</span>
              </label>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <button class="add-button" onclick={addOption}> + Add Option </button>
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
          onchange={() => updateConfig({ layout: 'vertical' })}
        />
        <span>Vertical</span>
      </label>
      <label>
        <input
          type="radio"
          name="layout"
          value="horizontal"
          checked={question.config?.layout === 'horizontal'}
          onchange={() => updateConfig({ layout: 'horizontal' })}
        />
        <span>Horizontal</span>
      </label>
      <label>
        <input
          type="radio"
          name="layout"
          value="grid"
          checked={question.config?.layout === 'grid'}
          onchange={() => updateConfig({ layout: 'grid' })}
        />
        <span>Grid</span>
      </label>
    </div>

    {#if question.config?.layout === 'grid'}
      <div class="field">
        <label for="grid-columns">Columns</label>
        <input
          id="grid-columns"
          type="number"
          min="2"
          max="4"
          value={question.config?.columns || 2}
          oninput={(e) => updateConfig({ columns: parseInt(e.currentTarget.value) || 2 })}
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
        onchange={(e) => updateConfig({ randomizeOptions: e.currentTarget.checked })}
      />
      <span>Randomize option order</span>
    </label>

    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={question.config?.otherOption || false}
        onchange={(e) => updateConfig({ otherOption: e.currentTarget.checked })}
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

  .field input,
  .field textarea {
    padding: 0.5rem;
    border: 1px solid hsl(var(--input));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }

  .field input:focus,
  .field textarea:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .field textarea {
    resize: vertical;
    min-height: 3rem;
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
