<script lang="ts">
  import { 
    BaseEdge, 
    EdgeLabel,
    getSmoothStepPath, 
    type EdgeProps 
  } from '@xyflow/svelte';
  import type { FlowControl } from '$lib/shared/types/questionnaire';
  
  interface ConditionalEdgeData {
    condition?: string;
    flow?: FlowControl;
  }
  
  let { 
    id, 
    sourceX, 
    sourceY, 
    targetX, 
    targetY, 
    sourcePosition,
    targetPosition,
    data = {},
    markerEnd,
    style,
    selected
  }: EdgeProps<ConditionalEdgeData> = $props();
  
  let [edgePath, labelX, labelY] = $derived(
    getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    })
  );
  
  // Simplify condition display
  function formatCondition(condition?: string): string {
    if (!condition) return '';
    
    // Truncate long conditions
    if (condition.length > 30) {
      return condition.substring(0, 27) + '...';
    }
    
    return condition;
  }
  
  const displayCondition = $derived(formatCondition(data.condition));
  const edgeColor = $derived(selected ? '#3B82F6' : '#F59E0B');
</script>

<g class="conditional-edge">
  <BaseEdge 
    {id} 
    path={edgePath} 
    {markerEnd}
    style="stroke: {edgeColor}; stroke-width: 2px; {style}"
  />
  
  {#if displayCondition}
    <EdgeLabel x={labelX} y={labelY}>
      <div 
        class="edge-label nodrag nopan"
        style="background: {selected ? '#EFF6FF' : '#FEF3C7'}; border-color: {edgeColor};"
      >
        <code class="condition-text" style="color: {selected ? '#1E40AF' : '#92400E'};">
          {displayCondition}
        </code>
      </div>
    </EdgeLabel>
  {/if}
</g>

<style>
  .edge-label {
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid;
    font-size: 11px;
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .edge-label:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }
  
  .condition-text {
    font-family: monospace;
    font-size: 10px;
  }
  
  :global(.conditional-edge path) {
    stroke-dasharray: 5 5;
    animation: dash 1s linear infinite;
  }
  
  @keyframes dash {
    to {
      stroke-dashoffset: -10;
    }
  }
</style>