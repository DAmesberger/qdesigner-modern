<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { mediaService } from '$lib/services/mediaService';
  import type { 
    MediaAsset, 
    MediaFilter, 
    MediaUploadProgress,
    MediaReference 
  } from '$lib/shared/types/media';
  import { 
    formatFileSize, 
    isImageMedia, 
    isVideoMedia, 
    isAudioMedia 
  } from '$lib/shared/types/media';
  import theme from '$lib/theme';
  
  export let organizationId: string;
  export let userId: string;
  export let allowMultiple = false;
  export let selectedMedia: MediaAsset[] = [];
  export let mode: 'select' | 'manage' = 'select';
  
  const dispatch = createEventDispatcher();
  
  // State
  let mediaAssets: MediaAsset[] = [];
  let loading = false;
  let uploading = false;
  let uploadProgress: Record<string, MediaUploadProgress> = {};
  let filter: MediaFilter = { type: 'all' };
  let searchQuery = '';
  let viewMode: 'grid' | 'list' = 'grid';
  let selectedIds = new Set<string>();
  let showUploadArea = false;
  let dragActive = false;
  
  // File input ref
  let fileInput: HTMLInputElement;
  
  onMount(() => {
    console.log('[MediaManager] Mounted with props:', { organizationId, userId });
    
    // Set the current user ID in the media service
    if (userId) {
      mediaService.setUserId(userId);
    }
    
    loadMedia();
    // Initialize storage bucket
    mediaService.setupBucket().catch(console.error);
  });
  
  async function loadMedia() {
    loading = true;
    try {
      mediaAssets = await mediaService.listMedia({
        ...filter,
        search: searchQuery || undefined
      });
      
      console.log('[MediaManager] Loaded media assets:', mediaAssets);
      
      // Get signed URLs for thumbnails only if we have media
      if (mediaAssets.length > 0) {
        const mediaIds = mediaAssets.map(m => m.id);
        console.log('[MediaManager] Getting signed URLs for:', mediaIds);
        const urls = await mediaService.getSignedUrls(mediaIds, 3600);
        
        // Update assets with URLs
        mediaAssets = mediaAssets.map(asset => ({
          ...asset,
          thumbnailUrl: urls[asset.id]
        }));
      }
    } catch (error) {
      console.error('Failed to load media:', error);
      // Set empty array on error to show empty state
      mediaAssets = [];
    } finally {
      loading = false;
    }
  }
  
  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    
    await uploadFiles(Array.from(input.files));
    input.value = ''; // Reset input
  }
  
  async function uploadFiles(files: File[]) {
    if (!organizationId || !userId) {
      console.error('[MediaManager] Missing organizationId or userId for upload');
      alert('Unable to upload: Missing organization or user context');
      return;
    }
    
    uploading = true;
    
    for (const file of files) {
      const fileId = `upload-${Date.now()}-${file.name}`;
      
      try {
        // Track upload progress
        uploadProgress[fileId] = { loaded: 0, total: file.size, percentage: 0 };
        
        const asset = await mediaService.uploadMedia(
          file,
          {
            organizationId,
            userId,
            accessLevel: 'organization',
            generateThumbnail: true
          },
          (progress) => {
            uploadProgress[fileId] = progress;
          }
        );
        
        // Get signed URL for the new asset
        const url = await mediaService.getSignedUrl(asset.id);
        
        // Add to list with URL
        mediaAssets = [{
          ...asset,
          url: url
        } as MediaAsset & { url?: string }, ...mediaAssets];
        
        delete uploadProgress[fileId];
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        delete uploadProgress[fileId];
      }
    }
    
    uploading = false;
    showUploadArea = false;
  }
  
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) {
      uploadFiles(files);
    }
  }
  
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragActive = true;
  }
  
  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
  }
  
  function toggleSelection(asset: MediaAsset) {
    if (mode === 'manage') {
      if (selectedIds.has(asset.id)) {
        selectedIds.delete(asset.id);
      } else {
        selectedIds.add(asset.id);
      }
      selectedIds = selectedIds; // Trigger reactivity
    } else {
      // Select mode
      if (allowMultiple) {
        const index = selectedMedia.findIndex(m => m.id === asset.id);
        if (index >= 0) {
          selectedMedia.splice(index, 1);
        } else {
          selectedMedia.push(asset);
        }
        selectedMedia = selectedMedia; // Trigger reactivity
      } else {
        selectedMedia = [asset];
      }
      
      dispatch('select', { 
        media: selectedMedia,
        asset: asset 
      });
    }
  }
  
  async function deleteSelected() {
    if (!confirm(`Delete ${selectedIds.size} selected media files?`)) return;
    
    loading = true;
    
    for (const id of selectedIds) {
      try {
        await mediaService.deleteMedia(id);
        mediaAssets = mediaAssets.filter(m => m.id !== id);
      } catch (error) {
        console.error(`Failed to delete media ${id}:`, error);
      }
    }
    
    selectedIds.clear();
    selectedIds = selectedIds;
    loading = false;
  }
  
  function getMediaIcon(mimeType: string | undefined): string {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    return '📄';
  }
  
  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString();
  }
  
  $: if (filter || searchQuery !== undefined) {
    loadMedia();
  }
</script>

<div class="bg-layer-surface border border-border rounded-lg h-full flex flex-col">
  <!-- Header -->
  <div class="p-4 border-b {theme.semantic.borderDefault}">
    <div class="flex items-center justify-between mb-4">
      <h2 class="{theme.typography.h3} {theme.semantic.textPrimary}">
        Media Library
      </h2>
      
      <div class="flex items-center gap-2">
        <!-- View mode toggle -->
        <div class="flex {theme.semantic.bgSubtle} rounded-md">
          <button
            on:click={() => viewMode = 'grid'}
            class="p-2 {viewMode === 'grid' ? theme.semantic.bgSurface : ''} rounded-l-md transition-colors"
            title="Grid view"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            on:click={() => viewMode = 'list'}
            class="p-2 {viewMode === 'list' ? theme.semantic.bgSurface : ''} rounded-r-md transition-colors"
            title="List view"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        
        <!-- Upload button -->
        <button
          on:click={() => showUploadArea = !showUploadArea}
          class="{theme.components.button.variants.default} {theme.components.button.sizes.sm} rounded-md"
        >
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload
        </button>
        
        {#if mode === 'manage' && selectedIds.size > 0}
          <button
            on:click={deleteSelected}
            class="{theme.components.button.variants.destructive} {theme.components.button.sizes.sm} rounded-md"
          >
            Delete ({selectedIds.size})
          </button>
        {/if}
      </div>
    </div>
    
    <!-- Filters -->
    <div class="flex items-center gap-4">
      <!-- Search -->
      <div class="flex-1">
        <input
          type="search"
          bind:value={searchQuery}
          placeholder="Search media..."
          class="w-full px-3 py-2 {theme.semantic.bgSurface} border {theme.semantic.borderDefault} rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
        />
      </div>
      
      <!-- Type filter -->
      <select
        bind:value={filter.type}
        class="px-3 py-2 {theme.semantic.bgSurface} border {theme.semantic.borderDefault} rounded-md"
      >
        <option value="all">All Types</option>
        <option value="image">Images</option>
        <option value="video">Videos</option>
        <option value="audio">Audio</option>
      </select>
    </div>
  </div>
  
  <!-- Upload area -->
  {#if showUploadArea}
    <div
      class="p-8 border-b {theme.semantic.borderDefault} {dragActive ? 'bg-primary/5' : theme.semantic.bgSubtle}"
      on:drop={handleDrop}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
    >
      <div class="text-center">
        <svg class="mx-auto h-12 w-12 {theme.semantic.textSecondary}" fill="none" stroke="currentColor" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        
        <p class="{theme.typography.body} {theme.semantic.textSecondary} mt-2">
          Drag and drop files here, or
        </p>
        
        <input
          bind:this={fileInput}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          on:change={handleFileSelect}
          class="hidden"
        />
        
        <button
          on:click={() => fileInput.click()}
          class="{theme.components.button.variants.outline} {theme.components.button.sizes.sm} rounded-md mt-2"
        >
          Choose Files
        </button>
        
        <p class="{theme.typography.caption} {theme.semantic.textSecondary} mt-2">
          Max file size: 50MB. Supported: Images, Videos, Audio
        </p>
      </div>
      
      <!-- Upload progress -->
      {#if Object.keys(uploadProgress).length > 0}
        <div class="mt-4 space-y-2">
          {#each Object.entries(uploadProgress) as [fileId, progress]}
            <div class="{theme.semantic.bgSurface} p-2 rounded">
              <div class="flex items-center justify-between mb-1">
                <span class="{theme.typography.caption}">{fileId.split('-').pop()}</span>
                <span class="{theme.typography.caption}">{progress.percentage}%</span>
              </div>
              <div class="w-full bg-muted rounded-full h-2">
                <div 
                  class="bg-primary h-2 rounded-full transition-all"
                  style="width: {progress.percentage}%"
                />
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  
  <!-- Media content -->
  <div class="flex-1 overflow-auto p-4">
    {#if loading && mediaAssets.length === 0}
      <div class="flex items-center justify-center h-full">
        <div class="{theme.semantic.textSecondary}">Loading media...</div>
      </div>
    {:else if mediaAssets.length === 0}
      <div class="flex flex-col items-center justify-center h-full">
        <svg class="w-16 h-16 {theme.semantic.textSubtle} mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p class="{theme.semantic.textSecondary}">No media files yet</p>
        <button
          on:click={() => fileInput.click()}
          class="{theme.components.button.variants.default} {theme.components.button.sizes.sm} rounded-md mt-4"
        >
          Upload First Media
        </button>
      </div>
    {:else if viewMode === 'grid'}
      <!-- Grid view -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {#each mediaAssets as asset}
          <button
            on:click={() => toggleSelection(asset)}
            class="group relative aspect-square {theme.semantic.bgSurface} rounded-lg overflow-hidden border-2 transition-all
                   {selectedMedia.some(m => m.id === asset.id) || selectedIds.has(asset.id) 
                     ? 'border-primary ring-2 ring-primary/20' 
                     : theme.semantic.borderDefault + ' hover:border-muted-foreground'}"
          >
            {#if isImageMedia(asset)}
              <img 
                src={(asset as any).url || '/placeholder-image.svg'} 
                alt={asset.originalFilename}
                class="w-full h-full object-cover"
                loading="lazy"
              />
            {:else}
              <div class="w-full h-full flex items-center justify-center {theme.semantic.bgSubtle}">
                <span class="text-4xl">{getMediaIcon(asset.mimeType)}</span>
              </div>
            {/if}
            
            <!-- Overlay info -->
            <div class="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div class="absolute bottom-0 left-0 right-0 p-2 text-background">
                <p class="text-xs truncate">{asset.originalFilename}</p>
                <p class="text-xs opacity-75">{formatFileSize(asset.sizeBytes)}</p>
              </div>
            </div>
            
            <!-- Selection indicator -->
            {#if selectedMedia.some(m => m.id === asset.id) || selectedIds.has(asset.id)}
              <div class="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      <!-- List view -->
      <div class="space-y-2">
        {#each mediaAssets as asset}
          <button
            on:click={() => toggleSelection(asset)}
            class="w-full flex items-center gap-4 p-3 {theme.semantic.bgSurface} rounded-lg border transition-all
                   {selectedMedia.some(m => m.id === asset.id) || selectedIds.has(asset.id)
                     ? 'border-primary bg-primary/5' 
                     : theme.semantic.borderDefault + ' hover:border-muted-foreground'}"
          >
            <!-- Thumbnail -->
            <div class="w-16 h-16 flex-shrink-0 {theme.semantic.bgSubtle} rounded overflow-hidden">
              {#if isImageMedia(asset)}
                <img 
                  src={(asset as any).url || '/placeholder-image.svg'} 
                  alt={asset.originalFilename}
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
              {:else}
                <div class="w-full h-full flex items-center justify-center">
                  <span class="text-2xl">{getMediaIcon(asset.mimeType)}</span>
                </div>
              {/if}
            </div>
            
            <!-- Info -->
            <div class="flex-1 text-left">
              <p class="{theme.typography.label} {theme.semantic.textPrimary} truncate">
                {asset.originalFilename}
              </p>
              <p class="{theme.typography.caption} {theme.semantic.textSecondary}">
                {formatFileSize(asset.sizeBytes)} • {asset.mimeType} • {formatDate(asset.createdAt)}
              </p>
            </div>
            
            <!-- Selection indicator -->
            {#if selectedMedia.some(m => m.id === asset.id) || selectedIds.has(asset.id)}
              <div class="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                <svg class="w-4 h-4 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>