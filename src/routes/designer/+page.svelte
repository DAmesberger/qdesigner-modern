<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    designerStore, 
    canUndo, 
    canRedo,
    currentPage,
    currentPageQuestions,
    selectedItem,
    isSaving,
    lastSaved,
    saveError
  } from '$lib/stores/designerStore';
  import QuestionPalette from '$lib/components/designer/QuestionPalette.svelte';
  import VariableManager from '$lib/components/designer/VariableManager.svelte';
  import EnhancedPropertiesPanel from '$lib/components/designer/EnhancedPropertiesPanel.svelte';
  import SaveLoadToolbar from '$lib/components/designer/SaveLoadToolbar.svelte';
  
  // WYSIWYG Components
  import WYSIWYGCanvas from './WYSIWYGCanvas.svelte';
  import StructuralCanvas from './StructuralCanvas.svelte';
  
  // View mode
  let viewMode: 'structural' | 'wysiwyg' = 'wysiwyg';
  let activeTab: 'questions' | 'variables' | 'flow' = 'questions';
  
  // Initialize
  onMount(() => {
    designerStore.initVariableEngine();
  });
  
  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'z':
          if (e.shiftKey && $canRedo) {
            e.preventDefault();
            designerStore.redo();
          } else if ($canUndo) {
            e.preventDefault();
            designerStore.undo();
          }
          break;
        case 's':
          e.preventDefault();
          designerStore.saveQuestionnaire();
          break;
        case 'p':
          e.preventDefault();
          designerStore.togglePreview();
          break;
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="min-h-screen bg-gray-50">
  <!-- Page Header -->
  <div class="bg-white shadow-sm">
    <div class="px-4 py-4 sm:px-6 lg:px-8">
      <div class="md:flex md:items-center md:justify-between">
        <div class="min-w-0 flex-1">
          <h2 class="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            {$designerStore.questionnaire.name || 'Untitled Questionnaire'}
          </h2>
          <div class="mt-1 flex flex-col sm:mt-0 sm:flex-row sm:flex-wrap sm:space-x-6">
            <div class="mt-2 flex items-center text-sm text-gray-500">
              <svg class="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clip-rule="evenodd" />
              </svg>
              {$designerStore.questionnaire.pages.length} pages • {$designerStore.questionnaire.questions.length} questions
            </div>
            {#if $lastSaved}
              <div class="mt-2 flex items-center text-sm text-gray-500">
                <svg class="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
                </svg>
                Last saved {new Date($lastSaved).toLocaleTimeString()}
              </div>
            {/if}
          </div>
        </div>
        <div class="mt-4 flex md:ml-4 md:mt-0">
          <SaveLoadToolbar />
        </div>
      </div>
    </div>
  </div>
  
  <!-- Secondary Toolbar -->
  <div class="bg-white border-b border-gray-200">
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between py-3">
        <div class="flex items-center space-x-4">
        
        <div class="flex items-center space-x-2">
          <button
            on:click={designerStore.undo}
            disabled={!$canUndo}
            class="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          
          <button
            on:click={designerStore.redo}
            disabled={!$canRedo}
            class="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Redo (Ctrl+Shift+Z)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>
        
        <!-- View Mode Toggle -->
        <div class="flex bg-gray-100 rounded-lg p-1">
          <button
            class="px-3 py-1 text-sm font-medium rounded transition-colors"
            class:bg-white={viewMode === 'structural'}
            class:text-gray-900={viewMode === 'structural'}
            class:text-gray-600={viewMode !== 'structural'}
            on:click={() => viewMode = 'structural'}
          >
            <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Structure
          </button>
          <button
            class="px-3 py-1 text-sm font-medium rounded transition-colors"
            class:bg-white={viewMode === 'wysiwyg'}
            class:text-gray-900={viewMode === 'wysiwyg'}
            class:text-gray-600={viewMode !== 'wysiwyg'}
            on:click={() => viewMode = 'wysiwyg'}
          >
            <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Visual
          </button>
        </div>
      </div>

      <div class="flex items-center space-x-3">
        <button
          on:click={designerStore.togglePreview}
          class="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        >
          Preview
        </button>
        
        <button
          on:click={designerStore.validate}
          class="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        >
          Validate
        </button>
      </div>
    </div>
  </div>

  <!-- Main Content Area -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar -->
    <div class="w-72 bg-white border-r border-gray-200 flex flex-col">
      <!-- Tabs -->
      <div class="flex border-b border-gray-200">
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          class:bg-gray-50={activeTab === 'questions'}
          class:text-gray-900={activeTab === 'questions'}
          class:text-gray-600={activeTab !== 'questions'}
          on:click={() => activeTab = 'questions'}
        >
          Questions
        </button>
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          class:bg-gray-50={activeTab === 'variables'}
          class:text-gray-900={activeTab === 'variables'}
          class:text-gray-600={activeTab !== 'variables'}
          on:click={() => activeTab = 'variables'}
        >
          Variables
        </button>
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          class:bg-gray-50={activeTab === 'flow'}
          class:text-gray-900={activeTab === 'flow'}
          class:text-gray-600={activeTab !== 'flow'}
          on:click={() => activeTab = 'flow'}
        >
          Flow
        </button>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto">
        {#if activeTab === 'questions'}
          <QuestionPalette />
        {:else if activeTab === 'variables'}
          <VariableManager />
        {:else}
          <div class="p-4">
            <p class="text-gray-600">Flow control coming soon...</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Canvas Area -->
    <div class="flex-1 overflow-hidden">
      {#if viewMode === 'structural'}
        <StructuralCanvas />
      {:else}
        <WYSIWYGCanvas />
      {/if}
    </div>

    <!-- Right Sidebar - Properties -->
    <div class="w-96 bg-white border-l border-gray-200">
      <EnhancedPropertiesPanel />
    </div>
  </div>

  <!-- Status Bar -->
  <div class="bg-gray-100 border-t border-gray-200 px-4 py-2 flex items-center justify-between text-sm text-gray-600">
    <div class="flex items-center space-x-4">
      <span>{$designerStore.questionnaire.pages.length} page{$designerStore.questionnaire.pages.length !== 1 ? 's' : ''}</span>
      <span>•</span>
      <span>{$designerStore.questionnaire.questions.length} question{$designerStore.questionnaire.questions.length !== 1 ? 's' : ''}</span>
      <span>•</span>
      <button
        on:click={designerStore.validate}
        class="text-blue-600 hover:text-blue-700"
      >
        Validate
      </button>
    </div>
    <div>
      {#if $isSaving}
        <span class="text-blue-600">Saving...</span>
      {:else if $saveError}
        <span class="text-red-600">{$saveError}</span>
      {:else if $lastSaved}
        <span>Last saved: {new Date($lastSaved).toLocaleTimeString()}</span>
      {:else}
        <span>Last saved: Never</span>
      {/if}
    </div>
  </div>
</div>
</div>