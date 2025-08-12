<script lang="ts">
  import type { InstructionProps } from '$lib/modules/types';
  import type { MediaConfig } from '$lib/shared/types/questionnaire';
  import MediaManagerModal from '$lib/components/designer/MediaManagerModal.svelte';
  import { insertMediaReference } from '$lib/services/markdownProcessor';
  import { processMarkdownContentSync } from '$lib/services/markdownProcessor';
  import { mediaService } from '$lib/services/mediaService';
  
  interface Props extends InstructionProps {
    instruction: any;
    organizationId?: string;
    userId?: string;
  }
  
  let { instruction, onUpdate, organizationId = '', userId = '' }: Props = $props();
  
  // Use local state for content to prevent focus loss
  // Initialize with default if display doesn't exist
  let localContent = $state(
    instruction.display?.content || 
    instruction.text || 
    'Enter your instruction text here...'
  );
  let debounceTimer: number | null = null;
  let lastInstructionId = instruction.id;
  let showMediaManager = $state(false);
  let contentTextarea: HTMLTextAreaElement;
  let mediaUrls = $state<Record<string, string>>({});
  let previewContent = $state('');
  
  // Update local content when switching to a different instruction
  $effect(() => {
    if (instruction.id !== lastInstructionId) {
      lastInstructionId = instruction.id;
      localContent = instruction.display?.content || 
                    instruction.text || 
                    'Enter your instruction text here...';
    }
  });
  
  // Load media URLs if media is present
  $effect(() => {
    // Check for media in both old (root) and new (display.media) locations
    if (instruction.media && instruction.media.length > 0 && (!instruction.display?.media || instruction.display.media.length === 0)) {
      // Migrate from old location to new
      console.log('[TextInstructionDesigner] Migrating media from root to display.media');
      onUpdate?.({
        display: {
          ...instruction.display,
          media: instruction.media
        }
      });
    } else if (instruction.display?.media && instruction.display.media.length > 0) {
      loadMediaUrls();
    }
  });
  
  // Update preview content
  $effect(() => {
    updatePreview();
  });
  
  // Sync orphaned media references with media array
  $effect(() => {
    syncOrphanedMediaReferences();
  });
  
  // Cleanup timer on unmount
  $effect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  });
  
  function handleContentChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    localContent = target.value;
    
    // Debounce the update to prevent re-renders on every keystroke
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    debounceTimer = window.setTimeout(() => {
      onUpdate?.({ 
        display: { 
          ...instruction.display,
          content: localContent 
        } 
      });
      debounceTimer = null;
    }, 300);
  }
  
  function handleMarkdownToggle() {
    onUpdate?.({ 
      display: { 
        ...instruction.display,
        enableMarkdown: !(instruction.display?.enableMarkdown ?? true)
      } 
    });
  }
  
  function handleVariablesToggle() {
    onUpdate?.({ 
      display: { 
        ...instruction.display,
        variables: !(instruction.display?.variables ?? true)
      } 
    });
  }
  
  function handleInteractiveToggle() {
    onUpdate?.({ 
      navigation: { 
        ...instruction.navigation,
        showNext: !(instruction.navigation?.showNext ?? true)
      } 
    });
  }
  
  function handleAutoAdvanceToggle() {
    onUpdate?.({
      navigation: {
        ...instruction.navigation,
        autoAdvance: !(instruction.navigation?.autoAdvance ?? false)
      }
    });
  }
  
  function handleDelayChange(event: Event) {
    const target = event.target as HTMLInputElement;
    onUpdate?.({
      navigation: {
        ...instruction.navigation,
        advanceDelay: parseInt(target.value) * 1000
      }
    });
  }
  
  async function loadMediaUrls() {
    if (!instruction.display?.media || instruction.display.media.length === 0) return;
    
    const mediaIds = instruction.display.media
      .filter((m: MediaConfig) => m.mediaId)
      .map((m: MediaConfig) => m.mediaId);
    
    if (mediaIds.length > 0) {
      try {
        const urls = await mediaService.getSignedUrls(mediaIds);
        mediaUrls = urls;
      } catch (error) {
        console.error('Failed to load media URLs:', error);
      }
    }
  }
  
  function updatePreview() {
    if (instruction.display?.enableMarkdown ?? true) {
      previewContent = processMarkdownContentSync(localContent, {
        media: instruction.display?.media || [],
        mediaUrls,
        format: 'markdown',
        processVariables: instruction.display?.variables ?? true,
        variables: {}
      });
    } else {
      previewContent = localContent.replace(/\n/g, '<br>');
    }
  }
  
  function syncOrphanedMediaReferences() {
    // Find all media references in content
    const mediaPattern = /!\[[^\]]*\]\(media:([a-z0-9_]+)\)/gi;
    const matches = [...localContent.matchAll(mediaPattern)];
    
    if (matches.length === 0) return;
    
    const currentMedia = instruction.display?.media || [];
    const currentRefIds = new Set(currentMedia.map(m => m.refId));
    const contentRefIds = matches.map(m => m[1]);
    
    // Find orphaned references (in content but not in media array)
    const orphanedRefIds = contentRefIds.filter(refId => !currentRefIds.has(refId));
    
    if (orphanedRefIds.length > 0) {
      console.log('[TextInstructionDesigner] Found orphaned media references, removing them:', orphanedRefIds);
      
      // Remove orphaned references from content
      let cleanedContent = localContent;
      orphanedRefIds.forEach(refId => {
        const pattern = new RegExp(`!\\[[^\\]]*\\]\\(media:${refId}\\)`, 'g');
        cleanedContent = cleanedContent.replace(pattern, '[Broken media reference - please re-insert]');
      });
      
      if (cleanedContent !== localContent) {
        localContent = cleanedContent;
        // Update the content
        onUpdate?.({
          display: {
            ...instruction.display,
            content: cleanedContent
          }
        });
      }
    }
  }
  
  function handleMediaSelect(event: CustomEvent<{ media: MediaConfig[]; markdown: string }>) {
    const { media, markdown } = event.detail;
    
    // Insert markdown at cursor position
    const cursorPos = contentTextarea?.selectionStart || localContent.length;
    const result = insertMediaReference(localContent, cursorPos, media[0], media[0].alt);
    localContent = result.text;
    
    // Update instruction with new media - media should be in display.media
    const currentMedia = instruction.display?.media || [];
    onUpdate?.({
      display: {
        ...instruction.display,
        content: localContent,
        media: [...currentMedia, ...media]
      }
    });
    
    // Load URLs for the new media and update preview
    if (media[0].mediaId) {
      mediaService.getSignedUrl(media[0].mediaId).then(url => {
        mediaUrls = { ...mediaUrls, [media[0].mediaId]: url };
        updatePreview(); // Update preview with new URL
      }).catch(error => {
        console.error('Failed to get media URL:', error);
      });
    }
    
    // Set cursor position after insertion
    setTimeout(() => {
      if (contentTextarea) {
        contentTextarea.selectionStart = result.newCursorPosition;
        contentTextarea.selectionEnd = result.newCursorPosition;
        contentTextarea.focus();
      }
    }, 0);
  }
</script>

{@debug instruction, showMediaManager, mediaUrls, previewContent}

<div class="text-instruction-designer">
  <div class="form-group">
    <div class="content-header">
      <label for="content">Content</label>
      <button
        type="button"
        onclick={() => showMediaManager = true}
        class="media-button"
        title="Insert Media"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Insert Media
      </button>
    </div>
    <textarea
      bind:this={contentTextarea}
      id="content"
      value={localContent}
      oninput={handleContentChange}
      rows="10"
      placeholder="Enter your instruction text here..."
      class="content-input"
    />
    {#if instruction.display?.variables}
      <div class="help-text">
        You can use variables with the syntax: {'{{variableName}}'}
      </div>
    {/if}
    {#if instruction.display?.media && instruction.display.media.length > 0}
      <div class="media-info">
        {instruction.display.media.length} media item{instruction.display.media.length !== 1 ? 's' : ''} attached
      </div>
    {/if}
  </div>
  
  {#if (instruction.display?.enableMarkdown ?? true) && localContent}
    <div class="preview-section">
      <h4>Preview</h4>
      <div class="preview-content">
        {@html previewContent}
      </div>
    </div>
  {/if}
  
  <div class="options-section">
    <h3>Display Options</h3>
    
    <div class="checkbox-group">
      <label>
        <input
          type="checkbox"
          checked={instruction.display?.enableMarkdown ?? true}
          onchange={handleMarkdownToggle}
        />
        <span>Enable Markdown</span>
      </label>
      <div class="help-text">Parse content as Markdown for rich formatting</div>
    </div>
    
    <div class="checkbox-group">
      <label>
        <input
          type="checkbox"
          checked={instruction.display?.variables ?? true}
          onchange={handleVariablesToggle}
        />
        <span>Enable Variables</span>
      </label>
      <div class="help-text">Allow variable interpolation in content</div>
    </div>
    
    <div class="checkbox-group">
      <label>
        <input
          type="checkbox"
          checked={instruction.navigation?.showNext ?? true}
          onchange={handleInteractiveToggle}
        />
        <span>Interactive</span>
      </label>
      <div class="help-text">Require user to click Continue button</div>
    </div>
  </div>
  
  <div class="auto-advance-section">
    <h3>Auto-Advance</h3>
    
    <div class="checkbox-group">
      <label>
        <input
          type="checkbox"
          checked={instruction.navigation?.autoAdvance ?? false}
          onchange={handleAutoAdvanceToggle}
        />
        <span>Enable Auto-Advance</span>
      </label>
    </div>
    
    {#if instruction.navigation?.autoAdvance}
      <div class="form-group">
        <label for="delay">Delay (seconds)</label>
        <input
          id="delay"
          type="number"
          min="1"
          max="300"
          value={(instruction.navigation?.advanceDelay || 5000) / 1000}
          oninput={handleDelayChange}
          class="delay-input"
        />
      </div>
    {/if}
  </div>
  
  {#if instruction.display?.enableMarkdown}
    <div class="markdown-reference">
      <h3>Markdown Reference</h3>
      <div class="reference-content">
        <div class="reference-item">
          <code># Heading 1</code>
          <code>## Heading 2</code>
          <code>### Heading 3</code>
        </div>
        <div class="reference-item">
          <code>**Bold Text**</code>
          <code>*Italic Text*</code>
          <code>`Code`</code>
        </div>
        <div class="reference-item">
          <code>- List Item</code>
          <code>1. Numbered Item</code>
          <code>[Link](url)</code>
        </div>
      </div>
    </div>
  {/if}
</div>

<MediaManagerModal
  bind:isOpen={showMediaManager}
  {organizationId}
  {userId}
  allowMultiple={false}
  title="Insert Media"
  on:confirm={handleMediaSelect}
/>

<style>
  .text-instruction-designer {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }
  
  .content-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    resize: vertical;
  }
  
  .content-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .options-section,
  .auto-advance-section {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 0.5rem;
  }
  
  h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.75rem;
  }
  
  .checkbox-group {
    margin-bottom: 0.75rem;
  }
  
  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  
  .checkbox-group input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }
  
  .help-text {
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.25rem;
    margin-left: 1.5rem;
  }
  
  .delay-input {
    width: 120px;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }
  
  .delay-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .markdown-reference {
    background: #f3f4f6;
    padding: 1rem;
    border-radius: 0.5rem;
  }
  
  .reference-content {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
  }
  
  .reference-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .reference-item code {
    font-size: 0.75rem;
    background: #e5e7eb;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }
</style>