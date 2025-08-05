<script lang="ts">
  import type { Question } from '$lib/shared';
  import { X } from 'lucide-svelte';
  
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
  }
  
  let { question = $bindable() }: Props = $props();
  
  let newSuggestion = $state('');
  
  function addSuggestion() {
    if (!newSuggestion.trim()) return;
    
    if (!question.config.suggestions) {
      question.config.suggestions = [];
    }
    
    if (!question.config.suggestions.includes(newSuggestion.trim())) {
      question.config.suggestions = [...question.config.suggestions, newSuggestion.trim()];
    }
    
    newSuggestion = '';
  }
  
  function removeSuggestion(index: number) {
    if (!question.config.suggestions) return;
    question.config.suggestions = question.config.suggestions.filter((_, i) => i !== index);
  }
  
  // Update validation based on input type
  $effect(() => {
    if (question.config.inputType === 'email' && !question.config.pattern) {
      question.config.pattern = '^[^\s@]+@[^\s@]+\.[^\s@]+$';
    } else if (question.config.inputType === 'url' && !question.config.pattern) {
      question.config.pattern = '^https?://.*';
    } else if (question.config.inputType === 'tel' && !question.config.pattern) {
      question.config.pattern = '^[\d\s\-\+\(\)]+$';
    }
  });
</script>

<div class="designer-panel">
  <!-- Input Type Selection -->
  <div class="form-group">
    <label for="input-type">Input Type</label>
    <select 
      id="input-type"
      bind:value={question.config.inputType}
      class="select"
    >
      <option value="text">Text</option>
      <option value="number">Number</option>
      <option value="email">Email</option>
      <option value="tel">Phone</option>
      <option value="url">URL</option>
      <option value="password">Password</option>
    </select>
  </div>
  
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
  
  <!-- Text-specific options -->
  {#if question.config.inputType === 'text'}
    <div class="form-group">
      <label class="checkbox-label">
        <input 
          type="checkbox" 
          bind:checked={question.config.multiline}
          class="checkbox"
        />
        <span>Multi-line input (textarea)</span>
      </label>
    </div>
    
    {#if question.config.multiline}
      <div class="form-group">
        <label for="rows">Number of Rows</label>
        <input
          id="rows"
          type="number"
          bind:value={question.config.rows}
          min="2"
          max="20"
          class="input"
        />
      </div>
      
      <div class="form-group">
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            bind:checked={question.config.autoResize}
            class="checkbox"
          />
          <span>Auto-resize height</span>
        </label>
      </div>
    {/if}
  {/if}
  
  <!-- Number-specific options -->
  {#if question.config.inputType === 'number'}
    <div class="form-row">
      <div class="form-group">
        <label for="min">Min Value</label>
        <input
          id="min"
          type="number"
          bind:value={question.config.min}
          class="input"
        />
      </div>
      
      <div class="form-group">
        <label for="max">Max Value</label>
        <input
          id="max"
          type="number"
          bind:value={question.config.max}
          class="input"
        />
      </div>
    </div>
    
    <div class="form-group">
      <label for="step">Step</label>
      <input
        id="step"
        type="number"
        bind:value={question.config.step}
        min="0"
        step="0.1"
        class="input"
      />
    </div>
  {/if}
  
  <!-- Length constraints -->
  <div class="section">
    <h4 class="section-title">Length Constraints</h4>
    <div class="form-row">
      <div class="form-group">
        <label for="min-length">Min Length</label>
        <input
          id="min-length"
          type="number"
          bind:value={question.config.minLength}
          min="0"
          class="input"
        />
      </div>
      
      <div class="form-group">
        <label for="max-length">Max Length</label>
        <input
          id="max-length"
          type="number"
          bind:value={question.config.maxLength}
          min="0"
          class="input"
        />
      </div>
    </div>
  </div>
  
  <!-- Pattern validation -->
  {#if question.config.inputType !== 'email' && question.config.inputType !== 'url' && question.config.inputType !== 'tel'}
    <div class="form-group">
      <label for="pattern">Validation Pattern (RegEx)</label>
      <input
        id="pattern"
        type="text"
        bind:value={question.config.pattern}
        placeholder="e.g., ^[A-Z]{2}\d{4}$"
        class="input font-mono"
      />
      <p class="help-text">Regular expression for custom validation</p>
    </div>
  {/if}
  
  <!-- Spell Check -->
  <div class="form-group">
    <label class="checkbox-label">
      <input 
        type="checkbox" 
        bind:checked={question.config.spellCheck}
        class="checkbox"
      />
      <span>Enable spell check</span>
    </label>
  </div>
  
  <!-- Suggestions -->
  <div class="section">
    <h4 class="section-title">Auto-complete Suggestions</h4>
    
    <div class="suggestions-input">
      <input
        type="text"
        bind:value={newSuggestion}
        placeholder="Add a suggestion..."
        class="input"
        on:keydown={(e) => e.key === 'Enter' && addSuggestion()}
      />
      <button 
        class="btn btn-secondary"
        on:click={addSuggestion}
        disabled={!newSuggestion.trim()}
      >
        Add
      </button>
    </div>
    
    {#if question.config.suggestions?.length}
      <div class="suggestions-list">
        {#each question.config.suggestions as suggestion, i}
          <div class="suggestion-item">
            <span>{suggestion}</span>
            <button 
              class="remove-btn"
              on:click={() => removeSuggestion(i)}
              aria-label="Remove suggestion"
            >
              <X size={16} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    space-y: 1.5rem;
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
  
  .input,
  .select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    transition: all 0.15s;
  }
  
  .input:hover,
  .select:hover {
    border-color: #d1d5db;
  }
  
  .input:focus,
  .select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .font-mono {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
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
  
  .suggestions-input {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  
  .suggestions-input .input {
    flex: 1;
  }
  
  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }
  
  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .suggestions-list {
    space-y: 0.5rem;
  }
  
  .suggestion-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }
  
  .remove-btn {
    padding: 0.25rem;
    border: none;
    background: none;
    color: #6b7280;
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.15s;
  }
  
  .remove-btn:hover {
    background: #e5e7eb;
    color: #374151;
  }
</style>