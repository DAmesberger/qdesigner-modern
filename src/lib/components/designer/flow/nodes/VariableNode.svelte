<script lang="ts">
  import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
  import type { Variable } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';

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
      <span class="{theme.typography.caption} text-gray-500">
        {data.variable.type}
      </span>
    </div>
  </div>

  {#if data.variable.formula}
    <div class="formula-indicator" title="Computed variable">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    </div>
  {/if}

  <Handle type="source" position={Position.Bottom} />
</div>

<style>
  .variable-node {
    background: white;
    border: 2px solid #10b981;
    border-radius: 8px;
    padding: 10px 14px;
    min-width: 140px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
    position: relative;
  }

  .variable-node.selected {
    box-shadow: 0 0 0 2px #10b981;
  }

  .variable-node:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
    color: #065f46;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .formula-indicator {
    position: absolute;
    top: -6px;
    right: -6px;
    background: #f59e0b;
    color: white;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  :global(.variable-node .svelte-flow__handle) {
    width: 8px;
    height: 8px;
    background: #10b981;
    border: 2px solid white;
  }
</style>
