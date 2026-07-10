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

describe('F-51/F-52 B: top-level Number of Test Trials survives reload', () => {
  afterEach(() => cleanup());

  it('an edited testTrials is not reverted to the paradigm default on reload', async () => {
    const question = reactiveQuestion();
    // F-52: the designer owns its state and reflects edits through onUpdate; the
    // saved config is the callback payload, not the (now un-mutated) prop.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
    let saved: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
    const onUpdate = (u: { config: any }) => (saved = u.config);
    render(ReactionTimeDesigner, { props: { question, onUpdate } });
    await tick();
    await tick();

    const el = document.getElementById('test-trials') as HTMLInputElement;
    if (!el) throw new Error('test-trials input did not render');
    await fireEvent.input(el, { target: { value: '25' } });
    await tick();
    await tick();

    // The saved config carries the edit; a fresh designer reloaded from it must
    // display 25, not the paradigm default (10). This is the exact re-QA reload
    // scenario — and the saved config now carries NO stale study for the
    // (procedural) standard paradigm.
    expect(saved).not.toBeNull();
    expect(saved.testTrials).toBe(25);
    expect(saved.study).toBeUndefined();
    cleanup();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal designer fixture
    const reloaded: any = { id: 'q1', type: 'reaction-time', name: '', config: saved };
    render(ReactionTimeDesigner, { props: { question: reloaded } });
    await tick();
    await tick();

    const reloadedEl = document.getElementById('test-trials') as HTMLInputElement;
    expect(reloadedEl?.value).toBe('25');
  });
});

describe('F-52 C: no ownership_invalid_mutation warnings', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounting and editing the reaction designer emits zero ownership warnings', async () => {
    // The designer OWNS its editing state, so binding its sub-editors into that
    // state (rather than mutating the passed-in `question` prop) must not trip
    // Svelte's `ownership_invalid_mutation` dev warning (console.warn).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const question = reactiveQuestion();
    render(ReactionTimeDesigner, { props: { question } });
    await tick();
    await tick();

    const el = document.getElementById('test-trials') as HTMLInputElement;
    if (!el) throw new Error('test-trials input did not render');
    await fireEvent.input(el, { target: { value: '30' } });
    await tick();
    await tick();

    const messages = [...warn.mock.calls, ...error.mock.calls]
      .flat()
      .map((arg) => String(arg))
      .join('\n');
    expect(messages).not.toContain('ownership_invalid_mutation');
  });
});

describe('F-52 D: onUpdate payload is structured-cloneable (no proxy / no DataCloneError)', () => {
  afterEach(() => cleanup());

  it('the reflected config survives structuredClone — never a $state proxy or closure', async () => {
    const question = reactiveQuestion();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
    let saved: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
    const onUpdate = (u: { config: any }) => (saved = u.config);
    render(ReactionTimeDesigner, { props: { question, onUpdate } });
    await tick();
    await tick();

    // Toggling feedback plants the feedbackSettings $state into the config — the
    // shape that previously leaked a proxy into the IndexedDB draft put.
    const feedback = document.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement | null;
    const el = document.getElementById('test-trials') as HTMLInputElement;
    if (!el) throw new Error('test-trials input did not render');
    await fireEvent.input(el, { target: { value: '12' } });
    if (feedback) await fireEvent.change(feedback, { target: { checked: true } });
    await tick();
    await tick();

    expect(saved).not.toBeNull();
    // structuredClone is exactly what Dexie's `.put` runs on the persisted draft;
    // a $state proxy or function would throw DataCloneError here.
    expect(() => structuredClone(saved)).not.toThrow();
    // And the payload is pure JSON data (round-trips identically).
    expect(saved).toEqual(JSON.parse(JSON.stringify(saved)));
  });
});
