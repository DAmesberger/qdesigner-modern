<script lang="ts">
  import BaseQuestion from './BaseQuestion.svelte';
  import type { Question } from '$lib/shared';
  import { marked } from 'marked';
  import { mediaService } from '$lib/services/mediaService';
  import { onMount } from 'svelte';
  
  export let question: Question;
  export let mode: 'edit' | 'preview' | 'runtime' = 'runtime';
  export let value: any = null;
  export let disabled: boolean = false;
  export let interactive: boolean = true;
  
  let mediaUrls: Record<string, string> = {};
  let parsedContent = '';
  
  // Configure marked
  marked.use({
    breaks: true,
    gfm: true
  });
  
  // Load media URLs on mount
  onMount(() => {
    if (question.display?.media) {
      loadMediaUrls();
    }
  });
  
  // Reactive media loading
  $: if (question.display?.media) {
    loadMediaUrls();
  }
  
  async function loadMediaUrls() {
    if (!question.display?.media) return;
    
    const mediaIds = question.display.media
      .filter((m: any) => m.mediaId)
      .map((m: any) => m.mediaId);
    
    if (mediaIds.length > 0) {
      const urls = await mediaService.getSignedUrls(mediaIds);
      mediaUrls = urls;
    }
  }
  
  // Parse content with media substitution
  $: parsedContent = (() => {
    if (question.display?.content) {
      let content = question.display.content;
      
      // Replace media references with actual URLs
      if (question.display.media) {
        question.display.media.forEach((media: any, index: number) => {
          if (media.mediaId && mediaUrls[media.mediaId]) {
            // Replace by refId if available
            if (media.refId) {
              content = content.replace(
                new RegExp(`\\(media:${media.refId}\\)`, 'g'),
                `(${mediaUrls[media.mediaId]})`
              );
            }
            // Also replace by index
            content = content.replace(
              new RegExp(`\\(media:${index}\\)`, 'g'),
              `(${mediaUrls[media.mediaId]})`
            );
          }
        });
      }
      
      return marked.parse(content);
    }
    return '';
  })();
  
  function handleContinue() {
    if (interactive) {
      value = 'viewed';
    }
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
>
  <div class="instruction-content">
    <div class="markdown-content">
      {@html parsedContent}
    </div>
    
    {#if mode === 'edit'}
      <div class="edit-overlay">
        <p class="edit-hint">Click to edit instruction content</p>
      </div>
    {/if}
  </div>
  
  {#if mode === 'runtime' && interactive}
    <div class="continue-button-container">
      <button 
        class="continue-button"
        on:click={handleContinue}
        {disabled}
      >
        Continue
      </button>
    </div>
  {/if}
</BaseQuestion>

<style>
  .instruction-content {
    position: relative;
    min-height: 100px;
  }
  
  .markdown-content {
    line-height: 1.6;
  }
  
  :global(.markdown-content img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1rem auto;
  }
  
  :global(.markdown-content h1),
  :global(.markdown-content h2),
  :global(.markdown-content h3) {
    margin-top: 1em;
    margin-bottom: 0.5em;
    font-weight: 600;
  }
  
  :global(.markdown-content p) {
    margin-bottom: 0.75em;
  }
  
  :global(.markdown-content ul),
  :global(.markdown-content ol) {
    margin-left: 1.5em;
    margin-bottom: 0.75em;
  }
  
  .edit-overlay {
    position: absolute;
    inset: 0;
    background: rgba(59, 130, 246, 0.05);
    border: 2px dashed rgba(59, 130, 246, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 200ms;
    pointer-events: none;
  }
  
  .instruction-content:hover .edit-overlay {
    opacity: 1;
  }
  
  .edit-hint {
    font-size: 0.875rem;
    color: rgb(59, 130, 246);
    font-weight: 500;
  }
  
  .continue-button-container {
    display: flex;
    justify-content: center;
    margin-top: 1.5rem;
  }
  
  .continue-button {
    padding: 0.5rem 1.5rem;
    background: #3B82F6;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 200ms;
  }
  
  .continue-button:hover:not(:disabled) {
    background: #2563EB;
  }
  
  .continue-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>