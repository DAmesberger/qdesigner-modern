<script lang="ts">
  import { WIDGET_PALETTE, type WidgetType } from '../types/dashboard-builder';

  interface Props {
    onAdd: (type: WidgetType) => void;
  }

  let { onAdd }: Props = $props();
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
  <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">
    Add Widget
  </h3>
  <div class="space-y-2">
    {#each WIDGET_PALETTE as item}
      <button
        type="button"
        class="w-full text-left px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600
          hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        onclick={() => onAdd(item.type)}
      >
        <div class="text-sm font-medium text-gray-900 dark:text-white">
          {item.label}
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {item.description}
        </div>
      </button>
    {/each}
  </div>
</div>
