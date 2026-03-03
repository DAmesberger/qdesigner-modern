<script lang="ts">
  import type { Question } from '$lib/shared';
  import { X } from 'lucide-svelte';

  type RatingStyle = 'stars' | 'hearts' | 'thumbs' | 'numeric';

  interface RatingConfig {
    levels: number;
    style: RatingStyle;
    allowHalf?: boolean;
    showValue?: boolean;
    labels?: string[];
  }

  interface Props {
    question: Question & { config: RatingConfig };
    onUpdate?: any;
  }

  let { question = $bindable(), onUpdate }: Props = $props();

  let hasInitializedConfig = $state(false);
  let lastConfigSnapshot = $state('');
  let emitConfigUpdate = $state(false);

  function markConfigDirty() {
    emitConfigUpdate = true;
  }

  // Sync labels array size with levels count
  $effect(() => {
    const count = question.config.levels || 5;
    if (question.config.labels && question.config.labels.length > count) {
      question.config.labels = question.config.labels.slice(0, count);
      markConfigDirty();
    }
  });

  function updateLabel(index: number, value: string) {
    if (!question.config.labels) {
      question.config.labels = [];
    }
    // Fill gaps with empty strings
    while (question.config.labels.length <= index) {
      question.config.labels.push('');
    }
    question.config.labels[index] = value;
    question.config.labels = [...question.config.labels];
    markConfigDirty();
  }

  function removeLabel(index: number) {
    if (!question.config.labels) return;
    question.config.labels[index] = '';
    question.config.labels = [...question.config.labels];
    markConfigDirty();
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
  <!-- Visual Style -->
  <div class="form-group">
    <label for="rating-style">Visual Style</label>
    <select id="rating-style" bind:value={question.config.style} class="select">
      <option value="stars">Stars</option>
      <option value="hearts">Hearts</option>
      <option value="thumbs">Thumbs Up</option>
      <option value="numeric">Numeric</option>
    </select>
  </div>

  <!-- Number of Levels -->
  <div class="form-group">
    <label for="levels">Number of Levels</label>
    <input
      id="levels"
      type="number"
      bind:value={question.config.levels}
      min="2"
      max="10"
      class="input"
    />
    <p class="help-text">How many rating options (2-10)</p>
  </div>

  <!-- Options -->
  <div class="section">
    <h4 class="section-title">Options</h4>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.allowHalf} class="checkbox" />
        <span>Allow half-step ratings</span>
      </label>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.showValue} class="checkbox" />
        <span>Show numeric value</span>
      </label>
    </div>
  </div>

  <!-- Labels -->
  <div class="section">
    <h4 class="section-title">Labels (optional)</h4>
    <p class="help-text">Add descriptive labels for each rating level</p>

    <div class="labels-list">
      {#each Array(question.config.levels || 5) as _, index}
        <div class="label-item">
          <span class="label-index">{index + 1}</span>
          <input
            type="text"
            value={question.config.labels?.[index] ?? ''}
            placeholder={index === 0 ? 'e.g. Poor' : index === (question.config.levels || 5) - 1 ? 'e.g. Excellent' : `Level ${index + 1}`}
            oninput={(e) => updateLabel(index, e.currentTarget.value)}
            class="input label-input"
          />
          {#if question.config.labels?.[index]}
            <button
              class="remove-btn"
              onclick={() => removeLabel(index)}
              aria-label="Remove label"
            >
              <X size={14} />
            </button>
          {/if}
        </div>
      {/each}
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

  .labels-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .label-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .label-index {
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f6;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    flex-shrink: 0;
  }

  .label-input {
    flex: 1;
  }

  .remove-btn {
    padding: 0.25rem;
    border: none;
    background: none;
    color: #6b7280;
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .remove-btn:hover {
    background: #e5e7eb;
    color: #374151;
  }
</style>
