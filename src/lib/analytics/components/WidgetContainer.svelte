<script lang="ts">
  import type { DashboardWidget } from '../types/dashboard-builder';

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
  class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col
    {editing ? 'ring-2 ring-blue-300 dark:ring-blue-700' : ''}
    {dragging ? 'opacity-50' : ''}"
  style="grid-column: span {widget.position.colSpan}; grid-row: span {widget.position.rowSpan};"
  draggable={editing ? 'true' : 'false'}
  ondragstart={() => { dragging = true; }}
  ondragend={() => { dragging = false; }}
  role="region"
  aria-label={widget.title}
>
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
    <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">
      {widget.title}
    </h3>

    {#if editing}
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          onclick={handleResizeSmaller}
          title="Shrink"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
          </svg>
        </button>
        <button
          type="button"
          class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          onclick={handleResizeLarger}
          title="Expand"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          type="button"
          class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
          onclick={handleRemove}
          title="Remove widget"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 p-4 overflow-auto">
    {#if children}
      {@render children()}
    {:else}
      <div class="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
        No data
      </div>
    {/if}
  </div>
</div>
