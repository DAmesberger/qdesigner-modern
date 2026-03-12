<script lang="ts">
  import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
  import type { Variable } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';
  import { Calculator } from 'lucide-svelte';

  interface VariableNodeData extends Record<string, unknown> {
    variable: Variable;
    label: string;
  }

  let { data, selected }: NodeProps<Node<VariableNodeData>> = $props();

  function getVariableIcon(type: string): string {
    const icons: Record<string, string> = {
      number: '🔢',
      string: '📝',
      boolean: '✓',
      date: '📅',
      time: '⏰',
      array: '📋',
      object: '📦',
      reaction_time: '⚡',
      stimulus_onset: '🎯',
    };
    return icons[type] || '📊';
  }
</script>

<div class="variable-node {selected ? 'selected' : ''}">
  <div class="node-content">
    <span class="variable-icon">{getVariableIcon(data.variable.type)}</span>
    <div class="variable-info">
      <span class="variable-name">{data.label}</span>
      <span class="{theme.typography.caption} text-muted-foreground">
        {data.variable.type}
      </span>
    </div>
  </div>

  {#if data.variable.formula}
    <div class="formula-indicator" title="Computed variable">
      <Calculator size={12} />
    </div>
  {/if}

  <Handle type="source" position={Position.Bottom} />
</div>

<style>
  .variable-node {
    background: hsl(var(--card));
    border: 2px solid hsl(var(--success));
    border-radius: 8px;
    padding: 10px 14px;
    min-width: 140px;
    box-shadow: 0 1px 3px hsl(var(--foreground) / 0.1);
    transition: all 0.2s;
    position: relative;
  }

  .variable-node.selected {
    box-shadow: 0 0 0 2px hsl(var(--success));
  }

  .variable-node:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px hsl(var(--foreground) / 0.15);
  }

  .node-content {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .variable-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .variable-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .variable-name {
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--success));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .formula-indicator {
    position: absolute;
    top: -6px;
    right: -6px;
    background: hsl(var(--warning));
    color: hsl(var(--background));
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid hsl(var(--card));
    box-shadow: 0 1px 3px hsl(var(--foreground) / 0.2);
  }

  :global(.variable-node .svelte-flow__handle) {
    width: 8px;
    height: 8px;
    background: hsl(var(--success));
    border: 2px solid hsl(var(--card));
  }
</style>
