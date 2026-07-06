<script lang="ts">
  import type { Question } from '$lib/shared';
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
    question: Question & { config: NumberInputConfig };
    onUpdate?: any;
  }

  let { question = $bindable(), onUpdate }: Props = $props();

  let hasInitializedConfig = $state(false);
  let lastConfigSnapshot = $state('');
  let emitConfigUpdate = $state(false);

  function markConfigDirty() {
    emitConfigUpdate = true;
  }

  // Keep parent question config in sync whenever this designer mutates config state.
  $effect(() => {
    const snapshot = JSON.stringify(question.config ?? {});

    if (!hasInitializedConfig) {
      hasInitializedConfig = true;
      lastConfigSnapshot = snapshot;
      return;
    }

    if (snapshot === lastConfigSnapshot) return;

    lastConfigSnapshot = snapshot;
    if (!emitConfigUpdate) return;

    emitConfigUpdate = false;
    onUpdate?.({ config: { ...question.config } } as Partial<Question>);
  });
</script>

<div class="designer-panel" oninput={markConfigDirty} onchange={markConfigDirty}>
  <!-- Placeholder -->
  <div class="form-group">
    <label for="placeholder">Placeholder Text</label>
    <Input
      id="placeholder"
      type="text"
      value={question.config.placeholder ?? ''}
      oninput={(e) => (question.config.placeholder = e.currentTarget.value)}
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
          value={question.config.min != null ? String(question.config.min) : ''}
          oninput={(e) =>
            (question.config.min = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
        />
      </div>

      <div class="form-group">
        <label for="max">Maximum</label>
        <Input
          id="max"
          type="number"
          value={question.config.max != null ? String(question.config.max) : ''}
          oninput={(e) =>
            (question.config.max = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
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
          value={question.config.step != null ? String(question.config.step) : ''}
          oninput={(e) =>
            (question.config.step = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
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
          value={question.config.decimalPlaces != null ? String(question.config.decimalPlaces) : ''}
          oninput={(e) =>
            (question.config.decimalPlaces =
              e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
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
          value={question.config.prefix ?? ''}
          oninput={(e) => (question.config.prefix = e.currentTarget.value)}
          placeholder="e.g. $"
        />
      </div>

      <div class="form-group">
        <label for="suffix">Suffix</label>
        <Input
          id="suffix"
          type="text"
          value={question.config.suffix ?? ''}
          oninput={(e) => (question.config.suffix = e.currentTarget.value)}
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
        checked={question.config.showSpinButtons ?? false}
        onchange={(e) => (question.config.showSpinButtons = e.currentTarget.checked)}
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
