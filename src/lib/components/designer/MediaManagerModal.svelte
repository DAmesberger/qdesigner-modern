<script lang="ts">
  import MediaManager from './MediaManager.svelte';
  import type { MediaAsset } from '$lib/shared/types/media';
  import type { MediaConfig } from '$lib/shared/types/questionnaire';
  import { generateMediaRefId } from '$lib/services/markdownProcessor';
  import theme from '$lib/theme';

  interface Props {
    isOpen?: boolean;
    organizationId: string;
    userId: string;
    allowMultiple?: boolean;
    selectedMedia?: MediaAsset[];
    title?: string;
    onselect?: (event: { media: MediaAsset[]; asset: MediaAsset }) => void;
    onconfirm?: (event: { media: MediaConfig[]; markdown: string }) => void;
    onclose?: () => void;
  }

  let {
    isOpen = $bindable(false),
    organizationId,
    userId,
    allowMultiple = false,
    selectedMedia = $bindable([]),
    title = 'Select Media',
    onselect,
    onconfirm,
    onclose,
  }: Props = $props();

  function handleSelect(event: { media: MediaAsset[]; asset: MediaAsset }) {
    selectedMedia = event.media;
    onselect?.({ media: event.media, asset: event.asset });

    // Auto-close if single selection
    if (!allowMultiple) {
      handleConfirmInternal();
    }
  }

  function handleClose() {
    isOpen = false;
    onclose?.();
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

    onconfirm?.({ media: mediaConfigs, markdown });
    isOpen = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClose();
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 overflow-y-auto" onkeydown={handleKeydown}>
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
      role="button"
      tabindex="0"
      onclick={handleClose}
      onkeydown={(e) => e.key === 'Escape' && handleClose()}
      aria-label="Close modal"
    />

    <!-- Modal -->
    <div class="flex min-h-full items-center justify-center p-4">
      <div
        class="bg-layer-modal border border-border shadow-xl rounded-lg relative max-w-6xl w-full max-h-[90vh] flex flex-col"
        role="document"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        tabindex="-1"
      >
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b {theme.semantic.borderDefault}">
          <h2 class="{theme.typography.h3} {theme.semantic.textPrimary}">
            {title}
          </h2>

          <button
            onclick={handleClose}
            class="p-2 {theme.semantic.interactive.ghost} rounded-md"
            aria-label="Close"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
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
            onselect={handleSelect}
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
                onclick={handleClose}
                class="{theme.components.button.variants.outline} {theme.components.button.sizes
                  .sm} rounded-md"
                aria-label="Cancel"
              >
                Cancel
              </button>
              <button
                onclick={handleConfirm}
                disabled={selectedMedia.length === 0}
                class="{theme.components.button.variants.default} {theme.components.button.sizes
                  .sm} rounded-md disabled:opacity-50"
                aria-label="Confirm Selection"
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
