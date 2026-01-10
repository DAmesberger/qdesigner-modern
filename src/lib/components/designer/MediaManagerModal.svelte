<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import MediaManager from './MediaManager.svelte';
  import type { MediaAsset } from '$lib/shared/types/media';
  import type { MediaConfig } from '$lib/shared/types/questionnaire';
  import { generateMediaRefId } from '$lib/services/markdownProcessor';
  import theme from '$lib/theme';

  export let isOpen = false;
  export let organizationId: string;
  export let userId: string;
  export let allowMultiple = false;
  export let selectedMedia: MediaAsset[] = [];
  export let title = 'Select Media';

  const dispatch = createEventDispatcher<{
    select: { assets: MediaAsset[]; asset: MediaAsset };
    confirm: { media: MediaConfig[]; markdown: string };
    close: void;
  }>();

  function handleSelect(event: CustomEvent<{ media: MediaAsset[]; asset: MediaAsset }>) {
    selectedMedia = event.detail.media;
    dispatch('select', { assets: event.detail.media, asset: event.detail.asset });

    // Auto-close if single selection
    if (!allowMultiple) {
      handleConfirmInternal();
    }
  }

  function handleClose() {
    isOpen = false;
    dispatch('close');
  }

  function handleConfirm() {
    handleConfirmInternal();
  }

  function handleConfirmInternal() {
    if (selectedMedia.length === 0) return;

    // Convert MediaAssets to MediaConfig with generated refIds
    const mediaConfigs: MediaConfig[] = selectedMedia.map((asset) => {
      const refId = generateMediaRefId();
      return {
        mediaId: asset.id,
        refId,
        alt: asset.originalFilename || 'Image',
        caption: '',
        display: {
          width: asset.width,
          height: asset.height,
          fit: 'contain' as const,
        },
      };
    });

    // Generate markdown for selected media
    const markdownSnippets = mediaConfigs.map(
      (config) => `![${config.alt}](media:${config.refId})`
    );

    const markdown = allowMultiple ? markdownSnippets.join('\n') : markdownSnippets[0] || '';

    dispatch('confirm', { media: mediaConfigs, markdown });
    isOpen = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClose();
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 overflow-y-auto" on:keydown={handleKeydown}>
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
      on:click={handleClose}
    />

    <!-- Modal -->
    <div class="flex min-h-full items-center justify-center p-4">
      <div
        class="bg-layer-modal border border-border shadow-xl rounded-lg relative max-w-6xl w-full max-h-[90vh] flex flex-col"
        on:click|stopPropagation
      >
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b {theme.semantic.borderDefault}">
          <h2 class="{theme.typography.h3} {theme.semantic.textPrimary}">
            {title}
          </h2>

          <button on:click={handleClose} class="p-2 {theme.semantic.interactive.ghost} rounded-md">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-hidden">
          <MediaManager
            {organizationId}
            {userId}
            {allowMultiple}
            bind:selectedMedia
            mode="select"
            on:select={handleSelect}
          />
        </div>

        <!-- Footer -->
        {#if allowMultiple}
          <div
            class="flex items-center justify-between p-4 border-t {theme.semantic.borderDefault}"
          >
            <div class="{theme.typography.caption} {theme.semantic.textSecondary}">
              {selectedMedia.length} file{selectedMedia.length !== 1 ? 's' : ''} selected
            </div>

            <div class="flex gap-2">
              <button
                on:click={handleClose}
                class="{theme.components.button.variants.outline} {theme.components.button.sizes
                  .sm} rounded-md"
              >
                Cancel
              </button>
              <button
                on:click={handleConfirm}
                disabled={selectedMedia.length === 0}
                class="{theme.components.button.variants.default} {theme.components.button.sizes
                  .sm} rounded-md disabled:opacity-50"
              >
                Confirm Selection
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
