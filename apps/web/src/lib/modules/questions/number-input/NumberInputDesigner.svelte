<script lang="ts">
  import type { Question } from '$lib/shared';
  import {
    buildModuleConfigUpdate,
    buildModuleRuntimeConfig,
  } from '$lib/runtime/core/moduleConfigAdapter';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';

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

  interface Props {
    question: Question & { config?: NumberInputConfig };
    onUpdate?: (updates: Record<string, unknown>) => void;
  }

  let { question, onUpdate }: Props = $props();
  const config = $derived(buildModuleRuntimeConfig(question) as unknown as NumberInputConfig);
  function updateConfig(updates: Partial<NumberInputConfig>) {
    onUpdate?.(buildModuleConfigUpdate(question, updates));
  }
</script>

<div class="designer-panel">
  <!-- Placeholder -->
  <div class="form-group">
    <label for="placeholder">Placeholder Text</label>
    <Input
      id="placeholder"
      type="text"
      value={config.placeholder ?? ''}
      oninput={(e) => updateConfig({ placeholder: e.currentTarget.value })}
      placeholder="Enter placeholder text..."
    />
  </div>

  <!-- Min / Max -->
  <div class="section">
    <h4 class="section-title">Value Constraints</h4>
    <div class="form-row">
      <div class="form-group">
        <label for="min">Minimum</label>
        <Input
          id="min"
          type="number"
          value={config.min != null ? String(config.min) : ''}
          oninput={(e) =>
            updateConfig({
              min: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
            })}
        />
      </div>

      <div class="form-group">
        <label for="max">Maximum</label>
        <Input
          id="max"
          type="number"
          value={config.max != null ? String(config.max) : ''}
          oninput={(e) =>
            updateConfig({
              max: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
            })}
        />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="step">Step</label>
        <Input
          id="step"
          type="number"
          min="0"
          step="any"
          value={config.step != null ? String(config.step) : ''}
          oninput={(e) =>
            updateConfig({
              step: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
            })}
        />
        <p class="help-text">Increment for spin buttons and arrow keys</p>
      </div>

      <div class="form-group">
        <label for="decimal-places">Decimal Places</label>
        <Input
          id="decimal-places"
          type="number"
          min="0"
          max="10"
          value={config.decimalPlaces != null ? String(config.decimalPlaces) : ''}
          oninput={(e) =>
            updateConfig({
              decimalPlaces:
                e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
            })}
        />
        <p class="help-text">Leave empty for auto</p>
      </div>
    </div>
  </div>

  <!-- Prefix / Suffix -->
  <div class="section">
    <h4 class="section-title">Prefix & Suffix</h4>
    <div class="form-row">
      <div class="form-group">
        <label for="prefix">Prefix</label>
        <Input
          id="prefix"
          type="text"
          value={config.prefix ?? ''}
          oninput={(e) => updateConfig({ prefix: e.currentTarget.value })}
          placeholder="e.g. $"
        />
      </div>

      <div class="form-group">
        <label for="suffix">Suffix</label>
        <Input
          id="suffix"
          type="text"
          value={config.suffix ?? ''}
          oninput={(e) => updateConfig({ suffix: e.currentTarget.value })}
          placeholder="e.g. kg"
        />
      </div>
    </div>
  </div>

  <!-- Spin Buttons Toggle -->
  <div class="section">
    <h4 class="section-title">Display Options</h4>
    <div class="form-group">
      <Checkbox
        id="number-spin-buttons"
        label="Show spin buttons (up/down arrows)"
        checked={config.showSpinButtons ?? false}
        onchange={(e) => updateConfig({ showSpinButtons: e.currentTarget.checked })}
      />
    </div>
  </div>
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
</style>
