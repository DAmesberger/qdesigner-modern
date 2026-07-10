import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import BlockEditor from './BlockEditor.svelte';
import { createStimulusForKind, type ReactionStudyBlock } from '$lib/modules/questions/reaction-time/model/reaction-schema';

// Block removal is gated behind the shared confirm dialog, whose host is only
// mounted in the app layout. Auto-confirm it so the structural round-trip is
// what these tests exercise.
vi.mock('$lib/stores/confirm.svelte', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}));

// jsdom lacks the Web Animations API some child components reach for.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfilling a missing jsdom API
  const proto = Element.prototype as any;
  if (typeof proto.animate !== 'function') {
    proto.animate = () => ({ cancel() {}, finish() {}, onfinish: null, finished: Promise.resolve() });
  }
});

function fixtureBlocks(): ReactionStudyBlock[] {
  return [
    {
      id: 'block-1',
      name: 'Block 1',
      kind: 'custom',
      randomizeOrder: false,
      repetitions: 1,
      trials: [
        {
          id: 'block-1-trial-1',
          name: 'Trial 1',
          condition: '',
          repeat: 1,
          stimulus: createStimulusForKind('text'),
          validKeys: ['f', 'j'],
          correctResponse: 'j',
          requireCorrect: true,
          fixationMs: 500,
          responseTimeoutMs: 2000,
          interTrialIntervalMs: 300,
        },
      ],
    },
  ];
}

/**
 * P6-T5 guardrail: the shared BlockEditor is consumed by both reaction stacks.
 * These tests exercise the `onUpdate` (immutable-commit) affordance for the
 * structural add/remove block + add/remove trial operations, asserting the next
 * value flows out of the component and the DOM reflects it.
 */
describe('BlockEditor onUpdate round-trip', () => {
  afterEach(() => cleanup());

  it('emits the updated block list on add/remove block', async () => {
    const blockLengths: number[] = [];
    render(BlockEditor, {
      props: { blocks: fixtureBlocks(), onUpdate: (b: ReactionStudyBlock[]) => blockLengths.push(b.length) },
    });

    expect(document.querySelectorAll('.block-card').length).toBe(1);

    await fireEvent.click(document.querySelector('.block-editor-header .btn') as HTMLButtonElement);
    expect(document.querySelectorAll('.block-card').length).toBe(2);
    expect(blockLengths.at(-1)).toBe(2);

    // Remove the second block via its card remove button (confirm is auto-accepted).
    const removeButtons = document.querySelectorAll('.block-card-top .remove-btn');
    await fireEvent.click(removeButtons[1] as HTMLButtonElement);
    await waitFor(() => expect(document.querySelectorAll('.block-card').length).toBe(1));
    expect(blockLengths.at(-1)).toBe(1);
  });

  it('emits on add/remove trial within a block', async () => {
    const trialCounts: number[] = [];
    render(BlockEditor, {
      props: {
        blocks: fixtureBlocks(),
        onUpdate: (b: ReactionStudyBlock[]) => trialCounts.push(b[0]!.trials.length),
      },
    });

    expect(document.querySelectorAll('.trial-card').length).toBe(1);

    // "Add Trial" lives in the block-trials-header.
    await fireEvent.click(document.querySelector('.block-trials-header .btn') as HTMLButtonElement);
    expect(document.querySelectorAll('.trial-card').length).toBe(2);
    expect(trialCounts.at(-1)).toBe(2);

    // Remove the first trial via its card remove button.
    const trialRemove = document.querySelectorAll('.trial-top .remove-btn');
    await fireEvent.click(trialRemove[0] as HTMLButtonElement);
    expect(document.querySelectorAll('.trial-card').length).toBe(1);
    expect(trialCounts.at(-1)).toBe(1);
  });
});
