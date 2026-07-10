import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReactionTimeDesigner from '../ReactionTimeDesigner.svelte';

/**
 * F-51 (A) + (B). Unlike the sibling persistence suites (which drive a plain,
 * non-reactive object and assert via reload), these use a `$state` question proxy
 * — the production shape — because the fixes under test are reactive:
 *
 *  A) Every reaction-editor edit must flow through the store's update pipeline so
 *     the questionnaire is marked dirty and autosaved. The designer binds the
 *     shared proxy directly, so it now reflects each settled edit through the
 *     `onUpdate` callback the properties panel passes. Mount-time normalization
 *     must NOT fire it (no spurious dirty).
 *
 *  B) Top-level authoring fields (here: Number of Test Trials) must survive the
 *     load→normalize round-trip. They previously reverted to the paradigm default
 *     because a stale compiled `study` shadowed the fresh top-level config.
 */

// A reactive question proxy mirroring what the designer store hands the panel.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal designer fixture
function reactiveQuestion(): any {
  const question = $state({
    id: 'q1',
    type: 'reaction-time',
    name: '',
    config: {
      task: { type: 'standard' },
      testTrials: 10,
      stimulus: { type: 'shape', content: 'circle' },
      response: { mode: 'keyboard', validKeys: ['f', 'j'], timeout: 2000 },
    },
  });
  return question;
}

describe('F-51 A: reaction edits flow through onUpdate (mark dirty)', () => {
  afterEach(() => cleanup());

  it('mounting does not fire onUpdate, but a field edit does — with the new config', async () => {
    const question = reactiveQuestion();
    const onUpdate = vi.fn();
    render(ReactionTimeDesigner, { props: { question, onUpdate } });
    await tick();
    await tick();

    // Mount-time hydrate/study-sync must not have marked the questionnaire dirty.
    expect(onUpdate).not.toHaveBeenCalled();

    const el = document.getElementById('test-trials') as HTMLInputElement;
    if (!el) throw new Error('test-trials input did not render');
    await fireEvent.input(el, { target: { value: '25' } });
    await tick();
    await tick();

    expect(onUpdate).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config
    const last = onUpdate.mock.calls.at(-1)![0] as any;
    expect(last.config.testTrials).toBe(25);
  });
});

describe('F-51 B: top-level Number of Test Trials survives reload', () => {
  afterEach(() => cleanup());

  it('an edited testTrials is not reverted to the paradigm default on reload', async () => {
    const question = reactiveQuestion();
    render(ReactionTimeDesigner, { props: { question } });
    await tick();
    await tick();

    const el = document.getElementById('test-trials') as HTMLInputElement;
    if (!el) throw new Error('test-trials input did not render');
    await fireEvent.input(el, { target: { value: '25' } });
    await tick();
    await tick();

    // Serialize + reload a fresh designer from the saved config (the study shadow
    // rides along); the reload must display 25, not the starter default (10).
    const saved = JSON.parse(JSON.stringify(question.config));
    cleanup();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal designer fixture
    const reloaded: any = { id: 'q1', type: 'reaction-time', name: '', config: saved };
    render(ReactionTimeDesigner, { props: { question: reloaded } });
    await tick();
    await tick();

    const reloadedEl = document.getElementById('test-trials') as HTMLInputElement;
    expect(reloadedEl?.value).toBe('25');
    expect(reloaded.config.testTrials).toBe(25);
  });
});
