<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import type { ReactionExperimentBlock } from '../model/reaction-experiment';

  interface Props {
    blocks: ReactionExperimentBlock[];
    selectedTrialId: string;
    onSelectBlock: (blockId: string) => void;
    onSelectTrial: (blockId: string, trialId: string) => void;
    onAddBlock: () => void;
    onRemoveBlock: (blockId: string) => void;
    onAddTrial: (blockId: string) => void;
    onRemoveTrial: (blockId: string, trialId: string) => void;
  }

  let {
    blocks,
    selectedTrialId,
    onSelectBlock,
    onSelectTrial,
    onAddBlock,
    onRemoveBlock,
    onAddTrial,
    onRemoveTrial,
  }: Props = $props();
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold text-foreground">Blocks</h3>
    <Button variant="secondary" size="sm" onclick={onAddBlock}>Add Block</Button>
  </div>

  {#each blocks as block}
    <section class="rounded-2xl border border-border/70 bg-background/70 p-3">
      <div class="flex items-center justify-between gap-2">
        <button type="button" class="min-w-0 text-left" onclick={() => onSelectBlock(block.id)}>
          <p class="truncate text-sm font-semibold text-foreground">{block.name}</p>
          <p class="text-xs text-muted-foreground">
            {block.kind} · {block.trials.length} trials
          </p>
        </button>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            onclick={() => onAddTrial(block.id)}
          >
            + Trial
          </button>
          <button
            type="button"
            class="rounded-full px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            onclick={() => onRemoveBlock(block.id)}
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
            class="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition {selectedTrialId ===
            trial.id
              ? 'border-primary bg-primary/8'
              : 'border-border/60 bg-card hover:border-primary/40'}"
            onclick={() => onSelectTrial(block.id, trial.id)}
            onkeydown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectTrial(block.id, trial.id);
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
                onRemoveTrial(block.id, trial.id);
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
