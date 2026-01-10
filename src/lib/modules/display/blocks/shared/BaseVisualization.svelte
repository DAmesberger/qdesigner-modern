<script lang="ts">
  import type { AnalyticsBlockProps, ConditionalLogic } from '$lib/modules/types';
  import type { AnalyticsBlockConfig } from './types';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { scriptingEngine } from '$lib/services/scriptingEngine';

  interface Props extends AnalyticsBlockProps {
    block: AnalyticsBlockConfig;
    children?: any;
    class?: string;
  }

  let {
    block,
    mode = 'runtime',
    data = [],
    onUpdate,
    children,
    class: className = '',
    ...restProps
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    update: Partial<AnalyticsBlockConfig>;
    edit: void;
    delete: void;
    duplicate: void;
    export: { format: string; data: any };
  }>();

  let isVisible = $state(true);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let processedData = $state<any>(null);
  let refreshInterval: number | null = null;
  let element = $state<HTMLDivElement>();

  // Check conditional visibility
  $effect(() => {
    if (block.conditions && mode === 'runtime') {
      checkVisibility();
    }
  });

  // Process data when it changes
  $effect(() => {
    if (data && data.length > 0) {
      processData();
    }
  });

  // Set up refresh interval if configured
  onMount(() => {
    if (block.refreshInterval && mode === 'runtime') {
      refreshInterval = window.setInterval(() => {
        dispatch('update', {}); // Trigger parent to refresh data
      }, block.refreshInterval);
    }
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });

  async function checkVisibility() {
    if (!block.conditions) {
      isVisible = true;
      return;
    }

    try {
      const result = await scriptingEngine.evaluateCondition(block.conditions);
      isVisible = result;
    } catch (error) {
      console.error('Error evaluating block visibility:', error);
      isVisible = true; // Default to visible on error
    }
  }

  async function processData() {
    if (!block.calculations || block.calculations.length === 0) {
      processedData = data;
      return;
    }

    isLoading = true;
    error = null;

    try {
      // Apply calculations
      const results = await Promise.all(
        block.calculations.map(async (calc) => {
          const context = {
            data,
            ...calc.inputs,
          };

          const value = await scriptingEngine.evaluate(calc.formula, context);
          return {
            name: calc.name,
            value,
          };
        })
      );

      // Merge calculation results with raw data
      processedData = {
        raw: data,
        calculated: results.reduce(
          (acc, { name, value }) => {
            acc[name] = value;
            return acc;
          },
          {} as Record<string, any>
        ),
      };
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error processing data';
      processedData = null;
    } finally {
      isLoading = false;
    }
  }

  function handleUpdate(updates: Partial<AnalyticsBlockConfig>) {
    dispatch('update', updates);
    onUpdate?.(updates);
  }

  function handleExport(format: string) {
    if (!block.exportable) return;

    dispatch('export', {
      format,
      data: processedData || data,
    });
  }

  // Base classes for consistent styling
  let baseClasses = $derived(`analytics-block analytics-${block.type} mode-${mode}`);
  let containerClasses = $derived(
    `${baseClasses} ${className} ${!isVisible ? 'hidden' : ''} ${isLoading ? 'loading' : ''}`
  );
</script>

{#if isVisible || mode === 'edit'}
  <div
    bind:this={element}
    class={containerClasses}
    data-block-id={block.id}
    data-block-type={block.type}
    role="figure"
    {...restProps}
  >
    {#if mode === 'edit'}
      <div class="block-header">
        <div class="block-info">
          <span class="block-type">{block.type}</span>
          <span class="block-order">#{block.order}</span>
        </div>
        <div class="block-actions">
          <button class="action-button" onclick={() => dispatch('edit')} title="Edit"> ✏️ </button>
          <button class="action-button" onclick={() => dispatch('duplicate')} title="Duplicate">
            📋
          </button>
          <button class="action-button danger" onclick={() => dispatch('delete')} title="Delete">
            🗑️
          </button>
        </div>
      </div>
    {/if}

    <div class="block-content">
      {#if isLoading}
        <div class="loading-indicator">
          <div class="spinner"></div>
          <span>Loading data...</span>
        </div>
      {:else if error}
        <div class="error-message" role="alert">
          <span class="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      {:else}
        {@render children?.()}
      {/if}
    </div>

    {#if mode === 'runtime' && block.exportable && processedData}
      <div class="export-controls">
        {#each block.exportFormats || ['png', 'csv'] as format}
          <button
            class="export-button"
            onclick={() => handleExport(format)}
            title="Export as {format.toUpperCase()}"
          >
            Export {format.toUpperCase()}
          </button>
        {/each}
      </div>
    {/if}

    {#if mode === 'edit' && block.conditions}
      <div class="condition-indicator">
        <span class="condition-icon">🔀</span>
        <span class="condition-text">Has conditional visibility</span>
      </div>
    {/if}

    {#if mode === 'edit' && block.refreshInterval}
      <div class="refresh-indicator">
        <span class="refresh-icon">🔄</span>
        <span class="refresh-text">Refreshes every {block.refreshInterval / 1000}s</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .analytics-block {
    position: relative;
    margin-bottom: 2rem;
    transition: all 0.2s ease;
  }

  .analytics-block.hidden {
    display: none;
  }

  .analytics-block.mode-edit {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
    background: #ffffff;
  }

  .analytics-block.mode-edit:hover {
    border-color: #3b82f6;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .block-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #f3f4f6;
  }

  .block-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .block-type {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    background: #f3f4f6;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
  }

  .block-order {
    font-size: 0.875rem;
    color: #9ca3af;
  }

  .block-actions {
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

  .block-content {
    position: relative;
    min-height: 200px;
  }

  .loading-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #6b7280;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 0.5rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: #fee2e2;
    color: #dc2626;
    border-radius: 0.5rem;
  }

  .error-icon {
    font-size: 1.25rem;
  }

  .export-controls {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #f3f4f6;
  }

  .export-button {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    background: #f3f4f6;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .export-button:hover {
    background: #3b82f6;
    color: white;
  }

  .condition-indicator,
  .refresh-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #f3f4f6;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .condition-icon,
  .refresh-icon {
    font-size: 0.875rem;
  }

  /* Runtime-specific styles */
  .analytics-block.mode-runtime {
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
</style>
