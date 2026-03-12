<script lang="ts">
  import type { Question } from '$lib/shared';
  import { nanoid } from 'nanoid';
  import { ChevronUp, ChevronDown, Edit, Copy, Trash } from 'lucide-svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

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
              <Button variant="primary" size="sm" onclick={() => updateItem(editingItem!)}>
                Save
              </Button>
              <Button variant="secondary" size="sm" onclick={() => (editingItem = null)}>
                Cancel
              </Button>
            </div>
          </div>
        {:else}
          <div class="item">
            <div class="item-content">
              <span class="item-number">{index + 1}.</span>
              <span class="item-label">{item.label}</span>
            </div>
            <div class="item-actions">
              <Button
                variant="ghost"
                size="sm"
                onclick={() => moveItem(index, 'up')}
                disabled={index === 0}
                aria-label="Move up"
              >
                <ChevronUp size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => moveItem(index, 'down')}
                disabled={index === question.config.items.length - 1}
                aria-label="Move down"
              >
                <ChevronDown size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => (editingItem = { ...item })}
                aria-label="Edit"
              >
                <Edit size={16} />
              </Button>
              <Button variant="ghost" size="sm" onclick={() => duplicateItem(item)} aria-label="Duplicate">
                <Copy size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="hover:text-destructive"
                onclick={() => deleteItem(item)}
                aria-label="Delete"
              >
                <Trash size={16} />
              </Button>
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
      <Button variant="secondary" size="sm" onclick={addItem} disabled={!newItemLabel.trim()}>
        Add Item
      </Button>
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
      <Select id="layout" bind:value={question.config.layout}>
        <option value="vertical">Vertical (Top to Bottom)</option>
        <option value="horizontal">Horizontal (Side by Side)</option>
      </Select>
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
    border-top: 1px solid hsl(var(--border));
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
    color: hsl(var(--foreground));
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
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
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
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
  }

  .item-label {
    color: hsl(var(--foreground));
  }

  .item-actions {
    display: flex;
    gap: 0.25rem;
  }

  .edit-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: hsl(var(--background));
    border: 2px solid hsl(var(--primary));
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
    color: hsl(var(--foreground));
  }

  .input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    transition: all 0.15s;
  }

  .input:hover {
    border-color: hsl(var(--border));
  }

  .input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
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

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .help-text.warning {
    color: hsl(var(--warning));
  }

  /* Preview */
  .preview-box {
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .preview-header {
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin-bottom: 0.75rem;
  }

  .preview-items {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .preview-item {
    padding: 0.5rem 0.75rem;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 0.25rem;
    font-size: 0.875rem;
    color: hsl(var(--foreground));
  }

  .preview-note {
    margin-top: 0.75rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }
</style>
