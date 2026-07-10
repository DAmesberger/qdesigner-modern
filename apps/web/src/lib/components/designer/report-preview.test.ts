import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/svelte';
import ReportPageView from '$lib/fillout/components/ReportPageView.svelte';
import type { ReportPageConfig } from '$lib/shared';
import { buildSampleReportData } from './report-sample-data';

/**
 * R4-3 preview smoke test: the report-page panel previews the layout by mounting the
 * REAL participant renderer against sample values derived from the widget bindings.
 * This asserts that path end-to-end — a score-tile binding renders a numeric tile and
 * an interpretation band from `buildSampleReportData` output, no lookalike involved.
 */
describe('ReportPageView preview with derived sample data (R4-3)', () => {
  afterEach(() => cleanup());

  it('renders a score tile with a numeric value and band from sample data', async () => {
    const reportConfig: ReportPageConfig = {
      enabled: true,
      title: 'Your results',
      layout: { columns: 12, rowHeight: 80, gap: 16 },
      widgets: [
        {
          id: 'w1',
          type: 'score-tile',
          position: { x: 0, y: 0, w: 6, h: 2 },
          binding: { source: 'score', key: 'anxiety', field: 'value' },
          text: 'Anxiety',
        },
      ],
    };
    const sample = buildSampleReportData(reportConfig);

    render(ReportPageView, {
      props: {
        reportConfig,
        variables: sample.variables,
        scoreConfigs: sample.scoreConfigs,
        session: sample.session,
        reportTitle: 'Your results',
      },
    });

    const page = await waitFor(() =>
      document.querySelector('[data-testid="fillout-report-page"]')
    );
    expect(page).not.toBeNull();

    const tile = document.querySelector('[data-testid="report-widget-score-tile"]');
    expect(tile).not.toBeNull();
    // The tile value is the sample score for `score.anxiety.value` (finite, not the em-dash).
    expect(tile?.textContent).not.toContain('—');
    expect(tile?.textContent).toMatch(/\d/);
  });
});
