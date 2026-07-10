import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReactionTimeDesigner from '../ReactionTimeDesigner.svelte';

/**
 * F-49 regression. TimingSpec (ADR 0025) jitter edits must reach the saved
 * questionnaire content, not just the local UI. The original defect: in
 * StandardParadigmFields the TimingSpecField `bind:value` was rooted at the
 * `task` `$derived` alias (`task.pvt.isi`); component `bind:value` through a
 * derived-rooted lvalue silently fails to write back to the underlying `$state`,
 * so the edit updated the input but never the config — it reverted on reload.
 * Rooting the binding at the bindable `question` (`question.config.task…`) — the
 * shape TaskPresetFields already used — fixes it.
 *
 * This drives the FULL ReactionTimeDesigner, edits a jitter min input, and
 * asserts the edit reaches the SAVED config. F-52: the designer OWNS its editing
 * state and reflects settled edits through `onUpdate` (it no longer mutates the
 * passed-in question prop — that would trip ownership_invalid_mutation), so the
 * saved config is captured from the `onUpdate` payload, then a fresh designer is
 * reloaded from it and the jitter-min input asserted to hydrate to the edit.
 */
async function editMinAndRoundTrip(
  taskConfig: unknown,
  inputId: string,
  newMin: string
): Promise<{ afterEdit: Record<string, unknown>; afterReloadMin: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal designer fixture
  const question: any = {
    id: 'q1',
    type: 'reaction-time',
    name: '',
    config: { task: taskConfig },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
  let saved: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config payload
  const onUpdate = (u: { config: any }) => {
    saved = u.config;
  };

  const { unmount } = render(ReactionTimeDesigner, { props: { question, onUpdate } });
  await tick();
  await tick();

  const min = document.getElementById(inputId) as HTMLInputElement;
  if (!min) throw new Error(`input #${inputId} not rendered`);
  await fireEvent.input(min, { target: { value: newMin } });
  await tick();
  await tick();

  if (!saved) throw new Error('edit did not reflect through onUpdate');
  const afterEdit = JSON.parse(JSON.stringify(saved.task)) as Record<string, unknown>;
  unmount();

  // Reload a fresh designer from the SAVED (persisted) config and assert the jitter
  // min input hydrates to the edited value — the exact re-QA reload scenario.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal designer fixture
  const reloaded: any = { id: 'q1', type: 'reaction-time', name: '', config: saved };
  render(ReactionTimeDesigner, { props: { question: reloaded } });
  await tick();
  await tick();

  const reloadedMin = document.getElementById(inputId) as HTMLInputElement | null;
  return { afterEdit, afterReloadMin: reloadedMin?.value ?? null };
}

describe('F-49: TimingSpec jitter edits persist through save → reload', () => {
  afterEach(() => cleanup());

  it('PVT foreperiod (StandardParadigmFields, was broken)', async () => {
    const { afterEdit, afterReloadMin } = await editMinAndRoundTrip(
      {
        type: 'pvt',
        pvt: { trialCount: 20, isi: { dist: 'uniform', min: 2000, max: 10000 }, responseKey: ' ', responseTimeoutMs: 5000 },
      },
      'pvt-isi',
      '3500'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config
    expect((afterEdit as any).pvt.isi).toEqual({ dist: 'uniform', min: 3500, max: 10000 });
    expect(afterReloadMin).toBe('3500');
  });

  it('Sternberg per-item study (StandardParadigmFields)', async () => {
    const { afterEdit, afterReloadMin } = await editMinAndRoundTrip(
      {
        type: 'sternberg',
        sternberg: {
          trialCount: 30,
          setSizes: [2, 4, 6],
          targetPresentRatio: 0.5,
          memoryItems: ['B', 'C', 'D', 'F', 'G', 'H', 'J'],
          presentKey: 'j',
          absentKey: 'f',
          encodingMs: { dist: 'uniform', min: 300, max: 500 },
          retentionMs: 1000,
          isi: 500,
          fixationMs: 500,
          responseTimeoutMs: 3000,
        },
      },
      'sternberg-encoding',
      '350'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config
    expect((afterEdit as any).sternberg.encodingMs).toEqual({ dist: 'uniform', min: 350, max: 500 });
    expect(afterReloadMin).toBe('350');
  });

  it('N-Back fixation (TaskPresetFields, question-rooted — the working shape)', async () => {
    const { afterEdit, afterReloadMin } = await editMinAndRoundTrip(
      {
        type: 'n-back',
        nBack: {
          n: 2,
          sequenceLength: 20,
          targetRate: 0.3,
          stimulusSet: ['A', 'B'],
          targetKey: 'j',
          nonTargetKey: 'f',
          fixationMs: { dist: 'uniform', min: 300, max: 500 },
          responseTimeoutMs: 1200,
        },
      },
      'nback-fixation-ms',
      '350'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config
    expect((afterEdit as any).nBack.fixationMs).toEqual({ dist: 'uniform', min: 350, max: 500 });
    expect(afterReloadMin).toBe('350');
  });
});
