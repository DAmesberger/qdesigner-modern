<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { FlowControl } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';
  
  interface LoopNodeData {
    flow: FlowControl;
    label: string;
  }
  
  let { data, selected }: NodeProps<LoopNodeData> = $props();
</script>

<div class="loop-node {selected ? 'selected' : ''}">
  <Handle type="target" position={Position.Top} />
  
  <div class="node-header">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
    <span class="font-medium">Loop</span>
  </div>
  
  <div class="node-content">
    <div class="condition-label">WHILE</div>
    <code class="condition-text">{data.flow.condition}</code>
    {#if data.flow.iterations}
      <div class="iterations-info">
        <span class="{theme.typography.caption}">
          Max iterations: {data.flow.iterations}
        </span>
      </div>
    {/if}
  </div>
  
  <Handle type="source" position={Position.Bottom} id="continue" style="left: 30%;" />
  <Handle type="source" position={Position.Bottom} id="break" style="left: 70%;" />
</div>

<style>
  .loop-node {
    background: white;
    border: 2px solid #10B981;
    border-radius: 8px;
    padding: 0;
    min-width: 200px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
  }
  
  .loop-node.selected {
    box-shadow: 0 0 0 2px #10B981;
  }
  
  .loop-node:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #D1FAE5;
    border-bottom: 1px solid #A7F3D0;
    border-radius: 6px 6px 0 0;
    color: #065F46;
  }
  
  .node-content {
    padding: 8px 12px;
  }
  
  .condition-label {
    font-size: 11px;
    font-weight: 600;
    color: #065F46;
    margin-bottom: 4px;
  }
  
  .condition-text {
    display: block;
    font-size: 12px;
    background: #ECFDF5;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #A7F3D0;
    color: #064E3B;
    word-break: break-all;
  }
  
  .iterations-info {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #A7F3D0;
  }
  
  :global(.loop-node .svelte-flow__handle) {
    width: 10px;
    height: 10px;
    background: #10B981;
    border: 2px solid white;
  }
</style>