<script lang="ts">
  import type { ExtendedQuestion } from './types';
  import type { ComponentType } from 'svelte';
  import { moduleRegistry } from '$lib/modules/registry';
  
  export let question: ExtendedQuestion;
  export let mode: 'edit' | 'preview' | 'runtime' = 'runtime';
  export let value: any = undefined;
  export let disabled: boolean = false;
  
  let QuestionComponent: ComponentType | null = null;
  let loading = false;
  let error: string | null = null;
  
  // Load component from module registry
  $effect(() => {
    loadComponent(question.type);
  });
  
  async function loadComponent(type: string) {
    loading = true;
    error = null;
    
    try {
      // Check module registry for question or instruction
      const metadata = moduleRegistry.get(type);
      if (metadata && (metadata.category === 'question' || metadata.category === 'instruction')) {
        QuestionComponent = await moduleRegistry.loadComponent(type, 'runtime');
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
</script>

{#if loading}
  <div class="loading-state">
    <div class="spinner"></div>
    <span>Loading question...</span>
  </div>
{:else if QuestionComponent}
  <svelte:component 
    this={QuestionComponent}
    question={fullQuestion}
    {mode}
    bind:value
    {disabled}
    on:edit
    on:delete
    on:duplicate
    on:response
    on:interaction
    on:mount
    on:change
  />
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