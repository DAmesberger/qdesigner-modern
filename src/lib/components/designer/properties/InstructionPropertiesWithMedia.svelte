<script lang="ts">
  import type { Question, MediaConfig } from '$lib/shared/types/questionnaire';
  import { createEventDispatcher } from 'svelte';
  import theme from '$lib/theme';
  import { marked } from 'marked';
  import MediaManagerModal from '../MediaManagerModal.svelte';
  import { mediaService } from '$lib/services/mediaService';
  import { formatFileSize } from '$lib/shared/types/media';
  
  export let question: Question;
  export let organizationId: string;
  export let userId: string;
  export let onUpdate: (updates: Partial<Question>) => void;
  
  const dispatch = createEventDispatcher();
  
  // Media management state
  let showMediaManager = false;
  let mediaUrls: Record<string, string> = {};
  
  // Configure marked
  marked.use({
    breaks: true,
    gfm: true
  });
  
  // Initialize media URLs on mount
  $: if (question.display?.media) {
    loadMediaUrls(question.display.media);
  }
  
  async function loadMediaUrls(mediaConfigs: MediaConfig[]) {
    const mediaIds = mediaConfigs
      .filter(m => m.mediaId)
      .map(m => m.mediaId!);
    
    if (mediaIds.length > 0) {
      const urls = await mediaService.getSignedUrls(mediaIds);
      mediaUrls = urls;
    }
  }
  
  function updateDisplay(field: string, value: any) {
    onUpdate({
      display: {
        ...question.display,
        [field]: value
      }
    });
  }
  
  function handleMediaSelect(event: CustomEvent<{ media: any[] }>) {
    const selectedMedia = event.detail.media;
    
    if (selectedMedia.length > 0) {
      const mediaConfigs: MediaConfig[] = selectedMedia.map(asset => ({
        mediaId: asset.id,
        alt: asset.originalFilename,
        type: asset.mimeType.split('/')[0] as 'image' | 'video' | 'audio',
        size: 'large'
      }));
      
      updateDisplay('media', [
        ...(question.display?.media || []),
        ...mediaConfigs
      ]);
      
      // Load URLs for new media
      loadMediaUrls(mediaConfigs);
    }
  }
  
  function removeMedia(index: number) {
    const media = [...(question.display?.media || [])];
    media.splice(index, 1);
    updateDisplay('media', media);
  }
  
  function updateMediaConfig(index: number, field: string, value: any) {
    const media = [...(question.display?.media || [])];
    media[index] = {
      ...media[index],
      [field]: value
    };
    updateDisplay('media', media);
  }
  
  // Parse markdown for preview
  $: parsedContent = (() => {
    if (question.display?.content) {
      try {
        return marked.parse(question.display.content);
      } catch (error) {
        console.error('Error parsing markdown:', error);
        return question.display.content;
      }
    }
    return '';
  })();
  
  function getMediaTypeIcon(type?: string): string {
    switch (type) {
      case 'image': return '🖼️';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      default: return '📄';
    }
  }
</script>

<div class="space-y-4">
  <!-- Content Editor -->
  <div>
    <label class="{theme.typography.label} {theme.semantic.textPrimary} mb-2 block">
      Instruction Content
    </label>
    <textarea
      value={question.display?.content || ''}
      on:input={(e) => updateDisplay('content', e.currentTarget.value)}
      rows="8"
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-mono text-sm"
      placeholder="Enter instruction content...&#10;&#10;Supports **bold**, *italic*, [links](url), lists, etc."
    />
    <p class="{theme.typography.caption} mt-2">
      This content will be displayed as Markdown. No user response will be collected.
    </p>
  </div>
  
  <!-- Media Section -->
  <div class="border-t pt-4">
    <div class="flex items-center justify-between mb-3">
      <label class="{theme.typography.label} {theme.semantic.textPrimary}">
        Media Attachments
      </label>
      <button
        on:click={() => showMediaManager = true}
        class="{theme.components.button.variants.outline} {theme.components.button.sizes.xs} rounded-md"
      >
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Add Media
      </button>
    </div>
    
    {#if question.display?.media && question.display.media.length > 0}
      <div class="space-y-3">
        {#each question.display.media as media, index}
          <div class="{theme.semantic.bgSubtle} p-3 rounded-md border {theme.semantic.borderDefault}">
            <div class="flex items-start gap-3">
              <!-- Thumbnail/Icon -->
              <div class="w-16 h-16 flex-shrink-0 {theme.semantic.bgSurface} rounded overflow-hidden">
                {#if media.type === 'image' && media.mediaId && mediaUrls[media.mediaId]}
                  <img 
                    src={mediaUrls[media.mediaId]} 
                    alt={media.alt || ''}
                    class="w-full h-full object-cover"
                  />
                {:else}
                  <div class="w-full h-full flex items-center justify-center">
                    <span class="text-2xl">{getMediaTypeIcon(media.type)}</span>
                  </div>
                {/if}
              </div>
              
              <!-- Media Settings -->
              <div class="flex-1 space-y-2">
                <!-- Alt Text -->
                <input
                  type="text"
                  value={media.alt || ''}
                  on:input={(e) => updateMediaConfig(index, 'alt', e.currentTarget.value)}
                  placeholder="Alt text / description"
                  class="w-full px-2 py-1 text-sm border rounded {theme.semantic.bgSurface}"
                />
                
                <!-- Caption -->
                <input
                  type="text"
                  value={media.caption || ''}
                  on:input={(e) => updateMediaConfig(index, 'caption', e.currentTarget.value)}
                  placeholder="Caption (optional)"
                  class="w-full px-2 py-1 text-sm border rounded {theme.semantic.bgSurface}"
                />
                
                <!-- Size and Position -->
                <div class="flex gap-2">
                  <select
                    value={media.size || 'large'}
                    on:change={(e) => updateMediaConfig(index, 'size', e.currentTarget.value)}
                    class="flex-1 px-2 py-1 text-sm border rounded {theme.semantic.bgSurface}"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                    <option value="full">Full Width</option>
                  </select>
                  
                  <select
                    value={media.position || 'below'}
                    on:change={(e) => updateMediaConfig(index, 'position', e.currentTarget.value)}
                    class="flex-1 px-2 py-1 text-sm border rounded {theme.semantic.bgSurface}"
                  >
                    <option value="above">Above Text</option>
                    <option value="below">Below Text</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                
                <!-- Video/Audio Options -->
                {#if media.type === 'video' || media.type === 'audio'}
                  <div class="flex gap-4 text-sm">
                    <label class="flex items-center">
                      <input
                        type="checkbox"
                        checked={media.controls !== false}
                        on:change={(e) => updateMediaConfig(index, 'controls', e.currentTarget.checked)}
                        class="mr-1"
                      />
                      Show Controls
                    </label>
                    <label class="flex items-center">
                      <input
                        type="checkbox"
                        checked={media.autoplay || false}
                        on:change={(e) => updateMediaConfig(index, 'autoplay', e.currentTarget.checked)}
                        class="mr-1"
                      />
                      Autoplay
                    </label>
                    <label class="flex items-center">
                      <input
                        type="checkbox"
                        checked={media.loop || false}
                        on:change={(e) => updateMediaConfig(index, 'loop', e.currentTarget.checked)}
                        class="mr-1"
                      />
                      Loop
                    </label>
                  </div>
                {/if}
              </div>
              
              <!-- Remove Button -->
              <button
                on:click={() => removeMedia(index)}
                class="p-1 {theme.semantic.interactive.ghost} rounded text-red-600 hover:bg-red-50"
                title="Remove media"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="{theme.typography.caption} {theme.semantic.textSecondary}">
        No media attached. Click "Add Media" to include images, videos, or audio.
      </p>
    {/if}
  </div>
  
  <!-- Media Position -->
  {#if question.display?.media && question.display.media.length > 0}
    <div>
      <label class="{theme.typography.label} {theme.semantic.textPrimary} mb-2 block">
        Default Media Position
      </label>
      <select
        value={question.display?.mediaPosition || 'below'}
        on:change={(e) => updateDisplay('mediaPosition', e.currentTarget.value)}
        class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
      >
        <option value="above">Above Content</option>
        <option value="below">Below Content</option>
        <option value="split">Side by Side</option>
      </select>
    </div>
  {/if}
  
  <!-- Text Alignment -->
  <div>
    <label class="{theme.typography.label} {theme.semantic.textPrimary} mb-2 block">
      Text Alignment
    </label>
    <select
      value={question.display?.alignment || 'left'}
      on:change={(e) => updateDisplay('alignment', e.currentTarget.value)}
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
    >
      <option value="left">Left</option>
      <option value="center">Center</option>
      <option value="right">Right</option>
    </select>
  </div>
</div>

<!-- Markdown Preview -->
{#if question.display?.content}
  <div class="border-t pt-4">
    <label class="{theme.typography.label} {theme.semantic.textPrimary} mb-2 block">
      Preview
    </label>
    <div class="markdown-preview {theme.semantic.bgSubtle} p-4 rounded-md border {theme.semantic.borderDefault}">
      <!-- Media above content -->
      {#if question.display.mediaPosition === 'above' && question.display.media}
        <div class="mb-4 space-y-2">
          {#each question.display.media as media}
            {#if media.mediaId && mediaUrls[media.mediaId]}
              <div class="media-preview" data-size={media.size || 'large'}>
                {#if media.type === 'image'}
                  <img 
                    src={mediaUrls[media.mediaId]} 
                    alt={media.alt || ''}
                    class="rounded"
                  />
                {:else if media.type === 'video'}
                  <video 
                    src={mediaUrls[media.mediaId]}
                    controls={media.controls !== false}
                    autoplay={media.autoplay}
                    loop={media.loop}
                    class="rounded w-full"
                  />
                {:else if media.type === 'audio'}
                  <audio
                    src={mediaUrls[media.mediaId]}
                    controls={media.controls !== false}
                    autoplay={media.autoplay}
                    loop={media.loop}
                    class="w-full"
                  />
                {/if}
                {#if media.caption}
                  <p class="{theme.typography.caption} {theme.semantic.textSecondary} mt-1 text-center">
                    {media.caption}
                  </p>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
      
      <!-- Content -->
      <div class="text-align-{question.display.alignment || 'left'}">
        {@html parsedContent}
      </div>
      
      <!-- Media below content -->
      {#if question.display.mediaPosition !== 'above' && question.display.media}
        <div class="mt-4 space-y-2">
          {#each question.display.media as media}
            {#if media.mediaId && mediaUrls[media.mediaId]}
              <div class="media-preview" data-size={media.size || 'large'}>
                {#if media.type === 'image'}
                  <img 
                    src={mediaUrls[media.mediaId]} 
                    alt={media.alt || ''}
                    class="rounded"
                  />
                {:else if media.type === 'video'}
                  <video 
                    src={mediaUrls[media.mediaId]}
                    controls={media.controls !== false}
                    autoplay={media.autoplay}
                    loop={media.loop}
                    class="rounded w-full"
                  />
                {:else if media.type === 'audio'}
                  <audio
                    src={mediaUrls[media.mediaId]}
                    controls={media.controls !== false}
                    autoplay={media.autoplay}
                    loop={media.loop}
                    class="w-full"
                  />
                {/if}
                {#if media.caption}
                  <p class="{theme.typography.caption} {theme.semantic.textSecondary} mt-1 text-center">
                    {media.caption}
                  </p>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Media Manager Modal -->
<MediaManagerModal
  bind:isOpen={showMediaManager}
  {organizationId}
  {userId}
  allowMultiple={true}
  on:select={handleMediaSelect}
/>

<style>
  /* Markdown preview styling */
  :global(.markdown-preview) {
    line-height: 1.6;
  }
  
  :global(.markdown-preview h1),
  :global(.markdown-preview h2),
  :global(.markdown-preview h3) {
    margin-top: 0.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
  }
  
  :global(.markdown-preview h1) { font-size: 1.5em; }
  :global(.markdown-preview h2) { font-size: 1.3em; }
  :global(.markdown-preview h3) { font-size: 1.1em; }
  
  :global(.markdown-preview p) {
    margin-bottom: 0.75em;
  }
  
  :global(.markdown-preview p:last-child) {
    margin-bottom: 0;
  }
  
  :global(.markdown-preview ul),
  :global(.markdown-preview ol) {
    margin-left: 1.5em;
    margin-bottom: 0.75em;
  }
  
  :global(.markdown-preview strong) {
    font-weight: 600;
  }
  
  :global(.markdown-preview em) {
    font-style: italic;
  }
  
  :global(.markdown-preview code) {
    background-color: rgba(0, 0, 0, 0.05);
    padding: 0.125em 0.25em;
    border-radius: 0.25em;
    font-family: monospace;
    font-size: 0.9em;
  }
  
  :global(.markdown-preview a) {
    color: #3B82F6;
    text-decoration: underline;
  }
  
  /* Media size classes */
  :global(.media-preview[data-size="small"] img),
  :global(.media-preview[data-size="small"] video) {
    max-width: 300px;
    margin: 0 auto;
  }
  
  :global(.media-preview[data-size="medium"] img),
  :global(.media-preview[data-size="medium"] video) {
    max-width: 500px;
    margin: 0 auto;
  }
  
  :global(.media-preview[data-size="large"] img),
  :global(.media-preview[data-size="large"] video) {
    max-width: 100%;
    margin: 0 auto;
  }
  
  :global(.media-preview[data-size="full"] img),
  :global(.media-preview[data-size="full"] video) {
    width: 100%;
  }
  
  .text-align-left { text-align: left; }
  .text-align-center { text-align: center; }
  .text-align-right { text-align: right; }
</style>