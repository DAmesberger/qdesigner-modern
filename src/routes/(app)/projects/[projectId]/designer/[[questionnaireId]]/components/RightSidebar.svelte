<script lang="ts">
  import { slide } from 'svelte/transition';
  import { onMount } from 'svelte';
  import EnhancedPropertiesPanel from '$lib/components/designer/EnhancedPropertiesPanel.svelte';
  
  let isCollapsed = false;
  
  // Load collapsed state from localStorage
  onMount(() => {
    const saved = localStorage.getItem('designer-right-sidebar-collapsed');
    if (saved === 'true') {
      isCollapsed = true;
    }
  });
  
  // Save collapsed state
  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    localStorage.setItem('designer-right-sidebar-collapsed', String(isCollapsed));
  }
</script>

<aside 
  class="relative bg-white border-l border-gray-200 flex flex-col transition-all duration-300 ease-in-out"
  class:w-96={!isCollapsed}
  class:w-14={isCollapsed}
>
  <!-- Collapse Toggle -->
  <button
    on:click={toggleCollapse}
    class="absolute -left-3 top-20 z-10 w-6 h-6 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
    title={isCollapsed ? 'Expand properties' : 'Collapse properties'}
  >
    <svg 
      class="w-3 h-3 text-gray-600 transition-transform duration-300"
      class:rotate-180={isCollapsed}
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
    </svg>
  </button>
  
  {#if !isCollapsed}
    <!-- Full Sidebar -->
    <div transition:slide={{ duration: 300, axis: 'x' }} class="flex-1 overflow-hidden">
      <EnhancedPropertiesPanel />
    </div>
  {:else}
    <!-- Collapsed Sidebar -->
    <div class="flex flex-col items-center py-4">
      <div class="p-2 text-gray-600 group relative">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        
        <!-- Tooltip -->
        <div class="absolute right-full mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Properties & Style
        </div>
      </div>
    </div>
  {/if}
</aside>