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
  
  // State
  let viewMode: 'structural' | 'wysiwyg' = 'wysiwyg';
  let activeTab: 'blocks' | 'questions' | 'variables' | 'flow' = 'blocks';
  
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
          designerStore.togglePreview();
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
  />
  
  <!-- Main Content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar -->
    <LeftSidebar bind:activeTab />
    
    <!-- Canvas Area -->
    <main class="flex-1 overflow-hidden bg-gray-50 relative">
      {#if viewMode === 'structural'}
        <StructuralCanvas />
      {:else}
        <WYSIWYGCanvas />
      {/if}
    </main>
    
    <!-- Right Sidebar -->
    <RightSidebar />
  </div>
</div>

<style>
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