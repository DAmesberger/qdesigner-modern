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
  import ScriptEditorOverlay from '$lib/components/designer/ScriptEditorOverlay.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let scriptEditorOpen = $state(false);
  let scriptEditorQuestion = $state<any>(null);
  let scriptEditorCleanup: (() => void) | null = null;

  function openScriptEditor(question: any) {
    scriptEditorQuestion = question;
    scriptEditorOpen = true;
  }

  function handleScriptEditorSave(script: string) {
    if (scriptEditorQuestion) {
      designerStore.updateQuestion(scriptEditorQuestion.id, {
        settings: {
          ...scriptEditorQuestion.settings,
          script,
        },
      });
    }
  }

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
    const target = event.target as HTMLElement | null;
    const isInput =
      target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

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
        return;
      }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!isInput) {
        event.preventDefault();
        designerStore.deleteSelected();
      }
    }

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      if (!isInput) {
        event.preventDefault();
        designerStore.moveSelectedQuestion(event.key === 'ArrowUp' ? 'up' : 'down');
      }
    }

    if (event.key === 'Escape') {
      if (designerStore.previewMode) {
        designerStore.togglePreview(false);
        return;
      }
      if (designerStore.showCommandPalette) {
        designerStore.toggleCommandPalette(false);
        return;
      }
      // Close flyout panel
      if (designerStore.activePanel) {
        designerStore.setPanel(null);
        return;
      }
      // Deselect → right panel slides out
      if (designerStore.selectedItem) {
        designerStore.selectItem(null);
        return;
      }
    }
  }

  onMount(() => {
    void initializeDesigner();

    const handleOpenScriptEditor = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.question) openScriptEditor(detail.question);
    };
    window.addEventListener('open-script-editor', handleOpenScriptEditor);
    scriptEditorCleanup = () => window.removeEventListener('open-script-editor', handleOpenScriptEditor);
  });

  onDestroy(() => {
    autoSave.stop();
    scriptEditorCleanup?.();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-screen flex flex-col bg-background" data-testid="designer-root">
  <DesignerHeader
    questionnaireName={designerStore.questionnaire.name}
    projectName={(data as any)?.projectName || (data as any)?.project?.name || ''}
  />

  <div class="flex-1 flex overflow-hidden relative" data-testid="designer-main-layout">
    <LeftSidebar />

    <main class="flex-1 overflow-hidden relative" data-testid="designer-canvas">
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
{#if scriptEditorOpen && scriptEditorQuestion}
  <ScriptEditorOverlay
    question={scriptEditorQuestion}
    variables={designerStore.questionnaire.variables}
    onclose={() => { scriptEditorOpen = false; scriptEditorQuestion = null; }}
    onsave={handleScriptEditorSave}
  />
{/if}
