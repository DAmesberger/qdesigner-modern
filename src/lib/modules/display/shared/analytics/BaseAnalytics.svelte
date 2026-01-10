<script lang="ts">
  import type { AnalyticsProps, AnalyticsModuleConfig, AnalyticsInteractionEvent } from './types';
  import { createEventDispatcher } from 'svelte';
  import { scriptingEngine } from '$lib/services/scriptingEngine';

  interface Props extends AnalyticsProps {
    analytics: any;
    children?: any;
    class?: string;
  }

  let {
    analytics,
    mode = 'runtime',
    variables = {},
    data,
    onUpdate,
    onInteraction,
    children,
    class: className = '',
    ...restProps
  }: Props = $props();

  // Debug what we're receiving
  $effect(() => {
    console.log('[BaseAnalytics] Props received:', {
      analyticsId: analytics?.id,
      mode,
      hasDataSource: !!analytics?.dataSource,
      selectedVariables: analytics?.dataSource?.variables,
      variablesReceived: variables,
      variableKeys: Object.keys(variables),
    });
  });

  const dispatch = createEventDispatcher<{
    interaction: AnalyticsInteractionEvent;
    update: Partial<AnalyticsModuleConfig>;
    edit: void;
    delete: void;
    duplicate: void;
  }>();

  let isVisible = $state(true);
  let computedData = $state<any[]>([]);
  let element = $state<HTMLDivElement | undefined>();

  // Check conditional visibility
  $effect(() => {
    if (analytics.conditions && mode === 'runtime') {
      checkVisibility();
    }
  });

  // Compute data from variables
  $effect(() => {
    if (analytics.dataSource?.variables?.length > 0) {
      // Compute data in all modes for proper visualization
      computeData();
    }
  });

  async function checkVisibility() {
    if (!analytics.conditions) {
      isVisible = true;
      return;
    }

    try {
      const result = await scriptingEngine.evaluateCondition(analytics.conditions);
      isVisible = result;
    } catch (error) {
      console.error('Error evaluating analytics visibility:', error);
      isVisible = true;
    }
  }

  async function computeData() {
    try {
      console.log('[BaseAnalytics] computeData called');
      console.log('[BaseAnalytics] dataSource.variables:', analytics.dataSource?.variables);
      console.log('[BaseAnalytics] variables object:', variables);

      // Get data for each variable
      const variableData = analytics.dataSource.variables.map((varId) => {
        const value = variables[varId];
        console.log(`[BaseAnalytics] Mapping variable ${varId}, value: ${value}`);
        return {
          id: varId,
          value: value !== undefined ? value : 0, // Default to 0 if undefined
        };
      });

      console.log('[BaseAnalytics] variableData result:', variableData);

      // Apply aggregation if needed
      if (analytics.dataSource.aggregation && analytics.dataSource.aggregation !== 'none') {
        // Aggregate data based on configuration
        computedData = aggregateData(variableData, analytics.dataSource.aggregation);
      } else {
        computedData = variableData;
      }

      console.log('[BaseAnalytics] Final computedData:', computedData);

      handleInteraction({
        type: 'view',
        timestamp: Date.now(),
        data: { variableCount: variableData.length },
      });
    } catch (error) {
      console.error('Error computing analytics data:', error);
      computedData = [];
    }
  }

  function aggregateData(data: any[], aggregationType: string): any[] {
    // Simple aggregation logic - would be expanded based on needs
    switch (aggregationType) {
      case 'mean':
        return data.map((d) => ({
          ...d,
          value: Array.isArray(d.value)
            ? d.value.reduce((a, b) => a + b, 0) / d.value.length
            : d.value,
        }));
      case 'sum':
        return data.map((d) => ({
          ...d,
          value: Array.isArray(d.value) ? d.value.reduce((a, b) => a + b, 0) : d.value,
        }));
      case 'count':
        return data.map((d) => ({
          ...d,
          value: Array.isArray(d.value) ? d.value.length : 1,
        }));
      default:
        return data;
    }
  }

  function handleInteraction(event: AnalyticsInteractionEvent) {
    dispatch('interaction', event);
    onInteraction?.(event);
  }

  function handleEdit() {
    if (mode === 'edit') {
      dispatch('edit');
    }
  }

  function handleUpdate(updates: Partial<AnalyticsModuleConfig>) {
    dispatch('update', updates);
    onUpdate?.(updates);
  }

  // Base classes for consistent styling
  const baseClasses = `analytics-block analytics-${analytics.type} mode-${mode}`;
  const containerClasses = $derived(`${baseClasses} ${className} ${!isVisible ? 'hidden' : ''}`);
</script>

{#if isVisible || mode === 'edit'}
  <div
    bind:this={element}
    class={containerClasses}
    data-analytics-id={analytics.id}
    data-analytics-type={analytics.type}
    role="figure"
    aria-label={analytics.visualization.title || `${analytics.type} visualization`}
    {...restProps}
  >
    {#if mode === 'edit'}
      <div class="analytics-header">
        <div class="analytics-info">
          <span class="analytics-icon">📊</span>
          <span class="analytics-type">{analytics.type}</span>
          <span class="analytics-order">#{analytics.order}</span>
        </div>
        <div class="analytics-actions">
          <button class="action-button" onclick={() => dispatch('edit')} title="Configure">
            ⚙️
          </button>
          <button class="action-button" onclick={() => dispatch('duplicate')} title="Duplicate">
            📋
          </button>
          <button class="action-button danger" onclick={() => dispatch('delete')} title="Delete">
            🗑️
          </button>
        </div>
      </div>
    {/if}

    <div class="analytics-content">
      {#if analytics.visualization.title}
        <h3 class="analytics-title">{analytics.visualization.title}</h3>
      {/if}
      {#if analytics.visualization.subtitle}
        <p class="analytics-subtitle">{analytics.visualization.subtitle}</p>
      {/if}

      <div class="visualization-container">
        {@render children?.({ data: computedData })}
      </div>
    </div>

    {#if mode === 'edit'}
      <div class="analytics-footer">
        <span class="variable-count">
          {analytics.dataSource.variables.length} variable{analytics.dataSource.variables.length !==
          1
            ? 's'
            : ''}
        </span>
        {#if analytics.conditions}
          <span class="condition-indicator"> 🔀 Conditional </span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .analytics-block {
    position: relative;
    margin-bottom: 2rem;
    background: white;
    border-radius: 0.5rem;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .analytics-block.hidden {
    display: none;
  }

  /* Edit mode styling */
  .analytics-block.mode-edit {
    border: 2px dashed #e5e7eb;
    background: #fafafa;
  }

  .analytics-block.mode-edit:hover {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .analytics-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: white;
    border-bottom: 1px solid #e5e7eb;
  }

  .analytics-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .analytics-icon {
    font-size: 1.125rem;
  }

  .analytics-type {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    background: #f3f4f6;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
  }

  .analytics-order {
    font-size: 0.875rem;
    color: #9ca3af;
  }

  .analytics-actions {
    display: flex;
    gap: 0.25rem;
  }

  .action-button {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    border: none;
    background: #f3f4f6;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-button:hover {
    background: #e5e7eb;
  }

  .action-button.danger:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  /* Content area */
  .analytics-content {
    padding: 1.5rem;
  }

  .analytics-title {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
  }

  .analytics-subtitle {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .visualization-container {
    position: relative;
    width: 100%;
    min-height: 300px;
  }

  /* Footer */
  .analytics-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .variable-count {
    font-weight: 500;
  }

  .condition-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  /* Preview mode */
  .analytics-block.mode-preview {
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* Runtime mode */
  .analytics-block.mode-runtime {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .analytics-content {
      padding: 1rem;
    }

    .visualization-container {
      min-height: 250px;
    }
  }
</style>
