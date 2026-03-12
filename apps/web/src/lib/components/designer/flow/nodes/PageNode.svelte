<script lang="ts">
  import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
  import type { Page } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';
  import { FileText } from 'lucide-svelte';

  interface PageNodeData extends Record<string, unknown> {
    page: Page;
    label: string;
  }

  let { data, selected }: NodeProps<Node<PageNodeData>> = $props();
</script>

<div class="page-node {selected ? 'selected' : ''}">
  <Handle type="target" position={Position.Top} />

  <div class="node-header">
    <FileText size={16} />
    <span class="font-medium">{data.label}</span>
  </div>

  <div class="node-content">
    {#if data.page.blocks && data.page.blocks.length > 0}
      <span class="{theme.typography.caption} {theme.semantic.textSecondary}">
        {data.page.blocks.length} block{data.page.blocks.length !== 1 ? 's' : ''}
      </span>
    {:else if data.page.questions && data.page.questions.length > 0}
      <span class="{theme.typography.caption} {theme.semantic.textSecondary}">
        {data.page.questions.length} question{data.page.questions.length !== 1 ? 's' : ''}
      </span>
    {:else}
      <span class="{theme.typography.caption} text-muted-foreground"> Empty page </span>
    {/if}
  </div>

  <Handle type="source" position={Position.Bottom} />
</div>

<style>
  .page-node {
    background: hsl(var(--card));
    border: 2px solid hsl(var(--primary));
    border-radius: 8px;
    padding: 0;
    min-width: 180px;
    box-shadow: 0 1px 3px hsl(var(--foreground) / 0.1);
    transition: all 0.2s;
  }

  .page-node.selected {
    box-shadow: 0 0 0 2px hsl(var(--primary));
  }

  .page-node:hover {
    box-shadow: 0 4px 12px hsl(var(--foreground) / 0.15);
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: hsl(var(--primary) / 0.1);
    border-bottom: 1px solid hsl(var(--primary) / 0.2);
    border-radius: 6px 6px 0 0;
    color: hsl(var(--primary));
  }

  .node-content {
    padding: 8px 12px;
  }

  :global(.page-node .svelte-flow__handle) {
    width: 10px;
    height: 10px;
    background: hsl(var(--primary));
    border: 2px solid hsl(var(--card));
  }
</style>
