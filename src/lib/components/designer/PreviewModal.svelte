<script lang="ts">
  import Modal from '../ui/feedback/Modal.svelte';
  import RealtimePreview from './RealtimePreview.svelte';
  import { createEventDispatcher } from 'svelte';
  
  export let isOpen = false;
  export let questionnaire: any;
  
  const dispatch = createEventDispatcher();
  
  function handleClose() {
    isOpen = false;
    dispatch('close');
  }
</script>

<Modal bind:isOpen on:close={handleClose} size="xl">
  <div class="h-[80vh] flex flex-col">
    <div class="flex items-center justify-between px-6 py-4 border-b">
      <h2 class="text-lg font-semibold">Preview</h2>
      <button
        on:click={handleClose}
        class="p-2 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
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
</Modal>