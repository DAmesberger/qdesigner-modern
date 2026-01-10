<script lang="ts">
  import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
  import type { FlowControl } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';

  interface BranchNodeData extends Record<string, unknown> {
    flow: FlowControl;
    label: string;
  }

  let { data, selected }: NodeProps<Node<BranchNodeData>> = $props();
</script>

<div class="branch-node {selected ? 'selected' : ''}">
  <Handle type="target" position={Position.Top} />

  <div class="node-header">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
      />
    </svg>
    <span class="font-medium">Branch</span>
  </div>

  <div class="node-content">
    <div class="condition-label">IF</div>
    <code class="condition-text">{data.flow.condition}</code>
    {#if data.flow.target}
      <div class="target-info">
        <span class={theme.typography.caption}>→ {data.flow.target}</span>
      </div>
    {/if}
  </div>

  <Handle type="source" position={Position.Bottom} id="true" style="left: 30%;" />
  <Handle type="source" position={Position.Bottom} id="false" style="left: 70%;" />
</div>

<style>
  .branch-node {
    background: white;
    border: 2px solid #f59e0b;
    border-radius: 8px;
    padding: 0;
    min-width: 200px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
  }

  .branch-node.selected {
    box-shadow: 0 0 0 2px #f59e0b;
  }

  .branch-node:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #fef3c7;
    border-bottom: 1px solid #fde68a;
    border-radius: 6px 6px 0 0;
    color: #92400e;
  }

  .node-content {
    padding: 8px 12px;
  }

  .condition-label {
    font-size: 11px;
    font-weight: 600;
    color: #92400e;
    margin-bottom: 4px;
  }

  .condition-text {
    display: block;
    font-size: 12px;
    background: #fffbeb;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #fde68a;
    color: #78350f;
    word-break: break-all;
  }

  .target-info {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #fde68a;
  }

  :global(.branch-node .svelte-flow__handle) {
    width: 10px;
    height: 10px;
    background: #f59e0b;
    border: 2px solid white;
  }
</style>
