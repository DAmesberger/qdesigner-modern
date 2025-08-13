<script lang="ts">
  import type { ExtendedQuestion } from './types';
  import type { ComponentType } from 'svelte';
  import { moduleRegistry } from '$lib/modules/registry';
  
  interface Props {
    question: ExtendedQuestion;
    mode?: 'edit' | 'preview' | 'runtime';
    value?: any;
    disabled?: boolean;
    variables?: Record<string, any>;
  }
  
  let { 
    question, 
    mode = 'runtime',
    value = undefined,
    disabled = false,
    variables = {}
  }: Props = $props();
  
  let QuestionComponent = $state<ComponentType | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  
  // Load component from module registry
  $effect(() => {
    loadComponent(question.type);
  });
  
  async function loadComponent(type: string) {
    loading = true;
    error = null;
    
    console.log('[QuestionRenderer] Loading component:', type);
    
    try {
      // Check module registry for question or instruction
      const metadata = moduleRegistry.get(type);
      console.log('[QuestionRenderer] Metadata found:', metadata);
      
      if (metadata && (metadata.category === 'question' || metadata.category === 'display')) {
        // Map preview mode to runtime for loading components
        const loadMode = mode === 'preview' ? 'runtime' : mode;
        QuestionComponent = await moduleRegistry.loadComponent(type, loadMode);
        console.log('[QuestionRenderer] Component loaded successfully');
      } else {
        console.error(`Component not found in module registry: ${type}`);
        error = `Component not found: ${type}`;
        QuestionComponent = null;
      }
    } catch (err) {
      console.error(`Failed to load component: ${type}`, err);
      error = `Failed to load component: ${type}`;
      QuestionComponent = null;
    } finally {
      loading = false;
    }
  }
  
  // Merge question properties with type-specific config
  const fullQuestion = $derived({
    ...question,
    config: {
      ...question.config,
      ...(question as any) // Type-specific properties
    }
  });
  
  // Transform question to analytics format for display modules
  const analyticsData = $derived(() => {
    const metadata = moduleRegistry.get(question.type);
    if (metadata?.category === 'display') {
      // Transform question data to analytics format
      return {
        ...question,
        dataSource: {
          variables: question.variables || [],
          aggregation: 'none' as const
        },
        visualization: {
          title: question.prompt || question.text || '',
          subtitle: question.description || '',
          showLegend: true,
          showGrid: true,
          showTooltips: true,
          colorScheme: 'default' as const
        },
        config: {
          ...metadata.defaultConfig,
          ...question.config,
          ...(question as any)
        }
      };
    }
    return fullQuestion;
  });
</script>

{#if loading}
  <div class="loading-state">
    <div class="spinner"></div>
    <span>Loading question...</span>
  </div>
{:else if QuestionComponent}
  {@const metadata = moduleRegistry.get(question.type)}
  {#if metadata?.category === 'display'}
    <!-- Display modules (analytics, instructions) use analytics prop -->
    <svelte:component 
      this={QuestionComponent}
      analytics={analyticsData()}
      {mode}
      {variables}
      on:edit
      on:delete
      on:duplicate
      on:interaction
    />
  {:else}
    <!-- Question modules use question prop -->
    <svelte:component 
      this={QuestionComponent}
      question={fullQuestion}
      {mode}
      bind:value
      {disabled}
      {variables}
      on:edit
      on:delete
      on:duplicate
      on:response
      on:interaction
      on:mount
      on:change
    />
  {/if}
{:else}
  <div class="unknown-question-type">
    <div class="error-icon">❓</div>
    <h3>Unknown Question Type</h3>
    <p>Question type "{question.type}" is not registered.</p>
    {#if mode === 'edit'}
      <p class="help-text">
        Please check that the question type is correctly configured
        or that the required component is installed.
      </p>
    {/if}
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
  
  .unknown-question-type {
    padding: 2rem;
    text-align: center;
    background: #f9fafb;
    border: 2px dashed #e5e7eb;
    border-radius: 0.5rem;
  }
  
  .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  .unknown-question-type h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.5rem;
  }
  
  .unknown-question-type p {
    color: #6b7280;
    margin: 0;
  }
  
  .help-text {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #9ca3af;
  }
</style>