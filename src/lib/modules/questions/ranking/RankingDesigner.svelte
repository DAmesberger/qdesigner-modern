<script lang="ts">
  import type { Question } from '$lib/shared';
  import { nanoid } from 'nanoid';
  import { ChevronUp, ChevronDown, Edit, Copy, Trash } from 'lucide-svelte';

  interface RankingItem {
    id: string;
    label: string;
  }

  interface RankingConfig {
    items: RankingItem[];
    layout?: 'vertical' | 'horizontal';
    animation?: boolean;
    allowPartial?: boolean;
    tieBreaking?: boolean;
    showNumbers?: boolean;
    dragHandlePosition?: 'left' | 'right' | 'both';
  }

  interface Props {
    question: Question & { config: RankingConfig };
  }

  let { question = $bindable() }: Props = $props();

  let editingItem: RankingItem | null = $state(null);
  let newItemLabel = $state('');

  function addItem() {
    if (!newItemLabel.trim()) return;

    const newItem: RankingItem = {
      id: nanoid(8),
      label: newItemLabel.trim(),
    };

    question.config.items = [...question.config.items, newItem];
    newItemLabel = '';
  }

  function updateItem(item: RankingItem) {
    const index = question.config.items.findIndex((i) => i.id === item.id);
    if (index !== -1) {
      question.config.items[index] = item;
      question.config.items = [...question.config.items];
    }
    editingItem = null;
  }

  function deleteItem(item: RankingItem) {
    question.config.items = question.config.items.filter((i) => i.id !== item.id);
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    const newItems = [...question.config.items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < newItems.length) {
      const current = newItems[index];
      const target = newItems[targetIndex];
      if (current && target) {
        newItems[index] = target;
        newItems[targetIndex] = current;
        question.config.items = newItems;
      }
    }
  }

  function duplicateItem(item: RankingItem) {
    const newItem: RankingItem = {
      id: nanoid(8),
      label: `${item.label} (copy)`,
    };

    const index = question.config.items.findIndex((i) => i.id === item.id);
    const newItems = [...question.config.items];
    newItems.splice(index + 1, 0, newItem);
    question.config.items = newItems;
  }
</script>

<div class="designer-panel">
  <!-- Items Management -->
  <div class="section">
    <h4 class="section-title">Items to Rank</h4>

    <div class="items-list">
      {#each question.config.items as item, index}
        {#if editingItem?.id === item.id}
          <div class="edit-item">
            <input
              type="text"
              bind:value={editingItem.label}
              class="input"
              placeholder="Item label"
              onkeydown={(e) => e.key === 'Enter' && updateItem(editingItem!)}
            />
            <div class="edit-actions">
              <button class="btn btn-primary" onclick={() => updateItem(editingItem!)}>
                Save
              </button>
              <button class="btn btn-secondary" onclick={() => (editingItem = null)}>
                Cancel
              </button>
            </div>
          </div>
        {:else}
          <div class="item">
            <div class="item-content">
              <span class="item-number">{index + 1}.</span>
              <span class="item-label">{item.label}</span>
            </div>
            <div class="item-actions">
              <button
                class="action-btn"
                onclick={() => moveItem(index, 'up')}
                disabled={index === 0}
                aria-label="Move up"
              >
                <ChevronUp size={16} />
              </button>
              <button
                class="action-btn"
                onclick={() => moveItem(index, 'down')}
                disabled={index === question.config.items.length - 1}
                aria-label="Move down"
              >
                <ChevronDown size={16} />
              </button>
              <button
                class="action-btn"
                onclick={() => (editingItem = { ...item })}
                aria-label="Edit"
              >
                <Edit size={16} />
              </button>
              <button class="action-btn" onclick={() => duplicateItem(item)} aria-label="Duplicate">
                <Copy size={16} />
              </button>
              <button
                class="action-btn delete"
                onclick={() => deleteItem(item)}
                aria-label="Delete"
              >
                <Trash size={16} />
              </button>
            </div>
          </div>
        {/if}
      {/each}
    </div>

    <div class="add-item">
      <input
        type="text"
        bind:value={newItemLabel}
        placeholder="Add new item..."
        class="input"
        onkeydown={(e) => e.key === 'Enter' && addItem()}
      />
      <button class="btn btn-secondary" onclick={addItem} disabled={!newItemLabel.trim()}>
        Add Item
      </button>
    </div>

    {#if question.config.items.length < 2}
      <p class="help-text warning">Add at least 2 items for a valid ranking task</p>
    {/if}
  </div>

  <!-- Layout Options -->
  <div class="section">
    <h4 class="section-title">Layout Options</h4>

    <div class="form-group">
      <label for="layout">Layout Direction</label>
      <select id="layout" bind:value={question.config.layout} class="select">
        <option value="vertical">Vertical (Top to Bottom)</option>
        <option value="horizontal">Horizontal (Side by Side)</option>
      </select>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.showNumbers} class="checkbox" />
        <span>Show rank numbers</span>
      </label>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.animation} class="checkbox" />
        <span>Enable drag animations</span>
      </label>
    </div>
  </div>

  <!-- Behavior Options -->
  <div class="section">
    <h4 class="section-title">Behavior</h4>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.allowPartial} class="checkbox" />
        <span>Allow partial ranking (not all items need to be ranked)</span>
      </label>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.tieBreaking} class="checkbox" />
        <span>Enable tie-breaking (allow equal ranks)</span>
      </label>
      {#if question.config.tieBreaking}
        <p class="help-text">Participants can assign the same rank to multiple items</p>
      {/if}
    </div>
  </div>

  <!-- Preview -->
  <div class="section">
    <h4 class="section-title">Preview</h4>
    <div class="preview-box">
      <div class="preview-header">
        <span>Unranked Items</span>
      </div>
      <div class="preview-items">
        {#each question.config.items as item}
          <div class="preview-item">
            {item.label}
          </div>
        {/each}
      </div>
      <div class="preview-note">
        In runtime mode, participants will drag these items to rank them
      </div>
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

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .section:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .item-number {
    font-weight: 600;
    color: #6b7280;
    font-size: 0.875rem;
  }

  .item-label {
    color: #374151;
  }

  .item-actions {
    display: flex;
    gap: 0.25rem;
  }

  .action-btn {
    padding: 0.375rem;
    border: none;
    background: white;
    color: #6b7280;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover:not(:disabled) {
    background: #e5e7eb;
    color: #374151;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.delete:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  .edit-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: white;
    border: 2px solid #3b82f6;
    border-radius: 0.375rem;
  }

  .edit-actions {
    display: flex;
    gap: 0.5rem;
  }

  .add-item {
    display: flex;
    gap: 0.5rem;
  }

  .add-item .input {
    flex: 1;
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

  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover {
    background: #2563eb;
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

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .help-text.warning {
    color: #f97316;
  }

  /* Preview */
  .preview-box {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .preview-header {
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.75rem;
  }

  .preview-items {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .preview-item {
    padding: 0.5rem 0.75rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    color: #374151;
  }

  .preview-note {
    margin-top: 0.75rem;
    font-size: 0.75rem;
    color: #6b7280;
    font-style: italic;
  }
</style>
