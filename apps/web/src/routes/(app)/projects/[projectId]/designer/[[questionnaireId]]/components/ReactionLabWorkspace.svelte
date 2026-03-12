<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import MediaManagerModal from '$lib/components/designer/MediaManagerModal.svelte';
  import ScriptEditorOverlay from '$lib/components/designer/ScriptEditorOverlay.svelte';
  import type { MediaAsset } from '$lib/shared/types/media';
  import { mediaService } from '$lib/services/mediaService';
  import { designerStore } from '$lib/stores/designer.svelte';
  import ReactionStagePreview from '$lib/modules/questions/reaction-experiment/ReactionStagePreview.svelte';
  import {
    REACTION_EXPERIMENT_TEMPLATES,
    buildReactionExperimentQuestionPatch,
    compileReactionExperimentPlan,
    createDefaultReactionExperimentConfig,
    normalizeReactionExperimentConfig,
    type ReactionExperimentAssetRef,
    type ReactionExperimentBlock,
    type ReactionExperimentConfig,
    type ReactionExperimentTrial,
  } from '$lib/modules/questions/reaction-experiment/model/reaction-experiment';
  import type { ReactionStimulusConfig, ScheduledPhase } from '$lib/runtime/reaction';

  interface Props {
    question: any;
    organizationId?: string;
    userId?: string;
    onclose?: () => void;
    onupdate?: (updates: Record<string, unknown>) => void;
  }

  let {
    question,
    organizationId = '',
    userId = '',
    onclose,
    onupdate,
  }: Props = $props();

  let config = $state<ReactionExperimentConfig>(createDefaultReactionExperimentConfig());
  let syncedQuestionId = $state<string | null>(null);
  let leftWidth = $state(308);
  let rightWidth = $state(368);
  let previewHeight = $state(430);
  let resizeSide = $state<'left' | 'right' | 'preview' | null>(null);
  let activeLeftTab = $state<'outline' | 'presets' | 'assets' | 'randomization'>('outline');
  let selectedBlockId = $state<string>('');
  let selectedTrialId = $state<string>('');
  let selectedPhaseIndex = $state<number>(-1);
  let showAssetPicker = $state(false);
  let assetPickerMode = $state<'library' | 'assign-selected-trial'>('library');
  let loadingAssets = $state(false);
  let projectAssets = $state<ReactionExperimentAssetRef[]>([]);
  let centerPane = $state<HTMLElement | null>(null);
  let scriptEditorOpen = $state(false);
  const minCenterWidth = 280;

  function effectiveOrganizationId() {
    return organizationId || designerStore.organizationId || '';
  }

  function effectiveUserId() {
    return userId || designerStore.userId || '';
  }

  function projectAssetMediaList(): MediaAsset[] {
    return projectAssets.map((asset) => ({
      id: asset.mediaId || asset.id,
      organizationId: effectiveOrganizationId(),
      uploadedBy: effectiveUserId(),
      filename: asset.label,
      originalFilename: asset.label,
      mimeType:
        asset.mimeType ||
        (asset.kind === 'video'
          ? 'video/mp4'
          : asset.kind === 'audio'
            ? 'audio/mpeg'
            : 'image/png'),
      sizeBytes: 0,
      storagePath: '',
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      durationSeconds: asset.durationSeconds ?? undefined,
      thumbnailPath: undefined,
      metadata: {},
      isPublic: false,
      accessLevel: 'organization',
      createdAt: new Date(),
      updatedAt: new Date(),
      url: asset.url,
    }));
  }

  function selectedBlock() {
    return config.blocks.find((block) => block.id === selectedBlockId) || config.blocks[0] || null;
  }

  function selectedTrial() {
    const block = selectedBlock();
    if (!block) return null;
    return block.trials.find((trial) => trial.id === selectedTrialId) || block.trials[0] || null;
  }

  function visiblePhases() {
    const trial = selectedTrial();
    if (!trial) return [] as ScheduledPhase[];
    if (trial.phases && trial.phases.length > 0) {
      return trial.phases;
    }
    return deriveDefaultPhases(trial);
  }

  function selectedPhaseLabel() {
    const phases = visiblePhases();
    if (selectedPhaseIndex >= 0 && phases[selectedPhaseIndex]) {
      return phases[selectedPhaseIndex]!.name;
    }
    return 'stimulus';
  }

  function randomizationPreview() {
    return compileReactionExperimentPlan(
      config,
      {
        questionnaire: undefined,
        question: { id: question?.id || 'reaction-experiment-preview' },
        variableEngine: {
          getVariable() {
            return config.randomization.previewParticipantId;
          },
        } as any,
      },
      {
        previewParticipantId: config.randomization.previewParticipantId,
      }
    ).slice(0, 12);
  }

  function stimulusAssetCandidates() {
    const trial = selectedTrial();
    if (!trial || typeof trial.stimulus !== 'object') return [] as ReactionExperimentAssetRef[];
    if (trial.stimulus.kind === 'image') {
      return config.assets.filter((asset) => asset.kind === 'image');
    }
    if (trial.stimulus.kind === 'video') {
      return config.assets.filter((asset) => asset.kind === 'video');
    }
    if (trial.stimulus.kind === 'audio') {
      return config.assets.filter((asset) => asset.kind === 'audio');
    }
    return [] as ReactionExperimentAssetRef[];
  }

  function selectedStimulusKind(): ReactionStimulusConfig['kind'] {
    const trial = selectedTrial();
    if (trial && typeof trial.stimulus === 'object') {
      return trial.stimulus.kind;
    }
    return 'text';
  }

  function hasScript() {
    return typeof question?.settings?.script === 'string' && question.settings.script.trim().length > 0;
  }

  function syncFromQuestion(force = false) {
    const nextId = question?.id ?? null;
    if (!force && nextId === syncedQuestionId) return;

    config = normalizeReactionExperimentConfig(question);
    syncedQuestionId = nextId;

    const firstBlock = config.blocks[0];
    selectedBlockId = firstBlock?.id || '';
    selectedTrialId = firstBlock?.trials[0]?.id || '';
    selectedPhaseIndex = -1;
    projectAssets = config.assets;
  }

  syncFromQuestion(true);

  $effect(() => {
    syncFromQuestion();
  });

  onMount(() => {
    const storedLeft = localStorage.getItem('reaction-lab:left-width');
    const storedRight = localStorage.getItem('reaction-lab:right-width');
    const storedPreview = localStorage.getItem('reaction-lab:preview-height');
    if (storedLeft) leftWidth = Number(storedLeft) || leftWidth;
    if (storedRight) rightWidth = Number(storedRight) || rightWidth;
    if (storedPreview) previewHeight = Number(storedPreview) || previewHeight;

    const handleMove = (event: PointerEvent) => {
      if (resizeSide === 'left') {
        const available = window.innerWidth - rightWidth - 72;
        const maxLeft = Math.max(250, available - minCenterWidth);
        leftWidth = clamp(event.clientX - 48, 250, maxLeft);
      }
      if (resizeSide === 'right') {
        const available = window.innerWidth - leftWidth - 72;
        const maxRight = Math.max(320, available - minCenterWidth);
        rightWidth = clamp(window.innerWidth - event.clientX, 320, maxRight);
      }
      if (resizeSide === 'preview' && centerPane) {
        const bounds = centerPane.getBoundingClientRect();
        const maxPreview = Math.max(320, bounds.height - 260);
        previewHeight = clamp(event.clientY - bounds.top, 320, maxPreview);
      }
    };

    const handleUp = () => {
      if (!resizeSide) return;
      localStorage.setItem('reaction-lab:left-width', String(leftWidth));
      localStorage.setItem('reaction-lab:right-width', String(rightWidth));
      localStorage.setItem('reaction-lab:preview-height', String(previewHeight));
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizeSide = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);

    void refreshProjectAssets();

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  });

  async function refreshProjectAssets() {
    const currentOrganizationId = effectiveOrganizationId();
    const currentUserId = effectiveUserId();

    if (!currentOrganizationId) {
      projectAssets = config.assets;
      return;
    }

    loadingAssets = true;
    try {
      if (currentUserId) {
        mediaService.setUserId(currentUserId);
      }
      const assets = await mediaService.listMedia({ organizationId: currentOrganizationId });
      projectAssets = assets.map((asset) => ({
        id: asset.id,
        mediaId: asset.id,
        label: asset.originalFilename || asset.filename,
        kind: asset.mimeType.startsWith('video/')
          ? 'video'
          : asset.mimeType.startsWith('audio/')
            ? 'audio'
            : 'image',
        url: undefined,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        durationSeconds: asset.durationSeconds,
      }));
    } catch (error) {
      console.error('Failed to load reaction lab assets:', error);
      projectAssets = config.assets;
    } finally {
      loadingAssets = false;
    }
  }

  function commit(nextConfig: ReactionExperimentConfig) {
    config = nextConfig;
    const patch = buildReactionExperimentQuestionPatch(nextConfig);
    onupdate?.(patch);
  }

  function updateConfig(mutator: (draft: ReactionExperimentConfig) => void) {
    const next = cloneConfig(config);
    mutator(next);
    commit(next);
  }

  function setSelectedBlock(blockId: string) {
    selectedBlockId = blockId;
    const block = config.blocks.find((entry) => entry.id === blockId);
    selectedTrialId = block?.trials[0]?.id || '';
    selectedPhaseIndex = -1;
  }

  function setSelectedTrial(blockId: string, trialId: string) {
    selectedBlockId = blockId;
    selectedTrialId = trialId;
    selectedPhaseIndex = -1;
  }

  function addBlock() {
    updateConfig((draft) => {
      const nextIndex = draft.blocks.length + 1;
      const blockId = `block-${nextIndex}`;
      draft.blocks.push({
        id: blockId,
        name: `Block ${nextIndex}`,
        kind: 'test',
        randomizeOrder: draft.randomization.randomizeTrialOrder,
        repetitions: 1,
        trials: [createTrial(blockId, 1)],
      });
      selectedBlockId = blockId;
      selectedTrialId = `${blockId}-trial-1`;
    });
  }

  function removeBlock(blockId: string) {
    updateConfig((draft) => {
      draft.blocks = draft.blocks.filter((block) => block.id !== blockId);
      const firstBlock = draft.blocks[0];
      selectedBlockId = firstBlock?.id || '';
      selectedTrialId = firstBlock?.trials[0]?.id || '';
      selectedPhaseIndex = -1;
    });
  }

  function addTrial(blockId: string) {
    updateConfig((draft) => {
      const block = draft.blocks.find((entry) => entry.id === blockId);
      if (!block) return;
      const nextIndex = block.trials.length + 1;
      const trial = createTrial(block.id, nextIndex);
      block.trials.push(trial);
      selectedBlockId = block.id;
      selectedTrialId = trial.id;
      selectedPhaseIndex = -1;
    });
  }

  function removeTrial(blockId: string, trialId: string) {
    updateConfig((draft) => {
      const block = draft.blocks.find((entry) => entry.id === blockId);
      if (!block) return;
      block.trials = block.trials.filter((trial) => trial.id !== trialId);
      const fallbackTrial = block.trials[0];
      selectedTrialId = fallbackTrial?.id || '';
      selectedPhaseIndex = -1;
    });
  }

  function applyTemplate(templateId: ReactionExperimentConfig['metadata']['template']) {
    const base = createDefaultReactionExperimentConfig(templateId);
    updateConfig((draft) => {
      draft.metadata.template = base.metadata.template;
      draft.metadata.prompt = base.metadata.prompt;
      draft.blocks = base.blocks;
      draft.stage.targetFPS = base.stage.targetFPS;
      draft.response.validKeys = base.response.validKeys;
      draft.response.correctKey = base.response.correctKey;
      draft.response.requireCorrect = base.response.requireCorrect;
      draft.response.timeoutMs = base.response.timeoutMs;
      draft.feedback.enabled = base.feedback.enabled;
      draft.randomization.seed = base.randomization.seed;
      const firstBlock = draft.blocks[0];
      selectedBlockId = firstBlock?.id || '';
      selectedTrialId = firstBlock?.trials[0]?.id || '';
      selectedPhaseIndex = -1;
    });
  }

  function updateSelectedBlock(mutator: (block: ReactionExperimentBlock) => void) {
    updateConfig((draft) => {
      const block = draft.blocks.find((entry) => entry.id === selectedBlockId);
      if (block) mutator(block);
    });
  }

  function updateSelectedTrial(mutator: (trial: ReactionExperimentTrial) => void) {
    updateConfig((draft) => {
      const block = draft.blocks.find((entry) => entry.id === selectedBlockId);
      const trial = block?.trials.find((entry) => entry.id === selectedTrialId);
      if (trial) mutator(trial);
    });
  }

  function changeStimulusKind(kind: ReactionStimulusConfig['kind']) {
    updateSelectedTrial((trial) => {
      trial.stimulus = createStimulus(kind);
      trial.assetPoolIds = [];
    });
  }

  function addPhase() {
    updateSelectedTrial((trial) => {
      const phases = Array.isArray(trial.phases) ? trial.phases : [];
      phases.push({
        name: 'phase',
        durationMs: 250,
        allowResponse: false,
        marksStimulusOnset: false,
      });
      trial.phases = phases;
      selectedPhaseIndex = phases.length - 1;
    });
  }

  function removePhase(index: number) {
    updateSelectedTrial((trial) => {
      const phases = Array.isArray(trial.phases) ? trial.phases : [];
      trial.phases = phases.filter((_, currentIndex) => currentIndex !== index);
      selectedPhaseIndex = -1;
    });
  }

  function addPositionVariant() {
    updateSelectedTrial((trial) => {
      const variants = Array.isArray(trial.positionVariants) ? trial.positionVariants : [];
      const nextIndex = variants.length + 1;
      variants.push({
        id: `position-${nextIndex}`,
        label: `Position ${nextIndex}`,
        x: 0,
        y: 0,
      });
      trial.positionVariants = variants;
    });
  }

  function removePositionVariant(id: string) {
    updateSelectedTrial((trial) => {
      trial.positionVariants = (trial.positionVariants || []).filter((variant) => variant.id !== id);
    });
  }

  function assignAsset(asset: ReactionExperimentAssetRef) {
    updateSelectedTrial((trial) => {
      if (typeof trial.stimulus !== 'object') return;
      if (trial.stimulus.kind !== asset.kind) return;
      trial.assetPoolIds = [asset.id];
      if ('src' in trial.stimulus) {
        trial.stimulus.src = asset.url || '';
      }
    });
  }

  function openAssetPicker(mode: 'library' | 'assign-selected-trial' = 'library') {
    assetPickerMode = mode;
    showAssetPicker = true;
  }

  function handleMediaSelected(event: { media: MediaAsset[]; asset: MediaAsset }) {
    const additions = event.media.map((asset) => ({
      id: asset.id,
      mediaId: asset.id,
      label: asset.originalFilename || asset.filename,
      kind: asset.mimeType.startsWith('video/')
        ? 'video'
        : asset.mimeType.startsWith('audio/')
          ? 'audio'
          : 'image',
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.durationSeconds,
    })) satisfies ReactionExperimentAssetRef[];

    Promise.all(
      event.media.map(async (asset) => ({ id: asset.id, url: await mediaService.getSignedUrl(asset.id) }))
    )
      .then((urls) => {
        updateConfig((draft) => {
          additions.forEach((assetRef) => {
            const existing = draft.assets.find((entry) => entry.id === assetRef.id);
            const signed = urls.find((entry) => entry.id === assetRef.id)?.url;
            if (existing) {
              existing.url = signed;
              existing.label = assetRef.label;
              existing.kind = assetRef.kind;
              existing.mimeType = assetRef.mimeType;
              existing.width = assetRef.width;
              existing.height = assetRef.height;
              existing.durationSeconds = assetRef.durationSeconds;
            } else {
              draft.assets.push({
                ...assetRef,
                url: signed,
              });
            }
          });

          if (assetPickerMode === 'assign-selected-trial') {
            const block = draft.blocks.find((entry) => entry.id === selectedBlockId);
            const trial = block?.trials.find((entry) => entry.id === selectedTrialId);
            const compatible = additions.find((entry) => entry.kind === selectedStimulusKind());

            if (trial && compatible && typeof trial.stimulus === 'object' && trial.stimulus.kind === compatible.kind) {
              trial.assetPoolIds = [compatible.id];
              if ('src' in trial.stimulus) {
                trial.stimulus.src = urls.find((entry) => entry.id === compatible.id)?.url || '';
              }
            }
          }
        });
      })
      .finally(() => {
        showAssetPicker = false;
        assetPickerMode = 'library';
      });
  }

  function removeAsset(assetId: string) {
    updateConfig((draft) => {
      draft.assets = draft.assets.filter((asset) => asset.id !== assetId);
      draft.blocks.forEach((block) => {
        block.trials.forEach((trial) => {
          trial.assetPoolIds = (trial.assetPoolIds || []).filter((id) => id !== assetId);
        });
      });
    });
  }

  async function linkProjectAsset(asset: ReactionExperimentAssetRef) {
    const signedUrl =
      asset.url || (asset.mediaId ? await mediaService.getSignedUrl(asset.mediaId) : undefined);

    updateConfig((draft) => {
      const existing = draft.assets.find((entry) => entry.id === asset.id);
      if (existing) {
        existing.url = signedUrl;
        existing.label = asset.label;
        existing.kind = asset.kind;
        existing.mimeType = asset.mimeType;
        existing.width = asset.width;
        existing.height = asset.height;
        existing.durationSeconds = asset.durationSeconds;
        return;
      }

      draft.assets.push({
        ...asset,
        url: signedUrl,
      });
    });
  }

  function startResize(side: 'left' | 'right' | 'preview', event: PointerEvent) {
    event.preventDefault();
    resizeSide = side;
    document.body.style.cursor = side === 'preview' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function saveScript(script: string) {
    onupdate?.({
      settings: {
        ...(question?.settings || {}),
        script,
      },
    });
  }
</script>

<div
  class="grid h-full min-h-0 bg-[linear-gradient(180deg,rgba(8,15,28,0.04),transparent_28%)]"
  style={`grid-template-columns:${leftWidth}px 10px minmax(0,1fr) 10px ${rightWidth}px;`}
  data-testid="reaction-lab-workspace"
>
  <aside class="min-h-0 overflow-hidden border-r border-border/70 bg-card/60 backdrop-blur">
    <div class="flex items-center justify-between border-b border-border/70 px-4 py-3">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Reaction Lab
        </p>
        <h2 class="mt-1 text-sm font-semibold text-foreground">{config.metadata.prompt}</h2>
      </div>
      <Button variant="ghost" size="sm" onclick={onclose}>Exit Lab</Button>
    </div>

    <div class="flex border-b border-border/70 px-2 py-2">
      {#each [
        ['outline', 'Outline'],
        ['presets', 'Presets'],
        ['assets', 'Assets'],
        ['randomization', 'Randomizer'],
      ] as [id, label]}
        <button
          type="button"
          class="rounded-full px-3 py-1.5 text-xs font-medium transition {activeLeftTab === id
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
          onclick={() => (activeLeftTab = id as 'outline' | 'presets' | 'assets' | 'randomization')}
        >
          {label}
        </button>
      {/each}
    </div>

    <div class="min-h-0 overflow-y-auto p-4">
      {#if activeLeftTab === 'outline'}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-foreground">Blocks</h3>
            <Button variant="secondary" size="sm" onclick={addBlock}>Add Block</Button>
          </div>

          {#each config.blocks as block}
            <section class="rounded-2xl border border-border/70 bg-background/70 p-3">
              <div class="flex items-center justify-between gap-2">
                <button
                  type="button"
                  class="min-w-0 text-left"
                  onclick={() => setSelectedBlock(block.id)}
                >
                  <p class="truncate text-sm font-semibold text-foreground">{block.name}</p>
                  <p class="text-xs text-muted-foreground">
                    {block.kind} · {block.trials.length} trials
                  </p>
                </button>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    onclick={() => addTrial(block.id)}
                  >
                    + Trial
                  </button>
                  <button
                    type="button"
                    class="rounded-full px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    onclick={() => removeBlock(block.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div class="mt-3 space-y-2">
                {#each block.trials as trial}
                  <div
                    role="button"
                    tabindex="0"
                    class="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition {selectedTrialId === trial.id
                      ? 'border-primary bg-primary/8'
                      : 'border-border/60 bg-card hover:border-primary/40'}"
                    onclick={() => setSelectedTrial(block.id, trial.id)}
                    onkeydown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedTrial(block.id, trial.id);
                      }
                    }}
                  >
                    <span>
                      <span class="block text-sm font-medium text-foreground">
                        {trial.name || trial.id}
                      </span>
                      <span class="block text-xs text-muted-foreground">
                        {trial.condition || 'condition-free'}
                      </span>
                    </span>
                    <button
                      type="button"
                      class="rounded-full px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                      onclick={(event) => {
                        event.stopPropagation();
                        removeTrial(block.id, trial.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {:else if activeLeftTab === 'presets'}
        <div class="space-y-3">
          {#each REACTION_EXPERIMENT_TEMPLATES as template}
            <button
              type="button"
              class="w-full rounded-2xl border border-border/70 bg-background/70 p-4 text-left transition hover:border-primary/40 hover:bg-accent/30"
              onclick={() => applyTemplate(template.id)}
            >
              <span class="text-sm font-semibold text-foreground">{template.name}</span>
              <span class="mt-1 block text-xs text-muted-foreground">{template.description}</span>
            </button>
          {/each}
        </div>
      {:else if activeLeftTab === 'assets'}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-semibold text-foreground">Project Assets</h3>
              <p class="text-xs text-muted-foreground">Reuse image, video, and audio stimuli.</p>
            </div>
            <Button variant="secondary" size="sm" onclick={() => (showAssetPicker = true)}>
              Add Assets
            </Button>
          </div>

          {#if loadingAssets}
            <p class="text-sm text-muted-foreground">Loading assets...</p>
          {/if}

          <div class="space-y-2">
            {#if projectAssets.length > 0}
              <div class="rounded-2xl border border-border/70 bg-background/60 p-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h4 class="text-sm font-semibold text-foreground">Project Library</h4>
                    <p class="text-xs text-muted-foreground">
                      Link existing media into this experiment.
                    </p>
                  </div>
                </div>

                <div class="mt-3 space-y-2">
                  {#each projectAssets.slice(0, 8) as asset}
                    {@const isLinked = config.assets.some((entry) => entry.id === asset.id)}
                    <div class="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-foreground">{asset.label}</p>
                        <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {asset.kind}
                        </p>
                      </div>
                      <button
                        type="button"
                        class="rounded-full px-3 py-1 text-xs font-medium transition {isLinked
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary/10 text-primary hover:bg-primary/15'}"
                        disabled={isLinked}
                        onclick={() => void linkProjectAsset(asset)}
                      >
                        {isLinked ? 'Linked' : 'Link'}
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#each config.assets as asset}
              <div class="rounded-2xl border border-border/70 bg-background/70 p-3">
                <div class="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    class="min-w-0 text-left"
                    onclick={() => assignAsset(asset)}
                  >
                    <span class="block truncate text-sm font-medium text-foreground">{asset.label}</span>
                    <span class="block text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {asset.kind}
                    </span>
                  </button>
                  <button
                    type="button"
                    class="rounded-full px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                    onclick={() => removeAsset(asset.id)}
                  >
                    Remove
                  </button>
                </div>
                {#if asset.width && asset.height}
                  <p class="mt-2 text-xs text-muted-foreground">{asset.width}×{asset.height}</p>
                {/if}
                {#if asset.durationSeconds}
                  <p class="text-xs text-muted-foreground">{asset.durationSeconds.toFixed(1)}s</p>
                {/if}
              </div>
            {/each}
            {#if config.assets.length === 0}
              <p class="rounded-2xl border border-dashed border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                Add assets to assign them to image, video, or audio trials.
              </p>
            {/if}
          </div>
        </div>
      {:else}
        <div class="space-y-4">
          <div>
            <h3 class="text-sm font-semibold text-foreground">Randomization</h3>
            <p class="text-xs text-muted-foreground">
              Seeded ordering, counterbalancing, and trial assignment preview.
            </p>
          </div>

          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Seed</span>
            <input
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={config.randomization.seed}
              oninput={(event) =>
                updateConfig((draft) => {
                  draft.randomization.seed = event.currentTarget.value;
                })}
            />
          </label>

          <label class="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={config.randomization.randomizeBlockOrder}
              onchange={(event) =>
                updateConfig((draft) => {
                  draft.randomization.randomizeBlockOrder = event.currentTarget.checked;
                })}
            />
            Randomize block order
          </label>

          <label class="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={config.randomization.randomizeTrialOrder}
              onchange={(event) =>
                updateConfig((draft) => {
                  draft.randomization.randomizeTrialOrder = event.currentTarget.checked;
                  draft.blocks.forEach((block) => {
                    block.randomizeOrder = event.currentTarget.checked;
                  });
                })}
            />
            Randomize trial order in blocks
          </label>

          <div class="grid gap-3">
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Condition strategy</span>
              <select
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.randomization.conditionStrategy}
                onchange={(event) =>
                  updateConfig((draft) => {
                    draft.randomization.conditionStrategy = event.currentTarget
                      .value as ReactionExperimentConfig['randomization']['conditionStrategy'];
                  })}
              >
                <option value="none">None</option>
                <option value="shuffle">Shuffle</option>
                <option value="balanced">Balanced</option>
              </select>
            </label>

            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Position mode</span>
              <select
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.randomization.positionMode}
                onchange={(event) =>
                  updateConfig((draft) => {
                    draft.randomization.positionMode = event.currentTarget
                      .value as ReactionExperimentConfig['randomization']['positionMode'];
                  })}
              >
                <option value="fixed">Fixed</option>
                <option value="shuffle">Shuffle</option>
                <option value="counterbalance">Counterbalance</option>
              </select>
            </label>

            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Asset selection</span>
              <select
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.randomization.assetSelection}
                onchange={(event) =>
                  updateConfig((draft) => {
                    draft.randomization.assetSelection = event.currentTarget
                      .value as ReactionExperimentConfig['randomization']['assetSelection'];
                  })}
              >
                <option value="fixed">Fixed</option>
                <option value="shuffle">Shuffle</option>
                <option value="without-replacement">Without replacement</option>
              </select>
            </label>
          </div>

          <div class="rounded-2xl border border-border/70 bg-background/70 p-4">
            <label class="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={config.randomization.counterbalancing.enabled}
                onchange={(event) =>
                  updateConfig((draft) => {
                    draft.randomization.counterbalancing.enabled = event.currentTarget.checked;
                  })}
              />
              Enable participant counterbalancing
            </label>

            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Groups</span>
                <input
                  type="number"
                  min="2"
                  max="12"
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={config.randomization.counterbalancing.groups}
                  oninput={(event) =>
                    updateConfig((draft) => {
                      draft.randomization.counterbalancing.groups = clamp(
                        Number(event.currentTarget.value),
                        2,
                        12
                      );
                    })}
                />
              </label>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Preview participant</span>
                <input
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={config.randomization.previewParticipantId}
                  oninput={(event) =>
                    updateConfig((draft) => {
                      draft.randomization.previewParticipantId = event.currentTarget.value;
                    })}
                />
              </label>
            </div>
          </div>

          <div class="space-y-2">
            <h4 class="text-sm font-semibold text-foreground">Sequence Preview</h4>
            {#each randomizationPreview() as planned, index}
              <div class="rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                <span class="font-semibold text-foreground">#{index + 1}</span>
                {' · '}
                {planned.metadata.blockId}
                {' · '}
                {planned.metadata.condition || 'condition-free'}
                {' · '}
                {planned.trial.stimulus.kind}
                {#if planned.trial.stimulus.position}
                  {' · '}
                  ({planned.trial.stimulus.position.x.toFixed(2)}, {planned.trial.stimulus.position.y.toFixed(2)})
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </aside>

  <button
    type="button"
    class="group relative cursor-col-resize bg-border/70 transition hover:bg-primary/60"
    aria-label="Resize left panel"
    onpointerdown={(event) => startResize('left', event)}
  >
    <span class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80 transition group-hover:bg-primary"></span>
  </button>

  <section class="min-h-0 min-w-0 overflow-hidden bg-background">
    <div
      bind:this={centerPane}
      class="grid h-full min-h-0 min-w-0"
      style={`grid-template-rows:minmax(320px, ${previewHeight}px) 10px minmax(220px, 1fr);`}
    >
      <div class="min-h-0 overflow-auto p-5">
        <div class="mx-auto w-full min-w-0 max-w-[1180px]">
          <ReactionStagePreview
            {config}
            trial={selectedTrial()}
            phaseLabel={selectedPhaseLabel()}
          />
        </div>
      </div>

      <button
        type="button"
        class="group relative cursor-row-resize bg-border/70 transition hover:bg-primary/60"
        aria-label="Resize experiment preview"
        onpointerdown={(event) => startResize('preview', event)}
      >
        <span class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/80 transition group-hover:bg-primary"></span>
      </button>

      <div class="min-h-0 overflow-auto border-t border-border/70 bg-card/80 px-5 py-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Timeline
            </p>
            <h3 class="mt-1 text-sm font-semibold text-foreground">
              {selectedTrial()?.name || 'Select a trial'}
            </h3>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="secondary" size="sm" onclick={addPhase}>Add Phase</Button>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-3">
          {#each visiblePhases() as phase, index}
            <button
              type="button"
              class="min-w-[140px] rounded-2xl border px-4 py-3 text-left transition {selectedPhaseIndex === index
                ? 'border-primary bg-primary/8'
                : 'border-border/70 bg-background hover:border-primary/40'}"
              onclick={() => (selectedPhaseIndex = index)}
            >
              <span class="block text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {phase.name}
              </span>
              <span class="mt-1 block text-sm font-semibold text-foreground">
                {phase.durationMs} ms
              </span>
            </button>
          {/each}
          {#if visiblePhases().length === 0}
            <div class="rounded-2xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">
              No phases yet. Add phases to build a custom sequence.
            </div>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <button
    type="button"
    class="group relative cursor-col-resize bg-border/70 transition hover:bg-primary/60"
    aria-label="Resize right panel"
    onpointerdown={(event) => startResize('right', event)}
  >
    <span class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80 transition group-hover:bg-primary"></span>
  </button>

  <aside class="min-h-0 min-w-0 overflow-y-auto border-l border-border/70 bg-card/60 px-4 py-4">
    <div class="space-y-5">
      <section class="rounded-2xl border border-border/70 bg-background/80 p-4">
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Experiment
        </p>
        <div class="mt-3 grid gap-3">
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Prompt</span>
            <input
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={config.metadata.prompt}
              oninput={(event) =>
                updateConfig((draft) => {
                  draft.metadata.prompt = event.currentTarget.value;
                })}
            />
          </label>
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Description</span>
            <textarea
              class="min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2"
              value={config.metadata.description}
              oninput={(event) =>
                updateConfig((draft) => {
                  draft.metadata.description = event.currentTarget.value;
                })}
            ></textarea>
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Canvas Width</span>
              <input
                type="number"
                min="320"
                max="1920"
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.stage.width}
                oninput={(event) =>
                  updateConfig((draft) => {
                    draft.stage.width = clamp(Number(event.currentTarget.value), 320, 1920);
                  })}
              />
            </label>
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Canvas Height</span>
              <input
                type="number"
                min="240"
                max="1080"
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.stage.height}
                oninput={(event) =>
                  updateConfig((draft) => {
                    draft.stage.height = clamp(Number(event.currentTarget.value), 240, 1080);
                  })}
              />
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Background</span>
              <input
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.stage.background}
                oninput={(event) =>
                  updateConfig((draft) => {
                    draft.stage.background = event.currentTarget.value;
                  })}
              />
            </label>
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Target FPS</span>
              <input
                type="number"
                min="30"
                max="240"
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.stage.targetFPS}
                oninput={(event) =>
                  updateConfig((draft) => {
                    draft.stage.targetFPS = clamp(Number(event.currentTarget.value), 30, 240);
                  })}
              />
            </label>
          </div>
          <label class="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={config.stage.showGrid}
              onchange={(event) =>
                updateConfig((draft) => {
                  draft.stage.showGrid = event.currentTarget.checked;
                })}
            />
            Show stage grid
          </label>
          <div class="rounded-2xl border border-border/70 bg-muted/20 p-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-foreground">Experiment Script</p>
                <p class="text-xs text-muted-foreground">
                  Attach advanced runtime hooks for this experiment.
                </p>
              </div>
              <Button variant="secondary" size="sm" onclick={() => (scriptEditorOpen = true)}>
                {hasScript() ? 'Edit Script' : 'Add Script'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-border/70 bg-background/80 p-4">
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Response & Feedback
        </p>
        <div class="mt-3 grid gap-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Response Mode</span>
              <select
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.response.mode}
                onchange={(event) =>
                  updateConfig((draft) => {
                    draft.response.mode = event.currentTarget.value as typeof draft.response.mode;
                  })}
              >
                <option value="keyboard">Keyboard</option>
                <option value="mouse">Mouse</option>
                <option value="touch">Touch</option>
              </select>
            </label>
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Save Variable</span>
              <input
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.response.saveAs}
                oninput={(event) =>
                  updateConfig((draft) => {
                    draft.response.saveAs = event.currentTarget.value;
                  })}
              />
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Default Valid Inputs</span>
              <input
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.response.validKeys.join(', ')}
                oninput={(event) =>
                  updateConfig((draft) => {
                    draft.response.validKeys = event.currentTarget.value
                      .split(',')
                      .map((entry) => entry.trim())
                      .filter(Boolean);
                  })}
              />
            </label>
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Default Correct Response</span>
              <input
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={config.response.correctKey || ''}
                oninput={(event) =>
                  updateConfig((draft) => {
                    draft.response.correctKey = event.currentTarget.value || undefined;
                  })}
              />
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={config.response.requireCorrect}
                onchange={(event) =>
                  updateConfig((draft) => {
                    draft.response.requireCorrect = event.currentTarget.checked;
                  })}
              />
              Score responses as correct / incorrect
            </label>
            <label class="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={config.feedback.enabled}
                onchange={(event) =>
                  updateConfig((draft) => {
                    draft.feedback.enabled = event.currentTarget.checked;
                  })}
              />
              Show per-trial feedback during preview/runtime
            </label>
          </div>
        </div>
      </section>

      {#if selectedBlock()}
        <section class="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Block
          </p>
          <div class="mt-3 grid gap-3">
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Name</span>
              <input
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={selectedBlock()?.name}
                oninput={(event) =>
                  updateSelectedBlock((block) => {
                    block.name = event.currentTarget.value;
                  })}
              />
            </label>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Kind</span>
                <select
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedBlock()?.kind}
                  onchange={(event) =>
                    updateSelectedBlock((block) => {
                      block.kind = event.currentTarget.value as ReactionExperimentBlock['kind'];
                    })}
                >
                  <option value="practice">Practice</option>
                  <option value="test">Test</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Repetitions</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedBlock()?.repetitions}
                  oninput={(event) =>
                    updateSelectedBlock((block) => {
                      block.repetitions = clamp(Number(event.currentTarget.value), 1, 50);
                    })}
                />
              </label>
            </div>
            <label class="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={selectedBlock()?.randomizeOrder}
                onchange={(event) =>
                  updateSelectedBlock((block) => {
                    block.randomizeOrder = event.currentTarget.checked;
                  })}
              />
              Randomize order in this block
            </label>
          </div>
        </section>
      {/if}

      {#if selectedTrial()}
        <section class="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Trial
          </p>
          <div class="mt-3 grid gap-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Name</span>
                <input
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedTrial()?.name}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.name = event.currentTarget.value;
                    })}
                />
              </label>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Condition</span>
                <input
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedTrial()?.condition}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.condition = event.currentTarget.value;
                    })}
                />
              </label>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Repeat</span>
                <input
                  type="number"
                  min="1"
                  max="250"
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedTrial()?.repeat || 1}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.repeat = clamp(Number(event.currentTarget.value), 1, 250);
                    })}
                />
              </label>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Stimulus Kind</span>
                <select
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedStimulusKind()}
                  onchange={(event) =>
                    changeStimulusKind(event.currentTarget.value as ReactionStimulusConfig['kind'])}
                >
                  <option value="text">Text</option>
                  <option value="shape">Shape</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="custom">Custom Shader</option>
                </select>
              </label>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selectedTrial()?.isPractice || false}
                  onchange={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.isPractice = event.currentTarget.checked;
                    })}
                />
                Practice trial
              </label>
              <label class="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selectedTrial()?.isTarget || false}
                  onchange={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.isTarget = event.currentTarget.checked;
                    })}
                />
                Target trial
              </label>
            </div>

            {#if typeof selectedTrial()?.stimulus === 'object'}
              {@const stimulus = selectedTrial()!.stimulus as ReactionStimulusConfig}
              {#if stimulus.kind === 'text'}
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="space-y-1 text-sm">
                    <span class="block text-muted-foreground">Text</span>
                    <input
                      class="w-full rounded-xl border border-input bg-background px-3 py-2"
                      value={stimulus.text}
                      oninput={(event) =>
                        updateSelectedTrial((trial) => {
                          if (typeof trial.stimulus === 'object' && trial.stimulus.kind === 'text') {
                            trial.stimulus.text = event.currentTarget.value;
                          }
                        })}
                    />
                  </label>
                  <label class="space-y-1 text-sm">
                    <span class="block text-muted-foreground">Font Size</span>
                    <input
                      type="number"
                      min="10"
                      max="240"
                      class="w-full rounded-xl border border-input bg-background px-3 py-2"
                      value={stimulus.fontPx || 64}
                      oninput={(event) =>
                        updateSelectedTrial((trial) => {
                          if (typeof trial.stimulus === 'object' && trial.stimulus.kind === 'text') {
                            trial.stimulus.fontPx = Number(event.currentTarget.value);
                          }
                        })}
                    />
                  </label>
                </div>
              {:else if stimulus.kind === 'shape'}
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="space-y-1 text-sm">
                    <span class="block text-muted-foreground">Shape</span>
                    <select
                      class="w-full rounded-xl border border-input bg-background px-3 py-2"
                      value={stimulus.shape}
                      onchange={(event) =>
                        updateSelectedTrial((trial) => {
                          if (typeof trial.stimulus === 'object' && trial.stimulus.kind === 'shape') {
                            trial.stimulus.shape = event.currentTarget.value as typeof stimulus.shape;
                          }
                        })}
                    >
                      <option value="circle">Circle</option>
                      <option value="square">Square</option>
                      <option value="rectangle">Rectangle</option>
                      <option value="triangle">Triangle</option>
                    </select>
                  </label>
                  <label class="space-y-1 text-sm">
                    <span class="block text-muted-foreground">Radius / Size</span>
                    <input
                      type="number"
                      min="10"
                      max="800"
                      class="w-full rounded-xl border border-input bg-background px-3 py-2"
                      value={stimulus.radiusPx || stimulus.widthPx || 120}
                      oninput={(event) =>
                        updateSelectedTrial((trial) => {
                          if (typeof trial.stimulus === 'object' && trial.stimulus.kind === 'shape') {
                            const next = Number(event.currentTarget.value);
                            trial.stimulus.radiusPx = next;
                            trial.stimulus.widthPx = next;
                            trial.stimulus.heightPx = next;
                          }
                        })}
                    />
                  </label>
                </div>
              {:else if stimulus.kind === 'image' || stimulus.kind === 'video' || stimulus.kind === 'audio'}
                <div class="space-y-3">
                  <div class="rounded-2xl border border-border/70 bg-muted/20 p-3">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p class="text-sm font-semibold text-foreground">Media Source</p>
                        <p class="text-xs text-muted-foreground">
                          Link an uploaded asset or paste a remote fallback URL.
                        </p>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onclick={() => openAssetPicker('assign-selected-trial')}>
                          Choose Media
                        </Button>
                        <Button variant="ghost" size="sm" onclick={() => (activeLeftTab = 'assets')}>
                          Open Asset Bin
                        </Button>
                      </div>
                    </div>
                  </div>
                  <label class="space-y-1 text-sm">
                    <span class="block text-muted-foreground">Assigned Asset</span>
                    <select
                      class="w-full rounded-xl border border-input bg-background px-3 py-2"
                      value={selectedTrial()?.assetPoolIds?.[0] || ''}
                      onchange={(event) => {
                        const asset = config.assets.find((entry) => entry.id === event.currentTarget.value);
                        if (asset) assignAsset(asset);
                      }}
                    >
                      <option value="">No asset selected</option>
                      {#each stimulusAssetCandidates() as asset}
                        <option value={asset.id}>{asset.label}</option>
                      {/each}
                    </select>
                  </label>
                  {#if stimulusAssetCandidates().length === 0}
                    <p class="text-xs text-muted-foreground">
                      No linked {stimulus.kind} assets yet. Use <strong>Choose Media</strong> or the Asset Bin tab.
                    </p>
                  {/if}
                  <label class="space-y-1 text-sm">
                    <span class="block text-muted-foreground">Fallback URL</span>
                    <input
                      class="w-full rounded-xl border border-input bg-background px-3 py-2"
                      value={stimulus.src}
                      oninput={(event) =>
                        updateSelectedTrial((trial) => {
                          if (typeof trial.stimulus === 'object' && 'src' in trial.stimulus) {
                            trial.stimulus.src = event.currentTarget.value;
                          }
                        })}
                    />
                  </label>
                </div>
              {:else if stimulus.kind === 'custom'}
                <div class="grid gap-3">
                  <label class="space-y-1 text-sm">
                    <span class="block text-muted-foreground">Shader Source</span>
                    <textarea
                      class="min-h-28 w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
                      value={stimulus.shader}
                      oninput={(event) =>
                        updateSelectedTrial((trial) => {
                          if (typeof trial.stimulus === 'object' && trial.stimulus.kind === 'custom') {
                            trial.stimulus.shader = event.currentTarget.value;
                          }
                        })}
                    ></textarea>
                  </label>
                </div>
              {/if}

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="space-y-1 text-sm">
                  <span class="block text-muted-foreground">Position X</span>
                  <input
                    type="number"
                    min="-1"
                    max="1"
                    step="0.05"
                    class="w-full rounded-xl border border-input bg-background px-3 py-2"
                    value={stimulus.position?.x || 0}
                    oninput={(event) =>
                      updateSelectedTrial((trial) => {
                        if (typeof trial.stimulus === 'object') {
                          trial.stimulus.position = {
                            x: Number(event.currentTarget.value),
                            y: trial.stimulus.position?.y || 0,
                          };
                        }
                      })}
                  />
                </label>
                <label class="space-y-1 text-sm">
                  <span class="block text-muted-foreground">Position Y</span>
                  <input
                    type="number"
                    min="-1"
                    max="1"
                    step="0.05"
                    class="w-full rounded-xl border border-input bg-background px-3 py-2"
                    value={stimulus.position?.y || 0}
                    oninput={(event) =>
                      updateSelectedTrial((trial) => {
                        if (typeof trial.stimulus === 'object') {
                          trial.stimulus.position = {
                            x: trial.stimulus.position?.x || 0,
                            y: Number(event.currentTarget.value),
                          };
                        }
                      })}
                  />
                </label>
              </div>
            {/if}

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Correct Response</span>
                <input
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedTrial()?.correctResponse || config.response.correctKey || ''}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.correctResponse = event.currentTarget.value;
                    })}
                />
              </label>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Valid Inputs</span>
                <input
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={(selectedTrial()?.validKeys || config.response.validKeys).join(', ')}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.validKeys = event.currentTarget.value
                        .split(',')
                        .map((entry) => entry.trim())
                        .filter(Boolean);
                    })}
                />
              </label>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selectedTrial()?.requireCorrect ?? config.response.requireCorrect}
                  onchange={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.requireCorrect = event.currentTarget.checked;
                    })}
                />
                Require correct response for this trial
              </label>
              <div class="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Feedback is currently {config.feedback.enabled ? 'enabled' : 'disabled'} for runtime preview.
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Fixation (ms)</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedTrial()?.fixationMs || 0}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.fixationMs = Number(event.currentTarget.value);
                    })}
                />
              </label>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Cue Delay (ms)</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedTrial()?.preStimulusDelayMs || 0}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.preStimulusDelayMs = Number(event.currentTarget.value);
                    })}
                />
              </label>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Stimulus Duration (ms)</span>
                <input
                  type="number"
                  min="0"
                  max="30000"
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedTrial()?.stimulusDurationMs || 0}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.stimulusDurationMs = Number(event.currentTarget.value);
                    })}
                />
              </label>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Response Timeout (ms)</span>
                <input
                  type="number"
                  min="100"
                  max="30000"
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedTrial()?.responseTimeoutMs || config.response.timeoutMs}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      trial.responseTimeoutMs = Number(event.currentTarget.value);
                    })}
                />
              </label>
            </div>

            <div class="rounded-2xl border border-border/70 bg-muted/20 p-3">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-semibold text-foreground">Position Variants</h4>
                <Button variant="ghost" size="sm" onclick={addPositionVariant}>Add</Button>
              </div>
              <div class="mt-3 space-y-2">
                {#each selectedTrial()?.positionVariants || [] as variant (variant.id)}
                  <div class="grid grid-cols-[1fr_96px_96px_auto] gap-2">
                    <input
                      class="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      value={variant.label}
                      oninput={(event) =>
                        updateSelectedTrial((trial) => {
                          const target = (trial.positionVariants || []).find((entry) => entry.id === variant.id);
                          if (target) target.label = event.currentTarget.value;
                        })}
                    />
                    <input
                      type="number"
                      min="-1"
                      max="1"
                      step="0.05"
                      class="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      value={variant.x}
                      oninput={(event) =>
                        updateSelectedTrial((trial) => {
                          const target = (trial.positionVariants || []).find((entry) => entry.id === variant.id);
                          if (target) target.x = Number(event.currentTarget.value);
                        })}
                    />
                    <input
                      type="number"
                      min="-1"
                      max="1"
                      step="0.05"
                      class="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      value={variant.y}
                      oninput={(event) =>
                        updateSelectedTrial((trial) => {
                          const target = (trial.positionVariants || []).find((entry) => entry.id === variant.id);
                          if (target) target.y = Number(event.currentTarget.value);
                        })}
                    />
                    <button
                      type="button"
                      class="rounded-xl px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                      onclick={() => removePositionVariant(variant.id)}
                    >
                      Remove
                    </button>
                  </div>
                {/each}
                {#if (selectedTrial()?.positionVariants || []).length === 0}
                  <p class="text-xs text-muted-foreground">
                    Add alternate positions for shuffle or counterbalancing rules.
                  </p>
                {/if}
              </div>
            </div>

            <div class="rounded-2xl border border-border/70 bg-muted/20 p-3">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-semibold text-foreground">Phase Editor</h4>
                <Button variant="ghost" size="sm" onclick={addPhase}>Add Phase</Button>
              </div>
              <div class="mt-3 space-y-2">
                {#each visiblePhases() as phase, index}
                  <div class="grid grid-cols-[1fr_112px_auto_auto] gap-2">
                    <input
                      class="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      value={phase.name}
                      oninput={(event) =>
                        updateSelectedTrial((trial) => {
                          const phases = Array.isArray(trial.phases) ? trial.phases : [];
                          if (phases[index]) phases[index]!.name = event.currentTarget.value;
                        })}
                    />
                    <input
                      type="number"
                      min="0"
                      max="30000"
                      class="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      value={phase.durationMs}
                      oninput={(event) =>
                        updateSelectedTrial((trial) => {
                          const phases = Array.isArray(trial.phases) ? trial.phases : [];
                          if (phases[index]) phases[index]!.durationMs = Number(event.currentTarget.value);
                        })}
                    />
                    <label class="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={phase.allowResponse || false}
                        onchange={(event) =>
                          updateSelectedTrial((trial) => {
                            const phases = Array.isArray(trial.phases) ? trial.phases : [];
                            if (phases[index]) phases[index]!.allowResponse = event.currentTarget.checked;
                          })}
                      />
                      Respond
                    </label>
                    <button
                      type="button"
                      class="rounded-xl px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                      onclick={() => removePhase(index)}
                    >
                      Remove
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </section>
      {/if}
    </div>
  </aside>

  <MediaManagerModal
    isOpen={showAssetPicker}
    organizationId={effectiveOrganizationId()}
    userId={effectiveUserId()}
    allowMultiple={true}
    initialAssets={projectAssetMediaList()}
    onselect={handleMediaSelected}
    onclose={() => (showAssetPicker = false)}
  />

  {#if scriptEditorOpen}
    <ScriptEditorOverlay
      question={question}
      variables={designerStore.questionnaire.variables}
      onclose={() => (scriptEditorOpen = false)}
      onsave={(script) => {
        saveScript(script);
        scriptEditorOpen = false;
      }}
    />
  {/if}
</div>

<style>
  :global(.reaction-lab-canvas-hidden) {
    display: none;
  }
</style>

<script module lang="ts">
  function cloneConfig<T>(value: T): T {
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value)) as T;
    }
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value || 0));
  }

  function deriveDefaultPhases(trial: ReactionExperimentTrial) {
    const phases: ScheduledPhase[] = [];
    if ((trial.fixationMs || 0) > 0) {
      phases.push({
        name: 'fixation',
        durationMs: trial.fixationMs || 0,
        allowResponse: false,
        marksStimulusOnset: false,
      });
    }
    if ((trial.preStimulusDelayMs || 0) > 0) {
      phases.push({
        name: 'cue',
        durationMs: trial.preStimulusDelayMs || 0,
        allowResponse: false,
        marksStimulusOnset: false,
      });
    }
    phases.push({
      name: 'stimulus',
      durationMs: trial.stimulusDurationMs || 0,
      allowResponse: true,
      marksStimulusOnset: true,
    });
    phases.push({
      name: 'response',
      durationMs: trial.responseTimeoutMs || 0,
      allowResponse: true,
      marksStimulusOnset: false,
    });
    if ((trial.interTrialIntervalMs || 0) > 0) {
      phases.push({
        name: 'iti',
        durationMs: trial.interTrialIntervalMs || 0,
        allowResponse: false,
        marksStimulusOnset: false,
      });
    }
    return phases;
  }

  function createTrial(blockId: string, index: number): ReactionExperimentTrial {
    return {
      id: `${blockId}-trial-${index}`,
      name: `Trial ${index}`,
      condition: '',
      repeat: 1,
      isPractice: false,
      isTarget: false,
      stimulus: createStimulus('text'),
      validKeys: ['f', 'j'],
      correctResponse: 'j',
      requireCorrect: false,
      fixationMs: 500,
      preStimulusDelayMs: 0,
      stimulusDurationMs: 250,
      responseTimeoutMs: 1800,
      interTrialIntervalMs: 300,
      positionVariants: [],
      assetPoolIds: [],
      phases: [],
    };
  }

  function createStimulus(kind: ReactionStimulusConfig['kind']): ReactionStimulusConfig {
    if (kind === 'shape') {
      return {
        kind: 'shape',
        shape: 'circle',
        radiusPx: 120,
        position: { x: 0, y: 0 },
      };
    }
    if (kind === 'image') {
      return {
        kind: 'image',
        src: '',
        widthPx: 300,
        heightPx: 220,
        position: { x: 0, y: 0 },
      };
    }
    if (kind === 'video') {
      return {
        kind: 'video',
        src: '',
        autoplay: true,
        muted: true,
        loop: true,
        widthPx: 420,
        heightPx: 240,
        position: { x: 0, y: 0 },
      };
    }
    if (kind === 'audio') {
      return {
        kind: 'audio',
        src: '',
        autoplay: true,
        volume: 1,
        position: { x: 0, y: 0 },
      };
    }
    if (kind === 'custom') {
      return {
        kind: 'custom',
        shader: 'void main() { gl_FragColor = vec4(0.49, 0.82, 0.98, 1.0); }',
        vertices: [-0.5, -0.5, 0.5, -0.5, 0, 0.5],
        uniforms: {},
        position: { x: 0, y: 0 },
      };
    }
    return {
      kind: 'text',
      text: 'GO',
      fontPx: 72,
      position: { x: 0, y: 0 },
    };
  }
</script>
