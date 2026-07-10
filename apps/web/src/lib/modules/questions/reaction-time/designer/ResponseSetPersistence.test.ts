import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReactionTimeDesigner from '../ReactionTimeDesigner.svelte';

/**
 * RT-2b ResponseSet editor persistence. Following the F-49 discipline (a COMPONENT
 * `bind:value` rooted in a `$derived` alias silently drops the write, so we prove
 * the whole author → serialize → reload spine end-to-end BEFORE trusting the UI):
 * author a ResponseSet in the FULL ReactionTimeDesigner, snapshot the live config,
 * reload a fresh designer from that snapshot, and assert the edit survived.
 *
 * Assertions are reload-based (a fresh mount renders the mutated data) rather than
 * live, because the plain-object test prop is not a `$state` proxy — mirroring the
 * F-49 harness. The editor is only offered for the author-defined paradigms
 * (standard, custom); these tests drive `standard`.
 */

interface RSOption {
  id: string;
  label?: string;
  bindings: Array<Record<string, unknown>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal designer fixture
function seededQuestion(options: RSOption[]): any {
  return {
    id: 'q1',
    type: 'reaction-time',
    name: '',
    config: {
      task: { type: 'standard' },
      response: { validKeys: ['f', 'j'], timeout: 2000, mode: 'keyboard', responseSet: { options } },
    },
  };
}

function twoOptions(): RSOption[] {
  return [
    { id: 'left', label: 'Left', bindings: [{ source: 'keyboard', key: 'f', on: 'down' }] },
    { id: 'right', label: 'Right', bindings: [{ source: 'keyboard', key: 'j', on: 'down' }] },
  ];
}

async function reload(config: unknown): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal designer fixture
  const reloaded: any = { id: 'q1', type: 'reaction-time', name: '', config };
  render(ReactionTimeDesigner, { props: { question: reloaded } });
  await tick();
  await tick();
  return JSON.parse(JSON.stringify(reloaded.config));
}

// F-52: the designer OWNS its editing state and reflects settled edits through
// `onUpdate` (it no longer mutates the passed-in question prop). Capture the saved
// config from that callback rather than reading the prop back.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
function renderCapturing(question: any): () => any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
  let saved: any = null;
  render(ReactionTimeDesigner, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
    props: { question, onUpdate: (u: { config: any }) => (saved = u.config) },
  });
  return () => saved;
}

describe('RT-2b: ResponseSet edits persist through save → reload', () => {
  afterEach(() => cleanup());

  it('option label + id edit and a correct-mark survive a round-trip', async () => {
    const question = seededQuestion(twoOptions());
    const saved = renderCapturing(question);
    await tick();
    await tick();

    const label = document.getElementById('responseset-option-0-label') as HTMLInputElement;
    const id = document.getElementById('responseset-option-0-id') as HTMLInputElement;
    const correct1 = document.getElementById('responseset-option-1-correct') as HTMLInputElement;
    if (!label || !id || !correct1) throw new Error('ResponseSet editor did not render');

    await fireEvent.input(label, { target: { value: 'Leftward' } });
    await fireEvent.input(id, { target: { value: 'leftward' } });
    await fireEvent.change(correct1, { target: { checked: true } });
    await tick();
    await tick();

    const savedConfig = JSON.parse(JSON.stringify(saved()));
    cleanup();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config
    const afterReload = (await reload(savedConfig)) as any;
    expect(afterReload.response.responseSet.options[0]).toEqual({
      id: 'leftward',
      label: 'Leftward',
      bindings: [{ source: 'keyboard', key: 'f', on: 'down' }],
    });
    expect(afterReload.response.correctOptionIds).toEqual(['right']);
  });

  it('the Add response option control appends an option', async () => {
    const question = seededQuestion(twoOptions());
    const saved = renderCapturing(question);
    await tick();
    await tick();

    const add = document.getElementById('responseset-add-option') as HTMLButtonElement;
    if (!add) throw new Error('add-option control did not render');
    await fireEvent.click(add);
    await tick();
    await tick();

    expect(saved().response.responseSet.options).toHaveLength(3);
    expect(saved().response.responseSet.options[2]).toEqual({ id: '', label: '', bindings: [] });
  });

  it('auto-suggests an option id (slugified) from the label', async () => {
    const question = seededQuestion([...twoOptions(), { id: '', label: '', bindings: [] }]);
    const saved = renderCapturing(question);
    await tick();
    await tick();

    const label2 = document.getElementById('responseset-option-2-label') as HTMLInputElement;
    if (!label2) throw new Error('third option did not render');
    await fireEvent.input(label2, { target: { value: 'Center Choice' } });
    await tick();
    await tick();

    const savedConfig = JSON.parse(JSON.stringify(saved()));
    cleanup();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config
    const afterReload = (await reload(savedConfig)) as any;
    const option = afterReload.response.responseSet.options[2];
    expect(option.label).toBe('Center Choice');
    expect(option.id).toBe('center-choice');
  });

  it('flags a duplicate option id after an edit', async () => {
    const question = seededQuestion(twoOptions());
    const saved = renderCapturing(question);
    await tick();
    await tick();

    const id1 = document.getElementById('responseset-option-1-id') as HTMLInputElement;
    if (!id1) throw new Error('option 1 id did not render');
    await fireEvent.input(id1, { target: { value: 'left' } });
    await tick();
    await tick();

    const savedConfig = JSON.parse(JSON.stringify(saved()));
    expect(savedConfig.response.responseSet.options[1].id).toBe('left');
    cleanup();

    // Reload a fresh designer from the now-colliding data; the flag renders at mount.
    await reload(savedConfig);
    const error = document.getElementById('responseset-option-1-id-error');
    expect(error).not.toBeNull();
    expect(error?.textContent?.toLowerCase()).toContain('unique');
  });

  it('labels the paradigm selector "Paradigm", not "Task Type"', async () => {
    const question = seededQuestion(twoOptions());
    render(ReactionTimeDesigner, { props: { question } });
    await tick();
    await tick();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain('Task Type');
    expect(bodyText).not.toContain('Task Mode');
    const paradigmLabel = document.querySelector('label[for="task-type"]');
    expect(paradigmLabel?.textContent?.trim()).toBe('Paradigm');
  });

  it('does not offer the editor for a procedure-fixed paradigm (simon)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal designer fixture
    const question: any = {
      id: 'q1',
      type: 'reaction-time',
      name: '',
      config: { task: { type: 'simon' }, response: { validKeys: ['f', 'j'], timeout: 2000 } },
    };
    render(ReactionTimeDesigner, { props: { question } });
    await tick();
    await tick();

    expect(document.getElementById('responseset-add-option')).toBeNull();
    expect(document.querySelector('[data-testid="responseset-fixed-note"]')).not.toBeNull();
  });
});
