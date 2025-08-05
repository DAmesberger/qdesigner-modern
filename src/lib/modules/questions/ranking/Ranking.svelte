<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { flip } from 'svelte/animate';
  
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
  
  interface Props extends QuestionProps {
    question: Question & { config: RankingConfig };
  }
  
  let {
    question,
    mode = 'runtime',
    value = $bindable([]),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction
  }: Props = $props();
  
  // State
  let rankedItems = $state<Array<RankingItem & { rank?: number }>>([]);
  let unrankedItems = $state<RankingItem[]>([]);
  let draggedItem = $state<RankingItem | null>(null);
  let draggedFrom = $state<'ranked' | 'unranked' | null>(null);
  let draggedIndex = $state(-1);
  let dropTarget = $state<'ranked' | 'unranked' | null>(null);
  let dropIndex = $state(-1);
  
  // Configuration
  const config = $derived(question.config);
  const items = $derived(config.items || []);
  const allowPartial = $derived(config.allowPartial !== false);
  const animation = $derived(config.animation !== false);
  const layout = $derived(config.layout || 'vertical');
  const showNumbers = $derived(config.showNumbers !== false);
  
  // Initialize items
  $effect(() => {
    if (value && Array.isArray(value)) {
      // Restore from saved value
      rankedItems = value.map((itemId, index) => {
        const item = items.find(i => i.id === itemId);
        return item ? { ...item, rank: index + 1 } : null;
      }).filter(Boolean) as typeof rankedItems;
      
      unrankedItems = items.filter(item => 
        !value.includes(item.id)
      );
    } else {
      // Initialize fresh
      rankedItems = [];
      unrankedItems = [...items];
    }
  });
  
  // Validation
  $effect(() => {
    const errors: string[] = [];
    let isValid = true;
    
    if (question.required && !allowPartial && rankedItems.length < items.length) {
      errors.push('Please rank all items');
      isValid = false;
    } else if (question.required && rankedItems.length === 0) {
      errors.push('Please rank at least one item');
      isValid = false;
    }
    
    onValidation?.({ valid: isValid, errors });
  });
  
  // Drag and drop handlers
  function handleDragStart(event: DragEvent, item: RankingItem, from: 'ranked' | 'unranked', index: number) {
    if (disabled || mode !== 'runtime') return;
    
    draggedItem = item;
    draggedFrom = from;
    draggedIndex = index;
    
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', item.id);
    
    // Add dragging class
    (event.target as HTMLElement).classList.add('dragging');
    
    onInteraction?.({
      type: 'drag-start',
      timestamp: Date.now(),
      data: { item: item.id, from, index }
    });
  }
  
  function handleDragEnd(event: DragEvent) {
    (event.target as HTMLElement).classList.remove('dragging');
    draggedItem = null;
    draggedFrom = null;
    draggedIndex = -1;
    dropTarget = null;
    dropIndex = -1;
  }
  
  function handleDragOver(event: DragEvent, target: 'ranked' | 'unranked', index?: number) {
    if (!draggedItem) return;
    
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    
    dropTarget = target;
    if (index !== undefined) {
      dropIndex = index;
    }
  }
  
  function handleDrop(event: DragEvent, target: 'ranked' | 'unranked', index?: number) {
    event.preventDefault();
    
    if (!draggedItem || !draggedFrom) return;
    
    // Remove from source
    if (draggedFrom === 'ranked') {
      rankedItems = rankedItems.filter((_, i) => i !== draggedIndex);
    } else {
      unrankedItems = unrankedItems.filter((_, i) => i !== draggedIndex);
    }
    
    // Add to target
    if (target === 'ranked') {
      if (index !== undefined) {
        rankedItems.splice(index, 0, { ...draggedItem, rank: index + 1 });
      } else {
        rankedItems = [...rankedItems, { ...draggedItem, rank: rankedItems.length + 1 }];
      }
      // Update ranks
      rankedItems = rankedItems.map((item, i) => ({ ...item, rank: i + 1 }));
    } else {
      unrankedItems = [...unrankedItems, draggedItem];
    }
    
    // Update value
    updateValue();
    
    onInteraction?.({
      type: 'drop',
      timestamp: Date.now(),
      data: { 
        item: draggedItem.id, 
        from: draggedFrom, 
        to: target, 
        index: index ?? -1 
      }
    });
  }
  
  function moveItem(from: 'ranked' | 'unranked', fromIndex: number, to: 'ranked' | 'unranked', toIndex?: number) {
    let item: RankingItem;
    
    // Remove from source
    if (from === 'ranked') {
      item = rankedItems[fromIndex];
      rankedItems = rankedItems.filter((_, i) => i !== fromIndex);
    } else {
      item = unrankedItems[fromIndex];
      unrankedItems = unrankedItems.filter((_, i) => i !== fromIndex);
    }
    
    // Add to target
    if (to === 'ranked') {
      if (toIndex !== undefined) {
        rankedItems.splice(toIndex, 0, { ...item, rank: toIndex + 1 });
      } else {
        rankedItems = [...rankedItems, { ...item, rank: rankedItems.length + 1 }];
      }
      // Update ranks
      rankedItems = rankedItems.map((item, i) => ({ ...item, rank: i + 1 }));
    } else {
      unrankedItems = [...unrankedItems, item];
    }
    
    updateValue();
  }
  
  function updateValue() {
    value = rankedItems.map(item => item.id);
    onResponse?.(value);
  }
  
  function moveUp(index: number) {
    if (index > 0) {
      const items = [...rankedItems];
      [items[index - 1], items[index]] = [items[index], items[index - 1]];
      rankedItems = items.map((item, i) => ({ ...item, rank: i + 1 }));
      updateValue();
      
      onInteraction?.({
        type: 'reorder',
        timestamp: Date.now(),
        data: { item: items[index].id, direction: 'up', newIndex: index - 1 }
      });
    }
  }
  
  function moveDown(index: number) {
    if (index < rankedItems.length - 1) {
      const items = [...rankedItems];
      [items[index], items[index + 1]] = [items[index + 1], items[index]];
      rankedItems = items.map((item, i) => ({ ...item, rank: i + 1 }));
      updateValue();
      
      onInteraction?.({
        type: 'reorder',
        timestamp: Date.now(),
        data: { item: items[index].id, direction: 'down', newIndex: index + 1 }
      });
    }
  }
  
  function removeFromRanking(index: number) {
    const item = rankedItems[index];
    rankedItems = rankedItems.filter((_, i) => i !== index);
    unrankedItems = [...unrankedItems, { id: item.id, label: item.label }];
    rankedItems = rankedItems.map((item, i) => ({ ...item, rank: i + 1 }));
    updateValue();
    
    onInteraction?.({
      type: 'remove',
      timestamp: Date.now(),
      data: { item: item.id, from: 'ranked' }
    });
  }
  
  function addToRanking(index: number) {
    const item = unrankedItems[index];
    unrankedItems = unrankedItems.filter((_, i) => i !== index);
    rankedItems = [...rankedItems, { ...item, rank: rankedItems.length + 1 }];
    updateValue();
    
    onInteraction?.({
      type: 'add',
      timestamp: Date.now(),
      data: { item: item.id, to: 'ranked' }
    });
  }
  
  function resetRanking() {
    rankedItems = [];
    unrankedItems = [...items];
    updateValue();
    
    onInteraction?.({
      type: 'reset',
      timestamp: Date.now(),
      data: {}
    });
  }
</script>

<BaseQuestion
  {question}
  {mode}
  bind:value
  {disabled}
  {onResponse}
  {onValidation}
  {onInteraction}
>
  <div class="ranking-container" class:horizontal={layout === 'horizontal'}>
    <div class="ranking-area">
      <div class="area-header">
        <h4>Ranked Items</h4>
        <span class="count">{rankedItems.length} / {items.length}</span>
      </div>
      
      <div 
        class="ranked-list"
        on:dragover|preventDefault={(e) => handleDragOver(e, 'ranked')}
        on:drop|preventDefault={(e) => handleDrop(e, 'ranked')}
        class:drop-active={dropTarget === 'ranked'}
      >
        {#each rankedItems as item, index (item.id)}
          <div
            animate:flip={{ duration: animation ? 250 : 0 }}
            class="ranked-item"
            class:drop-above={dropTarget === 'ranked' && dropIndex === index}
            draggable={!disabled && mode === 'runtime'}
            on:dragstart={(e) => handleDragStart(e, item, 'ranked', index)}
            on:dragend={handleDragEnd}
            on:dragover|preventDefault={(e) => handleDragOver(e, 'ranked', index)}
          >
            {#if showNumbers}
              <span class="rank">{item.rank}</span>
            {/if}
            <span class="label">{item.label}</span>
            {#if !disabled && mode === 'runtime'}
              <div class="actions">
                <button
                  class="move-button"
                  on:click={() => moveUp(index)}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  class="move-button"
                  on:click={() => moveDown(index)}
                  disabled={index === rankedItems.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  class="remove-button"
                  on:click={() => removeFromRanking(index)}
                  aria-label="Remove from ranking"
                >
                  ✕
                </button>
              </div>
            {/if}
          </div>
        {/each}
        
        {#if rankedItems.length === 0}
          <div class="empty-message">
            Drag items here to rank them
          </div>
        {/if}
      </div>
    </div>
    
    <div class="divider" />
    
    <div class="unranked-area">
      <div class="area-header">
        <h4>Unranked Items</h4>
        <span class="count">{unrankedItems.length}</span>
      </div>
      
      <div 
        class="unranked-list"
        on:dragover|preventDefault={(e) => handleDragOver(e, 'unranked')}
        on:drop|preventDefault={(e) => handleDrop(e, 'unranked')}
        class:drop-active={dropTarget === 'unranked'}
      >
        {#each unrankedItems as item, index (item.id)}
          <div
            animate:flip={{ duration: animation ? 250 : 0 }}
            class="unranked-item"
            draggable={!disabled && mode === 'runtime'}
            on:dragstart={(e) => handleDragStart(e, item, 'unranked', index)}
            on:dragend={handleDragEnd}
          >
            <span class="label">{item.label}</span>
            {#if !disabled && mode === 'runtime'}
              <button
                class="add-button"
                on:click={() => addToRanking(index)}
                aria-label="Add to ranking"
              >
                +
              </button>
            {/if}
          </div>
        {/each}
        
        {#if unrankedItems.length === 0}
          <div class="empty-message">
            All items have been ranked
          </div>
        {/if}
      </div>
    </div>
    
    {#if !disabled && mode === 'runtime'}
      <div class="ranking-footer">
        <button 
          class="reset-button"
          on:click={resetRanking}
          disabled={rankedItems.length === 0}
        >
          Reset Ranking
        </button>
        
        {#if !allowPartial}
          <span class="requirement">All items must be ranked</span>
        {/if}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .ranking-container {
    width: 100%;
  }
  
  .ranking-container.horizontal {
    display: flex;
    gap: 2rem;
  }
  
  .ranking-container.horizontal .ranking-area,
  .ranking-container.horizontal .unranked-area {
    flex: 1;
  }
  
  .ranking-container.horizontal .divider {
    display: none;
  }
  
  .area-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .area-header h4 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
  }
  
  .count {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }
  
  .ranked-list,
  .unranked-list {
    min-height: 200px;
    background: #f9fafb;
    border: 2px solid #d1d5db;
    border-radius: 0.5rem;
    padding: 0.5rem;
    transition: all 0.2s;
  }
  
  .ranked-list.drop-active,
  .unranked-list.drop-active {
    border-color: #3b82f6;
    background: #eff6ff;
  }
  
  .ranked-item,
  .unranked-item {
    display: flex;
    align-items: center;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    cursor: move;
    transition: all 0.2s;
  }
  
  .ranked-item:last-child,
  .unranked-item:last-child {
    margin-bottom: 0;
  }
  
  .ranked-item:hover,
  .unranked-item:hover {
    border-color: #9ca3af;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .ranked-item.dragging,
  .unranked-item.dragging {
    opacity: 0.5;
  }
  
  .ranked-item.drop-above {
    margin-top: 3rem;
  }
  
  .rank {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: #dbeafe;
    color: #1e40af;
    border-radius: 50%;
    font-weight: 600;
    font-size: 0.875rem;
    margin-right: 1rem;
    flex-shrink: 0;
  }
  
  .label {
    flex: 1;
    font-size: 0.875rem;
    color: #374151;
  }
  
  .actions {
    display: flex;
    gap: 0.25rem;
    margin-left: 1rem;
  }
  
  .move-button,
  .remove-button,
  .add-button {
    padding: 0.25rem 0.5rem;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .move-button:hover:not(:disabled),
  .remove-button:hover,
  .add-button:hover {
    background: #e5e7eb;
  }
  
  .move-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .remove-button {
    color: #dc2626;
  }
  
  .add-button {
    color: #059669;
    font-weight: 600;
    margin-left: auto;
  }
  
  .empty-message {
    text-align: center;
    padding: 2rem;
    color: #6b7280;
    font-size: 0.875rem;
  }
  
  .divider {
    height: 1px;
    background: #d1d5db;
    margin: 2rem 0;
  }
  
  .ranking-footer {
    margin-top: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .reset-button {
    padding: 0.5rem 1rem;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .reset-button:hover:not(:disabled) {
    background: #f9fafb;
  }
  
  .reset-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .requirement {
    font-size: 0.875rem;
    color: #f97316;
    font-weight: 500;
  }
  
  /* Responsive */
  @media (max-width: 768px) {
    .ranking-container.horizontal {
      flex-direction: column;
    }
    
    .ranking-container.horizontal .divider {
      display: block;
    }
  }
</style>