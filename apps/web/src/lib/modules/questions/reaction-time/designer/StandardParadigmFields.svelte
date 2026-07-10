<script lang="ts">
  import type { Question } from '$lib/shared';
  import type { ReactionTimeConfig } from '../model/designer-config';
  import {
    validateReactionTask,
    issueFor,
  } from '$lib/components/designer/validation/scientificRules';
  import TimingSpecField from './TimingSpecField.svelte';

  // Per-task-type configuration UI for the standard-paradigm library expansion
  // (E-REACT-2): Go/No-Go, SART, Simon, Posner, visual search, Sternberg, PVT,
  // temporal-order and RSVP. Mirrors the shared sub-editor pattern from P6-T5 —
  // it binds directly into the question config the parent owns.
  interface Props {
    question: Question & { config: ReactionTimeConfig };
  }

  let { question = $bindable() }: Props = $props();

  const task = $derived(question.config.task);

  // Inline scientific-validity checks (R4-4). Recomputed on every edit so the
  // researcher sees bad timing/ratios/counts as they type, not at publish.
  const issues = $derived(validateReactionTask(task));
  const errorFields = $derived(
    new Set(issues.filter((i) => i.severity === 'error').map((i) => i.field))
  );

  function parseNumberList(value: string): number[] {
    return value
      .split(',')
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isFinite(entry));
  }

  function parseStringList(value: string): string[] {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
</script>

{#snippet fieldMsg(field: string)}
  {@const issue = issueFor(issues, field)}
  {#if issue}
    <p class="field-msg {issue.severity}" role={issue.severity === 'error' ? 'alert' : undefined}>
      {issue.message}
    </p>
  {/if}
{/snippet}

{#if task.type === 'go-nogo'}
  <div class="mt-4 pl-4">
    <h5 class="mb-2 text-sm font-medium text-muted-foreground">Go / No-Go Configuration</h5>
    <p class="mt-1 text-xs text-muted-foreground">
      A prepotent "go" response is built up by frequent go trials; the participant withholds on the
      rarer no-go signal. Scored for commission/omission errors and SSRT.
    </p>
    <div class="grid grid-cols-2 gap-3">
      <div class="mb-4">
        <label for="gonogo-trials">Trial Count</label>
        <input id="gonogo-trials" type="number" min="1" max="1000" bind:value={task.goNoGo.trialCount} class="input" class:invalid={errorFields.has('goNoGo.trialCount')} />
        {@render fieldMsg('goNoGo.trialCount')}
      </div>
      <div class="mb-4">
        <label for="gonogo-ratio">Go Ratio</label>
        <input id="gonogo-ratio" type="number" min="0" max="1" step="0.05" bind:value={task.goNoGo.goRatio} class="input" class:invalid={errorFields.has('goNoGo.goRatio')} />
        {@render fieldMsg('goNoGo.goRatio')}
      </div>
      <div class="mb-4">
        <label for="gonogo-go">Go Label</label>
        <input id="gonogo-go" type="text" bind:value={task.goNoGo.goStimulus} class="input" />
      </div>
      <div class="mb-4">
        <label for="gonogo-nogo">No-Go Label</label>
        <input id="gonogo-nogo" type="text" bind:value={task.goNoGo.noGoStimulus} class="input" />
      </div>
      <div class="mb-4">
        <label for="gonogo-key">Response Key</label>
        <input id="gonogo-key" type="text" bind:value={task.goNoGo.responseKey} class="input" />
      </div>
      <div class="mb-4">
        <TimingSpecField id="gonogo-timeout" label="Response Timeout (ms)" bind:value={task.goNoGo.responseTimeoutMs} min={100} max={20000} step={10} fixedDefault={1000} invalid={errorFields.has('goNoGo.responseTimeoutMs')} />
        {@render fieldMsg('goNoGo.responseTimeoutMs')}
      </div>
    </div>
  </div>
{/if}

{#if task.type === 'sart'}
  <div class="mt-4 pl-4">
    <h5 class="mb-2 text-sm font-medium text-muted-foreground">SART Configuration</h5>
    <p class="mt-1 text-xs text-muted-foreground">
      Respond to a stream of digits, withholding on the rare target digit. Sustained-attention
      inverse of Go/No-Go.
    </p>
    <div class="grid grid-cols-2 gap-3">
      <div class="mb-4">
        <label for="sart-trials">Trial Count</label>
        <input id="sart-trials" type="number" min="1" max="2000" bind:value={task.sart.trialCount} class="input" class:invalid={errorFields.has('sart.trialCount')} />
        {@render fieldMsg('sart.trialCount')}
      </div>
      <div class="mb-4">
        <label for="sart-target">Target (No-Go) Digit</label>
        <input id="sart-target" type="number" min="0" max="9" bind:value={task.sart.targetDigit} class="input" class:invalid={errorFields.has('sart.targetDigit')} />
        {@render fieldMsg('sart.targetDigit')}
      </div>
      <div class="mb-4">
        <label for="sart-key">Response Key</label>
        <input id="sart-key" type="text" bind:value={task.sart.responseKey} class="input" />
      </div>
      <div class="mb-4">
        <TimingSpecField id="sart-duration" label="Digit Duration (ms)" bind:value={task.sart.stimulusDuration} min={0} max={5000} step={10} fixedDefault={250} invalid={errorFields.has('sart.stimulusDuration')} />
        {@render fieldMsg('sart.stimulusDuration')}
      </div>
    </div>
  </div>
{/if}

{#if task.type === 'simon'}
  <div class="mt-4 pl-4">
    <h5 class="mb-2 text-sm font-medium text-muted-foreground">Simon Configuration</h5>
    <p class="mt-1 text-xs text-muted-foreground">
      A colour cues the response key while the stimulus appears left/right. The Simon effect is the
      incongruent−congruent RT cost.
    </p>
    <div class="grid grid-cols-2 gap-3">
      <div class="mb-4">
        <label for="simon-trials">Trial Count</label>
        <input id="simon-trials" type="number" min="1" max="1000" bind:value={task.simon.trialCount} class="input" class:invalid={errorFields.has('simon.trialCount')} />
        {@render fieldMsg('simon.trialCount')}
      </div>
      <div class="mb-4">
        <label for="simon-ratio">Congruent Ratio</label>
        <input id="simon-ratio" type="number" min="0" max="1" step="0.05" bind:value={task.simon.congruentRatio} class="input" class:invalid={errorFields.has('simon.congruentRatio')} />
        {@render fieldMsg('simon.congruentRatio')}
      </div>
      <div class="mb-4">
        <label for="simon-left-color">Left Colour</label>
        <input id="simon-left-color" type="text" bind:value={task.simon.leftColor} class="input" />
      </div>
      <div class="mb-4">
        <label for="simon-right-color">Right Colour</label>
        <input id="simon-right-color" type="text" bind:value={task.simon.rightColor} class="input" />
      </div>
      <div class="mb-4">
        <label for="simon-left-key">Left Key</label>
        <input id="simon-left-key" type="text" bind:value={task.simon.leftKey} class="input" />
      </div>
      <div class="mb-4">
        <label for="simon-right-key">Right Key</label>
        <input id="simon-right-key" type="text" bind:value={task.simon.rightKey} class="input" />
      </div>
    </div>
  </div>
{/if}

{#if task.type === 'posner'}
  <div class="mt-4 pl-4">
    <h5 class="mb-2 text-sm font-medium text-muted-foreground">Posner Cueing Configuration</h5>
    <p class="mt-1 text-xs text-muted-foreground">
      A cue predicts the target side (valid) or mis-predicts it (invalid). The cueing effect is the
      invalid−valid RT cost.
    </p>
    <div class="grid grid-cols-2 gap-3">
      <div class="mb-4">
        <label for="posner-trials">Trial Count</label>
        <input id="posner-trials" type="number" min="1" max="1000" bind:value={task.posner.trialCount} class="input" class:invalid={errorFields.has('posner.trialCount')} />
        {@render fieldMsg('posner.trialCount')}
      </div>
      <div class="mb-4">
        <label for="posner-valid">Valid Ratio</label>
        <input id="posner-valid" type="number" min="0" max="1" step="0.05" bind:value={task.posner.validRatio} class="input" class:invalid={errorFields.has('posner.validRatio')} />
        {@render fieldMsg('posner.validRatio')}
      </div>
      <div class="mb-4">
        <TimingSpecField id="posner-cue" label="Cue Duration (ms)" bind:value={task.posner.cueDurationMs} min={0} max={5000} step={10} fixedDefault={100} invalid={errorFields.has('posner.cueDurationMs')} />
        {@render fieldMsg('posner.cueDurationMs')}
      </div>
      <div class="mb-4">
        <TimingSpecField id="posner-soa" label="Cue→Target SOA (ms)" bind:value={task.posner.soaMs} min={0} max={5000} step={10} fixedDefault={200} invalid={errorFields.has('posner.soaMs')} />
        {@render fieldMsg('posner.soaMs')}
      </div>
      <div class="mb-4">
        <label for="posner-left-key">Left Key</label>
        <input id="posner-left-key" type="text" bind:value={task.posner.leftKey} class="input" />
      </div>
      <div class="mb-4">
        <label for="posner-right-key">Right Key</label>
        <input id="posner-right-key" type="text" bind:value={task.posner.rightKey} class="input" />
      </div>
    </div>
  </div>
{/if}

{#if task.type === 'visual-search'}
  <div class="mt-4 pl-4">
    <h5 class="mb-2 text-sm font-medium text-muted-foreground">Visual Search Configuration</h5>
    <p class="mt-1 text-xs text-muted-foreground">
      Report whether a target is present among distractors. RT scales with set size; the search
      slope (ms/item) indexes search efficiency.
    </p>
    <div class="grid grid-cols-2 gap-3">
      <div class="mb-4">
        <label for="search-trials">Trial Count</label>
        <input id="search-trials" type="number" min="1" max="1000" bind:value={task.visualSearch.trialCount} class="input" class:invalid={errorFields.has('visualSearch.trialCount')} />
        {@render fieldMsg('visualSearch.trialCount')}
      </div>
      <div class="mb-4">
        <label for="search-sizes">Set Sizes (comma-separated)</label>
        <input
          id="search-sizes"
          type="text"
          value={task.visualSearch.setSizes.join(', ')}
          onchange={(e) => (task.visualSearch.setSizes = parseNumberList(e.currentTarget.value))}
          class="input"
          class:invalid={errorFields.has('visualSearch.setSizes')}
        />
        {@render fieldMsg('visualSearch.setSizes')}
      </div>
      <div class="mb-4">
        <label for="search-present-ratio">Target-Present Ratio</label>
        <input id="search-present-ratio" type="number" min="0" max="1" step="0.05" bind:value={task.visualSearch.targetPresentRatio} class="input" class:invalid={errorFields.has('visualSearch.targetPresentRatio')} />
        {@render fieldMsg('visualSearch.targetPresentRatio')}
      </div>
      <div class="mb-4">
        <label for="search-present-key">Present Key</label>
        <input id="search-present-key" type="text" bind:value={task.visualSearch.presentKey} class="input" />
      </div>
      <div class="mb-4">
        <label for="search-absent-key">Absent Key</label>
        <input id="search-absent-key" type="text" bind:value={task.visualSearch.absentKey} class="input" />
      </div>
      <div class="mb-4">
        <label class="flex items-center gap-2 cursor-pointer" style="margin-top: 1.75rem;">
          <input type="checkbox" bind:checked={task.visualSearch.featureSearch} class="w-4 h-4 cursor-pointer" />
          <span>Feature (pop-out) search</span>
        </label>
      </div>
    </div>
  </div>
{/if}

{#if task.type === 'sternberg'}
  <div class="mt-4 pl-4">
    <h5 class="mb-2 text-sm font-medium text-muted-foreground">Sternberg Configuration</h5>
    <p class="mt-1 text-xs text-muted-foreground">
      Study a memory set, then judge whether a probe was in it. RT rises with set size; the slope
      (ms/item) indexes the memory scan rate.
    </p>
    <div class="grid grid-cols-2 gap-3">
      <div class="mb-4">
        <label for="sternberg-trials">Trial Count</label>
        <input id="sternberg-trials" type="number" min="1" max="1000" bind:value={task.sternberg.trialCount} class="input" class:invalid={errorFields.has('sternberg.trialCount')} />
        {@render fieldMsg('sternberg.trialCount')}
      </div>
      <div class="mb-4">
        <label for="sternberg-sizes">Set Sizes (comma-separated)</label>
        <input
          id="sternberg-sizes"
          type="text"
          value={task.sternberg.setSizes.join(', ')}
          onchange={(e) => (task.sternberg.setSizes = parseNumberList(e.currentTarget.value))}
          class="input"
          class:invalid={errorFields.has('sternberg.setSizes')}
        />
        {@render fieldMsg('sternberg.setSizes')}
      </div>
      <div class="mb-4">
        <TimingSpecField id="sternberg-encoding" label="Per-Item Study (ms)" bind:value={task.sternberg.encodingMs} min={0} max={10000} step={10} fixedDefault={400} invalid={errorFields.has('sternberg.encodingMs')} />
        {@render fieldMsg('sternberg.encodingMs')}
      </div>
      <div class="mb-4">
        <TimingSpecField id="sternberg-retention" label="Retention (ms)" bind:value={task.sternberg.retentionMs} min={0} max={20000} step={10} fixedDefault={1000} invalid={errorFields.has('sternberg.retentionMs')} />
        {@render fieldMsg('sternberg.retentionMs')}
      </div>
      <div class="mb-4">
        <label for="sternberg-present-key">In-Set Key</label>
        <input id="sternberg-present-key" type="text" bind:value={task.sternberg.presentKey} class="input" />
      </div>
      <div class="mb-4">
        <label for="sternberg-absent-key">Out-of-Set Key</label>
        <input id="sternberg-absent-key" type="text" bind:value={task.sternberg.absentKey} class="input" />
      </div>
    </div>
  </div>
{/if}

{#if task.type === 'pvt'}
  <div class="mt-4 pl-4">
    <h5 class="mb-2 text-sm font-medium text-muted-foreground">PVT Configuration</h5>
    <p class="mt-1 text-xs text-muted-foreground">
      After a random 2–10 s wait, a target appears; respond as fast as possible. Scored for lapses
      (≥500 ms) and mean 1/RT.
    </p>
    <div class="grid grid-cols-2 gap-3">
      <div class="mb-4">
        <label for="pvt-trials">Trial Count</label>
        <input id="pvt-trials" type="number" min="1" max="1000" bind:value={task.pvt.trialCount} class="input" class:invalid={errorFields.has('pvt.trialCount')} />
        {@render fieldMsg('pvt.trialCount')}
      </div>
      <div class="mb-4">
        <label for="pvt-key">Response Key</label>
        <input id="pvt-key" type="text" bind:value={task.pvt.responseKey} class="input" />
      </div>
      <div class="mb-4">
        <TimingSpecField id="pvt-isi" label="Foreperiod / ISI (ms)" bind:value={task.pvt.isi} min={0} max={60000} step={100} fixedDefault={2000} invalid={errorFields.has('pvt.isi')} />
        {@render fieldMsg('pvt.isi')}
      </div>
    </div>
  </div>
{/if}

{#if task.type === 'temporal-order'}
  <div class="mt-4 pl-4">
    <h5 class="mb-2 text-sm font-medium text-muted-foreground">Temporal-Order Configuration</h5>
    <p class="mt-1 text-xs text-muted-foreground">
      Two flashes separated by an SOA; judge which came first. The JND is recovered from the
      psychometric function across SOAs.
    </p>
    <div class="grid grid-cols-2 gap-3">
      <div class="mb-4">
        <label for="toj-trials">Trial Count</label>
        <input id="toj-trials" type="number" min="1" max="1000" bind:value={task.temporalOrder.trialCount} class="input" class:invalid={errorFields.has('temporalOrder.trialCount')} />
        {@render fieldMsg('temporalOrder.trialCount')}
      </div>
      <div class="mb-4">
        <label for="toj-soas">SOAs (ms, comma-separated)</label>
        <input
          id="toj-soas"
          type="text"
          value={task.temporalOrder.soaSetMs.join(', ')}
          onchange={(e) => (task.temporalOrder.soaSetMs = parseNumberList(e.currentTarget.value))}
          class="input"
          class:invalid={errorFields.has('temporalOrder.soaSetMs')}
        />
        {@render fieldMsg('temporalOrder.soaSetMs')}
      </div>
      <div class="mb-4">
        <label for="toj-first-key">Left-First Key</label>
        <input id="toj-first-key" type="text" bind:value={task.temporalOrder.firstKey} class="input" />
      </div>
      <div class="mb-4">
        <label for="toj-second-key">Right-First Key</label>
        <input id="toj-second-key" type="text" bind:value={task.temporalOrder.secondKey} class="input" />
      </div>
    </div>
  </div>
{/if}

{#if task.type === 'rsvp'}
  <div class="mt-4 pl-4">
    <h5 class="mb-2 text-sm font-medium text-muted-foreground">RSVP Configuration</h5>
    <p class="mt-1 text-xs text-muted-foreground">
      A rapid stream of items with an embedded target to detect. Item exposure is frame-scheduled
      for trustworthy rapid-serial timing.
    </p>
    <div class="grid grid-cols-2 gap-3">
      <div class="mb-4">
        <label for="rsvp-trials">Trial Count</label>
        <input id="rsvp-trials" type="number" min="1" max="1000" bind:value={task.rsvp.trialCount} class="input" class:invalid={errorFields.has('rsvp.trialCount')} />
        {@render fieldMsg('rsvp.trialCount')}
      </div>
      <div class="mb-4">
        <label for="rsvp-stream">Stream Length</label>
        <input id="rsvp-stream" type="number" min="1" max="100" bind:value={task.rsvp.streamLength} class="input" class:invalid={errorFields.has('rsvp.streamLength')} />
        {@render fieldMsg('rsvp.streamLength')}
      </div>
      <div class="mb-4">
        <TimingSpecField id="rsvp-item" label="Item Duration (ms)" bind:value={task.rsvp.itemDurationMs} min={10} max={2000} step={10} fixedDefault={100} invalid={errorFields.has('rsvp.itemDurationMs')} />
        {@render fieldMsg('rsvp.itemDurationMs')}
      </div>
      <div class="mb-4">
        <label for="rsvp-key">Target Key</label>
        <input id="rsvp-key" type="text" bind:value={task.rsvp.targetKey} class="input" />
      </div>
      <div class="mb-4">
        <label for="rsvp-targets">Target Set (comma-separated)</label>
        <input
          id="rsvp-targets"
          type="text"
          value={task.rsvp.targetSet.join(', ')}
          onchange={(e) => (task.rsvp.targetSet = parseStringList(e.currentTarget.value))}
          class="input"
          class:invalid={errorFields.has('rsvp.targetSet')}
        />
        {@render fieldMsg('rsvp.targetSet')}
      </div>
      <div class="mb-4">
        <label for="rsvp-distractors">Distractor Set (comma-separated)</label>
        <input
          id="rsvp-distractors"
          type="text"
          value={task.rsvp.distractorSet.join(', ')}
          onchange={(e) => (task.rsvp.distractorSet = parseStringList(e.currentTarget.value))}
          class="input"
        />
      </div>
    </div>
  </div>
{/if}

<style>
  .input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    transition: all 0.15s;
  }

  .input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .input.invalid {
    border-color: hsl(var(--destructive));
  }

  .input.invalid:focus {
    box-shadow: 0 0 0 3px hsl(var(--destructive) / 0.1);
  }

  .field-msg {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    line-height: 1.1rem;
  }

  .field-msg.error {
    color: hsl(var(--destructive));
  }

  .field-msg.warning {
    color: hsl(var(--warning));
  }
</style>
