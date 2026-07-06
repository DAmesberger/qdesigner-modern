<script lang="ts">
  import TrialTemplateEditor from './TrialTemplateEditor.svelte';
  import {
    createStimulusForKind,
    type ReactionStudyBlock,
    type ReactionStudyTrialTemplate,
  } from '$lib/modules/questions/reaction-time/model/reaction-schema';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    blocks: ReactionStudyBlock[];
    /**
     * Optional immutable-commit affordance (P6-T5). Fired after any block/trial
     * mutation so a consumer that drives this editor without `bind:` (e.g. the
     * ReactionLab immutable `updateConfig` flow) can commit the next value. The
     * `$bindable` reassignment is preserved for `bind:blocks` consumers, so both
     * styles work from the same component.
     */
    onUpdate?: (blocks: ReactionStudyBlock[]) => void;
  }

  let { blocks = $bindable(), onUpdate }: Props = $props();

  // Notify immutable consumers. `bind:blocks` consumers already saw the mutation
  // via the reassignment; this just re-emits the current array reference.
  function emit() {
    onUpdate?.(blocks);
  }

  function ensureBlocks() {
    if (!Array.isArray(blocks)) {
      blocks = [];
    }
  }

  function addBlock() {
    ensureBlocks();
    const nextIndex = blocks.length + 1;
    blocks = [
      ...blocks,
      {
        id: `block-${nextIndex}`,
        name: `Block ${nextIndex}`,
        kind: 'custom',
        randomizeOrder: false,
        repetitions: 1,
        trials: [],
      },
    ];
    emit();
  }

  function removeBlock(index: number) {
    ensureBlocks();
    blocks = blocks.filter((_, i) => i !== index);
    emit();
  }

  function addTrial(block: ReactionStudyBlock) {
    const nextIndex = block.trials.length + 1;
    block.trials = [
      ...block.trials,
      {
        id: `${block.id}-trial-${nextIndex}`,
        name: `Trial ${nextIndex}`,
        condition: '',
        repeat: 1,
        stimulus: createStimulusForKind('text'),
        validKeys: ['f', 'j'],
        correctResponse: 'j',
        requireCorrect: true,
        fixationMs: 500,
        responseTimeoutMs: 2000,
        interTrialIntervalMs: 300,
      } satisfies ReactionStudyTrialTemplate,
    ];
    blocks = [...blocks];
    emit();
  }

  function removeTrial(block: ReactionStudyBlock, trialIndex: number) {
    block.trials = block.trials.filter((_, i) => i !== trialIndex);
    blocks = [...blocks];
    emit();
  }

  // E-REACT-4: criterion-based practice. Toggling this on a practice block makes
  // the runtime re-run it until the accuracy target is met (or attempts run out).
  function togglePracticeCriterion(block: ReactionStudyBlock, enabled: boolean) {
    block.practiceCriterion = enabled ? { minAccuracy: 0.8, maxAttempts: 3 } : undefined;
    blocks = [...blocks];
    emit();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="block-editor-root" oninput={emit} onchange={emit}>
  <div class="block-editor-header">
    <h5 class="subsection-title">Visual Block &amp; Trial Editor</h5>
    <button class="btn btn-secondary" type="button" onclick={addBlock}>Add Block</button>
  </div>

  {#if !blocks || blocks.length === 0}
    <p class="help-text">No blocks defined. Add a block to begin building fully editable reaction trials.</p>
  {:else}
    <div class="block-list">
      {#each blocks as block, blockIndex}
        <section class="block-card">
          <div class="block-card-top">
            <h6>{block.name || `Block ${blockIndex + 1}`}</h6>
            <button class="remove-btn" type="button" onclick={() => removeBlock(blockIndex)}>✕</button>
          </div>

          <div class="block-grid">
            <div class="form-group">
              <span class="label-text">Block ID</span>
              <input class="input" type="text" bind:value={block.id} />
            </div>
            <div class="form-group">
              <span class="label-text">Name</span>
              <input class="input" type="text" bind:value={block.name} />
            </div>
            <div class="form-group">
              <span class="label-text">Kind</span>
              <Select bind:value={block.kind}>
                <option value="practice">Practice</option>
                <option value="test">Test</option>
                <option value="custom">Custom</option>
              </Select>
            </div>
            <div class="form-group">
              <span class="label-text">Block Repetitions</span>
              <input class="input" type="number" min="1" max="50" bind:value={block.repetitions} />
            </div>
            <div class="form-group checkbox-wrap">
              <label class="checkbox-label">
                <input class="checkbox" type="checkbox" bind:checked={block.randomizeOrder} />
                <span>Randomize Trial Order</span>
              </label>
            </div>
          </div>

          <div class="criterion-block">
            <label class="checkbox-label">
              <input
                class="checkbox"
                type="checkbox"
                checked={Boolean(block.practiceCriterion)}
                onchange={(event) =>
                  togglePracticeCriterion(block, (event.currentTarget as HTMLInputElement).checked)}
              />
              <span>Gate on accuracy criterion (practice)</span>
            </label>
            {#if block.practiceCriterion}
              <p class="help-text">
                Re-runs this block until the participant reaches the minimum accuracy or the attempt
                budget is spent. Applies only when the block's trials are practice.
              </p>
              <div class="criterion-grid">
                <div class="form-group">
                  <span class="label-text">Min accuracy (%)</span>
                  <input
                    class="input"
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={Math.round(block.practiceCriterion.minAccuracy * 100)}
                    oninput={(event) => {
                      const pct = Number((event.currentTarget as HTMLInputElement).value);
                      if (block.practiceCriterion) {
                        block.practiceCriterion.minAccuracy = Math.min(1, Math.max(0, pct / 100));
                      }
                    }}
                  />
                </div>
                <div class="form-group">
                  <span class="label-text">Max attempts</span>
                  <input
                    class="input"
                    type="number"
                    min="1"
                    max="20"
                    bind:value={block.practiceCriterion.maxAttempts}
                  />
                </div>
              </div>
            {/if}
          </div>

          <div class="block-trials-header">
            <span>Trials ({block.trials.length})</span>
            <button class="btn btn-secondary" type="button" onclick={() => addTrial(block)}>Add Trial</button>
          </div>

          {#if block.trials.length === 0}
            <p class="help-text">No trials yet in this block.</p>
          {:else}
            <div class="trial-list">
              {#each block.trials as trial, trialIndex}
                <TrialTemplateEditor
                  bind:trial={block.trials[trialIndex]!}
                  index={trialIndex}
                  onRemove={(idx) => removeTrial(block, idx)}
                  onUpdate={emit}
                />
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .block-editor-root {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .block-editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .block-list {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .block-card {
    border: 1px solid var(--border-color, #cfd8e3);
    border-radius: 0.75rem;
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--card-bg, #ffffff);
  }

  .block-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .block-card-top h6 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .block-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.6rem;
  }

  .checkbox-wrap {
    display: flex;
    align-items: flex-end;
  }

  .checkbox-label {
    display: flex;
    gap: 0.45rem;
    align-items: center;
  }

  .criterion-block {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
    border: 1px dashed var(--border-color, #cfd8e3);
    border-radius: 0.6rem;
  }

  .criterion-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.6rem;
  }

  .block-trials-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
  }

  .trial-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
</style>
