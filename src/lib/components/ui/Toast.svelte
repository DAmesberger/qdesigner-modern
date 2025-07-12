<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { toasts, toast, type Toast } from '$lib/stores/toast';

  function getIcon(type: Toast['type']) {
    switch (type) {
      case 'success':
        return `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>`;
      case 'error':
        return `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>`;
      case 'warning':
        return `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>`;
      case 'info':
        return `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>`;
    }
  }

  function getStyles(type: Toast['type']) {
    const base = 'pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg shadow-lg ring-1 ring-black ring-opacity-5';
    
    switch (type) {
      case 'success':
        return `${base} bg-white dark:bg-gray-800`;
      case 'error':
        return `${base} bg-white dark:bg-gray-800`;
      case 'warning':
        return `${base} bg-white dark:bg-gray-800`;
      case 'info':
        return `${base} bg-white dark:bg-gray-800`;
    }
  }

  function getIconStyles(type: Toast['type']) {
    switch (type) {
      case 'success':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      case 'warning':
        return 'text-yellow-500';
      case 'info':
        return 'text-blue-500';
    }
  }
</script>

<!-- Toast Container -->
<div 
  class="fixed bottom-0 right-0 z-50 p-4 sm:p-6 pointer-events-none"
  aria-live="polite"
  aria-atomic="true"
>
  <div class="flex flex-col items-end space-y-4">
    {#each $toasts as item (item.id)}
      <div
        animate:flip={{ duration: 200 }}
        transition:fly={{ y: 20, duration: 300 }}
        class={getStyles(item.type)}
      >
        <div class="p-4">
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <span class={getIconStyles(item.type)}>
                {@html getIcon(item.type)}
              </span>
            </div>
            <div class="ml-3 flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {item.title}
              </p>
              {#if item.message}
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {item.message}
                </p>
              {/if}
              {#if item.action}
                <div class="mt-3">
                  <button
                    type="button"
                    on:click={item.action.onClick}
                    class="text-sm font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    {item.action.label}
                  </button>
                </div>
              {/if}
            </div>
            {#if item.dismissible}
              <div class="ml-4 flex-shrink-0 flex">
                <button
                  type="button"
                  on:click={() => toast.remove(item.id)}
                  class="inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 rounded-md"
                >
                  <span class="sr-only">Close</span>
                  <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  /* Ensure toasts appear above other content */
  :global(.pointer-events-none > *) {
    pointer-events: auto;
  }
</style>