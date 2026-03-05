<script lang="ts">
  import { WIDGET_PALETTE, type WidgetType } from '../types/dashboard-builder';

  interface Props {
    onAdd: (type: WidgetType) => void;
  }

  let { onAdd }: Props = $props();
</script>

<div class="bg-card rounded-lg border border-border p-4">
  <h3 class="text-sm font-semibold text-foreground mb-3">
    Add Widget
  </h3>
  <div class="space-y-2">
    {#each WIDGET_PALETTE as item}
      <button
        type="button"
        class="w-full text-left px-3 py-2 rounded-md border border-border
          hover:bg-accent transition-colors"
        onclick={() => onAdd(item.type)}
      >
        <div class="text-sm font-medium text-foreground">
          {item.label}
        </div>
        <div class="text-xs text-muted-foreground mt-0.5">
          {item.description}
        </div>
      </button>
    {/each}
  </div>
</div>
