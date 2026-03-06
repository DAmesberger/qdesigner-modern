<script lang="ts">
  import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
  import type { Question } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';

  interface QuestionNodeData extends Record<string, unknown> {
    question: Question;
    label: string;
  }

  let { data, selected }: NodeProps<Node<QuestionNodeData>> = $props();

  function getQuestionIcon(type: string): string {
    const icons: Record<string, string> = {
      'text-input': '✏️',
      'number-input': '🔢',
      'single-choice': '⭕',
      'multiple-choice': '☑️',
      scale: '📊',
      rating: '⭐',
      instruction: '📝',
      'text-display': '📄',
      'reaction-time': '⚡',
      matrix: '⊞',
    };
    return icons[type] || '❓';
  }
</script>

<div class="question-node {selected ? 'selected' : ''}">
  <Handle type="target" position={Position.Top} />

  <div class="node-content">
    <span class="question-icon">{getQuestionIcon(data.question.type)}</span>
    <div class="question-info">
      <span class="question-label">{data.label}</span>
      <span class="{theme.typography.caption} text-muted-foreground">
        {data.question.type.replace('-', ' ')}
      </span>
    </div>
  </div>

  <Handle type="source" position={Position.Bottom} />
</div>

<style>
  .question-node {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    padding: 8px 12px;
    min-width: 140px;
    box-shadow: 0 1px 2px hsl(var(--foreground) / 0.05);
    transition: all 0.2s;
  }

  .question-node.selected {
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 1px hsl(var(--primary));
  }

  .question-node:hover {
    border-color: hsl(var(--border));
    box-shadow: 0 2px 8px hsl(var(--foreground) / 0.1);
  }

  .node-content {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .question-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .question-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .question-label {
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(.question-node .svelte-flow__handle) {
    width: 6px;
    height: 6px;
    background: hsl(var(--muted-foreground));
    border: 2px solid hsl(var(--card));
  }

  :global(.question-node .svelte-flow__handle-top) {
    top: -3px;
  }

  :global(.question-node .svelte-flow__handle-bottom) {
    bottom: -3px;
  }
</style>
