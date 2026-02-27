<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import { autoSave } from '$lib/services/autoSave.svelte';
  import type { PageData } from './$types';

  import DesignerHeader from './components/DesignerHeader.svelte';
  import LeftSidebar from './components/LeftSidebar.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import PreviewModal from '$lib/components/designer/PreviewModal.svelte';
  import WYSIWYGCanvas from './WYSIWYGCanvas.svelte';
  import StructuralCanvas from './StructuralCanvas.svelte';
  import DesignerCommandPalette from './components/DesignerCommandPalette.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  async function initializeDesigner() {
    try {
      const { registerAllModules } = await import('$lib/modules');
      await registerAllModules();
    } catch (error) {
      console.error('Failed to register modules:', error);
    }

    designerStore.restoreUiFromStorage();
    designerStore.initVariableEngine();

    const userId = (data as any)?.publicUser?.id || data?.user?.id;
    if (userId) designerStore.setUserId(userId);

    if (data?.organizationId) {
      designerStore.setOrganizationId(data.organizationId);
    }

    if (data?.projectId) {
      designerStore.setProjectId(data.projectId);
    }

    const questionnaire = (data as any)?.questionnaire;
    if (questionnaire?.isNew) {
      await designerStore.createNewQuestionnaire({
        name: questionnaire.name,
        description: questionnaire.description,
        projectId: data?.projectId ?? undefined,
        organizationId: data?.organizationId ?? undefined,
      });
    } else if (questionnaire) {
      designerStore.loadQuestionnaireFromDefinition(questionnaire);
    }

    autoSave.start();
  }

  function handleKeydown(event: KeyboardEvent) {
    const isMeta = event.ctrlKey || event.metaKey;

    if (isMeta) {
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          designerStore.redo();
        } else {
          designerStore.undo();
        }
        return;
      }

      if (key === 's') {
        event.preventDefault();
        void designerStore.saveQuestionnaire().then((success) => {
          if (success) autoSave.resetTracking();
        });
        return;
      }

      if (key === 'p') {
        event.preventDefault();
        designerStore.togglePreview();
        return;
      }

      if (key === 'k') {
        event.preventDefault();
        designerStore.toggleCommandPalette();
        return;
      }

      if (key === 'd') {
        event.preventDefault();
        designerStore.duplicateSelected();
        return;
      }

      if (key === 'a' && event.shiftKey) {
        event.preventDefault();
        designerStore.addQuestionToCurrentBlock('text-input');
        return;
      }

      if (key === 'enter' && event.shiftKey) {
        event.preventDefault();
        void designerStore.publishQuestionnaire();
      }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const target = event.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (!isInput) {
        event.preventDefault();
        designerStore.deleteSelected();
      }
    }

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const target = event.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (!isInput) {
        event.preventDefault();
        designerStore.moveSelectedQuestion(event.key === 'ArrowUp' ? 'up' : 'down');
      }
    }

    if (event.key === 'Escape') {
      designerStore.toggleCommandPalette(false);
      designerStore.toggleDrawer('left', false);
      designerStore.toggleDrawer('right', false);
    }
  }

  onMount(() => {
    void initializeDesigner();
  });

  onDestroy(() => {
    autoSave.stop();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-screen flex flex-col bg-background" data-testid="designer-root">
  <DesignerHeader
    questionnaireName={designerStore.questionnaire.name}
    pageCount={designerStore.questionnaire.pages.length}
    blockCount={designerStore.questionnaire.pages.reduce(
      (acc, page) => acc + (page.blocks?.length || 0),
      0
    )}
    questionCount={designerStore.questionnaire.questions.length}
    viewMode={designerStore.viewMode}
  />

  <div class="flex-1 flex overflow-hidden relative" data-testid="designer-main-layout">
    <LeftSidebar />

    <main class="flex-1 overflow-hidden bg-muted/30 relative" data-testid="designer-canvas">
      {#if designerStore.viewMode === 'structural'}
        <StructuralCanvas />
      {:else}
        <WYSIWYGCanvas />
      {/if}
    </main>

    <RightSidebar />
  </div>
</div>

<PreviewModal
  isOpen={designerStore.previewMode}
  onclose={() => designerStore.togglePreview(false)}
/>
<DesignerCommandPalette
  isOpen={designerStore.showCommandPalette}
  onclose={() => designerStore.toggleCommandPalette(false)}
/>
