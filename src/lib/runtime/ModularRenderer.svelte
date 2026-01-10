<script lang="ts">
  import type { Question } from '$lib/shared';
  import type { ComponentType } from 'svelte';
  import type { ModuleCategory } from '$lib/modules/types';
  import { moduleRegistry } from '$lib/modules/registry';
  import { interpolateVariables } from '$lib/services/variableInterpolation';

  interface ModularItem {
    id: string;
    type: string;
    category: ModuleCategory;
    order: number;
    config?: any;
    conditions?: any;
    [key: string]: any; // For type-specific properties
  }

  interface Props {
    item: ModularItem;
    mode?: 'edit' | 'preview' | 'runtime';
    value?: any;
    variables?: Record<string, any>;
    disabled?: boolean;
    organizationId?: string;
    userId?: string;
    onResponse?: (value: any) => void;
    onValidation?: (result: { valid: boolean; errors: string[] }) => void;
    onInteraction?: (event: any) => void;
    onUpdate?: (updates: Partial<ModularItem>) => void;
    onedit?: () => void;
    ondelete?: () => void;
    onduplicate?: () => void;
  }

  let {
    item,
    mode = 'runtime',
    value = $bindable(null),
    variables = {},
    disabled = false,
    organizationId = '',
    userId = '',
    onResponse,
    onValidation,
    onInteraction,
    onUpdate,
    onedit,
    ondelete,
    onduplicate,
  }: Props = $props();

  let Component = $state<ComponentType | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let isVisible = $state(true);

  // Load component from module registry
  $effect(() => {
    loadComponent(item.type, item.category);
  });

  // Check visibility conditions
  $effect(() => {
    if (item.conditions && mode === 'runtime') {
      checkVisibility();
    }
  });

  async function loadComponent(type: string, category: ModuleCategory) {
    loading = true;
    error = null;

    try {
      const metadata = moduleRegistry.get(type);
      if (metadata && metadata.category === category) {
        const variant = mode === 'edit' ? 'designer' : 'runtime';
        Component = await moduleRegistry.loadComponent(type, variant);
      } else {
        console.error(`Component not found in module registry: ${type} (${category})`);
        error = `Component not found: ${type}`;
        Component = null;
      }
    } catch (err: any) {
      console.error(`Failed to load component: ${type}`, err);
      error = `Failed to load: ${err?.message || 'Unknown error'}`;
      Component = null;
    } finally {
      loading = false;
    }
  }

  async function checkVisibility() {
    // Simplified visibility check - would integrate with scripting engine
    isVisible = true;
  }

  // Process item data with variable interpolation
  const processedItem = $derived.by(() => {
    if (!variables || Object.keys(variables).length === 0) {
      return item;
    }

    // Deep clone the item
    const processed = JSON.parse(JSON.stringify(item));

    // Interpolate text fields
    if (processed.text) {
      processed.text = interpolateVariables(processed.text, variables);
    }
    if (processed.instruction) {
      processed.instruction = interpolateVariables(processed.instruction, variables);
    }
    if (processed.description) {
      processed.description = interpolateVariables(processed.description, variables);
    }

    // Process config recursively
    if (processed.config) {
      processed.config = interpolateObject(processed.config, variables);
    }

    return processed;
  });

  function interpolateObject(obj: any, vars: Record<string, any>): any {
    if (typeof obj === 'string') {
      return interpolateVariables(obj, vars);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => interpolateObject(item, vars));
    }
    if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, val] of Object.entries(obj)) {
        result[key] = interpolateObject(val, vars);
      }
      return result;
    }
    return obj;
  }

  // Prepare props based on category
  const componentProps = $derived.by(() => {
    const base = {
      mode,
      disabled,
      variables,
    };

    switch (item.category) {
      case 'question':
        return {
          ...base,
          question: processedItem,
          value,
          onResponse,
          onValidation,
          onInteraction,
        };

      case 'instruction':
        return {
          ...base,
          instruction: processedItem,
          organizationId,
          userId,
          onInteraction,
          onUpdate,
        };

      case 'analytics':
        return {
          ...base,
          analytics: processedItem,
          onInteraction,
          onUpdate,
          data: [], // Would be computed from variables
        };

      default:
        return base;
    }
  });
</script>

{#if loading}
  <div class="loading-state">
    <div class="spinner"></div>
    <span>Loading {item.category}...</span>
  </div>
{:else if error}
  <div class="error-state">
    <div class="error-icon">⚠️</div>
    <h3>Error Loading Component</h3>
    <p>{error}</p>
    {#if mode === 'edit'}
      <details class="error-details">
        <summary>Debug Info</summary>
        <pre>{JSON.stringify({ type: item.type, category: item.category }, null, 2)}</pre>
      </details>
    {/if}
  </div>
{:else if Component && isVisible}
  <Component
    {...componentProps}
    bind:value
    {onedit}
    {ondelete}
    {onduplicate}
    onresponse={onResponse}
    oninteraction={onInteraction}
    onupdate={onUpdate}
    onvalidation={onValidation}
  />
{:else if !isVisible && mode === 'edit'}
  <div class="hidden-indicator">
    <span class="icon">👁️‍🗨️</span>
    <span>Hidden by conditions</span>
  </div>
{/if}

<style>
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    color: #6b7280;
  }

  .spinner {
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    padding: 2rem;
    text-align: center;
    background: #fef2f2;
    border: 2px dashed #f87171;
    border-radius: 0.5rem;
  }

  .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .error-state h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #991b1b;
    margin-bottom: 0.5rem;
  }

  .error-state p {
    color: #dc2626;
    margin: 0;
  }

  .error-details {
    margin-top: 1rem;
    text-align: left;
    background: white;
    padding: 1rem;
    border-radius: 0.375rem;
  }

  .error-details summary {
    cursor: pointer;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .error-details pre {
    font-size: 0.75rem;
    overflow-x: auto;
  }

  .hidden-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: #f3f4f6;
    border: 1px dashed #9ca3af;
    border-radius: 0.375rem;
    color: #6b7280;
    font-size: 0.875rem;
  }

  .hidden-indicator .icon {
    font-size: 1.25rem;
  }
</style>
