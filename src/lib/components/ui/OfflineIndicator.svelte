<script lang="ts">
  import { isOnline, hasUpdate } from '$lib/services/offline';
  import { toast } from '$lib/stores/toast';
  import { slide } from 'svelte/transition';
  import { WifiOff, X } from 'lucide-svelte';

  // State
  let showOfflineBanner = $state(false);
  let wasOffline = $state(false);

  // Sync state with store changes
  $effect(() => {
    // Access stores
    const online = $isOnline;

    if (!online && !showOfflineBanner) {
      showOfflineBanner = true;
      wasOffline = true;
    } else if (online && wasOffline) {
      showOfflineBanner = false;
      wasOffline = false;
      toast.success('Back online! Your changes will be synced.', {
        duration: 3000,
      });
    }
  });

  // Handle updates
  $effect(() => {
    if ($hasUpdate) {
      toast.info('A new version is available', {
        action: {
          label: 'Update',
          onClick: () => window.location.reload(),
        },
        duration: 0, // Don't auto-dismiss
      });
    }
  });

  function dismissBanner() {
    showOfflineBanner = false;
  }
</script>

<!-- Offline Banner -->
{#if showOfflineBanner}
  <div
    transition:slide={{ duration: 300 }}
    role="alert"
    aria-live="assertive"
    class="fixed top-0 left-0 right-0 z-40 bg-warning/10 border-b border-warning/20"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between py-3">
        <div class="flex items-center">
          <WifiOff size={20} class="text-warning mr-2" />
          <p class="text-sm font-medium text-warning">
            You're offline. Changes will sync when connection is restored.
          </p>
        </div>
        <button
          onclick={dismissBanner}
          class="text-warning hover:text-warning/80"
          aria-label="Dismiss offline banner"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Connection Status Indicator (Bottom Right) -->
<div class="fixed bottom-4 right-4 z-30 pointer-events-none">
  <div
    class="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium transition-all duration-300 {$isOnline
      ? 'bg-success/10 text-success'
      : 'bg-warning/10 text-warning'}"
    class:opacity-0={$isOnline && !showOfflineBanner}
    class:opacity-100={!$isOnline || showOfflineBanner}
  >
    <div class="relative">
      <div
        class="w-2 h-2 rounded-full {$isOnline ? 'bg-success' : 'bg-warning'}"
        class:animate-pulse={!$isOnline}
      ></div>
    </div>
    <span>{$isOnline ? 'Online' : 'Offline'}</span>
  </div>
</div>

<style>
  /* Ensure the indicator doesn't interfere with page content */
  .pointer-events-none {
    pointer-events: none;
  }

  .pointer-events-none > * {
    pointer-events: auto;
  }
</style>
