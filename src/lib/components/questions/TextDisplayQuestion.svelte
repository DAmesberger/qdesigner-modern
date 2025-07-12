<script lang="ts">
  import BaseQuestion from './BaseQuestion.svelte';
  import type { ExtendedQuestion, TextDisplayConfig } from './types';
  import { marked } from 'marked';
  import DOMPurify from 'isomorphic-dompurify';
  import { onMount, onDestroy } from 'svelte';
  
  export let question: ExtendedQuestion & { config: TextDisplayConfig };
  export let mode: 'edit' | 'preview' | 'runtime' = 'runtime';
  export let value: any = null;
  export let disabled: boolean = false;
  
  let content = '';
  let autoAdvanceTimer: number | null = null;
  
  // Process content with markdown and variable interpolation
  $: processedContent = processContent(question.config.content);
  
  function processContent(raw: string): string {
    let processed = raw;
    
    // Variable interpolation
    if (question.config.variables) {
      // This would be connected to the variable engine in production
      processed = processed.replace(/\${([^}]+)}/g, (match, varName) => {
        // For now, return placeholder
        return `[${varName}]`;
      });
    }
    
    // Markdown processing
    if (question.config.markdown) {
      processed = marked(processed);
      // Sanitize HTML to prevent XSS
      processed = DOMPurify.sanitize(processed);
    }
    
    return processed;
  }
  
  onMount(() => {
    // Set up auto-advance if configured
    if (mode === 'runtime' && question.config.autoAdvance?.enabled) {
      autoAdvanceTimer = window.setTimeout(() => {
        handleResponse('auto-advanced');
      }, question.config.autoAdvance.delay);
    }
  });
  
  onDestroy(() => {
    if (autoAdvanceTimer !== null) {
      clearTimeout(autoAdvanceTimer);
    }
  });
  
  function handleResponse(val: any) {
    value = val;
  }
</script>

<BaseQuestion 
  {question} 
  {mode} 
  {value} 
  {disabled}
  on:edit
  on:delete
  on:duplicate
  on:response
  on:interaction
  let:handleResponse
>
  <div class="text-display-content">
    {#if question.config.markdown}
      {@html processedContent}
    {:else}
      <div class="plain-text">
        {processedContent}
      </div>
    {/if}
    
    {#if mode === 'edit'}
      <div class="edit-overlay">
        <p class="edit-hint">Click to edit text content</p>
      </div>
    {/if}
  </div>
  
  {#if mode === 'runtime' && !question.config.autoAdvance?.enabled}
    <div class="continue-button-container">
      <button 
        class="continue-button"
        on:click={() => handleResponse('continued')}
        {disabled}
      >
        Continue
      </button>
    </div>
  {/if}
</BaseQuestion>

<style>
  .text-display-content {
    position: relative;
    min-height: 3rem;
  }
  
  .plain-text {
    white-space: pre-wrap;
    line-height: 1.6;
  }
  
  /* Markdown content styling */
  :global(.text-display-content h1) {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 1rem;
  }
  
  :global(.text-display-content h2) {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }
  
  :global(.text-display-content h3) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }
  
  :global(.text-display-content p) {
    margin-bottom: 1rem;
    line-height: 1.6;
  }
  
  :global(.text-display-content ul),
  :global(.text-display-content ol) {
    margin-bottom: 1rem;
    padding-left: 2rem;
  }
  
  :global(.text-display-content li) {
    margin-bottom: 0.25rem;
  }
  
  :global(.text-display-content blockquote) {
    border-left: 4px solid var(--color-gray-300);
    padding-left: 1rem;
    margin: 1rem 0;
    color: var(--color-gray-600);
  }
  
  :global(.text-display-content code) {
    background: var(--color-gray-100);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: var(--font-mono);
    font-size: 0.875em;
  }
  
  :global(.text-display-content pre) {
    background: var(--color-gray-100);
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin-bottom: 1rem;
  }
  
  :global(.text-display-content pre code) {
    background: none;
    padding: 0;
  }
  
  :global(.text-display-content a) {
    color: var(--color-blue-600);
    text-decoration: underline;
  }
  
  :global(.text-display-content a:hover) {
    color: var(--color-blue-700);
  }
  
  :global(.text-display-content img) {
    max-width: 100%;
    height: auto;
    margin: 1rem 0;
  }
  
  :global(.text-display-content table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
  }
  
  :global(.text-display-content th),
  :global(.text-display-content td) {
    border: 1px solid var(--color-gray-300);
    padding: 0.5rem;
    text-align: left;
  }
  
  :global(.text-display-content th) {
    background: var(--color-gray-50);
    font-weight: 600;
  }
  
  /* Edit mode overlay */
  .edit-overlay {
    position: absolute;
    inset: 0;
    background: rgba(59, 130, 246, 0.05);
    border: 2px dashed var(--color-blue-400);
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
  }
  
  .text-display-content:hover .edit-overlay {
    opacity: 1;
  }
  
  .edit-hint {
    color: var(--color-blue-600);
    font-weight: 500;
  }
  
  /* Continue button */
  .continue-button-container {
    margin-top: 1.5rem;
    display: flex;
    justify-content: flex-end;
  }
  
  .continue-button {
    padding: 0.5rem 1.5rem;
    background: var(--color-blue-600);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .continue-button:hover:not(:disabled) {
    background: var(--color-blue-700);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .continue-button:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: none;
  }
  
  .continue-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>