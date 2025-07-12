<script lang="ts">
  import { 
    designerStore, 
    canUndo, 
    canRedo,
    isSaving,
    lastSaved,
    saveError
  } from '$lib/stores/designerStore';
  import { goto } from '$app/navigation';
  import { createEventDispatcher } from 'svelte';
  import theme from '$lib/theme';
  
  export let questionnaireName: string;
  export let pageCount: number;
  export let blockCount: number;
  export let questionCount: number;
  export let viewMode: 'structural' | 'wysiwyg';
  
  const dispatch = createEventDispatcher();
  
  let showMenu = false;
  let showKeyboardShortcuts = false;
  
  // Format save time
  $: formattedSaveTime = $lastSaved 
    ? new Date($lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Never';
  
  // Keyboard shortcuts
  const shortcuts = [
    { key: 'Ctrl+S', action: 'Save' },
    { key: 'Ctrl+Z', action: 'Undo' },
    { key: 'Ctrl+Shift+Z', action: 'Redo' },
    { key: 'Ctrl+P', action: 'Preview' },
    { key: 'F11', action: 'Fullscreen' },
    { key: 'Ctrl+D', action: 'Duplicate' },
    { key: 'Delete', action: 'Delete selected' }
  ];
  
  function handleSave() {
    designerStore.saveQuestionnaire();
  }
  
  function handleLoad() {
    // TODO: Implement load functionality
    console.log('Load questionnaire');
  }
  
  function handleExport() {
    // TODO: Implement export functionality
    console.log('Export questionnaire');
  }
  
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
</script>

<header class="h-14 flex items-center px-4 gap-4 {theme.semantic.bgSurface} {theme.semantic.borderDefault} border-b">
  <!-- Logo/Back Button -->
  <button
    on:click={() => goto('/dashboard')}
    class="flex items-center gap-2 {theme.semantic.textSecondary} {theme.semantic.interactive.ghost} px-2 py-1 rounded-md transition-colors"
    title="Back to Dashboard"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
    <span class="font-semibold {theme.semantic.textPrimary} hidden sm:inline">QDesigner</span>
  </button>
  
  <!-- Separator -->
  <div class="h-6 w-px {theme.semantic.borderDefault}"></div>
  
  <!-- Questionnaire Name -->
  <div class="flex-1 min-w-0">
    <h1 class="text-lg font-semibold {theme.semantic.textPrimary} truncate">
      {questionnaireName || 'Untitled Questionnaire'}
    </h1>
    <p class="text-xs {theme.semantic.textSecondary}">
      {pageCount} {pageCount === 1 ? 'page' : 'pages'} • {blockCount} {blockCount === 1 ? 'block' : 'blocks'} • {questionCount} {questionCount === 1 ? 'question' : 'questions'}
    </p>
  </div>
  
  <!-- Center Actions -->
  <div class="flex items-center gap-2">
    <!-- Undo/Redo -->
    <div class="flex items-center {theme.semantic.bgSubtle} rounded-md p-0.5">
      <button
        on:click={() => designerStore.undo()}
        disabled={!$canUndo}
        class="p-1.5 rounded {theme.semantic.bgHover} hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Undo (Ctrl+Z)"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      </button>
      <button
        on:click={() => designerStore.redo()}
        disabled={!$canRedo}
        class="p-1.5 rounded {theme.semantic.bgHover} hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Redo (Ctrl+Shift+Z)"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
        </svg>
      </button>
    </div>
    
    <!-- View Mode Toggle -->
    <div class="flex items-center {theme.semantic.bgSubtle} rounded-md p-0.5">
      <button
        class="px-2 py-1 text-xs font-medium rounded transition-colors"
        class:bg-white={viewMode === 'structural'}
        class:text-gray-900={viewMode === 'structural'}
        class:text-gray-600={viewMode !== 'structural'}
        on:click={() => dispatch('viewModeChange', 'structural')}
      >
        Structure
      </button>
      <button
        class="px-2 py-1 text-xs font-medium rounded transition-colors"
        class:bg-white={viewMode === 'wysiwyg'}
        class:text-gray-900={viewMode === 'wysiwyg'}
        class:text-gray-600={viewMode !== 'wysiwyg'}
        on:click={() => dispatch('viewModeChange', 'wysiwyg')}
      >
        Visual
      </button>
    </div>
  </div>
  
  <!-- Right Actions -->
  <div class="flex items-center gap-2">
    <!-- Save Status -->
    <div class="text-xs text-gray-500 min-w-[100px] text-right">
      {#if $isSaving}
        <span class="text-blue-600">Saving...</span>
      {:else if $saveError}
        <span class="text-red-600">Save failed</span>
      {:else}
        <span>Saved {formattedSaveTime}</span>
      {/if}
    </div>
    
    <!-- Preview Button -->
    <button
      on:click={() => dispatch('togglePreview')}
      class="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
    >
      Preview
    </button>
    
    <!-- More Menu -->
    <div class="relative">
      <button
        on:click={() => showMenu = !showMenu}
        class="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>
      
      {#if showMenu}
        <div class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
          <div class="py-1">
            <button
              on:click={handleSave}
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2" />
              </svg>
              Save
            </button>
            <button
              on:click={handleLoad}
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Load
            </button>
            <button
              on:click={handleExport}
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
            <div class="border-t border-gray-100"></div>
            <button
              on:click={() => designerStore.validate()}
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Validate
            </button>
            <button
              on:click={toggleFullscreen}
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              Fullscreen
            </button>
            <div class="border-t border-gray-100"></div>
            <button
              on:click={() => showKeyboardShortcuts = true}
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Keyboard Shortcuts
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>

<!-- Keyboard Shortcuts Modal -->
{#if showKeyboardShortcuts}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 max-w-md w-full">
      <h3 class="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
      <div class="space-y-2">
        {#each shortcuts as shortcut}
          <div class="flex justify-between">
            <span class="text-gray-600">{shortcut.action}</span>
            <kbd class="px-2 py-1 text-xs bg-gray-100 rounded font-mono">{shortcut.key}</kbd>
          </div>
        {/each}
      </div>
      <button
        on:click={() => showKeyboardShortcuts = false}
        class="mt-6 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Close
      </button>
    </div>
  </div>
{/if}

<!-- Click outside to close menu -->
{#if showMenu}
  <button
    class="fixed inset-0 z-40"
    on:click={() => showMenu = false}
    aria-label="Close menu"
  />
{/if}