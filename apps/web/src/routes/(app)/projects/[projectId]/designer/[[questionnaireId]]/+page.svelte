<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { beforeNavigate, replaceState } from '$app/navigation';
  import { designerStore } from '$lib/stores/designer.svelte';
  import { autoSave } from '$lib/services/autoSave.svelte';
  import { ws } from '$lib/services/ws';
  import { PresenceService, type PresenceUser } from '$lib/services/presence.svelte';
  import { CollaborativeDesigner } from '$lib/collaboration/CollaborativeDesigner';
  import { auth } from '$lib/services/auth';
  import type { PageData } from './$types';

  import DesignerHeader from './components/DesignerHeader.svelte';
  import LeftSidebar from './components/LeftSidebar.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import PreviewModal from '$lib/components/designer/PreviewModal.svelte';
  import WYSIWYGCanvas from './WYSIWYGCanvas.svelte';
  import StructuralCanvas from './StructuralCanvas.svelte';
  import DesignerCommandPalette from './components/DesignerCommandPalette.svelte';
  import ReactionLabWorkspace from './components/ReactionLabWorkspace.svelte';
  import ScriptEditorOverlay from '$lib/components/designer/ScriptEditorOverlay.svelte';
  import TourOverlay from '$lib/help/components/TourOverlay.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let scriptEditorOpen = $state(false);
  let scriptEditorQuestion = $state<any>(null);
  let scriptEditorCleanup: (() => void) | null = null;

  // Collaborative editing
  let collab: CollaborativeDesigner | null = null;
  let collabCleanup: (() => void) | null = null;

  // Presence state
  let presence: PresenceService | null = null;
  let presenceUsers = $state<PresenceUser[]>([]);

  $effect(() => {
    presenceUsers = presence?.otherUsers ?? [];
  });

  // Debounced save-on-edit (F-13). The 30s autoSave interval is only a backstop;
  // this narrows the unsaved window to ~2.5s after the last edit so a quick reload
  // doesn't discard freshly added questions. Reading `questionnaire` (whose
  // reference is replaced by commit() on every edit) reschedules the timer on each
  // edit; the false→true `isDirty` flip arms it. saveQuestionnaire() guards re-entry
  // via isLoading, and resetTracking() stops the interval from immediately re-saving.
  const SAVE_DEBOUNCE_MS = 2500;
  $effect(() => {
    const dirty = designerStore.isDirty;
    void designerStore.questionnaire; // re-run (reschedule) on each edit
    if (!dirty) return;

    const timer = setTimeout(() => {
      if (designerStore.isDirty && !designerStore.isSaving) {
        void designerStore.saveQuestionnaire().then((ok) => {
          if (ok) autoSave.resetTracking();
        });
      }
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  });

  // Flush on in-app navigation (F-13). beforeNavigate fires synchronously and does
  // not await async callbacks, but the save is a fetch already in flight by the time
  // the component tears down, so a best-effort fire persists the pending edits.
  beforeNavigate(() => {
    if (designerStore.isDirty && !designerStore.isSaving) {
      void designerStore.saveQuestionnaire().then((ok) => {
        if (ok) autoSave.resetTracking();
      });
    }
  });

  // Flush on tab close / hard reload (F-13). beforeunload cannot await, so we fire a
  // best-effort save AND trigger the browser's native unsaved-changes prompt; the
  // debounce above keeps the unsaved window small when the user proceeds anyway.
  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (designerStore.isDirty) {
      void designerStore.saveQuestionnaire();
      event.preventDefault();
      event.returnValue = '';
    }
  }

  function connectPresence() {
    const questionnaireId = designerStore.questionnaire?.id;
    if (!questionnaireId) return;

    const userId = designerStore.userId || 'anonymous';
    const displayName =
      (data as any)?.user?.fullName || (data as any)?.user?.email || 'Anonymous';
    const channel = `designer:${questionnaireId}`;

    presence = new PresenceService(channel, userId, displayName);
    presence.start();
  }

  function disconnectPresence() {
    presence?.stop();
    presence = null;
  }

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

  // A freshly-created questionnaire mints its id in the store, but the URL stays
  // /designer/new?name=... — so a reload re-runs the "create" flow and forks a blank
  // duplicate record (visible as the canvas reverting to blank). Sync the URL to the real
  // id once, via shallow replaceState (no load re-run, so in-memory edits are untouched). (F-15)
  let urlSyncedId: string | undefined;
  $effect(() => {
    const id = designerStore.questionnaire?.id;
    const pid = data?.projectId;
    if (!id || !pid || urlSyncedId === id) return;
    if (typeof window !== 'undefined' && !window.location.pathname.endsWith(`/designer/${id}`)) {
      try {
        replaceState(`/projects/${pid}/designer/${id}`, {});
        urlSyncedId = id;
      } catch {
        // router not ready yet; a later run of this effect will retry
      }
    }
  });

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

    // Wire up collaborative editing if online with a valid questionnaire
    const questionnaireId = designerStore.questionnaire?.id;
    const token = auth.getAccessToken();
    if (questionnaireId && token) {
      collab = new CollaborativeDesigner();
      collab.init(designerStore.questionnaire, {
        questionnaireId,
        token,
      });
      // Register collab with the store so mutations flow through Yjs
      designerStore.setCollab(collab);
      // Sync Yjs changes (local + remote) back into the designer store
      collabCleanup = collab.onChange((updated) => {
        designerStore.applyRemoteUpdate(updated);
      });
    }
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

      if (key === 'c' && !isInput && designerStore.selectedItemKind === 'question' && designerStore.selectedItem) {
        event.preventDefault();
        void designerStore.copyQuestions([designerStore.selectedItem.id]);
        return;
      }

      if (key === 'v' && !isInput) {
        event.preventDefault();
        void designerStore.pasteQuestions();
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

    if (event.key === '?' && !isInput && !isMeta) {
      event.preventDefault();
      designerStore.setPanel('help');
      return;
    }

    if (event.key === 'Escape') {
      if (designerStore.reactionLabQuestion) {
        designerStore.closeReactionLab();
        return;
      }
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
    void initializeDesigner().then(() => {
      connectPresence();
    });

    const handleOpenScriptEditor = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.question) openScriptEditor(detail.question);
    };
    window.addEventListener('open-script-editor', handleOpenScriptEditor);
    scriptEditorCleanup = () => window.removeEventListener('open-script-editor', handleOpenScriptEditor);

    window.addEventListener('beforeunload', handleBeforeUnload);
  });

  onDestroy(() => {
    autoSave.stop();
    window.removeEventListener('beforeunload', handleBeforeUnload);
    disconnectPresence();
    designerStore.setCollab(null);
    collabCleanup?.();
    collab?.destroy();
    collab = null;
    scriptEditorCleanup?.();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-screen flex flex-col bg-background" data-testid="designer-root">
  <DesignerHeader
    questionnaireName={designerStore.questionnaire.name}
    projectName={(data as any)?.projectName || (data as any)?.project?.name || ''}
    {presenceUsers}
  />

  <div class="flex-1 flex overflow-hidden relative" data-testid="designer-main-layout">
    <LeftSidebar />

    <main class="flex-1 overflow-hidden relative" data-testid="designer-canvas">
      {#if designerStore.viewMode === 'structural'}
        <StructuralCanvas />
      {:else if designerStore.reactionLabQuestion}
        <ReactionLabWorkspace
          question={designerStore.reactionLabQuestion}
          organizationId={designerStore.questionnaire.organizationId || designerStore.organizationId || ''}
          userId={designerStore.userId || ''}
          onclose={() => designerStore.closeReactionLab()}
          onupdate={(updates) =>
            designerStore.updateQuestion(designerStore.reactionLabQuestion!.id, updates as any)}
        />
      {:else}
        <WYSIWYGCanvas />
      {/if}
    </main>

    {#if !designerStore.reactionLabQuestion}
      <RightSidebar questionnaireId={designerStore.questionnaire?.id ?? ''} />
    {/if}
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
<TourOverlay />
{#if scriptEditorOpen && scriptEditorQuestion}
  <ScriptEditorOverlay
    question={scriptEditorQuestion}
    variables={designerStore.questionnaire.variables}
    onclose={() => { scriptEditorOpen = false; scriptEditorQuestion = null; }}
    onsave={handleScriptEditorSave}
  />
{/if}
