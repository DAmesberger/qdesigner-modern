import { describe, it, expect, afterEach, beforeEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { designerStore } from '$lib/stores/designer.svelte';
import ReportPagePanel from './ReportPagePanel.svelte';
import type { ReportWidget } from '$lib/shared';

/**
 * RT-5 palette wiring: the report-page editor exposes the `reaction-cohort-box`
 * widget with a config editor (reaction-question picker for `binding.key`, a
 * trials-source server-variable picker for the cohort, and stat/metric/invalidated
 * controls). This asserts the palette entry round-trips through save → the
 * questionnaire settings, and that the widget shows up in the grid editor's
 * box list like any other widget.
 */
// jsdom lacks the Web Animations API used by the Dialog transition.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfilling a missing jsdom API
  const proto = Element.prototype as any;
  if (typeof proto.animate !== 'function') {
    proto.animate = () => ({ cancel() {}, finish() {}, onfinish: null, finished: Promise.resolve() });
  }
});

function seed() {
  designerStore.loadQuestionnaireFromDefinition({
    id: 'q1',
    name: 'Reaction study',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [
      { id: 'q_rt', type: 'reaction-time', name: 'Go/No-Go', order: 0, required: false },
      { id: 'q_txt', type: 'text', name: 'Comments', order: 1, required: false },
    ],
    variables: [
      // A trials-source object bundle — the only valid cohort binding.
      { id: 'v_cohort', name: 'cohortRt', type: 'object', server: { source: 'trials', key: 'q_rt' } },
      // A response-source object variable that must NOT appear in the trials picker.
      { id: 'v_other', name: 'otherObj', type: 'object', server: { source: 'response', key: 'q_txt' } },
    ],
    pages: [{ id: 'p1', name: 'P', blocks: [{ id: 'b1', name: 'B', questions: ['q_rt', 'q_txt'] }] }],
  });
}

function changeSelect(el: Element | null, value: string) {
  expect(el).not.toBeNull();
  return fireEvent.change(el as HTMLSelectElement, { target: { value } });
}

describe('ReportPagePanel reaction-cohort-box palette entry (RT-5)', () => {
  beforeEach(() => seed());
  afterEach(() => cleanup());

  it('adds a reaction-cohort-box, configures it, and round-trips through save', async () => {
    render(ReportPagePanel, { props: { open: true } });

    // Add the first widget (defaults to score-tile).
    const add = await waitFor(
      () => document.querySelector('[data-testid="report-add-widget"]') as HTMLButtonElement
    );
    await fireEvent.click(add);

    // Switch its type to the reaction-cohort-box via the card's type select.
    const typeSelect = await waitFor(
      () => document.querySelector('[data-testid="report-widget-0"] select') as HTMLSelectElement
    );
    // The palette offers the reaction option.
    expect(
      Array.from(typeSelect.options).some((o) => o.value === 'reaction-cohort-box')
    ).toBe(true);
    await changeSelect(typeSelect, 'reaction-cohort-box');

    // The dedicated reaction editor mounts: reaction-question + cohort pickers.
    const rq = await waitFor(
      () => document.querySelector('select[id^="w-rq-"]') as HTMLSelectElement
    );
    // Only reaction questions are offered (Go/No-Go, not the text question).
    const rqValues = Array.from(rq.options).map((o) => o.value);
    expect(rqValues).toContain('q_rt');
    expect(rqValues).not.toContain('q_txt');

    const cohort = document.querySelector('select[id^="w-rcohort-"]') as HTMLSelectElement;
    // Only the trials-source object variable is a valid cohort — response-source excluded.
    const cohortValues = Array.from(cohort.options).map((o) => o.value);
    expect(cohortValues).toContain('cohortRt');
    expect(cohortValues).not.toContain('otherObj');

    await changeSelect(rq, 'q_rt');
    await changeSelect(cohort, 'cohortRt');
    await changeSelect(document.querySelector('select[id^="w-rmetric-"]'), 'accuracy');
    await changeSelect(document.querySelector('select[id^="w-rstat-"]'), 'mean');

    // The "include invalidated" checkbox in the reaction block.
    const includeInvalidated = Array.from(
      document.querySelectorAll('input[type="checkbox"]')
    ).find((c) => c.closest('label')?.textContent?.includes('Include invalidated')) as HTMLInputElement;
    expect(includeInvalidated).toBeTruthy();
    await fireEvent.click(includeInvalidated);

    // The widget appears in the grid editor's box list with its label.
    const gridEditor = document.querySelector('[data-testid="report-grid-editor"]');
    expect(gridEditor?.textContent).toContain('Reaction vs cohort');

    // Save and read the serialized config back off the questionnaire.
    await fireEvent.click(
      document.querySelector('[data-testid="report-save"]') as HTMLButtonElement
    );

    const widgets = designerStore.questionnaire.settings?.report?.widgets as ReportWidget[];
    expect(widgets).toHaveLength(1);
    const w = widgets[0]!;
    expect(w.type).toBe('reaction-cohort-box');
    expect(w.binding.key).toBe('q_rt');
    expect(w.comparison?.serverVariable).toBe('cohortRt');
    expect(w.comparison?.source).toBe('server-variable');
    expect(w.reaction?.metric).toBe('accuracy');
    expect(w.reaction?.stat).toBe('mean');
    expect(w.reaction?.includeInvalidated).toBe(true);
  });

  it('reloads a saved reaction-cohort-box with its config intact', async () => {
    // Pre-seed a saved report config, then open the panel fresh.
    designerStore.updateQuestionnaire({
      settings: {
        ...designerStore.questionnaire.settings,
        report: {
          enabled: true,
          layout: { columns: 12, rowHeight: 80, gap: 16 },
          widgets: [
            {
              id: 'rw1',
              type: 'reaction-cohort-box',
              position: { x: 0, y: 0, w: 6, h: 3 },
              binding: { source: 'variable', key: 'q_rt' },
              comparison: { source: 'server-variable', serverVariable: 'cohortRt', fallback: 'hide' },
              reaction: { stat: 'mean', metric: 'accuracy', includeInvalidated: true },
            },
          ],
        },
      },
    });

    render(ReportPagePanel, { props: { open: true } });

    // The saved config repopulates the editors.
    const rq = await waitFor(
      () => document.querySelector('select[id^="w-rq-"]') as HTMLSelectElement
    );
    expect(rq.value).toBe('q_rt');
    expect((document.querySelector('select[id^="w-rcohort-"]') as HTMLSelectElement).value).toBe(
      'cohortRt'
    );
    expect((document.querySelector('select[id^="w-rmetric-"]') as HTMLSelectElement).value).toBe(
      'accuracy'
    );
    expect((document.querySelector('select[id^="w-rstat-"]') as HTMLSelectElement).value).toBe(
      'mean'
    );
  });
});
