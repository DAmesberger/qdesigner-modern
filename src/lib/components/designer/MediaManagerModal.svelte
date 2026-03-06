<script lang="ts">
  import MediaManager from './MediaManager.svelte';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
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
</script>

<Dialog
  bind:open={isOpen}
  {title}
  size="xl"
  onclose={handleClose}
  className="max-h-[90vh] flex flex-col"
>
  <div class="flex-1 overflow-hidden -mx-6 -my-4">
    <MediaManager
      {organizationId}
      {userId}
      {allowMultiple}
      bind:selectedMedia
      mode="select"
      onselect={handleSelect}
    />
  </div>

  {#snippet footer()}
    {#if allowMultiple}
      <div class="flex items-center justify-between w-full">
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
  {/snippet}
</Dialog>
