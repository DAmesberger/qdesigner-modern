<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { mediaService } from '$lib/services/mediaService';
  import type {
    ReactionExperimentAssetRef,
    ReactionExperimentConfig,
    ReactionExperimentTrial,
  } from '../model/reaction-experiment';

  interface Props {
    /** Assets already linked into this experiment (`config.assets`). */
    assets: ReactionExperimentAssetRef[];
    /** Assets available in the project media library. */
    projectAssets: ReactionExperimentAssetRef[];
    loadingAssets: boolean;
    /** Open the media picker to add new assets to the experiment. */
    onAddAssets: () => void;
    updateConfig: (mutator: (draft: ReactionExperimentConfig) => void) => void;
    updateSelectedTrial: (mutator: (trial: ReactionExperimentTrial) => void) => void;
  }

  let { assets, projectAssets, loadingAssets, onAddAssets, updateConfig, updateSelectedTrial }: Props =
    $props();

  /** Assign a linked asset to the currently-selected trial. */
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

  /** Remove a linked asset from `config.assets` (and any trial referencing it). */
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

  /** Link a project-library asset into `config.assets`, resolving its signed URL. */
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

      draft.assets.push({ ...asset, url: signedUrl });
    });
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-sm font-semibold text-foreground">Project Assets</h3>
      <p class="text-xs text-muted-foreground">Reuse image, video, and audio stimuli.</p>
    </div>
    <Button variant="secondary" size="sm" onclick={onAddAssets}>Add Assets</Button>
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
            <p class="text-xs text-muted-foreground">Link existing media into this experiment.</p>
          </div>
        </div>

        <div class="mt-3 space-y-2">
          {#each projectAssets.slice(0, 8) as asset}
            {@const isLinked = assets.some((entry) => entry.id === asset.id)}
            <div class="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-foreground">{asset.label}</p>
                <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">{asset.kind}</p>
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

    {#each assets as asset}
      <div class="rounded-2xl border border-border/70 bg-background/70 p-3">
        <div class="flex items-start justify-between gap-3">
          <button type="button" class="min-w-0 text-left" onclick={() => assignAsset(asset)}>
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

    {#if assets.length === 0}
      <p class="rounded-2xl border border-dashed border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
        Add assets to assign them to image, video, or audio trials.
      </p>
    {/if}
  </div>
</div>
