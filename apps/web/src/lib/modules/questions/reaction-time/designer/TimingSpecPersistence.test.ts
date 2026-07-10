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
 * This drives the FULL ReactionTimeDesigner (the wrapper whose hydrate/study-sync
 * effects were essential to reproduce the bug), edits a jitter min input, then
 * snapshots → reloads a fresh designer, asserting the value survived.
 */
async function editMinAndRoundTrip(
  taskConfig: unknown,
  inputId: string,
  newMin: string
): Promise<{ afterEdit: unknown; afterReload: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal designer fixture
  const question: any = {
    id: 'q1',
    type: 'reaction-time',
    name: '',
    config: { task: taskConfig },
  };

  const { unmount } = render(ReactionTimeDesigner, { props: { question } });
  await tick();
  await tick();

  const min = document.getElementById(inputId) as HTMLInputElement;
  if (!min) throw new Error(`input #${inputId} not rendered`);
  await fireEvent.input(min, { target: { value: newMin } });
  await tick();
  await tick();

  const afterEdit = JSON.parse(JSON.stringify(question.config.task));

  // Save (autosave / persistence serializes the whole questionnaire) then reload.
  const saved = JSON.parse(JSON.stringify(question));
  unmount();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal designer fixture
  const reloaded: any = { id: 'q1', type: 'reaction-time', name: '', config: saved.config };
  render(ReactionTimeDesigner, { props: { question: reloaded } });
  await tick();
  await tick();

  return { afterEdit, afterReload: JSON.parse(JSON.stringify(reloaded.config.task)) };
}

describe('F-49: TimingSpec jitter edits persist through save → reload', () => {
  afterEach(() => cleanup());

  it('PVT foreperiod (StandardParadigmFields, was broken)', async () => {
    const { afterReload } = await editMinAndRoundTrip(
      {
        type: 'pvt',
        pvt: { trialCount: 20, isi: { dist: 'uniform', min: 2000, max: 10000 }, responseKey: ' ', responseTimeoutMs: 5000 },
      },
      'pvt-isi',
      '3500'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config
    expect((afterReload as any).pvt.isi).toEqual({ dist: 'uniform', min: 3500, max: 10000 });
  });

  it('Sternberg per-item study (StandardParadigmFields)', async () => {
    const { afterReload } = await editMinAndRoundTrip(
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
    expect((afterReload as any).sternberg.encodingMs).toEqual({ dist: 'uniform', min: 350, max: 500 });
  });

  it('N-Back fixation (TaskPresetFields, question-rooted — the working shape)', async () => {
    const { afterReload } = await editMinAndRoundTrip(
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
    expect((afterReload as any).nBack.fixationMs).toEqual({ dist: 'uniform', min: 350, max: 500 });
  });
});
