<script lang="ts">
  import TrialTemplateEditor from './TrialTemplateEditor.svelte';
  import type { ReactionStudyBlock, ReactionStudyTrialTemplate } from '../model/reaction-schema';

  interface Props {
    blocks: ReactionStudyBlock[];
  }

  let { blocks = $bindable() }: Props = $props();

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
  }

  function removeBlock(index: number) {
    ensureBlocks();
    blocks = blocks.filter((_, i) => i !== index);
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
        stimulus: {
          kind: 'text',
          text: 'GO',
          fontPx: 64,
        },
        validKeys: ['f', 'j'],
        correctResponse: 'j',
        requireCorrect: true,
        fixationMs: 500,
        responseTimeoutMs: 2000,
        interTrialIntervalMs: 300,
      } satisfies ReactionStudyTrialTemplate,
    ];
  }

  function removeTrial(block: ReactionStudyBlock, trialIndex: number) {
    block.trials = block.trials.filter((_, i) => i !== trialIndex);
  }
</script>

<div class="block-editor-root">
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
              <select class="select" bind:value={block.kind}>
                <option value="practice">Practice</option>
                <option value="test">Test</option>
                <option value="custom">Custom</option>
              </select>
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
                  {trial}
                  index={trialIndex}
                  onRemove={(idx) => removeTrial(block, idx)}
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
