<script lang="ts">
  import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
  import type { FlowControl } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';
  import { RefreshCw } from 'lucide-svelte';

  interface LoopNodeData extends Record<string, unknown> {
    flow: FlowControl;
    label: string;
  }

  let { data, selected }: NodeProps<Node<LoopNodeData>> = $props();
</script>

<div class="loop-node {selected ? 'selected' : ''}">
  <Handle type="target" position={Position.Top} />

  <div class="node-header">
    <RefreshCw size={16} />
    <span class="font-medium">Loop</span>
  </div>

  <div class="node-content">
    <div class="condition-label">WHILE</div>
    <code class="condition-text">{data.flow.condition}</code>
    {#if data.flow.iterations}
      <div class="iterations-info">
        <span class={theme.typography.caption}>
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
    background: hsl(var(--card));
    border: 2px solid hsl(var(--success));
    border-radius: 8px;
    padding: 0;
    min-width: 200px;
    box-shadow: 0 1px 3px hsl(var(--foreground) / 0.1);
    transition: all 0.2s;
  }

  .loop-node.selected {
    box-shadow: 0 0 0 2px hsl(var(--success));
  }

  .loop-node:hover {
    box-shadow: 0 4px 12px hsl(var(--foreground) / 0.15);
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: hsl(var(--success) / 0.15);
    border-bottom: 1px solid hsl(var(--success) / 0.3);
    border-radius: 6px 6px 0 0;
    color: hsl(var(--success));
  }

  .node-content {
    padding: 8px 12px;
  }

  .condition-label {
    font-size: 11px;
    font-weight: 600;
    color: hsl(var(--success));
    margin-bottom: 4px;
  }

  .condition-text {
    display: block;
    font-size: 12px;
    background: hsl(var(--success) / 0.1);
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid hsl(var(--success) / 0.3);
    color: hsl(var(--success));
    word-break: break-all;
  }

  .iterations-info {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid hsl(var(--success) / 0.3);
  }

  :global(.loop-node .svelte-flow__handle) {
    width: 10px;
    height: 10px;
    background: hsl(var(--success));
    border: 2px solid hsl(var(--card));
  }
</style>
