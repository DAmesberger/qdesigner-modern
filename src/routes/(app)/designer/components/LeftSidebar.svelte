<script lang="ts">
  import { slide } from 'svelte/transition';
  import { onMount } from 'svelte';
  import QuestionPalette from '$lib/components/designer/QuestionPalette.svelte';
  import BlockManager from '$lib/components/designer/BlockManager.svelte';
  import VariableManager from '$lib/components/designer/VariableManager.svelte';
  import theme from '$lib/theme';
  
  export let activeTab: 'blocks' | 'questions' | 'variables' | 'flow' = 'blocks';
  
  let isCollapsed = false;
  
  // Load collapsed state from localStorage
  onMount(() => {
    const saved = localStorage.getItem('designer-left-sidebar-collapsed');
    if (saved === 'true') {
      isCollapsed = true;
    }
  });
  
  // Save collapsed state
  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    localStorage.setItem('designer-left-sidebar-collapsed', String(isCollapsed));
  }
  
  const tabs = [
    { id: 'blocks', label: 'Blocks', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
    { id: 'questions', label: 'Questions', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'variables', label: 'Variables', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { id: 'flow', label: 'Flow', icon: 'M13 10V3L4 14h7v7l9-11h-7z' }
  ];
</script>

<aside 
  class="relative flex flex-col transition-all duration-300 ease-in-out {theme.components.designerSidebar.base}"
  class:w-80={!isCollapsed}
  class:w-14={isCollapsed}
>
  <!-- Collapse Toggle -->
  <button
    on:click={toggleCollapse}
    class="absolute -right-3 top-20 z-10 w-6 h-6 {theme.semantic.bgSurface} {theme.semantic.borderDefault} border rounded-full flex items-center justify-center {theme.semantic.interactive.ghost} transition-colors"
    title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
  >
    <svg 
      class="w-3 h-3 text-gray-600 transition-transform duration-300"
      class:rotate-180={!isCollapsed}
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
    </svg>
  </button>
  
  {#if !isCollapsed}
    <!-- Full Sidebar -->
    <div transition:slide={{ duration: 300, axis: 'x' }}>
      <!-- Tabs -->
      <div class="flex {theme.semantic.borderDefault} border-b">
        {#each tabs as tab}
          <button
            class="flex-1 px-4 py-3 text-sm font-medium transition-colors relative {theme.semantic.interactive.ghost}"
            class:text-foreground={activeTab === tab.id}
            class:text-muted-foreground={activeTab !== tab.id}
            on:click={() => activeTab = tab.id}
          >
            {tab.label}
            {#if activeTab === tab.id}
              <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
            {/if}
          </button>
        {/each}
      </div>
      
      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto">
        {#if activeTab === 'blocks'}
          <BlockManager />
        {:else if activeTab === 'questions'}
          <QuestionPalette />
        {:else if activeTab === 'variables'}
          <VariableManager />
        {:else}
          <div class="p-4">
            <div class="text-center py-8">
              <svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p class="text-gray-600 text-sm">Flow control coming soon</p>
              <p class="text-gray-500 text-xs mt-1">Design conditional logic and branching</p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Collapsed Sidebar -->
    <div class="flex flex-col items-center py-4 space-y-4">
      {#each tabs as tab}
        <button
          class="p-2 rounded-md transition-colors relative group {theme.semantic.interactive.ghost}"
          class:bg-muted={activeTab === tab.id}
          class:text-foreground={activeTab === tab.id}
          class:text-muted-foreground={activeTab !== tab.id}
          on:click={() => activeTab = tab.id}
          title={tab.label}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={tab.icon} />
          </svg>
          
          <!-- Tooltip -->
          <div class="absolute left-full ml-2 px-2 py-1 bg-foreground text-background text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
            {tab.label}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</aside>