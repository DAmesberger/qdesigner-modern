<script lang="ts">
  import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
  import type { FlowControl } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';

  interface TerminateNodeData extends Record<string, unknown> {
    flow: FlowControl;
    label: string;
  }

  let { data, selected }: NodeProps<Node<TerminateNodeData>> = $props();
</script>

<div class="terminate-node {selected ? 'selected' : ''}">
  <Handle type="target" position={Position.Top} />

  <div class="node-header">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
      />
    </svg>
    <span class="font-medium">Terminate</span>
  </div>

  <div class="node-content">
    <div class="condition-label">WHEN</div>
    <code class="condition-text">{data.flow.condition}</code>
  </div>
</div>

<style>
  .terminate-node {
    background: white;
    border: 2px solid #ef4444;
    border-radius: 8px;
    padding: 0;
    min-width: 180px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
  }

  .terminate-node.selected {
    box-shadow: 0 0 0 2px #ef4444;
  }

  .terminate-node:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #fee2e2;
    border-bottom: 1px solid #fecaca;
    border-radius: 6px 6px 0 0;
    color: #991b1b;
  }

  .node-content {
    padding: 8px 12px;
  }

  .condition-label {
    font-size: 11px;
    font-weight: 600;
    color: #991b1b;
    margin-bottom: 4px;
  }

  .condition-text {
    display: block;
    font-size: 12px;
    background: #fef2f2;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #fecaca;
    color: #7f1d1d;
    word-break: break-all;
  }

  :global(.terminate-node .svelte-flow__handle) {
    width: 10px;
    height: 10px;
    background: #ef4444;
    border: 2px solid white;
  }
</style>
