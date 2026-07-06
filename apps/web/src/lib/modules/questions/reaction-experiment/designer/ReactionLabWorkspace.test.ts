import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import ReactionLabWorkspace from './ReactionLabWorkspace.svelte';
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
 * Guardrail (F076) for the decomposed Reaction Lab (P6-T6). The shell normalizes
 * its own reactive `config` from the `question` prop and emits changes through
 * `onupdate` (the channel the +page wires back into the designerStore). We seed
 * the store + openReactionLab as the real designer does, then smoke-mount and
 * assert the block outline (OutlinePane) renders and the add-block interaction
 * emits an update.
 */
function seedReactionExperiment() {
  designerStore.loadQuestionnaireFromDefinition({
    id: 'qn-lab',
    name: 'Lab Test',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [{ id: 'q_lab', type: 'reaction-experiment', config: {} }],
  });
  designerStore.openReactionLab('q_lab');
  return designerStore.reactionLabQuestion;
}

describe('ReactionLabWorkspace', () => {
  let question: ReturnType<typeof seedReactionExperiment>;
  beforeEach(() => {
    question = seedReactionExperiment();
  });
  afterEach(() => cleanup());

  it('mounts and renders the block outline', async () => {
    render(ReactionLabWorkspace, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- store question is a runtime superset of the strict type
      props: { question: question as any, organizationId: '', userId: '' },
    });

    // The workspace root + outline (Blocks heading) render.
    expect(document.querySelector('[data-testid="reaction-lab-workspace"]')).toBeTruthy();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Blocks');
    });
  });

  it('emits an update and grows the outline when a block is added', async () => {
    const onupdate = vi.fn();
    render(ReactionLabWorkspace, {
      props: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- store question is a runtime superset of the strict type
        question: question as any,
        organizationId: '',
        userId: '',
        onupdate,
      },
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('Blocks');
    });

    const addBlockButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Add Block'
    ) as HTMLButtonElement;
    expect(addBlockButton).toBeTruthy();

    const trialsBefore = document.body.textContent?.match(/trials/g)?.length ?? 0;

    await fireEvent.click(addBlockButton);

    // addBlock -> updateConfig -> commit -> onupdate(patch)
    await waitFor(() => {
      expect(onupdate).toHaveBeenCalled();
    });
    // A new block row appears in the outline (each block renders a "· N trials" summary).
    const trialsAfter = document.body.textContent?.match(/trials/g)?.length ?? 0;
    expect(trialsAfter).toBeGreaterThan(trialsBefore);
  });
});
