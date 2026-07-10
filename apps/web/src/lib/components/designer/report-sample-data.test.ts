import { describe, it, expect } from 'vitest';
import type { ReportPageConfig, ReportWidget } from '$lib/shared';
import { generateId } from '$lib/shared';
import { buildSampleReportData } from './report-sample-data';

function widget(partial: Partial<ReportWidget> & Pick<ReportWidget, 'type'>): ReportWidget {
  return {
    id: generateId(),
    position: { x: 0, y: 0, w: 6, h: 2 },
    binding: { source: 'variable', key: '' },
    ...partial,
  };
}

function config(widgets: ReportWidget[]): ReportPageConfig {
  return { enabled: true, layout: { columns: 12, rowHeight: 80, gap: 16 }, widgets };
}

describe('buildSampleReportData', () => {
  it('seeds a numeric value at the widget dotted binding path so the renderer resolves it', () => {
    const { variables } = buildSampleReportData(
      config([widget({ type: 'score-tile', binding: { source: 'score', key: 'anxiety' } })])
    );
    const value = variables['score.anxiety.value'];
    expect(typeof value).toBe('number');
    expect(value as number).toBeGreaterThanOrEqual(40);
    expect(value as number).toBeLessThanOrEqual(75);
  });

  it('emits a matching score interpreter config for score-bound tiles so a band renders', () => {
    const { scoreConfigs } = buildSampleReportData(
      config([widget({ type: 'score-tile', binding: { source: 'score', key: 'depression' } })])
    );
    expect(scoreConfigs).toHaveLength(1);
    expect(scoreConfigs[0]?.variableId).toBe('depression');
    expect(scoreConfigs[0]?.ranges.length).toBeGreaterThan(0);
  });

  it('provides a valid cohort bundle for a server-variable comparison widget', () => {
    const { variables } = buildSampleReportData(
      config([
        widget({
          type: 'box-cohort',
          binding: { source: 'variable', key: 'rt' },
          comparison: { source: 'server-variable', serverVariable: 'cohort_rt', fallback: 'hide' },
        }),
      ])
    );
    const bundle = variables['cohort_rt'] as Record<string, number>;
    expect(bundle).toBeTypeOf('object');
    expect(bundle.n).toBeGreaterThanOrEqual(5);
    expect(bundle.mean).toBeTypeOf('number');
    expect(bundle.sd).toBeGreaterThan(0);
  });

  it('gives a results-table widget an object binding so it flattens into rows', () => {
    const { variables } = buildSampleReportData(
      config([widget({ type: 'results-table', binding: { source: 'variable', key: 'summary' } })])
    );
    const raw = variables['summary'];
    expect(raw).toBeTypeOf('object');
    expect(Object.keys(raw as object).length).toBeGreaterThan(0);
  });

  it('builds a completed session with duration and responses for completion-meta', () => {
    const { session } = buildSampleReportData(config([widget({ type: 'completion-meta' })]));
    expect(session.status).toBe('completed');
    expect(session.endTime).toBeGreaterThan(session.startTime);
    expect(session.responses.length).toBeGreaterThan(0);
  });

  it('is deterministic — repeated derivation yields identical values', () => {
    const cfg = config([widget({ type: 'score-tile', binding: { source: 'variable', key: 'wellbeing' } })]);
    expect(buildSampleReportData(cfg).variables).toEqual(buildSampleReportData(cfg).variables);
  });
});
