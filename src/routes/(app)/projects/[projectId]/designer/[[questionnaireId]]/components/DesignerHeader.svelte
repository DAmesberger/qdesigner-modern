<script lang="ts">
  import { appPaths } from '$lib/routing/paths';
  import { designerStore } from '$lib/stores/designer.svelte';
  import { ArrowLeft, Menu, PanelLeft, Share2, FlaskConical, ShieldCheck } from 'lucide-svelte';
  import DistributionPanel from './DistributionPanel.svelte';
  import ExperimentalDesignPanel from '$lib/components/designer/ExperimentalDesignPanel.svelte';
  import DataQualityPanel from '$lib/components/designer/DataQualityPanel.svelte';

  interface Props {
    questionnaireName: string;
    projectName?: string;
  }

  let { questionnaireName, projectName = '' }: Props = $props();

  let isEditingTitle = $state(false);
  let titleValue = $state('Untitled Questionnaire');
  let titleInput = $state<HTMLInputElement | undefined>();
  let showDistribution = $state(false);
  let showExperimentalDesign = $state(false);
  let showDataQuality = $state(false);

  $effect(() => {
    titleValue = questionnaireName || 'Untitled Questionnaire';
  });

  const validationState = $derived(designerStore.validate());
  const hasValidationErrors = $derived(validationState.validationErrors.length > 0);
  const questionCount = $derived(designerStore.questionnaire.questions.length);
  const canPublish = $derived(
    !hasValidationErrors &&
      questionCount > 0 &&
      !designerStore.isSaving &&
      !designerStore.isPublishing
  );

  const saveStatus = $derived.by<'saved' | 'unsaved' | 'saving' | 'error'>(() => {
    if (designerStore.isSaving) return 'saving';
    if (designerStore.saveError) return 'error';
    if (designerStore.isDirty) return 'unsaved';
    return 'saved';
  });

  const saveTooltip = $derived.by(() => {
    if (designerStore.isSaving) return 'Saving...';
    if (designerStore.isPublishing) return 'Publishing...';
    if (designerStore.saveError) return `Save failed: ${designerStore.saveError}`;
    if (designerStore.isDirty) return 'Unsaved changes';
    if (designerStore.lastSaved) {
      return `Saved ${new Date(designerStore.lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return 'Not saved yet';
  });

  function goBackToProject() {
    if (!designerStore.projectId) {
      window.location.href = appPaths.projects();
      return;
    }
    window.location.href = appPaths.project(designerStore.projectId);
  }

  function startEditingTitle() {
    isEditingTitle = true;
    queueMicrotask(() => {
      titleInput?.focus();
      titleInput?.select();
    });
  }

  function finishEditingTitle() {
    isEditingTitle = false;
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== questionnaireName) {
      designerStore.updateQuestionnaire({ name: trimmed });
    } else {
      titleValue = questionnaireName || 'Untitled Questionnaire';
    }
  }

  async function handlePublish() {
    const saved = await designerStore.saveQuestionnaire();
    if (!saved) return;
    await designerStore.publishQuestionnaire();
  }
</script>

<header
  class="flex h-11 items-center gap-3 px-3 bg-[hsl(var(--glass-bg))] backdrop-blur-[var(--glass-blur)] border-b border-[hsl(var(--glass-border))] shadow-[var(--shadow-sm)]"
  data-testid="designer-header"
>
  <!-- Back button (mobile only) -->
  <button
    type="button"
    onclick={goBackToProject}
    class="sm:hidden inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150"
    data-testid="designer-back"
    aria-label="Back to project"
    title="Back to project"
  >
    <ArrowLeft class="h-4 w-4" />
  </button>

  <div class="h-5 w-px bg-border sm:hidden"></div>

  <!-- Breadcrumb (desktop) -->
  <nav class="hidden sm:flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
    <a href="/projects" class="hover:text-foreground transition-colors">Projects</a>
    <span class="text-muted-foreground/50">›</span>
    <a href={designerStore.projectId ? `/projects/${designerStore.projectId}` : '/projects'} class="hover:text-foreground transition-colors truncate max-w-32">
      {projectName || 'Project'}
    </a>
    <span class="text-muted-foreground/50">›</span>
  </nav>

  <!-- Editable title -->
  <div class="min-w-0 flex-1">
    {#if isEditingTitle}
      <input
        bind:this={titleInput}
        bind:value={titleValue}
        type="text"
        class="w-full bg-transparent text-sm font-semibold text-foreground outline-none border-b-2 border-primary px-0.5 py-0"
        onblur={finishEditingTitle}
        onkeydown={(e) => {
          if (e.key === 'Enter') finishEditingTitle();
          if (e.key === 'Escape') {
            titleValue = questionnaireName || 'Untitled Questionnaire';
            isEditingTitle = false;
          }
        }}
        data-testid="designer-title-input"
      />
    {:else}
      <button
        type="button"
        class="truncate text-sm font-semibold text-foreground hover:text-primary transition-colors duration-150 cursor-text text-left max-w-full"
        onclick={startEditingTitle}
        title="Click to edit title"
        data-testid="designer-title"
      >
        {questionnaireName || 'Untitled Questionnaire'}
      </button>
    {/if}
  </div>

  <!-- Save indicator dot -->
  <div class="relative group" data-testid="designer-save-indicator">
    <div
      class="w-2 h-2 rounded-full transition-colors duration-200 {saveStatus === 'saved'
        ? 'bg-emerald-500'
        : saveStatus === 'unsaved'
          ? 'bg-amber-500 animate-pulse'
          : saveStatus === 'saving'
            ? 'bg-primary animate-spin'
            : 'bg-destructive'}"
      class:rounded-sm={saveStatus === 'saving'}
    ></div>
    <!-- Tooltip -->
    <div class="absolute right-0 top-full mt-2 hidden group-hover:block z-50">
      <div class="rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-[var(--shadow-md)] border border-border whitespace-nowrap">
        {saveTooltip}
      </div>
    </div>
  </div>

  <!-- Mobile drawer toggles -->
  <button
    type="button"
    class="md:hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors duration-150"
    onclick={() => designerStore.toggleDrawer('left')}
    data-testid="designer-toggle-left-drawer"
    aria-label="Toggle left panel"
  >
    <Menu class="h-4 w-4" />
  </button>

  <button
    type="button"
    class="md:hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors duration-150"
    onclick={() => designerStore.toggleDrawer('right')}
    data-testid="designer-toggle-right-drawer"
    aria-label="Toggle right panel"
  >
    <PanelLeft class="h-4 w-4" />
  </button>

  <!-- Experimental design button -->
  <button
    type="button"
    class="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
    onclick={() => (showExperimentalDesign = true)}
    data-testid="designer-experimental-design-button"
    title="Experimental Design"
  >
    <FlaskConical class="h-3.5 w-3.5" />
    Design
  </button>

  <!-- Data quality button -->
  <button
    type="button"
    class="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
    onclick={() => (showDataQuality = true)}
    data-testid="designer-data-quality-button"
    title="Data Quality"
  >
    <ShieldCheck class="h-3.5 w-3.5" />
    Quality
  </button>

  <!-- Share button -->
  <button
    type="button"
    class="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
    onclick={() => (showDistribution = true)}
    data-testid="designer-share-button"
    title="Share"
  >
    <Share2 class="h-3.5 w-3.5" />
    Share
  </button>

  <!-- Preview button -->
  <button
    type="button"
    class="hidden sm:inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
    onclick={() => designerStore.togglePreview()}
    data-testid="designer-preview-button"
    title="Preview (Ctrl+P)"
  >
    Preview
  </button>

  <!-- Publish button with gradient + validation dot -->
  <button
    type="button"
    class="relative hidden sm:inline-flex items-center rounded-md bg-gradient-to-r from-primary to-[hsl(280,80%,60%)] px-3 py-1 text-xs text-primary-foreground shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-glow)] hover:brightness-110 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-[var(--shadow-sm)] disabled:hover:brightness-100"
    onclick={handlePublish}
    data-testid="designer-publish-button"
    disabled={!canPublish}
    title="Publish (Ctrl+Shift+Enter)"
  >
    {designerStore.isPublishing ? 'Publishing...' : 'Publish'}
    {#if hasValidationErrors}
      <span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-destructive border-2 border-background"></span>
    {/if}
  </button>
</header>

<DistributionPanel
  isOpen={showDistribution}
  onclose={() => (showDistribution = false)}
/>

<ExperimentalDesignPanel bind:open={showExperimentalDesign} />

<DataQualityPanel bind:open={showDataQuality} />
