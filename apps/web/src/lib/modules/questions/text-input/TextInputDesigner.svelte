<script lang="ts">
  import type { Question } from '$lib/shared';
  import {
    buildModuleConfigUpdate,
    buildModuleRuntimeConfig,
  } from '$lib/runtime/core/moduleConfigAdapter';
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
    question: Question & { config?: TextInputConfig };
    onUpdate?: (updates: Record<string, unknown>) => void;
  }

  let { question, onUpdate }: Props = $props();
  const config = $derived(buildModuleRuntimeConfig(question) as unknown as TextInputConfig);
  function updateConfig(updates: Partial<TextInputConfig>) {
    onUpdate?.(buildModuleConfigUpdate(question, updates));
  }
  let newSuggestion = $state('');
  function addSuggestion() {
    const value = newSuggestion.trim();
    if (value && !config.suggestions?.includes(value))
      updateConfig({ suggestions: [...(config.suggestions ?? []), value] });
    newSuggestion = '';
  }
  function removeSuggestion(index: number) {
    updateConfig({ suggestions: (config.suggestions ?? []).filter((_, i) => i !== index) });
  }
</script>

<div class="designer-panel">
  <!-- Input Type Selection -->
  <div class="form-group">
    <label for="input-type">Input Type</label>
    <Select
      id="input-type"
      value={config.inputType}
      onchange={(e) =>
        updateConfig({ inputType: e.currentTarget.value as TextInputConfig['inputType'] })}
    >
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
      value={config.placeholder ?? ''}
      oninput={(e) => updateConfig({ placeholder: e.currentTarget.value })}
      placeholder="Enter placeholder text..."
    />
  </div>

  <!-- Text-specific options -->
  {#if config.inputType === 'text'}
    <div class="form-group">
      <Checkbox
        id="text-multiline"
        label="Multi-line input (textarea)"
        checked={config.multiline ?? false}
        onchange={(e) => updateConfig({ multiline: e.currentTarget.checked })}
      />
    </div>

    {#if config.multiline}
      <div class="form-group">
        <label for="rows">Number of Rows</label>
        <Input
          id="rows"
          type="number"
          min="2"
          max="20"
          value={config.rows != null ? String(config.rows) : ''}
          oninput={(e) =>
            updateConfig({
              rows: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
            })}
        />
      </div>

      <div class="form-group">
        <Checkbox
          id="text-auto-resize"
          label="Auto-resize height"
          checked={config.autoResize ?? false}
          onchange={(e) => updateConfig({ autoResize: e.currentTarget.checked })}
        />
      </div>
    {/if}
  {/if}

  <!-- Number-specific options -->
  {#if config.inputType === 'number'}
    <div class="form-row">
      <div class="form-group">
        <label for="min">Min Value</label>
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
        <label for="max">Max Value</label>
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

    <div class="form-group">
      <label for="step">Step</label>
      <Input
        id="step"
        type="number"
        min="0"
        step="0.1"
        value={config.step != null ? String(config.step) : ''}
        oninput={(e) =>
          updateConfig({
            step: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
          })}
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
          value={config.minLength != null ? String(config.minLength) : ''}
          oninput={(e) =>
            updateConfig({
              minLength: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
            })}
        />
      </div>

      <div class="form-group">
        <label for="max-length">Max Length</label>
        <Input
          id="max-length"
          type="number"
          min="0"
          value={config.maxLength != null ? String(config.maxLength) : ''}
          oninput={(e) =>
            updateConfig({
              maxLength: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
            })}
        />
      </div>
    </div>
  </div>

  <!-- Pattern validation -->
  {#if config.inputType !== 'email' && config.inputType !== 'url' && config.inputType !== 'tel'}
    <div class="form-group">
      <label for="pattern">Validation Pattern (RegEx)</label>
      <Input
        id="pattern"
        type="text"
        class="font-mono"
        value={config.pattern ?? ''}
        oninput={(e) => updateConfig({ pattern: e.currentTarget.value })}
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
      checked={config.spellCheck ?? false}
      onchange={(e) => updateConfig({ spellCheck: e.currentTarget.checked })}
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
      <Button
        variant="secondary"
        size="sm"
        onclick={addSuggestion}
        disabled={!newSuggestion.trim()}
      >
        Add
      </Button>
    </div>

    {#if config.suggestions?.length}
      <div class="suggestions-list">
        {#each config.suggestions as suggestion, i}
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
