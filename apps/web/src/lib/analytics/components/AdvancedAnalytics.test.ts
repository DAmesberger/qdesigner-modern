import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import type { ExportRow } from '$lib/shared/types/api';

// Chart.js needs a real 2d canvas context, which jsdom doesn't provide; stub the
// chart wrapper so the smoke test exercises the wiring, not the drawing library.
vi.mock('$lib/shared/charts', () => ({
  Chart: class {
    destroy() {}
    update() {}
  },
  CATEGORICAL_PALETTE: ['#000'],
}));

const { default: AdvancedAnalytics } = await import('./AdvancedAnalytics.svelte');

function row(partial: Partial<ExportRow>): ExportRow {
  return {
    session_id: 's1',
    participant_id: null,
    session_status: 'completed',
    started_at: null,
    completed_at: null,
    question_id: 'q1',
    value: null,
    reaction_time_us: null,
    presented_at: null,
    answered_at: null,
    ...partial,
  };
}

/**
 * R3-5: smoke-tests the wired Advanced tab. Both the empty state and the
 * populated state must render without throwing so the previously-stranded
 * FilterBuilder / HistogramWidget / CohortComparison suite stays reachable.
 */
describe('AdvancedAnalytics — Advanced tab (R3-5)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an empty state when there is no response data', () => {
    render(AdvancedAnalytics, { props: { rows: [] } });
    expect(document.body.textContent).toContain('No response data');
  });

  it('renders the Segment and Cohort sections with real rows', () => {
    const rows: ExportRow[] = [];
    for (let i = 0; i < 6; i++) {
      rows.push(row({ session_id: `a${i}`, question_id: 'arm', value: 'A' }));
      rows.push(row({ session_id: `a${i}`, question_id: 'score', value: 8 + (i % 2) }));
      rows.push(row({ session_id: `b${i}`, question_id: 'arm', value: 'B' }));
      rows.push(row({ session_id: `b${i}`, question_id: 'score', value: 2 + (i % 2) }));
    }
    render(AdvancedAnalytics, { props: { rows } });
    expect(document.body.textContent).toContain('Segment');
    expect(document.body.textContent).toContain('Cohort comparison');
    // All 12 participants match before any filter is applied.
    expect(document.body.textContent).toContain('12 of 12 participants match');
  });
});
