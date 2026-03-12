<script lang="ts">
  import type { Question } from '$lib/shared';

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
    <input
      id="placeholder"
      type="text"
      bind:value={question.config.placeholder}
      placeholder="Enter placeholder text..."
      class="input"
    />
  </div>

  <!-- Min / Max -->
  <div class="section">
    <h4 class="section-title">Value Constraints</h4>
    <div class="form-row">
      <div class="form-group">
        <label for="min">Minimum</label>
        <input id="min" type="number" bind:value={question.config.min} class="input" />
      </div>

      <div class="form-group">
        <label for="max">Maximum</label>
        <input id="max" type="number" bind:value={question.config.max} class="input" />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="step">Step</label>
        <input
          id="step"
          type="number"
          bind:value={question.config.step}
          min="0"
          step="any"
          class="input"
        />
        <p class="help-text">Increment for spin buttons and arrow keys</p>
      </div>

      <div class="form-group">
        <label for="decimal-places">Decimal Places</label>
        <input
          id="decimal-places"
          type="number"
          bind:value={question.config.decimalPlaces}
          min="0"
          max="10"
          class="input"
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
        <input
          id="prefix"
          type="text"
          bind:value={question.config.prefix}
          placeholder="e.g. $"
          class="input"
        />
      </div>

      <div class="form-group">
        <label for="suffix">Suffix</label>
        <input
          id="suffix"
          type="text"
          bind:value={question.config.suffix}
          placeholder="e.g. kg"
          class="input"
        />
      </div>
    </div>
  </div>

  <!-- Spin Buttons Toggle -->
  <div class="section">
    <h4 class="section-title">Display Options</h4>
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          bind:checked={question.config.showSpinButtons}
          class="checkbox"
        />
        <span>Show spin buttons (up/down arrows)</span>
      </label>
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

  .input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    transition: all 0.15s;
  }

  .input:hover {
    border-color: #d1d5db;
  }

  .input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
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
