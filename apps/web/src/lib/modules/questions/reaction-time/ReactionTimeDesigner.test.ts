import { describe, it, expect, afterEach, beforeAll, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import ReactionTimeDesigner from './ReactionTimeDesigner.svelte';
import { designerStore } from '$lib/stores/designer.svelte';

// jsdom lacks the Web Animations API used by some Svelte transitions.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfilling a missing jsdom API
  const proto = Element.prototype as any;
  if (typeof proto.animate !== 'function') {
    proto.animate = () => ({
      cancel() {},
      finish() {},
      onfinish: null,
      finished: Promise.resolve(),
    });
  }
});

/**
 * Guardrail (F076) for the ReactionTimeDesigner god component (1704 lines). It
 * self-hydrates its config from `question.config` on mount and drives the visual
 * BlockEditor. The `question` prop must be a deep-reactive object (Svelte 5 does
 * not proxy plain objects passed as props), so we source it from the designerStore
 * — the same $state-backed object the real designer binds — and assert the
 * add-block interaction mutates the question's study config.
 */
function seedReactionQuestion() {
  designerStore.loadQuestionnaireFromDefinition({
    id: 'qn-rt',
    name: 'RT Test',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [{ id: 'q_rt', type: 'reaction-time', config: {} }],
  });
  return designerStore.questionnaire.questions[0];
}

describe('ReactionTimeDesigner', () => {
  let question: ReturnType<typeof seedReactionQuestion>;
  beforeEach(() => {
    question = seedReactionQuestion();
  });
  afterEach(() => cleanup());

  it('renders the visual BlockEditor', async () => {
    render(ReactionTimeDesigner, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- store question is a runtime superset of the strict type
      props: { question: question as any, organizationId: '', userId: '' },
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('Visual Block & Trial Editor');
    });
  });

  it('adds a block through the BlockEditor add-block interaction', async () => {
    render(ReactionTimeDesigner, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- store question is a runtime superset of the strict type
      props: { question: question as any, organizationId: '', userId: '' },
    });

    // Wait for hydration to settle and the block editor to render its cards.
    await waitFor(() => {
      expect(document.querySelectorAll('.block-card').length).toBeGreaterThan(0);
    });
    const before = document.querySelectorAll('.block-card').length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reading the hydrated study config off the store question
    const blocksBefore = ((question as any).config?.study?.blocks ?? []).length;

    const addBlockButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Add Block'
    ) as HTMLButtonElement;
    expect(addBlockButton).toBeTruthy();

    await fireEvent.click(addBlockButton);

    // The interaction adds a block to the question's study config (visible as a new
    // block card and reflected in the underlying reactive question object).
    await waitFor(() => {
      expect(document.querySelectorAll('.block-card').length).toBe(before + 1);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reading the mutated study config off the store question
    const blocksAfter = ((question as any).config?.study?.blocks ?? []).length;
    expect(blocksAfter).toBe(blocksBefore + 1);
  });
});
