<script lang="ts">
  import Button from '$lib/components/common/Button.svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import {
    normalizeReactionExperimentConfig,
    summarizeReactionExperiment,
  } from './model/reaction-experiment';

  interface Props {
    question: any;
  }

  let { question = $bindable() }: Props = $props();

  const config = $derived(normalizeReactionExperimentConfig(question));
  const summary = $derived(summarizeReactionExperiment(config));

  function openLab() {
    designerStore.openReactionLab(question.id);
  }
</script>

<div class="space-y-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
  <div>
    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
      Reaction Lab
    </p>
    <h4 class="mt-2 text-base font-semibold text-foreground">{config.metadata.prompt}</h4>
    <p class="mt-1 text-sm text-muted-foreground">
      {summary.blocks} blocks, {summary.trials} trials, {summary.assets} assets, {config.stage.targetFPS} FPS
    </p>
  </div>

  <div class="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
    <div class="rounded-xl border border-border/60 bg-background/80 p-3">
      <span class="block text-xs uppercase tracking-[0.18em]">Template</span>
      <span class="mt-1 block text-foreground">{config.metadata.template}</span>
    </div>
    <div class="rounded-xl border border-border/60 bg-background/80 p-3">
      <span class="block text-xs uppercase tracking-[0.18em]">Randomization</span>
      <span class="mt-1 block text-foreground">{config.randomization.conditionStrategy}</span>
    </div>
  </div>

  <Button variant="secondary" onclick={openLab}>
    Open Reaction Lab
  </Button>
</div>
