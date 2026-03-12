<script lang="ts">
  import ResponseMappingEditor from './ResponseMappingEditor.svelte';
  import PhaseTimelineEditor from './PhaseTimelineEditor.svelte';
  import type { ReactionStudyTrialTemplate } from '../model/reaction-schema';
  import type { ReactionStimulusConfig } from '$lib/runtime/reaction';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    trial: ReactionStudyTrialTemplate;
    index: number;
    onRemove: (index: number) => void;
  }

  let { trial = $bindable(), index, onRemove }: Props = $props();

  const stimulusKind = $derived(() => {
    if (typeof trial.stimulus === 'object' && trial.stimulus?.kind) {
      return trial.stimulus.kind;
    }

    return 'text';
  });

  function setStimulusKind(kind: ReactionStimulusConfig['kind']) {
    if (kind === 'text') {
      trial.stimulus = {
        kind: 'text',
        text: 'GO',
        fontPx: 64,
      };
      return;
    }

    if (kind === 'shape') {
      trial.stimulus = {
        kind: 'shape',
        shape: 'circle',
        radiusPx: 80,
      };
      return;
    }

    if (kind === 'image') {
      trial.stimulus = {
        kind: 'image',
        src: '',
        widthPx: 360,
        heightPx: 360,
      };
      return;
    }

    if (kind === 'video') {
      trial.stimulus = {
        kind: 'video',
        src: '',
        autoplay: true,
        muted: true,
        widthPx: 640,
        heightPx: 360,
      };
      return;
    }

    if (kind === 'audio') {
      trial.stimulus = {
        kind: 'audio',
        src: '',
        autoplay: true,
        volume: 1,
      };
      return;
    }

    trial.stimulus = {
      kind: 'custom',
      shader: '',
      vertices: [],
      uniforms: {},
    };
  }
</script>

<div class="trial-card">
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

    <div class="form-group">
      <span class="label-text">Kind</span>
      <select class="block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-foreground bg-background shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6" value={stimulusKind()} onchange={(e) => setStimulusKind((e.currentTarget as HTMLSelectElement).value as ReactionStimulusConfig['kind'])}>
        <option value="text">Text</option>
        <option value="shape">Shape</option>
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="audio">Audio</option>
      </select>
    </div>

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
    </div>
    <div class="form-group">
      <span class="label-text">Stimulus Duration (ms)</span>
      <input class="input" type="number" min="0" max="30000" bind:value={trial.stimulusDurationMs} />
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

  <ResponseMappingEditor bind:trial />
  <PhaseTimelineEditor bind:trial />
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
