<script lang="ts">
  import type { Question } from '$lib/shared';
  import type { ReactionTimeConfig } from '../model/designer-config';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import TimingSpecField from './TimingSpecField.svelte';
  import {
    validateReactionTask,
    issueFor,
  } from '$lib/components/designer/validation/scientificRules';

  // Per-task-type configuration UI extracted from ReactionTimeDesigner (P6-T5).
  // Receives the bindable question so the nested `bind:value` inputs mutate the
  // same config the parent owns; the parent shrinks toward per-task orchestration.
  interface Props {
    question: Question & { config: ReactionTimeConfig };
  }

  let { question = $bindable() }: Props = $props();

  // Inline scientific-validity checks (R4-4), matching StandardParadigmFields so
  // the TimingSpec jitter controls surface min/max errors as the researcher types.
  const issues = $derived(validateReactionTask(question.config.task));
  const errorFields = $derived(
    new Set(issues.filter((i) => i.severity === 'error').map((i) => i.field))
  );

  let newNBackStimulus = $state('');
  let newStroopColor = $state('');
  let newIatItem = $state('');
  let iatItemTarget = $state<'cat1' | 'cat2' | 'attr1' | 'attr2'>('cat1');
  let newDotProbeSalient = $state('');
  let newDotProbeNeutral = $state('');

  function addNBackStimulus() {
    const value = newNBackStimulus.trim();
    if (!value || !question.config.task?.nBack) return;

    const set = question.config.task.nBack.stimulusSet || [];
    if (!set.includes(value)) {
      question.config.task.nBack.stimulusSet = [...set, value];
    }
    newNBackStimulus = '';
  }

  function removeNBackStimulus(value: string) {
    const set = question.config.task?.nBack?.stimulusSet || [];
    question.config.task!.nBack!.stimulusSet = set.filter((entry) => entry !== value);
  }

  function addStroopColor() {
    const value = newStroopColor.trim().toLowerCase();
    if (!value || !question.config.task?.stroop) return;
    const colors = question.config.task.stroop.colors || [];
    if (!colors.includes(value)) {
      question.config.task.stroop.colors = [...colors, value];
    }
    newStroopColor = '';
  }

  function removeStroopColor(value: string) {
    const colors = question.config.task?.stroop?.colors || [];
    question.config.task!.stroop!.colors = colors.filter((c) => c !== value);
  }

  function addIatItem() {
    const value = newIatItem.trim();
    if (!value || !question.config.task?.iat) return;
    const iat = question.config.task.iat;
    const targetMap = {
      cat1: 'category1Items',
      cat2: 'category2Items',
      attr1: 'attribute1Items',
      attr2: 'attribute2Items',
    } as const;
    const key = targetMap[iatItemTarget];
    const items = iat[key] || [];
    if (!items.includes(value)) {
      iat[key] = [...items, value];
    }
    newIatItem = '';
  }

  function removeIatItem(target: 'category1Items' | 'category2Items' | 'attribute1Items' | 'attribute2Items', value: string) {
    if (!question.config.task?.iat) return;
    const items = question.config.task.iat[target] || [];
    question.config.task.iat[target] = items.filter((i) => i !== value);
  }

  function addDotProbePair() {
    const salient = newDotProbeSalient.trim();
    const neutral = newDotProbeNeutral.trim();
    if (!salient || !neutral || !question.config.task?.dotProbe) return;
    question.config.task.dotProbe.stimulusPairs = [
      ...question.config.task.dotProbe.stimulusPairs,
      { salient, neutral },
    ];
    newDotProbeSalient = '';
    newDotProbeNeutral = '';
  }

  function removeDotProbePair(index: number) {
    if (!question.config.task?.dotProbe) return;
    question.config.task.dotProbe.stimulusPairs = question.config.task.dotProbe.stimulusPairs.filter(
      (_, i) => i !== index
    );
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

    {#if question.config.task.type === 'n-back'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">N-Back Configuration</h5>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="nback-n">N</label>
            <input
              id="nback-n"
              type="number"
              min="1"
              max="6"
              bind:value={question.config.task.nBack.n}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="nback-sequence-length">Sequence Length</label>
            <input
              id="nback-sequence-length"
              type="number"
              min="3"
              max="500"
              bind:value={question.config.task.nBack.sequenceLength}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="nback-target-rate">Target Rate</label>
            <input
              id="nback-target-rate"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={question.config.task.nBack.targetRate}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="nback-target-key">Target Key</label>
            <input
              id="nback-target-key"
              type="text"
              bind:value={question.config.task.nBack.targetKey}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="nback-non-target-key">Non-Target Key</label>
            <input
              id="nback-non-target-key"
              type="text"
              bind:value={question.config.task.nBack.nonTargetKey}
              class="input"
            />
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="nback-fixation-ms"
              label="Fixation (ms)"
              bind:value={question.config.task.nBack.fixationMs}
              min={0}
              max={5000}
              step={10}
              fixedDefault={400}
              invalid={errorFields.has('nBack.fixationMs')}
            />
            {@render fieldMsg('nBack.fixationMs')}
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="nback-timeout-ms"
              label="Response Timeout (ms)"
              bind:value={question.config.task.nBack.responseTimeoutMs}
              min={100}
              max={10000}
              step={10}
              fixedDefault={1200}
              invalid={errorFields.has('nBack.responseTimeoutMs')}
            />
            {@render fieldMsg('nBack.responseTimeoutMs')}
          </div>
        </div>

        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Stimulus Set</span>
          <div class="flex gap-2 mb-2">
            <input
              type="text"
              bind:value={newNBackStimulus}
              placeholder="e.g., A"
              class="input"
              onkeydown={(e) => e.key === 'Enter' && addNBackStimulus()}
            />
            <Button variant="secondary" size="sm" onclick={addNBackStimulus} disabled={!newNBackStimulus}
              >Add</Button
            >
          </div>
          <div class="flex flex-wrap gap-2 mt-2">
            {#each question.config.task.nBack.stimulusSet || [] as item}
              <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md">
                <span class="font-mono text-sm font-medium text-foreground">{item}</span>
                <button class="remove-btn" onclick={() => removeNBackStimulus(item)}>✕</button>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#if question.config.task.type === 'stroop'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">Stroop Configuration</h5>
        <p class="mt-1 text-xs text-muted-foreground">
          Color words displayed in congruent or incongruent ink colors. Participants respond to the ink color, not the word.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="stroop-trial-count">Trial Count</label>
            <input
              id="stroop-trial-count"
              type="number"
              min="4"
              max="500"
              bind:value={question.config.task.stroop.trialCount}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="stroop-congruent-ratio">Congruent Ratio</label>
            <input
              id="stroop-congruent-ratio"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={question.config.task.stroop.congruentRatio}
              class="input"
            />
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="stroop-fixation-ms"
              label="Fixation (ms)"
              bind:value={question.config.task.stroop.fixationMs}
              min={0}
              max={5000}
              step={10}
              fixedDefault={500}
              invalid={errorFields.has('stroop.fixationMs')}
            />
            {@render fieldMsg('stroop.fixationMs')}
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="stroop-timeout-ms"
              label="Response Timeout (ms)"
              bind:value={question.config.task.stroop.responseTimeoutMs}
              min={100}
              max={10000}
              step={10}
              fixedDefault={2000}
              invalid={errorFields.has('stroop.responseTimeoutMs')}
            />
            {@render fieldMsg('stroop.responseTimeoutMs')}
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="stroop-isi"
              label="Inter-Stimulus Interval (ms)"
              bind:value={question.config.task.stroop.isi}
              min={0}
              max={5000}
              step={10}
              fixedDefault={250}
              invalid={errorFields.has('stroop.isi')}
            />
            {@render fieldMsg('stroop.isi')}
          </div>
        </div>

        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Colors</span>
          <div class="flex gap-2 mb-2">
            <input
              type="text"
              bind:value={newStroopColor}
              placeholder="e.g., red"
              class="input"
              onkeydown={(e) => e.key === 'Enter' && addStroopColor()}
            />
            <Button variant="secondary" size="sm" onclick={addStroopColor} disabled={!newStroopColor}>Add</Button>
          </div>
          <div class="flex flex-wrap gap-2 mt-2">
            {#each question.config.task.stroop.colors || [] as color}
              <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md">
                <span class="inline-block w-3.5 h-3.5 rounded border border-foreground/15 shrink-0" style="background-color: {color};"></span>
                <span class="font-mono text-sm font-medium text-foreground">{color}</span>
                <button class="remove-btn" onclick={() => removeStroopColor(color)}>&#10005;</button>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#if question.config.task.type === 'flanker'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">Flanker Configuration</h5>
        <p class="mt-1 text-xs text-muted-foreground">
          A central target surrounded by flankers. Congruent: flankers match target. Incongruent: flankers differ.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="flanker-trial-count">Trial Count</label>
            <input
              id="flanker-trial-count"
              type="number"
              min="4"
              max="500"
              bind:value={question.config.task.flanker.trialCount}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="flanker-congruent-ratio">Congruent Ratio</label>
            <input
              id="flanker-congruent-ratio"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={question.config.task.flanker.congruentRatio}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="flanker-count">Flankers per Side</label>
            <input
              id="flanker-count"
              type="number"
              min="1"
              max="6"
              bind:value={question.config.task.flanker.flankerCount}
              class="input"
            />
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="flanker-fixation-ms"
              label="Fixation (ms)"
              bind:value={question.config.task.flanker.fixationMs}
              min={0}
              max={5000}
              step={10}
              fixedDefault={500}
              invalid={errorFields.has('flanker.fixationMs')}
            />
            {@render fieldMsg('flanker.fixationMs')}
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="flanker-timeout-ms"
              label="Response Timeout (ms)"
              bind:value={question.config.task.flanker.responseTimeoutMs}
              min={100}
              max={10000}
              step={10}
              fixedDefault={1500}
              invalid={errorFields.has('flanker.responseTimeoutMs')}
            />
            {@render fieldMsg('flanker.responseTimeoutMs')}
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="flanker-isi"
              label="Inter-Stimulus Interval (ms)"
              bind:value={question.config.task.flanker.isi}
              min={0}
              max={5000}
              step={10}
              fixedDefault={250}
              invalid={errorFields.has('flanker.isi')}
            />
            {@render fieldMsg('flanker.isi')}
          </div>
        </div>

        <div class="mb-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={question.config.task.flanker.includeNeutral}
              class="w-4 h-4 cursor-pointer"
            />
            <span>Include neutral condition (e.g., --&lt;--)</span>
          </label>
        </div>

        {#if question.config.task.flanker.includeNeutral}
          <div class="mb-4">
            <label for="flanker-neutral-ratio">Neutral Ratio</label>
            <input
              id="flanker-neutral-ratio"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={question.config.task.flanker.neutralRatio}
              class="input"
            />
          </div>
        {/if}

        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Stimulus Characters</span>
          <div class="grid grid-cols-2 gap-3">
            <div class="mb-4">
              <label for="flanker-stim-0">Left Response</label>
              <input
                id="flanker-stim-0"
                type="text"
                maxlength="1"
                bind:value={question.config.task.flanker.stimulusSet[0]}
                class="input"
              />
            </div>
            <div class="mb-4">
              <label for="flanker-stim-1">Right Response</label>
              <input
                id="flanker-stim-1"
                type="text"
                maxlength="1"
                bind:value={question.config.task.flanker.stimulusSet[1]}
                class="input"
              />
            </div>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">
            Preview: {question.config.task.flanker.stimulusSet[0].repeat(question.config.task.flanker.flankerCount)}{question.config.task.flanker.stimulusSet[0]}{question.config.task.flanker.stimulusSet[0].repeat(question.config.task.flanker.flankerCount)} (congruent) |
            {question.config.task.flanker.stimulusSet[1].repeat(question.config.task.flanker.flankerCount)}{question.config.task.flanker.stimulusSet[0]}{question.config.task.flanker.stimulusSet[1].repeat(question.config.task.flanker.flankerCount)} (incongruent)
          </p>
        </div>
      </div>
    {/if}

    <!-- Stimulus Preview Panel -->
    {#if question.config.task.type === 'stroop' || question.config.task.type === 'flanker'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">Stimulus Preview</h5>
        <div class="bg-foreground border border-foreground rounded-lg p-5 overflow-hidden">
          {#if question.config.task.type === 'stroop'}
            {@const colors = question.config.task.stroop.colors || []}
            {@const congruent = colors.length >= 1}
            <div class="flex items-center gap-4 justify-center">
              <div class="text-3xl font-bold text-muted-foreground font-mono shrink-0">+</div>
              <div class="text-xl text-muted-foreground shrink-0">&#x2192;</div>
              <div class="flex flex-col gap-3">
                {#if congruent && colors.length >= 2}
                  <div class="flex items-center gap-3">
                    <span class="stroop-flanker-label">Congruent:</span>
                    <span class="stroop-word" style="color: {colors[0]}; font-size: 1.5rem; font-weight: 700;">
                      {(colors[0] ?? 'RED').toUpperCase()}
                    </span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="stroop-flanker-label">Incongruent:</span>
                    <span class="stroop-word" style="color: {colors[1]}; font-size: 1.5rem; font-weight: 700;">
                      {(colors[0] ?? 'RED').toUpperCase()}
                    </span>
                  </div>
                {:else}
                  <span class="text-muted-foreground text-[0.8125rem] italic">Add at least 2 colors to see preview</span>
                {/if}
              </div>
            </div>
          {:else if question.config.task.type === 'flanker'}
            {@const stim = question.config.task.flanker.stimulusSet}
            {@const n = question.config.task.flanker.flankerCount}
            <div class="flex items-center gap-4 justify-center">
              <div class="text-3xl font-bold text-muted-foreground font-mono shrink-0">+</div>
              <div class="text-xl text-muted-foreground shrink-0">&#x2192;</div>
              <div class="flex flex-col gap-3">
                <div class="flex items-center gap-3">
                  <span class="stroop-flanker-label">Congruent:</span>
                  <span class="flanker-display">{stim[0].repeat(n)}{stim[0]}{stim[0].repeat(n)}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="stroop-flanker-label">Incongruent:</span>
                  <span class="flanker-display">{stim[1].repeat(n)}{stim[0]}{stim[1].repeat(n)}</span>
                </div>
                {#if question.config.task.flanker.includeNeutral}
                  <div class="flex items-center gap-3">
                    <span class="stroop-flanker-label">Neutral:</span>
                    <span class="flanker-display">{'-'.repeat(n)}{stim[0]}{'-'.repeat(n)}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if question.config.task.type === 'iat'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">IAT Configuration</h5>
        <p class="mt-1 text-xs text-muted-foreground">
          Standard 7-block Implicit Association Test. Categories are sorted with E (left) and I (right) keys.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="iat-trials-per-block">Trials per Test Block</label>
            <input
              id="iat-trials-per-block"
              type="number"
              min="4"
              max="100"
              bind:value={question.config.task.iat.trialsPerBlock}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="iat-practice-trials">Trials per Practice Block</label>
            <input
              id="iat-practice-trials"
              type="number"
              min="4"
              max="50"
              bind:value={question.config.task.iat.practiceTrialsPerBlock}
              class="input"
            />
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="iat-fixation-ms"
              label="Fixation (ms)"
              bind:value={question.config.task.iat.fixationMs}
              min={0}
              max={5000}
              step={10}
              fixedDefault={400}
              invalid={errorFields.has('iat.fixationMs')}
            />
            {@render fieldMsg('iat.fixationMs')}
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="iat-timeout-ms"
              label="Response Timeout (ms)"
              bind:value={question.config.task.iat.responseTimeoutMs}
              min={100}
              max={10000}
              step={10}
              fixedDefault={3000}
              invalid={errorFields.has('iat.responseTimeoutMs')}
            />
            {@render fieldMsg('iat.responseTimeoutMs')}
          </div>
        </div>

        <h5 class="mb-2 text-sm font-medium text-muted-foreground" style="margin-top: 1rem;">Categories &amp; Attributes</h5>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="iat-cat1-name">Category 1 Name</label>
            <input
              id="iat-cat1-name"
              type="text"
              bind:value={question.config.task.iat.category1Name}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="iat-cat2-name">Category 2 Name</label>
            <input
              id="iat-cat2-name"
              type="text"
              bind:value={question.config.task.iat.category2Name}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="iat-attr1-name">Attribute 1 Name</label>
            <input
              id="iat-attr1-name"
              type="text"
              bind:value={question.config.task.iat.attribute1Name}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="iat-attr2-name">Attribute 2 Name</label>
            <input
              id="iat-attr2-name"
              type="text"
              bind:value={question.config.task.iat.attribute2Name}
              class="input"
            />
          </div>
        </div>

        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Add Items</span>
          <div class="flex gap-2 mb-2">
            <Select bind:value={iatItemTarget} class="text-sm">
              <option value="cat1">{question.config.task.iat.category1Name}</option>
              <option value="cat2">{question.config.task.iat.category2Name}</option>
              <option value="attr1">{question.config.task.iat.attribute1Name}</option>
              <option value="attr2">{question.config.task.iat.attribute2Name}</option>
            </Select>
            <input
              type="text"
              bind:value={newIatItem}
              placeholder="Item text"
              class="input"
              onkeydown={(e) => e.key === 'Enter' && addIatItem()}
            />
            <Button variant="secondary" size="sm" onclick={addIatItem} disabled={!newIatItem}>Add</Button>
          </div>
        </div>

        {#each [
          { label: question.config.task.iat.category1Name, key: 'category1Items' as const, items: question.config.task.iat.category1Items },
          { label: question.config.task.iat.category2Name, key: 'category2Items' as const, items: question.config.task.iat.category2Items },
          { label: question.config.task.iat.attribute1Name, key: 'attribute1Items' as const, items: question.config.task.iat.attribute1Items },
          { label: question.config.task.iat.attribute2Name, key: 'attribute2Items' as const, items: question.config.task.iat.attribute2Items },
        ] as group}
          <div class="mb-4">
            <span class="block mb-1.5 text-sm font-medium text-foreground">{group.label}</span>
            <div class="flex flex-wrap gap-2 mt-2">
              {#each group.items as item}
                <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md">
                  <span class="font-mono text-sm font-medium text-foreground">{item}</span>
                  <button class="remove-btn" onclick={() => removeIatItem(group.key, item)}>&#10005;</button>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if question.config.task.type === 'dot-probe'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">Dot-Probe Configuration</h5>
        <p class="mt-1 text-xs text-muted-foreground">
          Two stimuli are shown briefly, then a probe replaces one. Congruent = probe at salient location. Measures attentional bias.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="dotprobe-trial-count">Trial Count</label>
            <input
              id="dotprobe-trial-count"
              type="number"
              min="4"
              max="500"
              bind:value={question.config.task.dotProbe.trialCount}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="dotprobe-congruent-ratio">Congruent Ratio</label>
            <input
              id="dotprobe-congruent-ratio"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={question.config.task.dotProbe.congruentRatio}
              class="input"
            />
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="dotprobe-cue-duration"
              label="Cue Duration (ms)"
              bind:value={question.config.task.dotProbe.cueDuration}
              min={50}
              max={5000}
              step={10}
              fixedDefault={500}
              invalid={errorFields.has('dotProbe.cueDuration')}
            />
            {@render fieldMsg('dotProbe.cueDuration')}
          </div>
          <div class="mb-4">
            <label for="dotprobe-probe-symbol">Probe Symbol</label>
            <input
              id="dotprobe-probe-symbol"
              type="text"
              maxlength="3"
              bind:value={question.config.task.dotProbe.probeSymbol}
              class="input"
            />
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="dotprobe-fixation-ms"
              label="Fixation (ms)"
              bind:value={question.config.task.dotProbe.fixationMs}
              min={0}
              max={5000}
              step={10}
              fixedDefault={500}
              invalid={errorFields.has('dotProbe.fixationMs')}
            />
            {@render fieldMsg('dotProbe.fixationMs')}
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="dotprobe-timeout-ms"
              label="Response Timeout (ms)"
              bind:value={question.config.task.dotProbe.responseTimeoutMs}
              min={100}
              max={10000}
              step={10}
              fixedDefault={2000}
              invalid={errorFields.has('dotProbe.responseTimeoutMs')}
            />
            {@render fieldMsg('dotProbe.responseTimeoutMs')}
          </div>
          <div class="mb-4">
            <TimingSpecField
              id="dotprobe-isi"
              label="Inter-Trial Interval (ms)"
              bind:value={question.config.task.dotProbe.isi}
              min={0}
              max={5000}
              step={10}
              fixedDefault={500}
              invalid={errorFields.has('dotProbe.isi')}
            />
            {@render fieldMsg('dotProbe.isi')}
          </div>
        </div>

        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Stimulus Pairs (Salient / Neutral)</span>
          <div class="flex gap-2 mb-2">
            <input
              type="text"
              bind:value={newDotProbeSalient}
              placeholder="Salient stimulus"
              class="input"
            />
            <input
              type="text"
              bind:value={newDotProbeNeutral}
              placeholder="Neutral stimulus"
              class="input"
            />
            <Button
              variant="secondary"
              size="sm"
              onclick={addDotProbePair}
              disabled={!newDotProbeSalient || !newDotProbeNeutral}
            >Add</Button>
          </div>
          <div class="flex flex-wrap gap-2 mt-2" style="flex-direction: column;">
            {#each question.config.task.dotProbe.stimulusPairs as pair, idx}
              <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md" style="width: 100%; justify-content: space-between;">
                <span class="font-mono text-sm font-medium text-foreground">{pair.salient} / {pair.neutral}</span>
                <button class="remove-btn" onclick={() => removeDotProbePair(idx)}>&#10005;</button>
              </div>
            {/each}
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

  .input:hover {
    border-color: hsl(var(--border));
  }

  .input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .remove-btn {
    padding: 0.125rem;
    border: none;
    background: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    color: hsl(var(--destructive));
  }

  .stroop-flanker-label {
    font-size: 0.6875rem;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    width: 5.5rem;
    flex-shrink: 0;
  }

  .stroop-word {
    text-shadow: 0 1px 3px hsl(var(--foreground) / 0.3);
  }

  .flanker-display {
    font-family: monospace;
    font-size: 1.75rem;
    font-weight: 700;
    color: hsl(var(--background));
    letter-spacing: 0.15em;
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
