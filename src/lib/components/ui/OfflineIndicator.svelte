<script lang="ts">
  import { isOnline, hasUpdate } from '$lib/services/offline';
  import { toast } from '$lib/stores/toast';
  import { slide } from 'svelte/transition';
  import { onMount } from 'svelte';

  let showOfflineBanner = false;
  let wasOffline = false;

  $: {
    if (!$isOnline && !showOfflineBanner) {
      showOfflineBanner = true;
      wasOffline = true;
    } else if ($isOnline && wasOffline) {
      showOfflineBanner = false;
      wasOffline = false;
      toast.success('Back online! Your changes will be synced.', {
        duration: 3000
      });
    }
  }

  $: if ($hasUpdate) {
    toast.info('A new version is available', {
      action: {
        label: 'Update',
        onClick: () => window.location.reload()
      },
      duration: 0 // Don't auto-dismiss
    });
  }
</script>

<!-- Offline Banner -->
{#if showOfflineBanner}
  <div 
    transition:slide={{ duration: 300 }}
    class="fixed top-0 left-0 right-0 z-40 bg-yellow-50 border-b border-yellow-200"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between py-3">
        <div class="flex items-center">
          <svg class="w-5 h-5 text-yellow-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"/>
          </svg>
          <p class="text-sm font-medium text-yellow-800">
            You're offline. Changes will sync when connection is restored.
          </p>
        </div>
        <button
          on:click={() => showOfflineBanner = false}
          class="text-yellow-600 hover:text-yellow-800"
          aria-label="Dismiss offline banner"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Connection Status Indicator (Bottom Right) -->
<div class="fixed bottom-4 right-4 z-30 pointer-events-none">
  <div 
    class="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium transition-all duration-300 {$isOnline ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}"
    class:opacity-0={$isOnline && !showOfflineBanner}
    class:opacity-100={!$isOnline || showOfflineBanner}
  >
    <div class="relative">
      <div 
        class="w-2 h-2 rounded-full {$isOnline ? 'bg-green-500' : 'bg-yellow-500'}"
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