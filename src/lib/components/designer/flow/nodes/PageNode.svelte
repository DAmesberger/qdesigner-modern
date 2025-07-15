<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { Page } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';
  
  interface PageNodeData {
    page: Page;
    label: string;
  }
  
  let { data, selected }: NodeProps<PageNodeData> = $props();
</script>

<div class="page-node {selected ? 'selected' : ''}">
  <Handle type="target" position={Position.Top} />
  
  <div class="node-header">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
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
      <span class="{theme.typography.caption} {theme.semantic.textTertiary}">
        Empty page
      </span>
    {/if}
  </div>
  
  <Handle type="source" position={Position.Bottom} />
</div>

<style>
  .page-node {
    background: white;
    border: 2px solid #3B82F6;
    border-radius: 8px;
    padding: 0;
    min-width: 180px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
  }
  
  .page-node.selected {
    box-shadow: 0 0 0 2px #3B82F6;
  }
  
  .page-node:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #EFF6FF;
    border-bottom: 1px solid #DBEAFE;
    border-radius: 6px 6px 0 0;
    color: #1E40AF;
  }
  
  .node-content {
    padding: 8px 12px;
  }
  
  :global(.page-node .svelte-flow__handle) {
    width: 10px;
    height: 10px;
    background: #3B82F6;
    border: 2px solid white;
  }
</style>