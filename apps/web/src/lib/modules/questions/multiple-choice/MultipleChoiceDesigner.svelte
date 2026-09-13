<script lang="ts">
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { generateId } from '$lib/shared/utils/id';
  import { buildModuleRuntimeConfig } from '$lib/runtime/core/moduleConfigAdapter';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
  import Button from '$lib/components/ui/Button.svelte';

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
    image?: string | { url?: string; [key: string]: unknown };
    color?: string;
    description?: string;
    exclusive?: boolean;
    hotkey?: string;
  }

  interface Props extends QuestionProps {
    question: Question & { config?: MultipleChoiceConfig };
    onUpdate?: (updates: any) => void;
  }

  let { question, onUpdate }: Props = $props();

  const config = $derived({
    ...buildModuleRuntimeConfig(question),
    options:
      question.config?.options ??
      (question.display as { options?: ChoiceOption[] } | undefined)?.options ??
      (question.responseType as { options?: ChoiceOption[] } | undefined)?.options ??
      (question.response as { options?: ChoiceOption[] } | undefined)?.options ??
      [],
  } as MultipleChoiceConfig);
  function updateConfig(updates: Partial<MultipleChoiceConfig>) {
    onUpdate?.({ config: { ...question.config, ...updates } });
  }

  function updateResponseType(type: 'single' | 'multiple') {
    updateConfig({
      responseType: { type },
    });
  }

  function addOption() {
    const currentOptions = config.options;
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
    const currentOptions = config.options;
    const newOptions = [...currentOptions];
    const option = newOptions[index];
    if (option) {
      newOptions[index] = { ...option, ...updates };
      updateConfig({ options: newOptions });
    }
  }

  function removeOption(index: number) {
    const currentOptions = config.options;
    if (currentOptions.length <= 2) return; // Keep at least 2 options

    const newOptions = currentOptions.filter((_, i) => i !== index);
    updateConfig({ options: newOptions });
  }

  function moveOption(index: number, direction: 'up' | 'down') {
    const currentOptions = config.options;
    const newOptions = [...currentOptions];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex >= 0 && newIndex < newOptions.length) {
      [newOptions[index], newOptions[newIndex]] = [newOptions[newIndex]!, newOptions[index]!];
      updateConfig({ options: newOptions });
    }
  }

  function toggleExclusive(index: number) {
    const currentOptions = config.options;
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
          onUpdate?.(updatedQuestion);
        }}
        rows="2"
        placeholder="Enter your question text here"
        class="w-full"
      ></textarea>
    </div>

    <div class="field">
      <label for="question-description">Description (optional)</label>
      <Input
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
          onUpdate?.(updatedQuestion);
        }}
        placeholder="Additional context or instructions"
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
          checked={config?.responseType?.type === 'single'}
          onchange={() => updateResponseType('single')}
        />
        <span>Single Choice (Radio Buttons)</span>
      </label>
      <label>
        <input
          type="radio"
          name="responseType"
          value="multiple"
          disabled={question.type === 'single-choice'}
          checked={config?.responseType?.type === 'multiple'}
          onchange={() => updateResponseType('multiple')}
        />
        <span>Multiple Choice (Checkboxes)</span>
      </label>
    </div>
  </div>

  <div class="form-section">
    <h3>Options</h3>
    <div class="options-list">
      {#each config?.options || [] as option, index}
        <div class="option-item">
          <div class="option-header">
            <span class="option-number">{index + 1}</span>
            <div class="option-controls">
              <Button
                variant="ghost"
                size="xs"
                onclick={() => moveOption(index, 'up')}
                disabled={index === 0}
                aria-label="Move up"
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onclick={() => moveOption(index, 'down')}
                disabled={index === (config?.options?.length || 0) - 1}
                aria-label="Move down"
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="xs"
                class="hover:text-destructive"
                onclick={() => removeOption(index)}
                disabled={(config?.options?.length || 0) <= 2}
                aria-label="Remove option"
              >
                ×
              </Button>
            </div>
          </div>

          <div class="option-fields">
            <div class="field-row">
              <div class="field flex-1">
                <label for={'label-' + index}>Label</label>
                <Input
                  id={'label-' + index}
                  type="text"
                  value={option.label}
                  oninput={(e) => updateOption(index, { label: e.currentTarget.value })}
                  placeholder="Option label"
                />
              </div>

              <div class="field" style="width: 120px">
                <label for={'value-' + index}>Value</label>
                <Input
                  id={'value-' + index}
                  type="text"
                  value={option.value}
                  oninput={(e) => updateOption(index, { value: e.currentTarget.value })}
                  placeholder="Value"
                />
              </div>

              <div class="field" style="width: 80px">
                <label for={'icon-' + index}>Icon</label>
                <Input
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
              <Input
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
                <Input
                  id={'img-' + index}
                  type="url"
                  value={typeof option.image === 'string'
                    ? option.image
                    : (option.image?.url ?? '')}
                  oninput={(e) =>
                    updateOption(index, {
                      image:
                        typeof option.image === 'object'
                          ? { ...option.image, url: e.currentTarget.value }
                          : e.currentTarget.value || undefined,
                    })}
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
                <Input
                  id={'hotkey-' + index}
                  type="text"
                  maxLength={1}
                  value={option.hotkey || ''}
                  oninput={(e) =>
                    updateOption(index, { hotkey: e.currentTarget.value || undefined })}
                  placeholder="1"
                />
              </div>
            </div>

            {#if config?.responseType?.type === 'multiple'}
              <Checkbox
                id={'exclusive-' + index}
                label="Exclusive option (deselects others when selected)"
                checked={option.exclusive || false}
                onchange={() => toggleExclusive(index)}
              />
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <Button variant="outline" size="sm" class="w-full mt-3" onclick={addOption}>+ Add Option</Button
    >
  </div>

  <div class="form-section">
    <h3>Layout</h3>
    <div class="radio-group">
      <label>
        <input
          type="radio"
          name="layout"
          value="vertical"
          checked={(config?.layout || 'vertical') === 'vertical'}
          onchange={() => updateConfig({ layout: 'vertical' })}
        />
        <span>Vertical</span>
      </label>
      <label>
        <input
          type="radio"
          name="layout"
          value="horizontal"
          checked={config?.layout === 'horizontal'}
          onchange={() => updateConfig({ layout: 'horizontal' })}
        />
        <span>Horizontal</span>
      </label>
      <label>
        <input
          type="radio"
          name="layout"
          value="grid"
          checked={config?.layout === 'grid'}
          onchange={() => updateConfig({ layout: 'grid' })}
        />
        <span>Grid</span>
      </label>
    </div>

    {#if config?.layout === 'grid'}
      <div class="field">
        <label for="grid-columns">Columns</label>
        <Input
          id="grid-columns"
          type="number"
          min="2"
          max="4"
          value={String(config?.columns ?? 2)}
          oninput={(e) => updateConfig({ columns: parseInt(e.currentTarget.value) || 2 })}
        />
      </div>
    {/if}
  </div>

  <div class="form-section">
    <h3>Options</h3>
    <div class="checkbox-label">
      <Checkbox
        id="mc-randomize"
        label="Randomize option order"
        checked={config?.randomizeOptions || false}
        onchange={(e) => updateConfig({ randomizeOptions: e.currentTarget.checked })}
      />
    </div>

    <div class="checkbox-label">
      <Checkbox
        id="mc-other-option"
        label={'Include "Other" option with text input'}
        checked={config?.otherOption || false}
        onchange={(e) => updateConfig({ otherOption: e.currentTarget.checked })}
      />
    </div>
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
</style>
