<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { mediaService } from '$lib/services/mediaService';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import { getDesignerContext } from '$lib/stores/designer-context';
  const designerStore = getDesignerContext();
  import { toast } from '$lib/stores/toast';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import type {
    MediaAsset,
    MediaFilter,
    MediaUploadProgress,
    MediaReference,
  } from '$lib/shared/types/media';
  import {
    formatFileSize,
    isImageMedia,
    isVideoMedia,
    isAudioMedia,
  } from '$lib/shared/types/media';
  import theme from '$lib/theme';
  import { Grid, List, Upload, Image, Check, Trash2, Settings2 } from 'lucide-svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    organizationId?: string;
    userId?: string;
    allowMultiple?: boolean;
    selectedMedia?: MediaAsset[];
    initialAssets?: MediaAsset[];
    mode?: 'select' | 'manage';
    onselect?: (event: { media: MediaAsset[]; asset: MediaAsset }) => void;
  }

  let {
    organizationId = '',
    userId = '',
    allowMultiple = false,
    selectedMedia = $bindable([]),
    initialAssets = [],
    mode = 'select',
    onselect,
  }: Props = $props();

  // The library can be flipped between picking media (select) and housekeeping
  // (manage — per-asset delete) from the header, so a caller that opens the
  // picker can still reach the delete affordances without a separate surface.
  // Seeded once from the `mode` prop; the header toggle drives it thereafter.
  let activeMode = $state<'select' | 'manage'>(untrack(() => mode));

  // State
  let mediaAssets = $state<MediaAsset[]>([]);
  let loading = $state(false);
  let uploading = $state(false);
  let uploadProgress = $state<Record<string, MediaUploadProgress>>({});
  let filter = $state<MediaFilter>({ type: 'all' });
  let searchQuery = $state('');
  let viewMode = $state<'grid' | 'list'>('grid');
  let showUploadArea = $state(false);
  let dragActive = $state(false);
  let uploadError = $state<string | null>(null);
  let contextError = $state<string | null>(null);
  let resolvedOrganizationId = $state('');
  let resolvedUserId = $state('');
  let lastQueryKey = $state('');
  let resolvingContext = $state<Promise<boolean> | null>(null);

  // File input ref
  let fileInput = $state<HTMLInputElement | undefined>();

  function normalizeId(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  function effectiveOrganizationId() {
    return (
      normalizeId(organizationId) ||
      normalizeId(resolvedOrganizationId) ||
      normalizeId(designerStore.questionnaire?.organizationId) ||
      normalizeId(designerStore.organizationId)
    );
  }

  function effectiveUserId() {
    return (
      normalizeId(userId) ||
      normalizeId(resolvedUserId) ||
      normalizeId(designerStore.userId)
    );
  }

  async function ensureContext() {
    if (effectiveOrganizationId()) {
      contextError = null;
      const nextUserId = effectiveUserId();
      if (nextUserId) {
        mediaService.setUserId(nextUserId);
      }
      return true;
    }

    if (!resolvingContext) {
      resolvingContext = (async () => {
        const session = await auth.getSession();
        const sessionUserId = normalizeId(session?.user?.id);
        if (!effectiveUserId() && sessionUserId) {
          resolvedUserId = sessionUserId;
        }

        if (!effectiveUserId()) {
          const user = await auth.getUser();
          if (user?.id) {
            resolvedUserId = user.id;
          }
        }

        const storeOrganizationId =
          normalizeId(designerStore.questionnaire?.organizationId) ||
          normalizeId(designerStore.organizationId);
        if (!effectiveOrganizationId() && storeOrganizationId) {
          resolvedOrganizationId = storeOrganizationId;
        }

        if (!effectiveOrganizationId()) {
          const projectId = normalizeId(designerStore.projectId);
          if (projectId) {
            try {
              const project = await api.projects.get(projectId);
              const projectOrganizationId = normalizeId(
                (project as { organizationId?: string }).organizationId
              );

              if (projectOrganizationId) {
                resolvedOrganizationId = projectOrganizationId;
              }
            } catch (error) {
              console.warn('[MediaManager] Failed to resolve organization from project:', error);
            }
          }
        }

        if (!effectiveOrganizationId()) {
          try {
            const organizations = await api.organizations.list();
            const firstOrganization = organizations[0];
            if (firstOrganization?.id) {
              resolvedOrganizationId = firstOrganization.id;
            }
          } catch (error) {
            console.warn('[MediaManager] Failed to resolve organization from memberships:', error);
          }
        }

        const nextUserId = effectiveUserId();
        const nextOrganizationId = effectiveOrganizationId();

        if (nextUserId) {
          mediaService.setUserId(nextUserId);
        }

        if (!nextOrganizationId) {
          contextError = 'Unable to resolve organization context for media uploads.';
          return false;
        }

        contextError = null;
        return true;
      })().finally(() => {
        resolvingContext = null;
      });
    }

    return resolvingContext;
  }

  $effect(() => {
    const nextOrganizationId =
      normalizeId(organizationId) ||
      normalizeId(designerStore.questionnaire?.organizationId) ||
      normalizeId(designerStore.organizationId);
    const nextUserId = normalizeId(userId) || normalizeId(designerStore.userId);

    if (nextOrganizationId) {
      resolvedOrganizationId = nextOrganizationId;
    }
    if (nextUserId) {
      resolvedUserId = nextUserId;
      mediaService.setUserId(nextUserId);
    }
    if (contextError && (nextOrganizationId || nextUserId)) {
      contextError = null;
    }
  });

  $effect(() => {
    if (mediaAssets.length === 0 && initialAssets.length > 0) {
      mediaAssets = initialAssets;
    }
  });

  onMount(() => {
    console.log('[MediaManager] Mounted with props:', { organizationId, userId });

    void (async () => {
      await ensureContext();
      await mediaService.setupBucket().catch(console.error);
    })();
  });

  async function loadMedia() {
    loading = true;
    try {
      uploadError = null;
      if (!(await ensureContext())) {
        mediaAssets = [];
        return;
      }
      mediaAssets = await mediaService.listMedia({
        organizationId: effectiveOrganizationId(),
        ...filter,
        search: searchQuery || undefined,
      });

      console.log('[MediaManager] Loaded media assets:', mediaAssets);

      // Get signed URLs for thumbnails only if we have media
      if (mediaAssets.length > 0) {
        const mediaIds = mediaAssets.map((m) => m.id);
        console.log('[MediaManager] Getting signed URLs for:', mediaIds);
        const urls = await mediaService.getSignedUrls(mediaIds, 3600);

        // Update assets with URLs
        mediaAssets = mediaAssets.map((asset) => ({
          ...asset,
          thumbnailUrl: urls[asset.id],
        }));
      }
    } catch (error) {
      console.error('Failed to load media:', error);
      uploadError = error instanceof Error ? error.message : 'Failed to load media library';
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

  // The file input is only bound inside the {#if showUploadArea} block, so
  // callers that live outside it (e.g. the empty-state CTA) must reveal the
  // upload area and wait for the DOM before the input exists to click.
  async function openUploadPicker() {
    showUploadArea = true;
    await tick();
    fileInput?.click();
  }

  async function uploadFiles(files: File[]) {
    if (!(await ensureContext())) {
      console.error('[MediaManager] Missing organizationId for upload');
      const message = contextError || 'Unable to upload: Missing organization context';
      uploadError = message;
      toast.error('Upload error', { message });
      return;
    }

    uploading = true;
    uploadError = null;

    for (const file of files) {
      const fileId = `upload-${Date.now()}-${file.name}`;

      try {
        // Track upload progress
        uploadProgress[fileId] = {
          loaded: 0,
          total: file.size,
          percentage: 0,
          indeterminate: true,
        };

        const asset = await mediaService.uploadMedia(
          file,
          {
            organizationId: effectiveOrganizationId(),
            userId: effectiveUserId() || undefined,
            accessLevel: 'organization',
            generateThumbnail: true,
          },
          (progress) => {
            uploadProgress[fileId] = {
              ...progress,
              indeterminate: progress.percentage <= 0 && progress.loaded < progress.total,
            };
          }
        );

        uploadProgress[fileId] = {
          loaded: file.size,
          total: file.size,
          percentage: 100,
          indeterminate: false,
        };
        await tick();

        let url: string | undefined;
        try {
          url = await mediaService.getSignedUrl(asset.id);
        } catch (error) {
          console.warn('[MediaManager] Uploaded asset but failed to resolve preview URL:', error);
        }

        // Add to list with URL
        mediaAssets = [
          {
            ...asset,
            url,
          } as MediaAsset & { url?: string },
          ...mediaAssets,
        ];

        delete uploadProgress[fileId];
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        uploadError = error instanceof Error ? error.message : `Failed to upload ${file.name}`;
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
    // Manage mode is housekeeping-only — the per-asset Delete button owns the
    // interaction, so a card tap must never register as a pick (which, in a
    // single-select picker, would confirm and close the dialog).
    if (activeMode === 'manage') return;

    // Select mode
    if (allowMultiple) {
      const index = selectedMedia.findIndex((m) => m.id === asset.id);
      if (index >= 0) {
        selectedMedia.splice(index, 1);
      } else {
        selectedMedia.push(asset);
      }
    } else {
      selectedMedia = [asset];
    }

    onselect?.({
      media: selectedMedia,
      asset: asset,
    });
  }

  // Per-asset delete (F-47). The server DELETE hard-deletes regardless of
  // references — there is no in-use/409 guard — so the confirm copy warns that
  // any questionnaire still pointing at this asset will lose it.
  async function deleteAsset(asset: MediaAsset) {
    const dims = formatDimensions(asset);
    const label = dims ? `${asset.originalFilename} (${dims})` : asset.originalFilename;

    if (
      !(await confirmDialog({
        title: 'Delete media?',
        message:
          `Permanently delete “${label}”? ` +
          `Any questionnaire that references this asset will lose it — this cannot be undone.`,
        confirmLabel: 'Delete',
        destructive: true,
      }))
    )
      return;

    try {
      await mediaService.deleteMedia(asset.id);
      mediaAssets = mediaAssets.filter((m) => m.id !== asset.id);
      selectedMedia = selectedMedia.filter((m) => m.id !== asset.id);
      toast.success('Media deleted', { message: label });
    } catch (error) {
      console.error(`Failed to delete media ${asset.id}:`, error);
      toast.error('Delete failed', {
        message: error instanceof Error ? error.message : 'Could not delete this media asset.',
      });
    }
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

  // '1920 × 1080' when the server extracted image dimensions, else ''.
  // Non-image assets and pre-F-8 uploads carry no dimensions.
  function formatDimensions(asset: MediaAsset): string {
    return asset.width && asset.height ? `${asset.width} × ${asset.height}` : '';
  }

  $effect(() => {
    const queryKey = JSON.stringify({
      organizationId: effectiveOrganizationId(),
      type: filter.type || 'all',
      search: searchQuery.trim(),
    });

    if (!effectiveOrganizationId() || queryKey === lastQueryKey) {
      return;
    }

    lastQueryKey = queryKey;
    void untrack(() => loadMedia());
  });
</script>

<div class="bg-layer-surface border border-border rounded-lg h-full flex flex-col">
  <!-- Header -->
  <div class="p-4 border-b {theme.semantic.borderDefault}">
    <div class="flex items-center justify-between mb-4">
      <h2 class="{theme.typography.h3} {theme.semantic.textPrimary}">Media Library</h2>

      <div class="flex items-center gap-2">
        <!-- View mode toggle -->
        <div class="flex {theme.semantic.bgSubtle} rounded-md">
          <button
            onclick={() => (viewMode = 'grid')}
            class="p-2 {viewMode === 'grid'
              ? theme.semantic.bgSurface
              : ''} rounded-l-md transition-colors"
            title="Grid view"
          >
            <Grid size={16} />
          </button>
          <button
            onclick={() => (viewMode = 'list')}
            class="p-2 {viewMode === 'list'
              ? theme.semantic.bgSurface
              : ''} rounded-r-md transition-colors"
            title="List view"
          >
            <List size={16} />
          </button>
        </div>

        <!-- Manage-library toggle: flips the picker into housekeeping mode where
             each asset exposes a Delete button (F-47). -->
        <button
          onclick={() => (activeMode = activeMode === 'manage' ? 'select' : 'manage')}
          class="{activeMode === 'manage'
            ? theme.components.button.variants.default
            : theme.components.button.variants.outline} {theme.components.button.sizes
            .sm} rounded-md"
          aria-pressed={activeMode === 'manage'}
          data-testid="media-manage-toggle"
          title={activeMode === 'manage' ? 'Exit manage mode' : 'Manage library (delete assets)'}
        >
          <Settings2 size={16} class="mr-1" />
          {activeMode === 'manage' ? 'Done' : 'Manage'}
        </button>

        <!-- Upload button -->
        <button
          onclick={() => (showUploadArea = !showUploadArea)}
          class="{theme.components.button.variants.default} {theme.components.button.sizes
            .sm} rounded-md"
        >
          <Upload size={16} class="mr-1" />
          Upload
        </button>
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
          class="w-full px-3 py-2 {theme.semantic.bgSurface} border {theme.semantic
            .borderDefault} rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
        />
      </div>

      <!-- Type filter -->
      <Select
        bind:value={filter.type}
        placeholder=""
      >
        <option value="all">All Types</option>
        <option value="image">Images</option>
        <option value="video">Videos</option>
        <option value="audio">Audio</option>
      </Select>
    </div>
  </div>

  <!-- Upload area -->
  {#if showUploadArea}
    <div
      class="p-8 border-b {theme.semantic.borderDefault} {dragActive
        ? 'bg-primary/5'
        : theme.semantic.bgSubtle}"
      role="region"
      aria-label="Media upload drop zone"
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
    >
      <div class="text-center">
        <Upload size={48} class="mx-auto {theme.semantic.textSecondary}" />

        <p class="{theme.typography.body} {theme.semantic.textSecondary} mt-2">
          Drag and drop files here, or
        </p>

        <input
          bind:this={fileInput}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          onchange={handleFileSelect}
          class="hidden"
        />

        <button
          onclick={() => fileInput?.click()}
          class="{theme.components.button.variants.outline} {theme.components.button.sizes
            .sm} rounded-md mt-2"
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
                <span class={theme.typography.caption}>{fileId.split('-').pop()}</span>
                <span class={theme.typography.caption}>
                  {progress.indeterminate ? 'Uploading...' : `${progress.percentage}%`}
                </span>
              </div>
              <div class="w-full bg-muted rounded-full h-2">
                {#if progress.indeterminate}
                  <div class="bg-primary/80 h-2 w-2/3 rounded-full animate-pulse"></div>
                {:else}
                  <div
                    class="bg-primary h-2 rounded-full transition-all"
                    style="width: {progress.percentage}%"
                  ></div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if uploadError}
        <div class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {uploadError}
        </div>
      {/if}
      {#if contextError}
        <div class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {contextError}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Media content -->
  <div class="flex-1 overflow-auto p-4">
    {#if loading && mediaAssets.length === 0}
      <div class="flex items-center justify-center h-full">
        <div class={theme.semantic.textSecondary}>Loading media...</div>
      </div>
    {:else if mediaAssets.length === 0}
      <div class="flex flex-col items-center justify-center h-full">
        <Image size={64} class="{theme.semantic.textSubtle} mb-4" />
        <p class={theme.semantic.textSecondary}>No media files yet</p>
        {#if uploadError}
          <p class="mt-2 max-w-md text-center text-sm text-destructive">{uploadError}</p>
        {/if}
        {#if contextError}
          <p class="mt-2 max-w-md text-center text-sm text-destructive">{contextError}</p>
        {/if}
        <button
          onclick={openUploadPicker}
          class="{theme.components.button.variants.default} {theme.components.button.sizes
            .sm} rounded-md mt-4"
        >
          Upload First Media
        </button>
      </div>
    {:else if viewMode === 'grid'}
      <!-- Grid view -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {#each mediaAssets as asset}
          <!-- Wrapper hosts the delete button as a SIBLING of the card button —
               a <button> cannot legally nest inside another <button>. -->
          <div class="relative aspect-square">
            <button
              onclick={() => toggleSelection(asset)}
              class="group relative w-full h-full block {theme.semantic
                .bgSurface} rounded-lg overflow-hidden border-2 transition-all
                     {selectedMedia.some((m) => m.id === asset.id)
                ? 'border-primary ring-2 ring-primary/20'
                : theme.semantic.borderDefault + ' hover:border-muted-foreground'}"
            >
              {#if isImageMedia(asset)}
                <!-- object-contain letterboxes against the tile background so the
                     author judges true aspect instead of a blind centre-crop. -->
                <img
                  src={(asset as any).thumbnailUrl || (asset as any).url || '/placeholder-image.svg'}
                  alt={asset.originalFilename}
                  class="w-full h-full object-contain {theme.semantic.bgSubtle}"
                  loading="lazy"
                />
              {:else}
                <div class="w-full h-full flex items-center justify-center {theme.semantic.bgSubtle}">
                  <span class="text-4xl">{getMediaIcon(asset.mimeType)}</span>
                </div>
              {/if}

              <!-- Overlay info -->
              <div
                class="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <div class="absolute bottom-0 left-0 right-0 p-2 text-background">
                  <p class="text-xs truncate">{asset.originalFilename}</p>
                  <p class="text-xs opacity-75">
                    {formatFileSize(asset.sizeBytes)}{#if formatDimensions(asset)} • {formatDimensions(asset)}{/if}
                  </p>
                </div>
              </div>

              <!-- Selection indicator -->
              {#if selectedMedia.some((m) => m.id === asset.id)}
                <div
                  class="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center"
                >
                  <Check size={16} class="text-primary-foreground" strokeWidth={3} />
                </div>
              {/if}
            </button>

            {#if activeMode === 'manage'}
              <button
                onclick={() => deleteAsset(asset)}
                class="absolute top-2 right-2 w-7 h-7 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow hover:bg-destructive/90 transition-colors"
                aria-label={`Delete ${asset.originalFilename}`}
                title={`Delete ${asset.originalFilename}`}
                data-testid={`media-delete-${asset.id}`}
              >
                <Trash2 size={15} />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <!-- List view -->
      <div class="space-y-2">
        {#each mediaAssets as asset}
          <!-- Row wrapper so the Delete button sits beside the card button rather
               than nested inside it (invalid button-in-button). -->
          <div
            class="flex items-center gap-2 rounded-lg border transition-all {selectedMedia.some(
              (m) => m.id === asset.id
            )
              ? 'border-primary bg-primary/5'
              : theme.semantic.borderDefault + ' hover:border-muted-foreground'}"
          >
            <button
              onclick={() => toggleSelection(asset)}
              class="flex-1 flex items-center gap-4 p-3 {theme.semantic.bgSurface} rounded-lg text-left"
            >
              <!-- Thumbnail -->
              <div class="w-16 h-16 flex-shrink-0 {theme.semantic.bgSubtle} rounded overflow-hidden">
                {#if isImageMedia(asset)}
                  <img
                    src={(asset as any).thumbnailUrl ||
                      (asset as any).url ||
                      '/placeholder-image.svg'}
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
                  {formatFileSize(asset.sizeBytes)} • {asset.mimeType}{#if formatDimensions(asset)} • {formatDimensions(asset)}{/if} • {formatDate(asset.createdAt)}
                </p>
              </div>

              <!-- Selection indicator -->
              {#if selectedMedia.some((m) => m.id === asset.id)}
                <div
                  class="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0"
                >
                  <Check size={16} class="text-primary-foreground" strokeWidth={3} />
                </div>
              {/if}
            </button>

            {#if activeMode === 'manage'}
              <button
                onclick={() => deleteAsset(asset)}
                class="mr-2 flex-shrink-0 w-8 h-8 rounded-md text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors"
                aria-label={`Delete ${asset.originalFilename}`}
                title={`Delete ${asset.originalFilename}`}
                data-testid={`media-delete-${asset.id}`}
              >
                <Trash2 size={16} />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
