import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { tick, type ComponentProps } from 'svelte';
import { normalizeReactionQuestionConfig } from './model/reaction-normalize';
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

  it('preserves explicit trials and counterbalancing when changing an unrelated display setting', async () => {
    const config = {
      task: { type: 'standard' },
      blocks: [
        {
          id: 'authored',
          name: 'Authored',
          kind: 'test',
          trials: [
            {
              id: 'trial',
              stimulus: { kind: 'text', text: 'Respond' },
              validKeys: ['k'],
              responseTimeoutMs: 1700,
            },
          ],
        },
      ],
      counterbalance: [
        { factor: 'key-mapping', levels: ['original', 'reversed'], method: 'round-robin' },
      ],
    };
    const question = seedReactionQuestion(config);
    const onUpdate = vi.fn();
    const screen = render(ReactionTimeDesigner, {
      question: question as ComponentProps<typeof ReactionTimeDesigner>['question'],
      onUpdate,
    });
    await tick();
    await tick();
    expect(onUpdate).not.toHaveBeenCalled();
    await fireEvent.change(screen.getByLabelText('Target FPS'), { target: { value: '60' } });
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const saved = onUpdate.mock.calls.at(-1)?.[0];
    const before = normalizeReactionQuestionConfig({ config });
    const after = normalizeReactionQuestionConfig(saved);
    expect(after.blocks).toEqual(before.blocks);
    expect(after.counterbalance).toEqual(before.counterbalance);
    expect(after.targetFPS).toBe(60);
  });

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
          {
            id: 'test',
            name: 'Test',
            kind: 'test',
            trials: [{ id: 't1', stimulus: { kind: 'text', text: 'GO' } }],
          },
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
