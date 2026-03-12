<script lang="ts">
  import type { ScheduledPhase } from '$lib/runtime/reaction';
  import type { ReactionStudyTrialTemplate } from '../model/reaction-schema';

  interface Props {
    trial: ReactionStudyTrialTemplate;
  }

  let { trial = $bindable() }: Props = $props();

  function addPhase() {
    const currentPhases = Array.isArray(trial.phases) ? trial.phases : [];
    trial.phases = [
      ...currentPhases,
      {
        name: 'phase',
        durationMs: 200,
        allowResponse: false,
        marksStimulusOnset: false,
      } satisfies ScheduledPhase,
    ];
  }

  function removePhase(index: number) {
    const currentPhases = Array.isArray(trial.phases) ? trial.phases : [];
    trial.phases = currentPhases.filter((_, i) => i !== index);
  }
</script>

<div class="phase-editor">
  <div class="phase-header">
    <span>Optional Phase Timeline</span>
    <button class="btn btn-secondary" type="button" onclick={addPhase}>Add Phase</button>
  </div>

  {#if !trial.phases || trial.phases.length === 0}
    <p class="help-text">No custom phases. Runtime uses fixation/stimulus/timeout fields.</p>
  {:else}
    <div class="phase-list">
      {#each trial.phases as phase, index}
        <div class="phase-row">
          <input class="input" type="text" bind:value={phase.name} placeholder="name" />
          <input class="input" type="number" min="0" max="30000" bind:value={phase.durationMs} />
          <label class="checkbox-label">
            <input class="checkbox" type="checkbox" bind:checked={phase.allowResponse} />
            <span>Allow Response</span>
          </label>
          <label class="checkbox-label">
            <input class="checkbox" type="checkbox" bind:checked={phase.marksStimulusOnset} />
            <span>Mark Onset</span>
          </label>
          <button class="remove-btn" type="button" onclick={() => removePhase(index)}>✕</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .phase-editor {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 0.5rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .phase-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
  }

  .phase-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .phase-row {
    display: grid;
    grid-template-columns: 1.4fr 1fr auto auto auto;
    gap: 0.5rem;
    align-items: center;
  }

  .checkbox-label {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  @media (max-width: 860px) {
    .phase-row {
      grid-template-columns: 1fr;
    }
  }
</style>
