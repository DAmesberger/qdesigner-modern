<script lang="ts">
  import type { ReactionStudyTrialTemplate } from '../model/reaction-schema';

  interface Props {
    trial: ReactionStudyTrialTemplate;
  }

  let { trial = $bindable() }: Props = $props();

  const validKeysText = $derived((trial.validKeys || []).join(', '));

  function updateValidKeys(value: string) {
    const keys = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    trial.validKeys = keys;
  }
</script>

<div class="response-grid">
  <div class="form-group">
    <span class="label-text">Valid Keys (comma separated)</span>
    <input
      class="input"
      type="text"
      value={validKeysText}
      oninput={(event) => updateValidKeys((event.currentTarget as HTMLInputElement).value)}
      placeholder="f, j"
    />
  </div>

  <div class="form-group">
    <span class="label-text">Correct Response</span>
    <input class="input" type="text" bind:value={trial.correctResponse} placeholder="e.g. f" />
  </div>

  <div class="form-group checkbox-wrap">
    <label class="checkbox-label">
      <input class="checkbox" type="checkbox" bind:checked={trial.requireCorrect} />
      <span>Require Correct Response</span>
    </label>
  </div>
</div>

<style>
  .response-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .checkbox-wrap {
    display: flex;
    align-items: flex-end;
  }

  .checkbox-label {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
</style>
