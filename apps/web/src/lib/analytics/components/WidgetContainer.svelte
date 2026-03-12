<script lang="ts">
  import type { DashboardWidget } from '../types/dashboard-builder';
  import { Minus, Plus, X } from 'lucide-svelte';

  interface Props {
    widget: DashboardWidget;
    editing?: boolean;
    onRemove?: (id: string) => void;
    onResize?: (id: string, colSpan: number, rowSpan: number) => void;
    children?: import('svelte').Snippet;
  }

  let {
    widget,
    editing = false,
    onRemove,
    onResize,
    children,
  }: Props = $props();

  let dragging = $state(false);

  function handleRemove() {
    onRemove?.(widget.id);
  }

  function handleResizeSmaller() {
    const newColSpan = Math.max(2, widget.position.colSpan - 2);
    onResize?.(widget.id, newColSpan, widget.position.rowSpan);
  }

  function handleResizeLarger() {
    const newColSpan = Math.min(12, widget.position.colSpan + 2);
    onResize?.(widget.id, newColSpan, widget.position.rowSpan);
  }
</script>

<div
  class="bg-card rounded-lg border border-border shadow-sm overflow-hidden flex flex-col
    {editing ? 'ring-2 ring-ring' : ''}
    {dragging ? 'opacity-50' : ''}"
  style="grid-column: span {widget.position.colSpan}; grid-row: span {widget.position.rowSpan};"
  draggable={editing ? 'true' : 'false'}
  ondragstart={() => { dragging = true; }}
  ondragend={() => { dragging = false; }}
  role="region"
  aria-label={widget.title}
>
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-border">
    <h3 class="text-sm font-medium text-foreground truncate">
      {widget.title}
    </h3>

    {#if editing}
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="p-1 text-muted-foreground hover:text-foreground"
          onclick={handleResizeSmaller}
          title="Shrink"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          class="p-1 text-muted-foreground hover:text-foreground"
          onclick={handleResizeLarger}
          title="Expand"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          class="p-1 text-muted-foreground hover:text-destructive"
          onclick={handleRemove}
          title="Remove widget"
        >
          <X size={16} />
        </button>
      </div>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 p-4 overflow-auto">
    {#if children}
      {@render children()}
    {:else}
      <div class="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data
      </div>
    {/if}
  </div>
</div>
