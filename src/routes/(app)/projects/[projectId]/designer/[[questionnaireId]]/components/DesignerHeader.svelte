<script lang="ts">
  import { appPaths } from '$lib/routing/paths';
  import { designerStore } from '$lib/stores/designer.svelte';

  interface Props {
    questionnaireName: string;
    pageCount: number;
    blockCount: number;
    questionCount: number;
    viewMode: 'structural' | 'wysiwyg';
  }

  let { questionnaireName, pageCount, blockCount, questionCount, viewMode }: Props = $props();
  const flowOrder = ['add', 'configure', 'preview', 'publish'] as const;
  type FlowStep = (typeof flowOrder)[number];

  const formattedSaveTime = $derived(
    designerStore.lastSaved
      ? new Date(designerStore.lastSaved).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Never'
  );

  const validationState = $derived(designerStore.validate());
  const validationErrorCount = $derived(validationState.validationErrors.length);
  const validationWarningCount = $derived(validationState.warnings.length);
  const canPublish = $derived(
    validationErrorCount === 0 &&
      questionCount > 0 &&
      !designerStore.isSaving &&
      !designerStore.isPublishing
  );
  const hasQuestions = $derived(questionCount > 0);
  const hasSelection = $derived(Boolean(designerStore.selectedItem));

  const activeFlowStep = $derived.by<FlowStep>(() => {
    if (designerStore.previewMode) return 'preview';
    if (!hasQuestions) return 'add';
    if (hasSelection || designerStore.isDirty || !designerStore.questionnaire.id)
      return 'configure';
    return canPublish ? 'publish' : 'configure';
  });
  const activeFlowIndex = $derived(flowOrder.indexOf(activeFlowStep));

  async function handleSave() {
    await designerStore.saveQuestionnaire();
  }

  async function handlePublish() {
    const saved = await designerStore.saveQuestionnaire();
    if (!saved) return;
    await designerStore.publishQuestionnaire();
  }

  function goBackToProject() {
    if (!designerStore.projectId) {
      window.location.href = appPaths.projects();
      return;
    }
    window.location.href = appPaths.project(designerStore.projectId);
  }

  function goToAddStep() {
    designerStore.setActiveLeftTab('questions');
    if (window.matchMedia('(max-width: 767px)').matches) {
      designerStore.toggleDrawer('left', true);
    }
  }

  function goToConfigureStep() {
    if (!designerStore.selectedItem) {
      const firstQuestion = designerStore.currentBlockQuestions[0];
      if (firstQuestion) {
        designerStore.selectItem(firstQuestion.id, 'question');
      }
    }
    if (window.matchMedia('(max-width: 767px)').matches) {
      designerStore.toggleDrawer('right', true);
    }
  }

  function goToPreviewStep() {
    designerStore.togglePreview(true);
  }

  function goToPublishStep() {
    void handlePublish();
  }

  function runStepAction(step: FlowStep) {
    if (step === 'add') return goToAddStep();
    if (step === 'configure') return goToConfigureStep();
    if (step === 'preview') return goToPreviewStep();
    return goToPublishStep();
  }
</script>

<header class="border-b border-border bg-background px-3 py-2" data-testid="designer-header">
  <div class="flex items-center gap-3">
    <button
      type="button"
      onclick={goBackToProject}
      class="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      data-testid="designer-back"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10 19l-7-7m0 0l7-7m-7 7h18"
        />
      </svg>
      <span class="hidden sm:inline">Project</span>
    </button>

    <div class="h-6 w-px bg-border"></div>

    <div class="min-w-0 flex-1">
      <h1 class="truncate text-base font-semibold text-foreground">
        {questionnaireName || 'Untitled Questionnaire'}
      </h1>
      <p class="truncate text-xs text-muted-foreground" data-testid="designer-counts">
        {pageCount} page{pageCount === 1 ? '' : 's'} · {blockCount} block{blockCount === 1
          ? ''
          : 's'}
        · {questionCount} question{questionCount === 1 ? '' : 's'}
      </p>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="md:hidden rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent"
        onclick={() => designerStore.toggleDrawer('left')}
        data-testid="designer-toggle-left-drawer"
        aria-label="Toggle left panel"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      <button
        type="button"
        class="md:hidden rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent"
        onclick={() => designerStore.toggleDrawer('right')}
        data-testid="designer-toggle-right-drawer"
        aria-label="Toggle right panel"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 5h5v14H4V5zm11 0h5v14h-5V5z"
          />
        </svg>
      </button>

      <div
        class="hidden md:flex items-center rounded-md bg-muted p-0.5"
        data-testid="designer-view-toggle"
      >
        <button
          type="button"
          class="rounded px-2 py-1 text-xs"
          class:bg-background={viewMode === 'structural'}
          class:text-foreground={viewMode === 'structural'}
          class:text-muted-foreground={viewMode !== 'structural'}
          onclick={() => designerStore.setViewMode('structural')}
          data-testid="designer-view-structure"
        >
          Structure
        </button>
        <button
          type="button"
          class="rounded px-2 py-1 text-xs"
          class:bg-background={viewMode === 'wysiwyg'}
          class:text-foreground={viewMode === 'wysiwyg'}
          class:text-muted-foreground={viewMode !== 'wysiwyg'}
          onclick={() => designerStore.setViewMode('wysiwyg')}
          data-testid="designer-view-visual"
        >
          Visual
        </button>
      </div>

      <button
        type="button"
        class="hidden md:inline-flex rounded-md border border-border p-1.5 text-muted-foreground disabled:opacity-50"
        onclick={() => designerStore.undo()}
        disabled={!designerStore.canUndo}
        data-testid="designer-undo"
        title="Undo"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
          />
        </svg>
      </button>

      <button
        type="button"
        class="hidden md:inline-flex rounded-md border border-border p-1.5 text-muted-foreground disabled:opacity-50"
        onclick={() => designerStore.redo()}
        disabled={!designerStore.canRedo}
        data-testid="designer-redo"
        title="Redo"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
          />
        </svg>
      </button>

      <button
        type="button"
        class="hidden sm:inline-flex rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        onclick={() => designerStore.toggleCommandPalette(true)}
        data-testid="designer-command-button"
        title="Command palette (Ctrl/Cmd+K)"
      >
        Command
      </button>

      <button
        type="button"
        class="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
        onclick={() => designerStore.togglePreview()}
        data-testid="designer-preview-button"
        title="Preview (Ctrl/Cmd+P)"
      >
        Preview
      </button>

      <button
        type="button"
        class="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
        onclick={handleSave}
        data-testid="designer-save-button"
        disabled={designerStore.isSaving || designerStore.isPublishing}
        title="Save (Ctrl/Cmd+S)"
      >
        {designerStore.isSaving ? 'Saving...' : 'Save'}
      </button>

      <button
        type="button"
        class="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        onclick={handlePublish}
        data-testid="designer-publish-button"
        disabled={!canPublish}
        title="Publish (Ctrl/Cmd+Shift+Enter)"
      >
        {designerStore.isPublishing ? 'Publishing...' : 'Publish'}
      </button>

      <div
        class="hidden md:flex items-center gap-2 text-xs text-muted-foreground"
        data-testid="designer-save-status"
      >
        {#if validationErrorCount > 0}
          <span
            class="rounded bg-red-100 px-2 py-0.5 text-red-700"
            data-testid="designer-validation-errors"
          >
            {validationErrorCount} validation error{validationErrorCount === 1 ? '' : 's'}
          </span>
        {/if}

        {#if validationWarningCount > 0}
          <span
            class="rounded bg-amber-100 px-2 py-0.5 text-amber-700"
            data-testid="designer-validation-warnings"
          >
            {validationWarningCount} warning{validationWarningCount === 1 ? '' : 's'}
          </span>
        {/if}

        {#if designerStore.isSaving}
          Saving...
        {:else if designerStore.isPublishing}
          Publishing...
        {:else if designerStore.saveError}
          Save failed
        {:else if designerStore.isDirty}
          Unsaved changes
        {:else}
          Saved {formattedSaveTime}
        {/if}
      </div>
    </div>
  </div>

  <div
    class="mt-2 hidden items-center gap-2 overflow-x-auto pb-1 md:flex"
    data-testid="designer-flow-strip"
  >
    {#each flowOrder as step, index}
      {@const isCurrent = index === activeFlowIndex}
      {@const isComplete = index < activeFlowIndex}
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors {isCurrent ||
        isComplete
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground'}"
        class:border-primary={isCurrent || isComplete}
        disabled={step === 'publish' && !canPublish}
        onclick={() => runStepAction(step)}
        data-testid={`designer-flow-step-${step}`}
      >
        <span
          class="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px]"
          class:border-primary={isCurrent || isComplete}
          class:bg-primary={isCurrent || isComplete}
          class:text-primary-foreground={isCurrent || isComplete}
        >
          {index + 1}
        </span>
        <span class="capitalize">{step}</span>
      </button>
      {#if index < flowOrder.length - 1}
        <div class="h-px w-4 bg-border"></div>
      {/if}
    {/each}

    <div class="ml-auto hidden items-center gap-2 text-xs text-muted-foreground xl:flex">
      <span>Quick keys:</span>
      <kbd class="rounded bg-muted px-1.5 py-0.5">Ctrl/Cmd+K</kbd>
      <kbd class="rounded bg-muted px-1.5 py-0.5">Ctrl/Cmd+P</kbd>
      <kbd class="rounded bg-muted px-1.5 py-0.5">Ctrl/Cmd+S</kbd>
      <kbd class="rounded bg-muted px-1.5 py-0.5">Del</kbd>
    </div>
  </div>
</header>
