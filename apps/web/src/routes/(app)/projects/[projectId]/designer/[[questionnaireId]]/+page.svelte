<script lang="ts">
  import { onMount, onDestroy, type ComponentType } from 'svelte';
  import { beforeNavigate, replaceState } from '$app/navigation';
  import { getDesignerContext } from '$lib/stores/designer-context';
  const designerStore = getDesignerContext();
  import { autoSave } from '$lib/services/autoSave.svelte';
  import { PresenceService, type PresenceUser } from '$lib/services/presence.svelte';
  import { CollaborativeDesigner } from '$lib/collaboration/CollaborativeDesigner';
  import type { PageData } from './$types';

  import DesignerHeader from './components/DesignerHeader.svelte';
  import LeftSidebar from './components/LeftSidebar.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import PreviewModal from '$lib/components/designer/PreviewModal.svelte';
  import WYSIWYGCanvas from './WYSIWYGCanvas.svelte';
  import StructuralCanvas from './StructuralCanvas.svelte';
  import DesignerCommandPalette from './components/DesignerCommandPalette.svelte';
  import { moduleRegistry } from '$lib/modules/registry';
  import TourOverlay from '$lib/help/components/TourOverlay.svelte';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import { isEditableTarget } from '$lib/components/designer/designerKeyboard';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let initializationPending = $state(true);
  let initializationError = $state<string | null>(null);

  // Full-canvas Reaction Lab. The trigger stays unchanged
  // (openLab → designerStore.openReactionLab → route fork on reactionLabQuestion);
  // only the MOUNT now resolves through the module registry's
  // `fullCanvasDesigner` capability instead of a hard-coded route-local import.
  let reactionLabComponent = $state<ComponentType | null>(null);
  $effect(() => {
    const question = designerStore.reactionLabQuestion;
    if (!question) {
      reactionLabComponent = null;
      return;
    }
    let cancelled = false;
    void moduleRegistry
      .loadComponent(question.type, 'fullCanvasDesigner')
      .then((component) => {
        if (!cancelled) reactionLabComponent = component;
      })
      .catch((error) => {
        console.error('Failed to load reaction lab workspace:', error);
        if (!cancelled) reactionLabComponent = null;
      });
    return () => {
      cancelled = true;
    };
  });

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
    if (!dirty || initializationPending || initializationError) return;

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
    if (initializationPending || initializationError) return;
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
    if (initializationPending || initializationError) return;
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

    // Wire up collaborative editing if online with a valid questionnaire
    const questionnaireId = designerStore.questionnaire?.id;
    if (questionnaireId) {
      collab = new CollaborativeDesigner();
      collab.init(designerStore.questionnaire, {
        questionnaireId,
      });

      // Editing starts only after the authoritative document arrives. Allowing
      // local REST edits before this handoff loses them when the first CRDT sync
      // replaces the store, especially on a cold or slow connection.
      let handedOff = false;
      const syncTimeout = setTimeout(() => {
        if (!handedOff) {
          initializationError = 'The questionnaire could not finish connecting. Check your connection and reload to try again.';
          autoSave.stop();
        }
      }, 30000);
      const offChange = collab.onChange((updated) => {
        if (handedOff) designerStore.applyRemoteUpdate(updated);
      });
      const offSynced = collab.onSynced(() => {
        if (!collab || initializationError) return;
        const docQ = collab.getQuestionnaire();
        const docHasContent = docQ.pages.length > 0 || docQ.questions.length > 0;
        const storeHasContent =
          designerStore.questionnaire.pages.length > 0 ||
          designerStore.questionnaire.questions.length > 0;
        // Hand off only when the synced doc actually carries the questionnaire (or
        // both are legitimately empty). If the doc synced empty while the store has
        // REST content (e.g. the server could not seed the room), keep waiting
        // behind the loading guard until sync succeeds or the timeout reports it.
        if (docHasContent || !storeHasContent) {
          handedOff = true;
          designerStore.applyRemoteUpdate(docQ);
          designerStore.setCollab(collab);
          clearTimeout(syncTimeout);
          initializationPending = false;
          autoSave.start();
        }
      });
      collabCleanup = () => {
        clearTimeout(syncTimeout);
        offChange();
        offSynced();
      };
    } else {
      initializationPending = false;
      autoSave.start();
    }
  }

  // F-39: destructive keyboard actions route through the shared confirmDialog
  // (matching the canvas + Structure-tree button paths). deleteSelected covers
  // question / block / variable; pages are deleted elsewhere.
  async function confirmAndDeleteSelected() {
    const kind = designerStore.selectedItemKind;
    if (!designerStore.selectedItem || (kind !== 'question' && kind !== 'block' && kind !== 'variable')) {
      return;
    }
    if (
      await confirmDialog({
        title: `Delete ${kind}?`,
        message: `Delete this ${kind}? This cannot be undone.`,
        confirmLabel: 'Delete',
        destructive: true,
      })
    ) {
      designerStore.deleteSelected();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (initializationPending || initializationError) return;
    const isMeta = event.ctrlKey || event.metaKey;
    const isInput = isEditableTarget(event.target);

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
      if (!isInput && designerStore.selectedItem) {
        event.preventDefault();
        void confirmAndDeleteSelected();
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
    }).catch((error) => {
      initializationError = error instanceof Error ? error.message : 'Failed to load questionnaire';
      autoSave.stop();
    });

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
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if initializationError}
  <div class="p-8" role="alert" data-testid="designer-load-error">
    <h1 class="text-xl font-semibold">Questionnaire could not be opened</h1>
    <p class="mt-3 whitespace-pre-wrap">{initializationError}</p>
  </div>
{:else if initializationPending}
  <div class="p-8" role="status" data-testid="designer-loading">Loading questionnaire…</div>
{:else}
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
        {#if reactionLabComponent}
          {@const ReactionLab = reactionLabComponent}
          <ReactionLab
            question={designerStore.reactionLabQuestion}
            organizationId={designerStore.questionnaire.organizationId || designerStore.organizationId || ''}
            userId={designerStore.userId || ''}
            onclose={() => designerStore.closeReactionLab()}
            onupdate={(updates: Record<string, unknown>) =>
              designerStore.updateQuestion(designerStore.reactionLabQuestion!.id, updates as any)}
          />
        {/if}
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
{/if}
