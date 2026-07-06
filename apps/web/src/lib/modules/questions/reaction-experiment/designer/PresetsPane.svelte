<script lang="ts">
  import {
    REACTION_EXPERIMENT_TEMPLATES,
    type ReactionExperimentTemplateKind,
  } from '../model/reaction-experiment';

  interface Props {
    onApply: (templateId: ReactionExperimentTemplateKind) => void;
  }

  let { onApply }: Props = $props();
</script>

<div class="space-y-3">
  {#each REACTION_EXPERIMENT_TEMPLATES as template}
    <button
      type="button"
      class="w-full rounded-2xl border border-border/70 bg-background/70 p-4 text-left transition hover:border-primary/40 hover:bg-accent/30"
      onclick={() => onApply(template.id)}
    >
      <span class="text-sm font-semibold text-foreground">{template.name}</span>
      <span class="mt-1 block text-xs text-muted-foreground">{template.description}</span>
    </button>
  {/each}
</div>
