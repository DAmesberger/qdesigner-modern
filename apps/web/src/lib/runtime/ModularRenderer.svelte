<script lang="ts">
  import type { Question } from '$lib/shared';
  import type { ComponentType } from 'svelte';
  import type { ModuleCategory } from '$lib/modules/types';
  import { moduleRegistry } from '$lib/modules/registry';
  import { interpolateVariables } from '$lib/services/variableInterpolation';
  import { resolveQuestionPrompt, resolveQuestionDescription } from '$lib/runtime/core/moduleConfigAdapter';

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
    value = $bindable(),
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

  // Process item data with variable interpolation.
  //
  // Beyond interpolation, this normalizes the canonical prompt/description fields
  // BaseQuestion renders from (`question.title` / `question.description`). Authored
  // form questions store the prompt under `text` / `display.prompt` (flattened to
  // `config.prompt` by the module-config adapter) and the description under
  // `display.description` / `instruction`; without surfacing them top-level a form
  // question renders its widget with no visible question text (Slice 1.1, ADR 0018).
  const processedItem = $derived.by(() => {
    const hasVars = !!variables && Object.keys(variables).length > 0;

    // Clone so neither interpolation nor canonical-field injection mutates the
    // source item (the runtime reuses it across presentations).
    const processed = hasVars ? JSON.parse(JSON.stringify(item)) : { ...item };
    const cfg = processed.config ?? {};

    // Resolve the canonical prompt/description before interpolation, via the
    // same single-sourced precedence the config adapter uses (config.prompt is
    // already the adapter's canonical value by the time we run).
    const resolvedTitle =
      resolveQuestionPrompt(processed) ?? cfg.title;
    const resolvedDescription = resolveQuestionDescription(processed) ?? cfg.description;

    const interp = (val: any) =>
      hasVars && typeof val === 'string' ? interpolateVariables(val, variables) : val;

    // Interpolate the legacy/WebGL text fields (unchanged behaviour).
    if (hasVars) {
      if (processed.text) {
        processed.text = interpolateVariables(processed.text, variables);
      }
      if (processed.instruction) {
        processed.instruction = interpolateVariables(processed.instruction, variables);
      }
      if (processed.config) {
        processed.config = interpolateObject(processed.config, variables);
      }
    }

    // Surface + interpolate the canonical fields BaseQuestion reads. Guarded so
    // reaction / display / analytics items without prompt text are untouched.
    if (resolvedTitle !== undefined && resolvedTitle !== null && resolvedTitle !== '') {
      processed.title = interp(resolvedTitle);
    }
    if (
      resolvedDescription !== undefined &&
      resolvedDescription !== null &&
      resolvedDescription !== ''
    ) {
      processed.description = interp(resolvedDescription);
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

      case 'display':
        // Display modules are heterogeneous: text-display / text-instruction read
        // `instruction`; bar-chart / statistical-feedback read `analytics` / `block`.
        // Pass the item under each name so every display component finds its prop
        // (Svelte 5 ignores the extras it doesn't destructure). Without this,
        // display items fell to `default` and bar-chart threw on a missing
        // `analytics` prop once Phase 5 routed them through the overlay.
        return {
          ...base,
          instruction: processedItem,
          analytics: processedItem,
          block: processedItem,
          onInteraction,
          onUpdate,
          data: [],
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
    color: hsl(var(--muted-foreground));
  }

  .spinner {
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid hsl(var(--border));
    border-top-color: hsl(var(--primary));
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
    background: hsl(var(--destructive) / 0.1);
    border: 2px dashed hsl(var(--destructive) / 0.5);
    border-radius: 0.5rem;
  }

  .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .error-state h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: hsl(var(--destructive));
    margin-bottom: 0.5rem;
  }

  .error-state p {
    color: hsl(var(--destructive));
    margin: 0;
  }

  .error-details {
    margin-top: 1rem;
    text-align: left;
    background: hsl(var(--background));
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
    background: hsl(var(--muted));
    border: 1px dashed hsl(var(--muted-foreground));
    border-radius: 0.375rem;
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
  }

  .hidden-indicator .icon {
    font-size: 1.25rem;
  }
</style>
