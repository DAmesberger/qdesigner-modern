<script lang="ts">
  import {
    type DashboardLayout,
    type DashboardWidget,
    type WidgetType,
    WIDGET_PALETTE,
    createWidget,
    createDefaultLayout,
  } from '../types/dashboard-builder';
  import WidgetContainer from './WidgetContainer.svelte';
  import WidgetPalette from './WidgetPalette.svelte';

  interface Props {
    questionnaireId: string;
    layout?: DashboardLayout;
    editing?: boolean;
    onLayoutChange?: (layout: DashboardLayout) => void;
    /** Render function for widget content based on type and config */
    renderWidget?: (widget: DashboardWidget) => import('svelte').Snippet | undefined;
  }

  let {
    questionnaireId,
    layout: initialLayout,
    editing = false,
    onLayoutChange,
    renderWidget,
  }: Props = $props();

  let layout = $state<DashboardLayout>(createDefaultLayout(''));

  $effect(() => {
    layout = initialLayout ?? createDefaultLayout(questionnaireId);
  });

  let showPalette = $state(false);

  function addWidget(type: WidgetType) {
    const paletteItem = WIDGET_PALETTE.find(p => p.type === type);
    if (!paletteItem) return;

    // Find next available row
    const maxRow = layout.widgets.reduce((max, w) =>
      Math.max(max, w.position.row + w.position.rowSpan), 0
    );

    const widget = createWidget(type, {
      col: 0,
      row: maxRow,
      colSpan: paletteItem.defaultSize.colSpan,
      rowSpan: paletteItem.defaultSize.rowSpan,
    }, {
      questionnaireId,
    });

    layout.widgets = [...layout.widgets, widget];
    layout.updatedAt = new Date().toISOString();
    showPalette = false;
    onLayoutChange?.(layout);
  }

  function removeWidget(id: string) {
    layout.widgets = layout.widgets.filter(w => w.id !== id);
    layout.updatedAt = new Date().toISOString();
    onLayoutChange?.(layout);
  }

  function resizeWidget(id: string, colSpan: number, rowSpan: number) {
    layout.widgets = layout.widgets.map(w =>
      w.id === id
        ? { ...w, position: { ...w.position, colSpan, rowSpan } }
        : w
    );
    layout.updatedAt = new Date().toISOString();
    onLayoutChange?.(layout);
  }

  function toggleEditing() {
    editing = !editing;
    showPalette = false;
  }
</script>

<div class="space-y-4">
  <!-- Toolbar -->
  <div class="flex items-center justify-between">
    <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
      {layout.name}
    </h2>
    <div class="flex items-center gap-2">
      {#if editing}
        <button
          type="button"
          class="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400
            bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40
            transition-colors"
          onclick={() => { showPalette = !showPalette; }}
        >
          + Add Widget
        </button>
      {/if}
      <button
        type="button"
        class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
          {editing
            ? 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
        onclick={toggleEditing}
      >
        {editing ? 'Done' : 'Edit'}
      </button>
    </div>
  </div>

  <div class="flex gap-4">
    <!-- Widget Palette (sidebar) -->
    {#if editing && showPalette}
      <div class="w-64 flex-shrink-0">
        <WidgetPalette onAdd={addWidget} />
      </div>
    {/if}

    <!-- Dashboard Grid -->
    <div
      class="flex-1 grid gap-4"
      style="grid-template-columns: repeat(12, 1fr); grid-auto-rows: {layout.rowHeight}px;"
    >
      {#each layout.widgets as widget (widget.id)}
        <WidgetContainer
          {widget}
          {editing}
          onRemove={removeWidget}
          onResize={resizeWidget}
        >
          {#if renderWidget}
            {@const snippet = renderWidget(widget)}
            {#if snippet}
              {@render snippet()}
            {/if}
          {/if}
        </WidgetContainer>
      {/each}

      {#if layout.widgets.length === 0}
        <div
          class="col-span-12 flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg"
        >
          <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
            />
          </svg>
          <p class="text-sm">No widgets configured</p>
          {#if !editing}
            <button
              type="button"
              class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              onclick={toggleEditing}
            >
              Click Edit to add widgets
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
