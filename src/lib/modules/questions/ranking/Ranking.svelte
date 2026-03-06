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
    onInteraction,
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
      rankedItems = value
        .map((itemId, index) => {
          const item = items.find((i) => i.id === itemId);
          return item ? { ...item, rank: index + 1 } : null;
        })
        .filter(Boolean) as typeof rankedItems;

      unrankedItems = items.filter((item) => !value.includes(item.id));
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
  function handleDragStart(
    event: DragEvent,
    item: RankingItem,
    from: 'ranked' | 'unranked',
    index: number
  ) {
    if (disabled || mode !== 'runtime') return;

    draggedItem = item;
    draggedFrom = from;
    draggedIndex = index;

    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', item.id);

    // Add dragging class
    (event.target as HTMLElement).classList.add('dragging');

    onInteraction?.({
      type: 'drag-start' as any,
      timestamp: Date.now(),
      data: { item: item.id, from, index },
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
      type: 'drop' as any,
      timestamp: Date.now(),
      data: {
        item: draggedItem.id,
        from: draggedFrom,
        to: target,
        index: index ?? -1,
      },
    });
  }

  function moveItem(
    from: 'ranked' | 'unranked',
    fromIndex: number,
    to: 'ranked' | 'unranked',
    toIndex?: number
  ) {
    let item: RankingItem;

    // Remove from source
    if (from === 'ranked') {
      const sourceItem = rankedItems[fromIndex];
      if (!sourceItem) return;
      item = sourceItem;
      rankedItems = rankedItems.filter((_, i) => i !== fromIndex);
    } else {
      const sourceItem = unrankedItems[fromIndex];
      if (!sourceItem) return;
      item = sourceItem;
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
    value = rankedItems.map((item) => item.id);
    onResponse?.(value);
  }

  function moveUp(index: number) {
    if (index > 0) {
      const items = [...rankedItems];
      const prev = items[index - 1];
      const curr = items[index];

      if (prev && curr) {
        items[index - 1] = curr;
        items[index] = prev;
        rankedItems = items.map((item, i) => ({ ...item, rank: i + 1 }));
        updateValue();

        onInteraction?.({
          type: 'reorder' as any,
          timestamp: Date.now(),
          data: { item: items[index].id, direction: 'up', newIndex: index - 1 },
        });
      }
    }
  }

  function moveDown(index: number) {
    if (index < rankedItems.length - 1) {
      const items = [...rankedItems];
      const curr = items[index];
      const next = items[index + 1];

      if (curr && next) {
        items[index] = next;
        items[index + 1] = curr;
        rankedItems = items.map((item, i) => ({ ...item, rank: i + 1 }));
        updateValue();

        onInteraction?.({
          type: 'reorder' as any,
          timestamp: Date.now(),
          data: { item: items[index].id, direction: 'down', newIndex: index + 1 },
        });
      }
    }
  }

  function removeFromRanking(index: number) {
    const item = rankedItems[index];
    if (!item) return;
    rankedItems = rankedItems.filter((_, i) => i !== index);
    unrankedItems = [...unrankedItems, { id: item.id, label: item.label }];
    rankedItems = rankedItems.map((item, i) => ({ ...item, rank: i + 1 }));
    updateValue();

    onInteraction?.({
      type: 'remove' as any,
      timestamp: Date.now(),
      data: { item: item.id, from: 'ranked' },
    });
  }

  function addToRanking(index: number) {
    const item = unrankedItems[index];
    if (!item) return;
    unrankedItems = unrankedItems.filter((_, i) => i !== index);
    rankedItems = [...rankedItems, { ...item, rank: rankedItems.length + 1 }];
    updateValue();

    onInteraction?.({
      type: 'add' as any,
      timestamp: Date.now(),
      data: { item: item.id, to: 'ranked' },
    });
  }

  function resetRanking() {
    rankedItems = [];
    unrankedItems = [...items];
    updateValue();

    onInteraction?.({
      type: 'reset' as any,
      timestamp: Date.now(),
      data: {},
    });
  }
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div class="ranking-container w-full" class:horizontal={layout === 'horizontal'}>
    <div class="ranking-area">
      <div class="flex justify-between items-center mb-4">
        <h4 class="m-0 text-base font-semibold text-foreground">Ranked Items</h4>
        <span class="text-sm text-muted-foreground font-medium">{rankedItems.length} / {items.length}</span>
      </div>

      <div
        class="ranked-list min-h-[200px] bg-muted border-2 border-border rounded-lg p-2 transition-all duration-200"
        ondragover={(e) => handleDragOver(e, 'ranked')}
        ondrop={(e) => handleDrop(e, 'ranked')}
        class:drop-active={dropTarget === 'ranked'}
        role="list"
      >
        {#each rankedItems as item, index (item.id)}
          <div
            animate:flip={{ duration: animation ? 250 : 0 }}
            class="ranked-item flex items-center p-3 mb-2 last:mb-0 bg-card border border-border rounded-md cursor-move transition-all duration-200 hover:border-muted-foreground hover:shadow-sm"
            class:drop-above={dropTarget === 'ranked' && dropIndex === index}
            draggable={!disabled && mode === 'runtime'}
            ondragstart={(e) => handleDragStart(e, item, 'ranked', index)}
            ondragend={handleDragEnd}
            ondragover={(e) => handleDragOver(e, 'ranked', index)}
            role="listitem"
          >
            {#if showNumbers}
              <span class="inline-flex items-center justify-center w-8 h-8 bg-primary/20 text-primary rounded-full font-semibold text-sm mr-4 shrink-0">{item.rank}</span>
            {/if}
            <span class="flex-1 text-sm text-foreground">{item.label}</span>
            {#if !disabled && mode === 'runtime'}
              <div class="flex gap-1 ml-4">
                <button
                  class="action-button px-2 py-1 bg-muted border border-border rounded text-sm cursor-pointer transition-all duration-200 hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed"
                  onclick={() => moveUp(index)}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  class="action-button px-2 py-1 bg-muted border border-border rounded text-sm cursor-pointer transition-all duration-200 hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed"
                  onclick={() => moveDown(index)}
                  disabled={index === rankedItems.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  class="px-2 py-1 bg-muted border border-border rounded text-sm cursor-pointer transition-all duration-200 text-destructive hover:bg-border"
                  onclick={() => removeFromRanking(index)}
                  aria-label="Remove from ranking"
                >
                  ✕
                </button>
              </div>
            {/if}
          </div>
        {/each}

        {#if rankedItems.length === 0}
          <div class="text-center p-8 text-muted-foreground text-sm">Drag items here to rank them</div>
        {/if}
      </div>
    </div>

    <div class="divider h-px bg-border my-8"></div>

    <div class="unranked-area">
      <div class="flex justify-between items-center mb-4">
        <h4 class="m-0 text-base font-semibold text-foreground">Unranked Items</h4>
        <span class="text-sm text-muted-foreground font-medium">{unrankedItems.length}</span>
      </div>

      <div
        class="unranked-list min-h-[200px] bg-muted border-2 border-border rounded-lg p-2 transition-all duration-200"
        ondragover={(e) => handleDragOver(e, 'unranked')}
        ondrop={(e) => handleDrop(e, 'unranked')}
        class:drop-active={dropTarget === 'unranked'}
        role="list"
      >
        {#each unrankedItems as item, index (item.id)}
          <div
            animate:flip={{ duration: animation ? 250 : 0 }}
            class="flex items-center p-3 mb-2 last:mb-0 bg-card border border-border rounded-md cursor-move transition-all duration-200 hover:border-muted-foreground hover:shadow-sm"
            draggable={!disabled && mode === 'runtime'}
            ondragstart={(e) => handleDragStart(e, item, 'unranked', index)}
            ondragend={handleDragEnd}
            role="listitem"
          >
            <span class="flex-1 text-sm text-foreground">{item.label}</span>
            {#if !disabled && mode === 'runtime'}
              <button
                class="px-2 py-1 bg-muted border border-border rounded text-sm cursor-pointer transition-all duration-200 text-success font-semibold ml-auto hover:bg-border"
                onclick={() => addToRanking(index)}
                aria-label="Add to ranking"
              >
                +
              </button>
            {/if}
          </div>
        {/each}

        {#if unrankedItems.length === 0}
          <div class="text-center p-8 text-muted-foreground text-sm">All items have been ranked</div>
        {/if}
      </div>
    </div>

    {#if !disabled && mode === 'runtime'}
      <div class="mt-4 flex justify-between items-center">
        <button class="reset-button px-4 py-2 bg-card border border-border rounded-md text-sm cursor-pointer transition-all duration-200 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed" onclick={resetRanking} disabled={rankedItems.length === 0}>
          Reset Ranking
        </button>

        {#if !allowPartial}
          <span class="text-sm text-warning font-medium">All items must be ranked</span>
        {/if}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
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

  .ranked-list.drop-active,
  .unranked-list.drop-active {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.1);
  }

  .ranked-item.drop-above {
    margin-top: 3rem;
  }

  @media (max-width: 768px) {
    .ranking-container.horizontal {
      flex-direction: column;
    }

    .ranking-container.horizontal .divider {
      display: block;
    }
  }
</style>
