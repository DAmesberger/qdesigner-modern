<script lang="ts">
  import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
  import type { FlowControl } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';
  import { StopCircle } from 'lucide-svelte';

  interface TerminateNodeData extends Record<string, unknown> {
    flow: FlowControl;
    label: string;
  }

  let { data, selected }: NodeProps<Node<TerminateNodeData>> = $props();
</script>

<div class="terminate-node {selected ? 'selected' : ''}">
  <Handle type="target" position={Position.Top} />

  <div class="node-header">
    <StopCircle size={16} />
    <span class="font-medium">Terminate</span>
  </div>

  <div class="node-content">
    <div class="condition-label">WHEN</div>
    <code class="condition-text">{data.flow.condition}</code>
  </div>
</div>

<style>
  .terminate-node {
    background: hsl(var(--card));
    border: 2px solid hsl(var(--destructive));
    border-radius: 8px;
    padding: 0;
    min-width: 180px;
    box-shadow: 0 1px 3px hsl(var(--foreground) / 0.1);
    transition: all 0.2s;
  }

  .terminate-node.selected {
    box-shadow: 0 0 0 2px hsl(var(--destructive));
  }

  .terminate-node:hover {
    box-shadow: 0 4px 12px hsl(var(--foreground) / 0.15);
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: hsl(var(--destructive) / 0.15);
    border-bottom: 1px solid hsl(var(--destructive) / 0.3);
    border-radius: 6px 6px 0 0;
    color: hsl(var(--destructive));
  }

  .node-content {
    padding: 8px 12px;
  }

  .condition-label {
    font-size: 11px;
    font-weight: 600;
    color: hsl(var(--destructive));
    margin-bottom: 4px;
  }

  .condition-text {
    display: block;
    font-size: 12px;
    background: hsl(var(--destructive) / 0.1);
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid hsl(var(--destructive) / 0.3);
    color: hsl(var(--destructive));
    word-break: break-all;
  }

  :global(.terminate-node .svelte-flow__handle) {
    width: 10px;
    height: 10px;
    background: hsl(var(--destructive));
    border: 2px solid hsl(var(--card));
  }
</style>
