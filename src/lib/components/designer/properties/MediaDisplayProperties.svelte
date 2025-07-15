<script lang="ts">
  import type { Question, MediaConfig } from '$lib/shared/types/questionnaire';
  import { createEventDispatcher } from 'svelte';
  import theme from '$lib/theme';
  import MediaManagerModal from '../MediaManagerModal.svelte';
  import { mediaService } from '$lib/services/mediaService';
  
  export let question: Question;
  export let organizationId: string;
  export let userId: string;
  export let onUpdate: (updates: Partial<Question>) => void;
  
  const dispatch = createEventDispatcher();
  
  // Media management state
  let showMediaManager = false;
  let mediaUrls: Record<string, string> = {};
  
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
      const mediaConfig: MediaConfig = {
        mediaId: selectedMedia[0].id,
        alt: selectedMedia[0].originalFilename,
        type: selectedMedia[0].mimeType.split('/')[0] as 'image' | 'video' | 'audio',
        size: 'large'
      };
      
      updateDisplay('media', [mediaConfig]);
      
      // Load URL for new media
      loadMediaUrls([mediaConfig]);
    }
  }
  
  function removeMedia() {
    updateDisplay('media', []);
    mediaUrls = {};
  }
  
  function updateMediaConfig(field: string, value: any) {
    const media = question.display?.media?.[0];
    if (media) {
      updateDisplay('media', [{
        ...media,
        [field]: value
      }]);
    }
  }
  
  function getMediaTypeIcon(type?: string): string {
    switch (type) {
      case 'image': return '🖼️';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      default: return '📄';
    }
  }
  
  $: currentMedia = question.display?.media?.[0];
  $: isWebGL = question.type === 'webgl';
</script>

<div class="space-y-4">
  <!-- Media Selection -->
  <div>
    <div class="flex items-center justify-between mb-3">
      <label class="{theme.typography.label} {theme.semantic.textPrimary}">
        {isWebGL ? 'WebGL Content' : 'Media Content'}
      </label>
      {#if !currentMedia}
        <button
          on:click={() => showMediaManager = true}
          class="{theme.components.button.variants.primary} {theme.components.button.sizes.xs} rounded-md"
        >
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Select Media
        </button>
      {/if}
    </div>
    
    {#if currentMedia}
      <div class="{theme.semantic.bgSubtle} p-4 rounded-md border {theme.semantic.borderDefault}">
        <div class="flex items-start gap-4">
          <!-- Preview -->
          <div class="w-24 h-24 flex-shrink-0 {theme.semantic.bgSurface} rounded overflow-hidden">
            {#if currentMedia.type === 'image' && currentMedia.mediaId && mediaUrls[currentMedia.mediaId]}
              <img 
                src={mediaUrls[currentMedia.mediaId]} 
                alt={currentMedia.alt || ''}
                class="w-full h-full object-cover"
              />
            {:else}
              <div class="w-full h-full flex items-center justify-center">
                <span class="text-3xl">{getMediaTypeIcon(currentMedia.type)}</span>
              </div>
            {/if}
          </div>
          
          <!-- Media Settings -->
          <div class="flex-1 space-y-3">
            <!-- Alt Text -->
            <div>
              <label class="{theme.typography.caption} {theme.semantic.textSecondary} block mb-1">
                Alt Text / Description
              </label>
              <input
                type="text"
                value={currentMedia.alt || ''}
                on:input={(e) => updateMediaConfig('alt', e.currentTarget.value)}
                placeholder="Describe the media for accessibility"
                class="w-full px-2 py-1 text-sm border rounded {theme.semantic.bgSurface}"
              />
            </div>
            
            <!-- Size -->
            <div>
              <label class="{theme.typography.caption} {theme.semantic.textSecondary} block mb-1">
                Display Size
              </label>
              <select
                value={currentMedia.size || 'large'}
                on:change={(e) => updateMediaConfig('size', e.currentTarget.value)}
                class="w-full px-2 py-1 text-sm border rounded {theme.semantic.bgSurface}"
              >
                <option value="small">Small (300px)</option>
                <option value="medium">Medium (500px)</option>
                <option value="large">Large (100%)</option>
                <option value="full">Full Screen</option>
              </select>
            </div>
            
            <!-- Video/Audio Options -->
            {#if currentMedia.type === 'video' || currentMedia.type === 'audio'}
              <div class="space-y-2">
                <label class="flex items-center">
                  <input
                    type="checkbox"
                    checked={currentMedia.controls !== false}
                    on:change={(e) => updateMediaConfig('controls', e.currentTarget.checked)}
                    class="mr-2"
                  />
                  <span class="{theme.typography.caption}">Show Controls</span>
                </label>
                <label class="flex items-center">
                  <input
                    type="checkbox"
                    checked={currentMedia.autoplay || false}
                    on:change={(e) => updateMediaConfig('autoplay', e.currentTarget.checked)}
                    class="mr-2"
                  />
                  <span class="{theme.typography.caption}">Autoplay</span>
                </label>
                <label class="flex items-center">
                  <input
                    type="checkbox"
                    checked={currentMedia.loop || false}
                    on:change={(e) => updateMediaConfig('loop', e.currentTarget.checked)}
                    class="mr-2"
                  />
                  <span class="{theme.typography.caption}">Loop</span>
                </label>
              </div>
            {/if}
            
            <!-- Remove Button -->
            <button
              on:click={removeMedia}
              class="{theme.components.button.variants.outline} {theme.components.button.sizes.xs} rounded-md text-red-600 border-red-600 hover:bg-red-50"
            >
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Remove Media
            </button>
          </div>
        </div>
      </div>
    {:else}
      <div class="{theme.semantic.bgSubtle} p-8 rounded-md border-2 border-dashed {theme.semantic.borderDefault} text-center">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
        <p class="{theme.typography.caption} {theme.semantic.textSecondary}">
          No media selected. Click "Select Media" to add {isWebGL ? 'WebGL content' : 'an image, video, or audio file'}.
        </p>
      </div>
    {/if}
  </div>
  
  <!-- Caption -->
  {#if currentMedia}
    <div>
      <label class="{theme.typography.label} {theme.semantic.textPrimary} mb-2 block">
        Caption (Optional)
      </label>
      <input
        type="text"
        value={currentMedia.caption || ''}
        on:input={(e) => updateMediaConfig('caption', e.currentTarget.value)}
        placeholder="Add a caption below the media"
        class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
      />
    </div>
  {/if}
  
  <!-- WebGL-specific Options -->
  {#if isWebGL && currentMedia}
    <div class="border-t pt-4">
      <h4 class="{theme.typography.label} {theme.semantic.textPrimary} mb-3">WebGL Settings</h4>
      
      <div class="space-y-3">
        <div>
          <label class="{theme.typography.caption} {theme.semantic.textSecondary} block mb-1">
            Render Mode
          </label>
          <select
            value={question.display?.webglConfig?.renderMode || '2d'}
            on:change={(e) => updateDisplay('webglConfig', {
              ...question.display?.webglConfig,
              renderMode: e.currentTarget.value
            })}
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="2d">2D Canvas</option>
            <option value="3d">3D Scene</option>
            <option value="shader">Custom Shader</option>
          </select>
        </div>
        
        <label class="flex items-center">
          <input
            type="checkbox"
            checked={question.display?.webglConfig?.interactive || false}
            on:change={(e) => updateDisplay('webglConfig', {
              ...question.display?.webglConfig,
              interactive: e.currentTarget.checked
            })}
            class="mr-2"
          />
          <span class="{theme.typography.caption}">Enable user interaction</span>
        </label>
        
        <label class="flex items-center">
          <input
            type="checkbox"
            checked={question.display?.webglConfig?.highPerformance || false}
            on:change={(e) => updateDisplay('webglConfig', {
              ...question.display?.webglConfig,
              highPerformance: e.currentTarget.checked
            })}
            class="mr-2"
          />
          <span class="{theme.typography.caption}">High performance mode (120+ FPS)</span>
        </label>
      </div>
    </div>
  {/if}
  
  <!-- Info Box -->
  <div class="bg-blue-50 p-3 rounded-md">
    <p class="text-sm text-blue-800 font-medium mb-1">
      ℹ️ {isWebGL ? 'WebGL Display' : 'Media Display'}
    </p>
    <p class="text-xs text-blue-700">
      {#if isWebGL}
        WebGL questions display high-performance graphics and can capture precise interaction timing.
        Upload WebGL-compatible content or images to be rendered with GPU acceleration.
      {:else}
        Media display questions show images, videos, or audio files without collecting responses.
        Use them to present stimuli or instructions with rich media content.
      {/if}
    </p>
  </div>
</div>

<!-- Media Manager Modal -->
<MediaManagerModal
  bind:isOpen={showMediaManager}
  {organizationId}
  {userId}
  allowMultiple={false}
  on:select={handleMediaSelect}
  acceptedTypes={isWebGL ? ['image/*', 'application/json', 'text/html'] : ['image/*', 'video/*', 'audio/*']}
/>