import { describe, it, expect, afterEach, beforeAll } from 'vitest';
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
 * Guardrail for the ReactionTimeDesigner god component. F-52 (single source of
 * truth): the visual BlockEditor is the CUSTOM paradigm's authoring surface. A
 * procedural paradigm has no `study` and renders no block editor — its trials
 * materialize from the top-level config. The designer OWNS its editing state and
 * reflects edits through `onUpdate` (it no longer mutates the passed-in question
 * prop), so add-block is asserted via the callback payload. The `question` prop is
 * sourced from the designerStore — the same $state-backed object the real designer
 * binds.
 */
function seedReactionQuestion(config: Record<string, unknown>) {
  designerStore.loadQuestionnaireFromDefinition({
    id: 'qn-rt',
    name: 'RT Test',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [{ id: 'q_rt', type: 'reaction-time', config }],
  });
  return designerStore.questionnaire.questions[0];
}

describe('ReactionTimeDesigner', () => {
  afterEach(() => cleanup());

  it('renders the visual BlockEditor for the custom paradigm', async () => {
    const question = seedReactionQuestion({ task: { type: 'custom' } });
    render(ReactionTimeDesigner, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- store question is a runtime superset of the strict type
      props: { question: question as any, organizationId: '', userId: '' },
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('Visual Block & Trial Editor');
    });
  });

  it('does not render the visual BlockEditor for a procedural paradigm (standard)', async () => {
    const question = seedReactionQuestion({ task: { type: 'standard' } });
    render(ReactionTimeDesigner, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- store question is a runtime superset of the strict type
      props: { question: question as any, organizationId: '', userId: '' },
    });

    // Let mount + effects settle, then confirm the block editor is absent.
    await waitFor(() => {
      expect(document.body.textContent).toContain('Paradigm');
    });
    expect(document.body.textContent).not.toContain('Visual Block & Trial Editor');
  });

  it('adds a block through the BlockEditor add-block interaction (custom)', async () => {
    const question = seedReactionQuestion({
      task: { type: 'custom' },
      study: {
        blocks: [
          { id: 'test', name: 'Test', kind: 'test', trials: [{ id: 't1', stimulus: { kind: 'text', text: 'GO' } }] },
        ],
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
    let saved: any = null;
    render(ReactionTimeDesigner, {
      props: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- store question is a runtime superset of the strict type
        question: question as any,
        organizationId: '',
        userId: '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
        onUpdate: (u: { config: any }) => (saved = u.config),
      },
    });

    await waitFor(() => {
      expect(document.querySelectorAll('.block-card').length).toBeGreaterThan(0);
    });
    const before = document.querySelectorAll('.block-card').length;

    const addBlockButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Add Block'
    ) as HTMLButtonElement;
    expect(addBlockButton).toBeTruthy();

    await fireEvent.click(addBlockButton);

    // A new block card renders and the edit reflects through onUpdate (the owned
    // study config grows) — not by mutating the passed-in question prop.
    await waitFor(() => {
      expect(document.querySelectorAll('.block-card').length).toBe(before + 1);
    });
    await waitFor(() => {
      expect(saved?.study?.blocks?.length).toBe(before + 1);
    });
  });
});
