<script lang="ts">
  import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
  import type { Block } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';
  import { Layers } from 'lucide-svelte';

  interface BlockNodeData extends Record<string, unknown> {
    block: Block;
    label: string;
    type: string;
  }

  let { data, selected }: NodeProps<Node<BlockNodeData>> = $props();

  const blockTypeColors = {
    standard: { bg: '#F3F4F6', border: '#9CA3AF', icon: '#6B7280' },
    randomized: { bg: '#FEF3C7', border: '#F59E0B', icon: '#D97706' },
    conditional: { bg: '#DBEAFE', border: '#3B82F6', icon: '#2563EB' },
    loop: { bg: '#D1FAE5', border: '#10B981', icon: '#059669' },
  };

  const colors = $derived(
    blockTypeColors[data.type as keyof typeof blockTypeColors] || blockTypeColors.standard
  );
</script>

<div
  class="block-node {selected ? 'selected' : ''}"
  style="border-color: {colors.border}; background: {colors.bg};"
>
  <Handle type="target" position={Position.Top} />

  <div class="node-header">
    <Layers size={16} color={colors.icon} />
    <span class="font-medium" style="color: {colors.icon}">{data.label}</span>
  </div>

  <div class="node-content">
    <span class={theme.typography.caption} style="color: {colors.icon}">
      {data.block.questions.length} question{data.block.questions.length !== 1 ? 's' : ''}
    </span>
    {#if data.type !== 'standard'}
      <span class="block-type-badge" style="background: {colors.icon}; color: white;">
        {data.type}
      </span>
    {/if}
  </div>

  <Handle type="source" position={Position.Bottom} />
</div>

<style>
  .block-node {
    border: 2px solid;
    border-radius: 8px;
    padding: 0;
    min-width: 160px;
    box-shadow: 0 1px 3px hsl(var(--foreground) / 0.1);
    transition: all 0.2s;
  }

  .block-node.selected {
    box-shadow: 0 0 0 2px currentColor;
  }

  .block-node:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px hsl(var(--foreground) / 0.15);
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid hsl(var(--foreground) / 0.1);
  }

  .node-content {
    padding: 6px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .block-type-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  :global(.block-node .svelte-flow__handle) {
    width: 8px;
    height: 8px;
    border: 2px solid hsl(var(--card));
  }
</style>
