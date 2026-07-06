<script lang="ts">
  import type { Question } from '$lib/shared';
  import { nanoid } from 'nanoid';
  import { ChevronUp, ChevronDown, Edit, Copy, Trash } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';

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

  // Defensive read: config may be transiently absent (e.g. when the
  // selection moves to another question) or lack `items` on a legacy
  // question. Falling back keeps {#each} iteration and .length from
  // throwing during render and freezing the entire designer.
  const items = $derived(question.config?.items ?? []);

  let editingItem: RankingItem | null = $state(null);
  let newItemLabel = $state('');

  function addItem() {
    if (!newItemLabel.trim()) return;

    const newItem: RankingItem = {
      id: nanoid(8),
      label: newItemLabel.trim(),
    };

    question.config.items = [...(question.config.items ?? []), newItem];
    newItemLabel = '';
  }

  function updateItem(item: RankingItem) {
    const current = question.config.items ?? [];
    const index = current.findIndex((i) => i.id === item.id);
    if (index !== -1) {
      current[index] = item;
      question.config.items = [...current];
    }
    editingItem = null;
  }

  function deleteItem(item: RankingItem) {
    question.config.items = (question.config.items ?? []).filter((i) => i.id !== item.id);
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    const newItems = [...(question.config.items ?? [])];
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

    const current = question.config.items ?? [];
    const index = current.findIndex((i) => i.id === item.id);
    const newItems = [...current];
    newItems.splice(index + 1, 0, newItem);
    question.config.items = newItems;
  }
</script>

<div class="designer-panel">
  <!-- Items Management -->
  <div class="section">
    <h4 class="section-title">Items to Rank</h4>

    <div class="items-list">
      {#each items as item, index}
        {#if editingItem?.id === item.id}
          <div class="edit-item">
            <Input
              type="text"
              bind:value={editingItem.label}
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
                disabled={index === items.length - 1}
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
      <Input
        type="text"
        class="flex-1"
        bind:value={newItemLabel}
        placeholder="Add new item..."
        onkeydown={(e) => e.key === 'Enter' && addItem()}
      />
      <Button variant="secondary" size="sm" onclick={addItem} disabled={!newItemLabel.trim()}>
        Add Item
      </Button>
    </div>

    {#if items.length < 2}
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
      <Checkbox
        id="ranking-show-numbers"
        label="Show rank numbers"
        checked={question.config.showNumbers ?? false}
        onchange={(e) => (question.config.showNumbers = e.currentTarget.checked)}
      />
    </div>

    <div class="form-group">
      <Checkbox
        id="ranking-animation"
        label="Enable drag animations"
        checked={question.config.animation ?? false}
        onchange={(e) => (question.config.animation = e.currentTarget.checked)}
      />
    </div>
  </div>

  <!-- Behavior Options -->
  <div class="section">
    <h4 class="section-title">Behavior</h4>

    <div class="form-group">
      <Checkbox
        id="ranking-allow-partial"
        label="Allow partial ranking (not all items need to be ranked)"
        checked={question.config.allowPartial ?? false}
        onchange={(e) => (question.config.allowPartial = e.currentTarget.checked)}
      />
    </div>

    <div class="form-group">
      <Checkbox
        id="ranking-tie-breaking"
        label="Enable tie-breaking (allow equal ranks)"
        checked={question.config.tieBreaking ?? false}
        onchange={(e) => (question.config.tieBreaking = e.currentTarget.checked)}
      />
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
        {#each items as item}
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
