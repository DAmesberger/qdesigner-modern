<script lang="ts">
  import { appPaths } from '$lib/routing/paths';
  import { getDesignerContext } from '$lib/stores/designer-context';
  const designerStore = getDesignerContext();
  import { ArrowLeft, Menu, PanelLeft, Share2, FlaskConical, ShieldCheck, Target, Calculator, LayoutDashboard, CalendarClock, Undo2, Redo2, Wrench, ChevronDown } from 'lucide-svelte';
  import { fly } from 'svelte/transition';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import StudySeriesDesigner from '$lib/components/designer/StudySeriesDesigner.svelte';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import DistributionPanel from './DistributionPanel.svelte';
  import ExperimentalDesignPanel from '$lib/components/designer/ExperimentalDesignPanel.svelte';
  import DataQualityPanel from '$lib/components/designer/DataQualityPanel.svelte';
  import ScaleScoringEditor from '$lib/components/designer/scoring/ScaleScoringEditor.svelte';
  import QuotaPanel from '$lib/components/designer/QuotaPanel.svelte';
  import ReportPagePanel from '$lib/components/designer/ReportPagePanel.svelte';
  import VersionManager from '$lib/components/designer/VersionManager.svelte';
  import type { PresenceUser } from '$lib/services/presence.svelte';

  interface Props {
    questionnaireName: string;
    projectName?: string;
    presenceUsers?: PresenceUser[];
  }

  let { questionnaireName, projectName = '', presenceUsers = [] }: Props = $props();

  let isEditingTitle = $state(false);
  let titleValue = $state('Untitled Questionnaire');
  let titleInput = $state<HTMLInputElement | undefined>();
  let showDistribution = $state(false);
  let showExperimentalDesign = $state(false);
  let showStudySeries = $state(false);
  let showDataQuality = $state(false);
  let showScaleScoring = $state(false);
  let showQuotas = $state(false);
  let showReportPage = $state(false);
  let showTools = $state(false);

  const canUndo = $derived(designerStore.canUndo);
  const canRedo = $derived(designerStore.canRedo);

  // Modifier-key hint for the undo/redo tooltips (⌘ on macOS, Ctrl elsewhere).
  const metaKeyLabel =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

  // Tools overflow menu items — the modal-launching secondary actions grouped
  // out of the always-visible header (R4-5). `show` flips the matching dialog.
  type ToolItem = { label: string; icon: typeof Wrench; run: () => void; when?: () => boolean };
  const toolItems: ToolItem[] = [
    { label: 'Experimental design', icon: FlaskConical, run: () => (showExperimentalDesign = true) },
    {
      label: 'Study series',
      icon: CalendarClock,
      run: () => (showStudySeries = true),
      when: () => Boolean(questionnaireId),
    },
    { label: 'Data quality', icon: ShieldCheck, run: () => (showDataQuality = true) },
    { label: 'Scale scoring', icon: Calculator, run: () => (showScaleScoring = true) },
    { label: 'Quotas', icon: Target, run: () => (showQuotas = true) },
    { label: 'Report page', icon: LayoutDashboard, run: () => (showReportPage = true) },
    { label: 'Share', icon: Share2, run: () => (showDistribution = true) },
  ];

  function runTool(item: ToolItem) {
    showTools = false;
    item.run();
  }

  function toggleTools(e: MouseEvent) {
    e.stopPropagation();
    showTools = !showTools;
  }

  $effect(() => {
    titleValue = questionnaireName || 'Untitled Questionnaire';
  });

  const questionnaireId = $derived(designerStore.questionnaire?.id ?? '');
  const validationState = $derived(designerStore.validate());
  const hasValidationErrors = $derived(validationState.validationErrors.length > 0);
  const canPublish = $derived(designerStore.canPublish);

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

<svelte:window onclick={() => { if (showTools) showTools = false; }} />

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
        ? 'bg-success'
        : saveStatus === 'unsaved'
          ? 'bg-warning animate-pulse'
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

  <div class="hidden sm:flex">
    <ThemeToggle />
  </div>

  <!-- Presence indicator -->
  {#if presenceUsers.length > 0}
    <div class="hidden sm:flex items-center -space-x-1.5">
      {#each presenceUsers.slice(0, 3) as user (user.userId)}
        <div
          class="w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-bold text-white"
          style="background-color: {user.color}"
          title={user.displayName}
        >
          {user.displayName.charAt(0).toUpperCase()}
        </div>
      {/each}
      {#if presenceUsers.length > 3}
        <div class="w-6 h-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
          +{presenceUsers.length - 3}
        </div>
      {/if}
    </div>
  {/if}

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

  <!-- Undo / redo (primary, always visible on desktop) -->
  <div class="hidden sm:flex items-center rounded-md border border-border" role="group" aria-label="History">
    <button
      type="button"
      class="inline-flex items-center rounded-l-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
      onclick={() => designerStore.undo()}
      disabled={!canUndo}
      data-testid="designer-undo-button"
      aria-label="Undo"
      title={`Undo (${metaKeyLabel}+Z)`}
    >
      <Undo2 class="h-3.5 w-3.5" />
    </button>
    <div class="h-4 w-px bg-border"></div>
    <button
      type="button"
      class="inline-flex items-center rounded-r-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
      onclick={() => designerStore.redo()}
      disabled={!canRedo}
      data-testid="designer-redo-button"
      aria-label="Redo"
      title={`Redo (${metaKeyLabel}+Shift+Z)`}
    >
      <Redo2 class="h-3.5 w-3.5" />
    </button>
  </div>

  <!-- Tools overflow menu (secondary modal-launching actions) -->
  <div class="relative hidden sm:block">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150 {showTools ? 'bg-accent text-accent-foreground' : ''}"
      onclick={toggleTools}
      data-testid="designer-tools-button"
      aria-haspopup="menu"
      aria-expanded={showTools}
      title="Tools"
    >
      <Wrench class="h-3.5 w-3.5" />
      Tools
      <ChevronDown class="h-3 w-3 transition-transform duration-150 {showTools ? 'rotate-180' : ''}" />
    </button>

    {#if showTools}
      <div
        transition:fly={{ y: -8, duration: 150 }}
        class="absolute right-0 top-full mt-2 w-52 rounded-lg border border-border bg-popover text-popover-foreground shadow-[var(--shadow-lg)] z-50 py-1"
        role="menu"
        tabindex="-1"
        data-testid="designer-tools-menu"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === 'Escape') showTools = false; }}
      >
        {#each toolItems as item (item.label)}
          {#if !item.when || item.when()}
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-100"
              onclick={() => runTool(item)}
              data-testid={`designer-tools-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <item.icon class="h-4 w-4 text-muted-foreground" />
              {item.label}
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  <!-- Version manager (bump / publish / history) -->
  {#if questionnaireId}
    <div class="hidden sm:block">
      <VersionManager {questionnaireId} />
    </div>
  {/if}

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

{#if questionnaireId}
  <Dialog bind:open={showStudySeries} title="Study series" size="lg">
    <StudySeriesDesigner {questionnaireId} />
  </Dialog>
{/if}

<DataQualityPanel bind:open={showDataQuality} />

<ScaleScoringEditor bind:open={showScaleScoring} />

<QuotaPanel bind:open={showQuotas} />

<ReportPagePanel bind:open={showReportPage} />
