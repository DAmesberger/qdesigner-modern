<script lang="ts">
  import type { Question } from '$lib/shared';
  import { X } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';

  interface TextInputConfig {
    inputType: 'text' | 'number' | 'email' | 'tel' | 'url' | 'password';
    placeholder?: string;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    multiline?: boolean;
    rows?: number;
    autoResize?: boolean;
    suggestions?: string[];
    spellCheck?: boolean;
    min?: number; // for number type
    max?: number; // for number type
    step?: number; // for number type
  }

  interface Props {
    question: Question & { config: TextInputConfig };
    onUpdate?: any;
  }

  let { question = $bindable(), onUpdate }: Props = $props();

  let newSuggestion = $state('');
  let hasInitializedConfig = $state(false);
  let lastConfigSnapshot = $state('');
  let emitConfigUpdate = $state(false);

  function markConfigDirty() {
    emitConfigUpdate = true;
  }

  function addSuggestion() {
    if (!newSuggestion.trim()) return;

    if (!question.config.suggestions) {
      question.config.suggestions = [];
    }

    if (!question.config.suggestions.includes(newSuggestion.trim())) {
      question.config.suggestions = [...question.config.suggestions, newSuggestion.trim()];
      markConfigDirty();
    }

    newSuggestion = '';
  }

  function removeSuggestion(index: number) {
    if (!question.config.suggestions) return;
    question.config.suggestions = question.config.suggestions.filter((_, i) => i !== index);
    markConfigDirty();
  }

  // Update validation based on input type
  $effect(() => {
    if (question.config.inputType === 'email' && !question.config.pattern) {
      question.config.pattern = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
      markConfigDirty();
    } else if (question.config.inputType === 'url' && !question.config.pattern) {
      question.config.pattern = '^https?://.*';
      markConfigDirty();
    } else if (question.config.inputType === 'tel' && !question.config.pattern) {
      question.config.pattern = '^[\\d\\s\\-\\+\\(\\)]+$';
      markConfigDirty();
    }
  });

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
  <!-- Input Type Selection -->
  <div class="form-group">
    <label for="input-type">Input Type</label>
    <Select id="input-type" bind:value={question.config.inputType}>
      <option value="text">Text</option>
      <option value="number">Number</option>
      <option value="email">Email</option>
      <option value="tel">Phone</option>
      <option value="url">URL</option>
      <option value="password">Password</option>
    </Select>
  </div>

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

  <!-- Text-specific options -->
  {#if question.config.inputType === 'text'}
    <div class="form-group">
      <Checkbox
        id="text-multiline"
        label="Multi-line input (textarea)"
        checked={question.config.multiline ?? false}
        onchange={(e) => (question.config.multiline = e.currentTarget.checked)}
      />
    </div>

    {#if question.config.multiline}
      <div class="form-group">
        <label for="rows">Number of Rows</label>
        <Input
          id="rows"
          type="number"
          min="2"
          max="20"
          value={question.config.rows != null ? String(question.config.rows) : ''}
          oninput={(e) =>
            (question.config.rows = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
        />
      </div>

      <div class="form-group">
        <Checkbox
          id="text-auto-resize"
          label="Auto-resize height"
          checked={question.config.autoResize ?? false}
          onchange={(e) => (question.config.autoResize = e.currentTarget.checked)}
        />
      </div>
    {/if}
  {/if}

  <!-- Number-specific options -->
  {#if question.config.inputType === 'number'}
    <div class="form-row">
      <div class="form-group">
        <label for="min">Min Value</label>
        <Input
          id="min"
          type="number"
          value={question.config.min != null ? String(question.config.min) : ''}
          oninput={(e) =>
            (question.config.min = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
        />
      </div>

      <div class="form-group">
        <label for="max">Max Value</label>
        <Input
          id="max"
          type="number"
          value={question.config.max != null ? String(question.config.max) : ''}
          oninput={(e) =>
            (question.config.max = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
        />
      </div>
    </div>

    <div class="form-group">
      <label for="step">Step</label>
      <Input
        id="step"
        type="number"
        min="0"
        step="0.1"
        value={question.config.step != null ? String(question.config.step) : ''}
        oninput={(e) =>
          (question.config.step = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
      />
    </div>
  {/if}

  <!-- Length constraints -->
  <div class="section">
    <h4 class="section-title">Length Constraints</h4>
    <div class="form-row">
      <div class="form-group">
        <label for="min-length">Min Length</label>
        <Input
          id="min-length"
          type="number"
          min="0"
          value={question.config.minLength != null ? String(question.config.minLength) : ''}
          oninput={(e) =>
            (question.config.minLength = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
        />
      </div>

      <div class="form-group">
        <label for="max-length">Max Length</label>
        <Input
          id="max-length"
          type="number"
          min="0"
          value={question.config.maxLength != null ? String(question.config.maxLength) : ''}
          oninput={(e) =>
            (question.config.maxLength = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
        />
      </div>
    </div>
  </div>

  <!-- Pattern validation -->
  {#if question.config.inputType !== 'email' && question.config.inputType !== 'url' && question.config.inputType !== 'tel'}
    <div class="form-group">
      <label for="pattern">Validation Pattern (RegEx)</label>
      <Input
        id="pattern"
        type="text"
        class="font-mono"
        value={question.config.pattern ?? ''}
        oninput={(e) => (question.config.pattern = e.currentTarget.value)}
        placeholder="e.g., ^[A-Z]{2}\d{4}$"
      />
      <p class="help-text">Regular expression for custom validation</p>
    </div>
  {/if}

  <!-- Spell Check -->
  <div class="form-group">
    <Checkbox
      id="text-spell-check"
      label="Enable spell check"
      checked={question.config.spellCheck ?? false}
      onchange={(e) => (question.config.spellCheck = e.currentTarget.checked)}
    />
  </div>

  <!-- Suggestions -->
  <div class="section">
    <h4 class="section-title">Auto-complete Suggestions</h4>

    <div class="suggestions-input">
      <Input
        type="text"
        class="flex-1"
        bind:value={newSuggestion}
        placeholder="Add a suggestion..."
        onkeydown={(e) => e.key === 'Enter' && addSuggestion()}
      />
      <Button variant="secondary" size="sm" onclick={addSuggestion} disabled={!newSuggestion.trim()}>
        Add
      </Button>
    </div>

    {#if question.config.suggestions?.length}
      <div class="suggestions-list">
        {#each question.config.suggestions as suggestion, i}
          <div class="suggestion-item">
            <span>{suggestion}</span>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => removeSuggestion(i)}
              aria-label="Remove suggestion"
            >
              <X size={16} />
            </Button>
          </div>
        {/each}
      </div>
    {/if}
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
    color: hsl(var(--foreground));
  }

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid hsl(var(--border));
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .suggestions-input {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .suggestions-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .suggestion-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

</style>
