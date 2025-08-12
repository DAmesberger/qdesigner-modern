<script lang="ts">
  import BaseInstruction from '../shared/base/BaseInstruction.svelte';
  import type { InstructionProps } from '$lib/modules/types';
  import type { InstructionModuleConfig } from '../shared/base/types';
  import type { MediaConfig } from '$lib/shared/types/questionnaire';
  import { processMarkdownContent } from '$lib/services/markdownProcessor';
  import { mediaService } from '$lib/services/mediaService';
  import { onMount } from 'svelte';
  
  interface TextInstructionConfig extends InstructionModuleConfig {
    display?: {
      content?: string;
      enableMarkdown?: boolean;
      variables?: boolean;
    };
    navigation?: {
      showNext?: boolean;
      autoAdvance?: boolean;
      advanceDelay?: number;
    };
    media?: MediaConfig[];
  }
  
  interface Props extends InstructionProps {
    instruction: TextInstructionConfig;
  }
  
  let { 
    instruction,
    mode = 'runtime',
    onUpdate,
    onInteraction
  }: Props = $props();
  
  let parsedContent = $state('');
  let contentLoading = $state(true);
  let hasViewed = $state(false);
  let autoAdvanceTimer: number | null = null;
  let mediaUrls = $state<Record<string, string>>({});
  
  // Load media URLs when instruction changes
  $effect(() => {
    if (instruction.display?.media && instruction.display.media.length > 0) {
      loadMediaUrls();
    }
  });
  
  // Parse content with variable interpolation and media
  $effect(() => {
    updateContent();
  });
  
  // Handle auto-advance
  $effect(() => {
    if (mode === 'runtime' && 
        hasViewed && 
        instruction.navigation?.autoAdvance && 
        instruction.navigation.advanceDelay && 
        instruction.navigation.advanceDelay > 0) {
      startAutoAdvance();
    }
    
    return () => {
      if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
      }
    };
  });
  
  onMount(() => {
    hasViewed = true;
  });
  
  async function loadMediaUrls() {
    if (!instruction.display?.media || instruction.display.media.length === 0) return;
    
    const mediaIds = instruction.display.media
      .filter((m: MediaConfig) => m.mediaId)
      .map((m: MediaConfig) => m.mediaId!);
    
    if (mediaIds.length > 0) {
      try {
        const urls = await mediaService.getSignedUrls(mediaIds);
        mediaUrls = urls;
        // Update content after URLs are loaded
        updateContent();
      } catch (error) {
        console.error('[TextInstruction] Failed to load media URLs:', error);
      }
    }
  }
  
  async function updateContent() {
    contentLoading = true;
    const content = instruction.display?.content || '';
    
    try {
      // Process markdown with media and variables
      parsedContent = await processMarkdownContent(content, {
        media: instruction.display?.media || [],
        mediaUrls: mediaUrls,
        format: (instruction.display?.enableMarkdown ?? true) ? 'markdown' : 'text',
        processVariables: instruction.display?.variables ?? true,
        variables: {} // TODO: Get from context or scriptingEngine
      });
      
      // If markdown is disabled and we still have plain text, convert newlines
      if (!(instruction.display?.enableMarkdown ?? true) && parsedContent === content) {
        parsedContent = content.replace(/\n/g, '<br>');
      }
    } catch (error) {
      console.error('[TextInstruction] Failed to process content:', error);
      // Fallback to showing raw content
      parsedContent = content;
    } finally {
      contentLoading = false;
    }
  }
  
  function startAutoAdvance() {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
    }
    
    autoAdvanceTimer = window.setTimeout(() => {
      handleContinue();
    }, instruction.navigation!.advanceDelay!);
  }
  
  function handleContinue() {
    onInteraction?.({
      type: 'submit',
      timestamp: Date.now(),
      data: { action: 'continue' }
    });
  }
  
  function handleUpdate(updates: any) {
    onUpdate?.(updates);
  }
</script>

<BaseInstruction
  {instruction}
  {mode}
  onUpdate={handleUpdate}
  onInteraction={onInteraction}
>
  <div class="text-instruction-content">
    <div class="content" class:markdown={instruction.display?.enableMarkdown ?? true} class:edit-mode={mode === 'edit'}>
      {#if contentLoading}
        <p class="loading-state">Loading content...</p>
      {:else if parsedContent}
        {@html parsedContent}
      {:else if mode === 'edit'}
        <p class="empty-state">Enter content in the properties panel to see a preview here.</p>
      {/if}
    </div>
    
    {#if mode === 'runtime' && instruction.navigation?.showNext && !instruction.navigation?.autoAdvance}
      <div class="continue-container">
        <button 
          class="continue-button"
          on:click={handleContinue}
        >
          Continue
        </button>
      </div>
    {/if}
    
    {#if mode === 'runtime' && instruction.navigation?.autoAdvance}
      <div class="auto-advance-indicator">
        <span class="indicator-icon">⏱️</span>
        <span class="indicator-text">
          Auto-advancing in {(instruction.navigation.advanceDelay || 5000) / 1000} seconds...
        </span>
      </div>
    {/if}
  </div>
</BaseInstruction>

<style>
  .text-instruction-content {
    position: relative;
  }
  
  .content {
    line-height: 1.6;
    color: #374151;
  }
  
  .content.edit-mode {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
    min-height: 100px;
  }
  
  .empty-state {
    color: #9ca3af;
    font-style: italic;
    text-align: center;
    margin: 0;
  }
  
  .content.markdown :global(h1),
  .content.markdown :global(h2),
  .content.markdown :global(h3),
  .content.markdown :global(h4),
  .content.markdown :global(h5),
  .content.markdown :global(h6) {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
    line-height: 1.25;
  }
  
  .content.markdown :global(h1) { font-size: 1.875rem; }
  .content.markdown :global(h2) { font-size: 1.5rem; }
  .content.markdown :global(h3) { font-size: 1.25rem; }
  .content.markdown :global(h4) { font-size: 1.125rem; }
  
  .content.markdown :global(p) {
    margin-bottom: 1em;
  }
  
  .content.markdown :global(ul),
  .content.markdown :global(ol) {
    margin-left: 1.5em;
    margin-bottom: 1em;
  }
  
  .content.markdown :global(li) {
    margin-bottom: 0.25em;
  }
  
  .content.markdown :global(code) {
    background: #f3f4f6;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
  }
  
  .content.markdown :global(pre) {
    background: #1f2937;
    color: #f9fafb;
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin-bottom: 1em;
  }
  
  .content.markdown :global(blockquote) {
    border-left: 4px solid #3b82f6;
    padding-left: 1rem;
    margin: 1em 0;
    color: #6b7280;
  }
  
  .content.markdown :global(strong) {
    font-weight: 600;
    color: #111827;
  }
  
  .content.markdown :global(em) {
    font-style: italic;
  }
  
  .content.markdown :global(a) {
    color: #3b82f6;
    text-decoration: underline;
  }
  
  .content.markdown :global(a:hover) {
    color: #2563eb;
  }
  
  .continue-container {
    display: flex;
    justify-content: center;
    margin-top: 2rem;
  }
  
  .continue-button {
    padding: 0.625rem 1.5rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-weight: 500;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .continue-button:hover {
    background: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
  }
  
  .continue-button:active {
    transform: translateY(0);
  }
  
  .auto-advance-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 1.5rem;
    padding: 0.75rem;
    background: #fef3c7;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #92400e;
  }
  
  .indicator-icon {
    font-size: 1rem;
  }
</style>