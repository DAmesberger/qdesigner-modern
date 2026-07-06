<script lang="ts">
  import { clamp, type ReactionExperimentConfig } from '../model/reaction-experiment';
  import type { PlannedReactionTrial } from '$lib/modules/questions/reaction-time/model/reaction-plan-types';

  interface Props {
    config: ReactionExperimentConfig;
    updateConfig: (mutator: (draft: ReactionExperimentConfig) => void) => void;
    /** Seeded assignment preview (first N planned trials). */
    preview: PlannedReactionTrial[];
  }

  let { config, updateConfig, preview }: Props = $props();
</script>

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
    {#each preview as planned, index}
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
