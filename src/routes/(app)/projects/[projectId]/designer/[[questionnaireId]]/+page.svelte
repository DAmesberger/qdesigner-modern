<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { 
    designerStore, 
    currentPage,
    currentPageQuestions,
    selectedItem
  } from '$lib/features/designer/stores/designerStore';
  import { autoSave } from '$lib/services/autoSave';
  import type { PageData } from './$types';
  
  // Components
  import DesignerHeader from './components/DesignerHeader.svelte';
  import LeftSidebar from './components/LeftSidebar.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import PreviewModal from '$lib/components/designer/PreviewModal.svelte';
  import WYSIWYGCanvas from './WYSIWYGCanvas.svelte';
  import StructuralCanvas from './StructuralCanvas.svelte';
  // TODO: Create these components
  // import PreviewModal from '$lib/components/designer/PreviewModal.svelte';
  // import CrashRecovery from '$lib/components/ui/CrashRecovery.svelte';
  // import CommandPalette from '$lib/components/ui/CommandPalette.svelte';
  
  interface Props {
    data: PageData;
  }
  
  let { data }: Props = $props();
  
  console.log('[INIT] Props received:', { hasData: !!data, dataType: typeof data });
  if (data) {
    console.log('[INIT] Data keys:', Object.keys(data));
    console.log('[INIT] Full data:', data);
  }
  
  // Extract data with derived (reactive in Svelte 5)
  const user = $derived(data?.user);
  const publicUser = $derived(data?.publicUser);
  const organizationId = $derived(data?.organizationId);
  const projectId = $derived(data?.projectId);
  const questionnaire = $derived(data?.questionnaire);
  const project = $derived(data?.project);
  
  // State
  let viewMode = $state<'structural' | 'wysiwyg'>('wysiwyg');
  let activeTab = $state<'blocks' | 'questions' | 'variables' | 'flow'>('blocks');
  let showPreview = $state(false);
  let showCommandPalette = $state(false);
  
  // Initialize
  onMount(() => {
    console.log('[Designer Page] Mounting with data:', {
      organizationId,
      projectId,
      userId: publicUser?.id || user?.id,
      questionnaire,
      dataKeys: data ? Object.keys(data) : 'no data'
    });
    console.log('[DEBUG] Full questionnaire data:', questionnaire);
    console.log('[DEBUG] Page data:', data);
    
    designerStore.initVariableEngine();
    
    // Initialize store with context
    // Use public user ID for database operations
    if (publicUser?.id) {
      designerStore.setUserId(publicUser.id);
    } else if (user?.id) {
      // Fallback to auth user ID if public user not available
      console.warn('Public user not available, using auth user ID');
      designerStore.setUserId(user.id);
    }
    
    if (organizationId) {
      designerStore.setOrganizationId(organizationId);
    }
    
    if (projectId) {
      designerStore.setProjectId(projectId);
    }
    
    // Load existing questionnaire or create new
    if (questionnaire?.isNew) {
      // Create new questionnaire with project context
      designerStore.createNewQuestionnaire({
        name: questionnaire.name,
        description: questionnaire.description,
        projectId: projectId,
        organizationId: organizationId
      });
    } else if (questionnaire && !questionnaire.isNew) {
      // Load existing questionnaire
      console.log('[DEBUG] Loading questionnaire from definition:', questionnaire);
      designerStore.loadQuestionnaireFromDefinition(questionnaire);
      // Ensure context is set from page data
      if (organizationId) {
        designerStore.setOrganizationId(organizationId);
      }
      if (projectId) {
        designerStore.setProjectId(projectId);
      }
    }
    
    // Start auto-save
    autoSave.start();
  });
  
  onDestroy(() => {
    // Stop auto-save when component unmounts
    autoSave.stop();
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
          designerStore.saveQuestionnaire().then(success => {
            if (success) {
              autoSave.resetTracking();
            }
          });
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

<div class="h-screen flex flex-col bg-background">
  <!-- Header -->
  <DesignerHeader
    questionnaireName={$designerStore.questionnaire.name}
    pageCount={$designerStore.questionnaire.pages.length}
    blockCount={$designerStore.questionnaire.pages.reduce((acc, p) => acc + (p.blocks ?? []).length, 0)}
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
    <main class="flex-1 overflow-hidden bg-muted/30 relative">
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

<!-- TODO: Uncomment when components are created -->
<!-- Crash Recovery Dialog -->
<!-- <CrashRecovery /> -->

<!-- Command Palette -->
<!-- <CommandPalette bind:isOpen={showCommandPalette} /> -->

<!-- Preview Modal -->
<PreviewModal 
  bind:isOpen={showPreview}
  questionnaire={$designerStore.questionnaire}
  on:close={() => showPreview = false}
/>

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