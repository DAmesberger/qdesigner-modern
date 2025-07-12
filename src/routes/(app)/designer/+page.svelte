<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    designerStore, 
    currentPage,
    currentPageQuestions,
    selectedItem
  } from '$lib/stores/designerStore';
  
  // Components
  import DesignerHeader from './components/DesignerHeader.svelte';
  import LeftSidebar from './components/LeftSidebar.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import WYSIWYGCanvas from './WYSIWYGCanvas.svelte';
  import StructuralCanvas from './StructuralCanvas.svelte';
  import RealtimePreview from '$lib/components/designer/RealtimePreview.svelte';
  
  // State
  let viewMode: 'structural' | 'wysiwyg' = 'wysiwyg';
  let activeTab: 'blocks' | 'questions' | 'variables' | 'flow' = 'blocks';
  let showPreview = false;
  let previewSplitPosition = 50; // percentage
  
  // Initialize
  onMount(() => {
    designerStore.initVariableEngine();
  });
  
  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'z':
          if (e.shiftKey) {
            e.preventDefault();
            designerStore.redo();
          } else {
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
          showPreview = !showPreview;
          break;
        case 'd':
          e.preventDefault();
          // TODO: Implement duplicate
          break;
      }
    } else if (e.key === 'Delete' && $selectedItem) {
      e.preventDefault();
      // TODO: Implement delete
    } else if (e.key === 'F11') {
      e.preventDefault();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  }
  
  function handleViewModeChange(event: CustomEvent) {
    viewMode = event.detail;
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="h-screen flex flex-col bg-gray-50">
  <!-- Header -->
  <DesignerHeader
    questionnaireName={$designerStore.questionnaire.name}
    pageCount={$designerStore.questionnaire.pages.length}
    blockCount={$designerStore.questionnaire.pages.reduce((acc, p) => acc + p.blocks.length, 0)}
    questionCount={$designerStore.questionnaire.questions.length}
    {viewMode}
    on:viewModeChange={handleViewModeChange}
    on:togglePreview={() => showPreview = !showPreview}
  />
  
  <!-- Main Content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar -->
    <LeftSidebar bind:activeTab />
    
    <!-- Canvas Area -->
    <main class="flex-1 overflow-hidden bg-gray-50 relative flex">
      <!-- Designer Canvas -->
      <div 
        class="flex-1 overflow-hidden"
        style="width: {showPreview ? previewSplitPosition : 100}%"
      >
        {#if viewMode === 'structural'}
          <StructuralCanvas />
        {:else}
          <WYSIWYGCanvas />
        {/if}
      </div>
      
      <!-- Preview Panel -->
      {#if showPreview}
        <div 
          class="preview-panel overflow-hidden border-l border-gray-300"
          style="width: {100 - previewSplitPosition}%"
        >
          <div class="preview-header">
            <h3 class="text-sm font-semibold text-gray-700">Live Preview</h3>
            <button
              on:click={() => showPreview = false}
              class="p-1 hover:bg-gray-100 rounded"
              title="Close preview (Ctrl+P)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="preview-content">
            <RealtimePreview 
              autoUpdate={true}
              updateDelay={300}
              showDebugPanel={false}
              interactive={true}
            />
          </div>
        </div>
      {/if}
    </main>
    
    <!-- Right Sidebar -->
    <RightSidebar />
  </div>
</div>

<style>
  .preview-panel {
    display: flex;
    flex-direction: column;
    background: white;
  }
  
  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }
  
  .preview-content {
    flex: 1;
    overflow: hidden;
  }
  
  /* Responsive breakpoints for mobile/tablet */
  @media (max-width: 768px) {
    /* Stack layout vertically on mobile */
    .flex {
      flex-direction: column;
    }
  }
  
  @media (max-width: 1024px) {
    /* Hide sidebars on tablet by default */
    :global(.designer-sidebar) {
      position: absolute;
      z-index: 20;
      height: 100%;
    }
  }
</style>