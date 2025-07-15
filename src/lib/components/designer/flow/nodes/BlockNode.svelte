<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { Block } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';
  
  interface BlockNodeData {
    block: Block;
    label: string;
    type: string;
  }
  
  let { data, selected }: NodeProps<BlockNodeData> = $props();
  
  const blockTypeColors = {
    standard: { bg: '#F3F4F6', border: '#9CA3AF', icon: '#6B7280' },
    randomized: { bg: '#FEF3C7', border: '#F59E0B', icon: '#D97706' },
    conditional: { bg: '#DBEAFE', border: '#3B82F6', icon: '#2563EB' },
    loop: { bg: '#D1FAE5', border: '#10B981', icon: '#059669' }
  };
  
  $: colors = blockTypeColors[data.type as keyof typeof blockTypeColors] || blockTypeColors.standard;
</script>

<div class="block-node {selected ? 'selected' : ''}" style="border-color: {colors.border}; background: {colors.bg};">
  <Handle type="target" position={Position.Top} />
  
  <div class="node-header">
    <svg class="w-4 h-4" fill="none" stroke={colors.icon} viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
    <span class="font-medium" style="color: {colors.icon}">{data.label}</span>
  </div>
  
  <div class="node-content">
    <span class="{theme.typography.caption}" style="color: {colors.icon}">
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
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
  }
  
  .block-node.selected {
    box-shadow: 0 0 0 2px currentColor;
  }
  
  .block-node:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .node-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
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
    border: 2px solid white;
  }
</style>