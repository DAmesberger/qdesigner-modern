<script lang="ts">
  import Dialog from '../ui/overlays/Dialog.svelte';
  import RealtimePreview from './RealtimePreview.svelte';
  import { X } from 'lucide-svelte';

  interface Props {
    isOpen?: boolean;
    onclose?: () => void;
  }

  let { isOpen = false, onclose }: Props = $props();

  function handleClose() {
    onclose?.();
  }
</script>

<Dialog
  open={isOpen}
  onclose={handleClose}
  size="xl"
  closable={false}
  className="overflow-hidden"
  bodyClass="px-4 py-3 sm:px-6 text-foreground"
>
  <div class="h-[80vh] flex flex-col" data-testid="designer-preview-modal">
    <div class="flex items-center justify-between px-6 py-4 border-b">
      <h2 class="text-lg font-semibold">Preview</h2>
      <button
        onclick={handleClose}
        aria-label="Close preview"
        class="p-2 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
        data-testid="designer-preview-close"
      >
        <X size={20} />
      </button>
    </div>

    <div class="flex-1 overflow-hidden">
      <RealtimePreview
        autoUpdate={true}
        updateDelay={300}
        showDebugPanel={false}
        interactive={true}
        deviceType="desktop"
      />
    </div>
  </div>
</Dialog>
