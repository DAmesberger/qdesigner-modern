<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import MediaManagerModal from '$lib/components/designer/MediaManagerModal.svelte';
  import ScriptEditorOverlay from '$lib/components/designer/ScriptEditorOverlay.svelte';
  import ResizablePanes from '$lib/components/designer/reaction/ResizablePanes.svelte';
  import type { MediaAsset } from '$lib/shared/types/media';
  import { mediaService } from '$lib/services/mediaService';
  import { getDesignerContext } from '$lib/stores/designer-context';
  const designerStore = getDesignerContext();
  import ReactionStagePreview from '$lib/modules/questions/reaction-experiment/ReactionStagePreview.svelte';
  import OutlinePane from './OutlinePane.svelte';
  import PresetsPane from './PresetsPane.svelte';
  import AssetsPane from './AssetsPane.svelte';
  import RandomizationPane from './RandomizationPane.svelte';
  import TrialInspector from './TrialInspector.svelte';
  import {
    buildReactionExperimentQuestionPatch,
    cloneConfig,
    compileReactionExperimentPlan,
    createDefaultReactionExperimentConfig,
    createTrial,
    deriveDefaultPhases,
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

  let { question, organizationId = '', userId = '', onclose, onupdate }: Props = $props();

  let config = $state<ReactionExperimentConfig>(createDefaultReactionExperimentConfig());
  let syncedQuestionId = $state<string | null>(null);
  let activeLeftTab = $state<'outline' | 'presets' | 'assets' | 'randomization'>('outline');
  let selectedBlockId = $state<string>('');
  let selectedTrialId = $state<string>('');
  let selectedPhaseIndex = $state<number>(-1);
  let showAssetPicker = $state(false);
  let assetPickerMode = $state<'library' | 'assign-selected-trial'>('library');
  let loadingAssets = $state(false);
  let projectAssets = $state<ReactionExperimentAssetRef[]>([]);
  let scriptEditorOpen = $state(false);

  const activeBlock = $derived(
    config.blocks.find((block) => block.id === selectedBlockId) || config.blocks[0] || null
  );
  const activeTrial = $derived.by<ReactionExperimentTrial | null>(() => {
    const block = activeBlock;
    if (!block) return null;
    return block.trials.find((trial) => trial.id === selectedTrialId) || block.trials[0] || null;
  });

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

  function visiblePhases(): ScheduledPhase[] {
    const trial = activeTrial;
    if (!trial) return [];
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

  function selectedStimulusKind(): ReactionStimulusConfig['kind'] {
    const trial = activeTrial;
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
    void refreshProjectAssets();
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

  /**
   * Persist after a shared sub-editor mutated the live trial in place (bind:).
   * The mutation already landed on `config`; clone + commit emits the patch.
   */
  function onTrialCommit() {
    commit(cloneConfig(config));
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

  function saveScript(script: string) {
    onupdate?.({
      settings: {
        ...(question?.settings || {}),
        script,
      },
    });
  }
</script>

<div class="h-full min-h-0" data-testid="reaction-lab-workspace">
  <ResizablePanes storageKey="reaction-lab">
    {#snippet left()}
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
          {#each [['outline', 'Outline'], ['presets', 'Presets'], ['assets', 'Assets'], ['randomization', 'Randomizer']] as [id, label]}
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
            <OutlinePane
              blocks={config.blocks}
              {selectedTrialId}
              onSelectBlock={setSelectedBlock}
              onSelectTrial={setSelectedTrial}
              onAddBlock={addBlock}
              onRemoveBlock={removeBlock}
              onAddTrial={addTrial}
              onRemoveTrial={removeTrial}
            />
          {:else if activeLeftTab === 'presets'}
            <PresetsPane onApply={applyTemplate} />
          {:else if activeLeftTab === 'assets'}
            <AssetsPane
              assets={config.assets}
              {projectAssets}
              {loadingAssets}
              onAddAssets={() => openAssetPicker('library')}
              {updateConfig}
              {updateSelectedTrial}
            />
          {:else}
            <RandomizationPane {config} {updateConfig} preview={randomizationPreview()} />
          {/if}
        </div>
      </aside>
    {/snippet}

    {#snippet preview()}
      <div class="mx-auto w-full min-w-0 max-w-[1180px]">
        <ReactionStagePreview {config} trial={activeTrial} phaseLabel={selectedPhaseLabel()} />
      </div>
    {/snippet}

    {#snippet timeline()}
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Timeline
          </p>
          <h3 class="mt-1 text-sm font-semibold text-foreground">
            {activeTrial?.name || 'Select a trial'}
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
            class="min-w-[140px] rounded-2xl border px-4 py-3 text-left transition {selectedPhaseIndex ===
            index
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
    {/snippet}

    {#snippet right()}
      <aside class="min-h-0 min-w-0 overflow-y-auto border-l border-border/70 bg-card/60 px-4 py-4">
        <TrialInspector
          {config}
          {updateConfig}
          selectedBlock={activeBlock}
          selectedTrial={activeTrial}
          {updateSelectedBlock}
          {updateSelectedTrial}
          {onTrialCommit}
          hasScript={hasScript()}
          onOpenScript={() => (scriptEditorOpen = true)}
          onChooseMedia={() => openAssetPicker('assign-selected-trial')}
          onOpenAssetBin={() => (activeLeftTab = 'assets')}
        />
      </aside>
    {/snippet}
  </ResizablePanes>

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
      {question}
      variables={designerStore.questionnaire.variables}
      onclose={() => (scriptEditorOpen = false)}
      onsave={(script) => {
        saveScript(script);
        scriptEditorOpen = false;
      }}
    />
  {/if}
</div>
