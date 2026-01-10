<script lang="ts">
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';

  interface ScaleConfig {
    min: number;
    max: number;
    step: number;
    labels?: ScaleLabel[];
    displayType: 'slider' | 'buttons' | 'stars' | 'visual-analog';
    showValue?: boolean;
    showLabels?: boolean;
    orientation?: 'horizontal' | 'vertical';
    defaultValue?: number;
  }

  interface ScaleLabel {
    value: number;
    label: string;
    description?: string;
  }

  interface Props extends QuestionProps {
    question: Question & { config: ScaleConfig };
  }

  let { question, onResponse }: Props = $props();

  // Initialize config if it doesn't exist
  $effect(() => {
    if (!question.config) {
      question.config = {
        min: 1,
        max: 10,
        step: 1,
        displayType: 'buttons',
        showValue: true,
        showLabels: true,
        orientation: 'horizontal',
      };
    }
  });

  function updateConfig(updates: Partial<ScaleConfig>) {
    onResponse?.({
      ...question,
      config: {
        ...question.config,
        ...updates,
      },
    });
  }

  function updateLabel(index: number, field: keyof ScaleLabel, value: any) {
    const labels = [...(question.config?.labels || [])];
    if (labels[index]) {
      labels[index] = { ...labels[index], [field]: value };
      updateConfig({ labels });
    }
  }

  function addLabel() {
    const labels = [...(question.config?.labels || [])];
    const nextValue =
      labels.length > 0 ? Math.max(...labels.map((l) => l.value)) + 1 : question.config?.min || 1;

    if (nextValue <= (question.config?.max || 10)) {
      labels.push({
        value: nextValue,
        label: `Label ${nextValue}`,
      });
      updateConfig({ labels });
    }
  }

  function removeLabel(index: number) {
    const labels = [...(question.config?.labels || [])];
    labels.splice(index, 1);
    updateConfig({ labels });
  }

  // Ensure min/max labels exist
  $effect(() => {
    const labels = question.config.labels || [];
    const hasMinLabel = labels.some((l) => l.value === (question.config?.min || 1));
    const hasMaxLabel = labels.some((l) => l.value === (question.config?.max || 10));

    if (!hasMinLabel || !hasMaxLabel) {
      const newLabels = [...labels];
      if (!hasMinLabel) {
        newLabels.push({
          value: question.config?.min || 1,
          label: 'Minimum',
        });
      }
      if (!hasMaxLabel) {
        newLabels.push({
          value: question.config?.max || 10,
          label: 'Maximum',
        });
      }
      updateConfig({ labels: newLabels.sort((a, b) => a.value - b.value) });
    }
  });
</script>

<div class="scale-designer">
  <div class="form-section">
    <h3>Scale Range</h3>

    <div class="form-row">
      <div class="field">
        <label for="scale-min">Minimum</label>
        <input
          id="scale-min"
          type="number"
          value={question.config?.min || 1}
          oninput={(e) => updateConfig({ min: parseInt(e.currentTarget.value) || 0 })}
        />
      </div>

      <div class="field">
        <label for="scale-max">Maximum</label>
        <input
          id="scale-max"
          type="number"
          value={question.config?.max || 10}
          oninput={(e) => updateConfig({ max: parseInt(e.currentTarget.value) || 10 })}
        />
      </div>

      <div class="field">
        <label for="scale-step">Step</label>
        <input
          id="scale-step"
          type="number"
          min="0.1"
          step="0.1"
          value={question.config?.step || 1}
          oninput={(e) => updateConfig({ step: parseFloat(e.currentTarget.value) || 1 })}
        />
      </div>
    </div>
  </div>

  <div class="form-section">
    <h3>Display Type</h3>

    <div class="radio-group">
      <label>
        <input
          type="radio"
          name="displayType"
          value="buttons"
          checked={question.config?.displayType === 'buttons'}
          onchange={() => updateConfig({ displayType: 'buttons' })}
        />
        <span>Buttons</span>
      </label>

      <label>
        <input
          type="radio"
          name="displayType"
          value="slider"
          checked={question.config?.displayType === 'slider'}
          onchange={() => updateConfig({ displayType: 'slider' })}
        />
        <span>Slider</span>
      </label>

      <label>
        <input
          type="radio"
          name="displayType"
          value="stars"
          checked={question.config?.displayType === 'stars'}
          onchange={() => updateConfig({ displayType: 'stars' })}
        />
        <span>Stars</span>
      </label>

      <label>
        <input
          type="radio"
          name="displayType"
          value="visual-analog"
          checked={question.config?.displayType === 'visual-analog'}
          onchange={() => updateConfig({ displayType: 'visual-analog' })}
        />
        <span>Visual Analog Scale</span>
      </label>
    </div>
  </div>

  {#if question.config?.displayType === 'buttons'}
    <div class="form-section">
      <h3>Orientation</h3>

      <div class="radio-group">
        <label>
          <input
            type="radio"
            name="orientation"
            value="horizontal"
            checked={(question.config?.orientation || 'horizontal') === 'horizontal'}
            onchange={() => updateConfig({ orientation: 'horizontal' })}
          />
          <span>Horizontal</span>
        </label>

        <label>
          <input
            type="radio"
            name="orientation"
            value="vertical"
            checked={question.config?.orientation === 'vertical'}
            onchange={() => updateConfig({ orientation: 'vertical' })}
          />
          <span>Vertical</span>
        </label>
      </div>
    </div>
  {/if}

  <div class="form-section">
    <h3>Display Options</h3>

    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={question.config?.showValue ?? true}
        onchange={(e) => updateConfig({ showValue: e.currentTarget.checked })}
      />
      <span>Show selected value</span>
    </label>

    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={question.config?.showLabels ?? true}
        onchange={(e) => updateConfig({ showLabels: e.currentTarget.checked })}
      />
      <span>Show labels</span>
    </label>

    <div class="field">
      <label
        >Default Value (optional)
        <input
          type="number"
          min={question.config.min}
          max={question.config.max}
          step={question.config.step}
          placeholder="No default"
          value={question.config?.defaultValue || ''}
          oninput={(e) =>
            updateConfig({
              defaultValue: e.currentTarget.value ? parseFloat(e.currentTarget.value) : undefined,
            })}
        />
      </label>
    </div>
  </div>

  <div class="form-section">
    <h3>Labels</h3>
    <p class="help-text">Define custom labels for specific scale values</p>

    <div class="labels-list">
      {#each question.config?.labels || [] as label, index}
        <div class="label-item">
          <div class="label-fields">
            <div class="field">
              <label
                >Value
                <input
                  type="number"
                  min={question.config.min}
                  max={question.config.max}
                  step={question.config.step}
                  value={label.value}
                  oninput={(e) =>
                    updateLabel(index, 'value', parseFloat(e.currentTarget.value) || 0)}
                />
              </label>
            </div>

            <div class="field flex-1">
              <label
                >Label
                <input
                  type="text"
                  value={label.label}
                  oninput={(e) => updateLabel(index, 'label', e.currentTarget.value)}
                  placeholder="Label text"
                />
              </label>
            </div>

            <button class="remove-button" onclick={() => removeLabel(index)} title="Remove label">
              ×
            </button>
          </div>

          <div class="field full-width">
            <label
              >Description (optional)
              <input
                type="text"
                value={label.description || ''}
                oninput={(e) =>
                  updateLabel(index, 'description', e.currentTarget.value || undefined)}
                placeholder="Additional description for this value"
              />
            </label>
          </div>
        </div>
      {/each}
    </div>

    <button class="add-button" onclick={addLabel}> + Add Label </button>
  </div>
</div>

<style>
  .scale-designer {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-section {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 0.5rem;
  }

  h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.75rem;
  }

  .help-text {
    font-size: 0.75rem;
    color: #6b7280;
    margin-bottom: 0.75rem;
  }

  .form-row {
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

  .field.full-width {
    width: 100%;
  }

  .field label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #374151;
  }

  .field input {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .field input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
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

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  .labels-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .label-item {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 0.75rem;
  }

  .label-fields {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
    margin-bottom: 0.5rem;
  }

  .remove-button {
    padding: 0.5rem 0.75rem;
    background: #fee2e2;
    color: #dc2626;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
    transition: all 0.15s;
  }

  .remove-button:hover {
    background: #fecaca;
  }

  .add-button {
    margin-top: 0.75rem;
    padding: 0.5rem 1rem;
    border: 2px dashed #d1d5db;
    border-radius: 0.375rem;
    background: transparent;
    color: #6b7280;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
  }

  .add-button:hover {
    border-color: #3b82f6;
    color: #3b82f6;
    background: #eff6ff;
  }
</style>
