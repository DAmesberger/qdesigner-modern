import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import Harness from './block-manager-harness.svelte';
import { DesignerStore } from '$lib/stores/designer.svelte';

// jsdom lacks the Web Animations API Svelte transitions (Dialog) reach for.
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

function seed(store: DesignerStore) {
  store.loadQuestionnaireFromDefinition({
    id: 'qn-blocks',
    name: 'Block Manager Test',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [],
    pages: [{ id: 'p1', name: 'Page 1', questions: [], blocks: [] }],
  });
}

/** Click the <button> whose text content contains the given label. */
function clickButtonByText(text: string): Promise<boolean> {
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text)
  ) as HTMLButtonElement | undefined;
  expect(btn, `button "${text}"`).toBeTruthy();
  return fireEvent.click(btn!);
}

/**
 * F-35 regression: the Add/Edit-Block dialog froze because `ensureAdaptive()` mutated
 * `$state` (editingBlock/newBlock.adaptive) from a template expression — a Svelte 5
 * `state_unsafe_mutation`, which corrupts the scheduler and wedges the footer buttons.
 * These tests drive the full adaptive cycle (open Add -> pick adaptive -> edit -> save
 * -> reopen Edit -> edit -> save) and assert (1) no state_unsafe_mutation is reported
 * and (2) each save actually commits to the store — i.e. the buttons never wedge.
 */
describe('BlockManager adaptive-block dialog (F-35 freeze)', () => {
  afterEach(() => cleanup());

  it('runs the full add -> edit adaptive cycle without wedging or unsafe-mutation', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const windowErrors: string[] = [];
    const onError = (e: ErrorEvent) => windowErrors.push(String(e.message ?? e.error));
    window.addEventListener('error', onError);

    const store = new DesignerStore();
    seed(store);
    render(Harness, { props: { store } });

    // Open the Add-Block dialog for the seeded page.
    await fireEvent.click(document.querySelector('[aria-label="Add block"]') as HTMLButtonElement);
    expect(document.getElementById('block-name')).toBeTruthy();

    // Choose the Adaptive type. Pre-fix this render mutated state and threw.
    await clickButtonByText('Adaptive Block');

    // The adaptive editor mounted (no wedge) and is normalized once, on open.
    await waitFor(() => {
      expect(document.getElementById('adaptive-max-items')).toBeTruthy();
    });

    // Name the block and set a max-items value inside the adaptive editor.
    await fireEvent.input(document.getElementById('block-name') as HTMLInputElement, {
      target: { value: 'CAT bank' },
    });
    await fireEvent.input(document.getElementById('adaptive-max-items') as HTMLInputElement, {
      target: { value: '20' },
    });

    // Save via the footer button — the button that wedges under the bug.
    await clickButtonByText('Add Block');

    // The save committed: an adaptive block with the edited config now exists.
    const created = store.questionnaire.pages[0]?.blocks?.find((b) => b.type === 'adaptive');
    expect(created).toBeTruthy();
    expect(created?.adaptive?.maxItems).toBe(20);

    // Reopen the same block for editing. (A default "Block 1" precedes it, so
    // pick the edit button that belongs to the "CAT bank" block node.)
    const editBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[aria-label="Edit block"]')
    ).find((b) => b.closest('div.ml-1')?.textContent?.includes('CAT bank'));
    expect(editBtn, 'edit button for CAT bank').toBeTruthy();
    await fireEvent.click(editBtn!);
    await waitFor(() => {
      const maxItems = document.getElementById('adaptive-max-items') as HTMLInputElement | null;
      expect(maxItems?.value).toBe('20');
    });

    // Edit again and update — proves the second dialog cycle also works.
    await fireEvent.input(document.getElementById('adaptive-max-items') as HTMLInputElement, {
      target: { value: '25' },
    });
    await clickButtonByText('Update Block');

    const updated = store.questionnaire.pages[0]?.blocks?.find((b) => b.type === 'adaptive');
    expect(updated?.adaptive?.maxItems).toBe(25);

    // No Svelte state_unsafe_mutation surfaced through either channel.
    const allErrors = [
      ...errorSpy.mock.calls.map((c) => c.map(String).join(' ')),
      ...windowErrors,
    ].join('\n');
    expect(allErrors).not.toMatch(/state_unsafe_mutation/);

    window.removeEventListener('error', onError);
    errorSpy.mockRestore();
  });
});
