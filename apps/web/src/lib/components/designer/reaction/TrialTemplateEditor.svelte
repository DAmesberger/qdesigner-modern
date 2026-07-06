<script lang="ts">
  import ResponseMappingEditor from './ResponseMappingEditor.svelte';
  import PhaseTimelineEditor from './PhaseTimelineEditor.svelte';
  import StimulusKindEditor from './StimulusKindEditor.svelte';
  import type { ReactionStudyTrialTemplate } from '$lib/modules/questions/reaction-time/model/reaction-schema';
  import type { ReactionStimulusConfig } from '$lib/runtime/reaction';
  import { framesForDurationMs, durationMsForFrames } from '$lib/runtime/reaction';
  import { TimingGatekeeper } from '$lib/runtime/timing';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    trial: ReactionStudyTrialTemplate;
    index: number;
    onRemove: (index: number) => void;
    /**
     * Optional immutable-commit affordance (P6-T5). Fired after any field or
     * stimulus mutation, alongside the `$bindable` trial reassignment, so a
     * non-`bind:` consumer can commit the change.
     */
    onUpdate?: (trial: ReactionStudyTrialTemplate) => void;
  }

  let { trial = $bindable(), index, onRemove, onUpdate }: Props = $props();

  function emit() {
    onUpdate?.(trial);
  }

  const stimulusKind = $derived.by(() => {
    if (typeof trial.stimulus === 'object' && trial.stimulus?.kind) {
      return trial.stimulus.kind;
    }

    return 'text';
  });

  function setStimulus(next: ReactionStimulusConfig) {
    trial.stimulus = next;
    emit();
  }

  // Live ms⇄frames conversion hint (E-REACT-3). Durations can be authored in ms
  // OR frames; a frame count removes the stimulus on the exact vsync boundary
  // (drift-free brief-exposure / masking / RSVP). Prefer the session's qualified
  // mean frame interval; fall back to a 60Hz assumption when unqualified.
  const frameIntervalMs = $derived.by(() => {
    const measured = TimingGatekeeper.shared().getMeanFrameIntervalMs();
    return measured > 0 ? measured : 1000 / 60;
  });
  const refreshHz = $derived(Math.round(1000 / frameIntervalMs));

  function conversionHint(ms?: number, frames?: number): string {
    const hz = refreshHz;
    if (frames && frames > 0) {
      return `≈ ${Math.round(durationMsForFrames(frames, frameIntervalMs))} ms at ${hz} Hz`;
    }
    if (ms && ms > 0) {
      return `≈ ${framesForDurationMs(ms, frameIntervalMs)} frames at ${hz} Hz`;
    }
    return '';
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="trial-card" oninput={emit} onchange={emit}>
  <div class="trial-top">
    <h6>Trial {index + 1}</h6>
    <button class="remove-btn" type="button" onclick={() => onRemove(index)}>✕</button>
  </div>

  <div class="form-grid">
    <div class="form-group">
      <span class="label-text">Trial ID</span>
      <input class="input" type="text" bind:value={trial.id} />
    </div>
    <div class="form-group">
      <span class="label-text">Label</span>
      <input class="input" type="text" bind:value={trial.name} placeholder="optional" />
    </div>
    <div class="form-group">
      <span class="label-text">Condition</span>
      <input class="input" type="text" bind:value={trial.condition} placeholder="e.g. congruent" />
    </div>
    <div class="form-group">
      <span class="label-text">Repeat</span>
      <input class="input" type="number" min="1" max="500" bind:value={trial.repeat} />
    </div>
  </div>

  <div class="form-grid compact-grid">
    <div class="form-group checkbox-wrap">
      <label class="checkbox-label">
        <input class="checkbox" type="checkbox" bind:checked={trial.isTarget} />
        <span>Target Trial</span>
      </label>
    </div>
    <div class="form-group checkbox-wrap">
      <label class="checkbox-label">
        <input class="checkbox" type="checkbox" bind:checked={trial.isPractice} />
        <span>Practice Trial</span>
      </label>
    </div>
  </div>

  <div class="stimulus-panel">
    <div class="panel-title">Stimulus</div>

    <StimulusKindEditor kind={stimulusKind} onChange={setStimulus} />

    {#if typeof trial.stimulus === 'string'}
      <div class="form-group">
        <span class="label-text">Text</span>
        <input class="input" type="text" bind:value={trial.stimulus} />
      </div>
    {:else if trial.stimulus?.kind === 'text'}
      <div class="form-grid compact-grid">
        <div class="form-group">
          <span class="label-text">Text</span>
          <input class="input" type="text" bind:value={trial.stimulus.text} />
        </div>
        <div class="form-group">
          <span class="label-text">Font (px)</span>
          <input class="input" type="number" min="8" max="240" bind:value={trial.stimulus.fontPx} />
        </div>
      </div>
    {:else if trial.stimulus?.kind === 'shape'}
      <div class="form-grid compact-grid">
        <div class="form-group">
          <span class="label-text">Shape</span>
          <Select bind:value={trial.stimulus.shape}>
            <option value="circle">Circle</option>
            <option value="square">Square</option>
            <option value="rectangle">Rectangle</option>
            <option value="triangle">Triangle</option>
          </Select>
        </div>
        <div class="form-group">
          <span class="label-text">Radius (px)</span>
          <input class="input" type="number" min="1" max="600" bind:value={trial.stimulus.radiusPx} />
        </div>
      </div>
    {:else if trial.stimulus?.kind === 'image' || trial.stimulus?.kind === 'video' || trial.stimulus?.kind === 'audio'}
      <div class="form-group">
        <span class="label-text">Source URL</span>
        <input class="input" type="text" bind:value={trial.stimulus.src} placeholder="https://..." />
      </div>
    {/if}
  </div>

  <div class="timing-grid">
    <div class="form-group">
      <span class="label-text">Fixation (ms)</span>
      <input class="input" type="number" min="0" max="30000" bind:value={trial.fixationMs} />
    </div>
    <div class="form-group">
      <span class="label-text">Cue Delay (ms)</span>
      <input class="input" type="number" min="0" max="30000" bind:value={trial.preStimulusDelayMs} />
      {#if !trial.preStimulusDelayFrames && trial.preStimulusDelayMs}
        <span class="hint">{conversionHint(trial.preStimulusDelayMs, undefined)}</span>
      {/if}
    </div>
    <div class="form-group">
      <span class="label-text">Cue Delay (frames)</span>
      <input class="input" type="number" min="0" max="1800" bind:value={trial.preStimulusDelayFrames} />
      {#if trial.preStimulusDelayFrames}
        <span class="hint">{conversionHint(undefined, trial.preStimulusDelayFrames)} · overrides ms</span>
      {/if}
    </div>
    <div class="form-group">
      <span class="label-text">Stimulus Duration (ms)</span>
      <input class="input" type="number" min="0" max="30000" bind:value={trial.stimulusDurationMs} />
      {#if !trial.stimulusDurationFrames && trial.stimulusDurationMs}
        <span class="hint">{conversionHint(trial.stimulusDurationMs, undefined)}</span>
      {/if}
    </div>
    <div class="form-group">
      <span class="label-text">Stimulus Duration (frames)</span>
      <input class="input" type="number" min="0" max="1800" bind:value={trial.stimulusDurationFrames} />
      {#if trial.stimulusDurationFrames}
        <span class="hint">{conversionHint(undefined, trial.stimulusDurationFrames)} · frame-accurate offset</span>
      {/if}
    </div>
    <div class="form-group">
      <span class="label-text">Response Timeout (ms)</span>
      <input class="input" type="number" min="1" max="30000" bind:value={trial.responseTimeoutMs} />
    </div>
    <div class="form-group">
      <span class="label-text">Inter-Trial Interval (ms)</span>
      <input class="input" type="number" min="0" max="30000" bind:value={trial.interTrialIntervalMs} />
    </div>
  </div>

  <ResponseMappingEditor bind:trial {onUpdate} />
  <PhaseTimelineEditor bind:trial {onUpdate} />
</div>

<style>
  .trial-card {
    border: 1px solid var(--border-color, #dbe2ea);
    border-radius: 0.75rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--bg-subtle, #f8fafc);
  }

  .trial-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .trial-top h6 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.6rem;
  }

  .compact-grid {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .hint {
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
    margin-top: 0.15rem;
  }

  .checkbox-wrap {
    display: flex;
    align-items: center;
  }

  .checkbox-label {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .stimulus-panel {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 0.5rem;
    padding: 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .panel-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-muted, #475569);
  }

  .timing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.5rem;
  }
</style>
