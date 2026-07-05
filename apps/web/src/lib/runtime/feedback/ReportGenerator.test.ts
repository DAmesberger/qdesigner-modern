import { describe, it, expect } from 'vitest';
import { generateReportHTML, type ReportConfig, type ReportData } from './ReportGenerator';
import type { ScoreInterpreterConfig } from './ScoreInterpreter';

function makeConfig(scoreConfigs: ScoreInterpreterConfig[]): ReportConfig {
  return {
    title: 'Wellbeing Report',
    subtitle: 'Study 42',
    date: 'January 1, 2026',
    scoreConfigs,
  };
}

describe('generateReportHTML', () => {
  const scale: ScoreInterpreterConfig = {
    variableId: 'anxiety',
    scaleName: 'Anxiety',
    ranges: [
      { min: 0, max: 10, label: 'Low', description: 'Anxiety is within a healthy range.', color: '#22c55e' },
      { min: 11, max: 20, label: 'Elevated', description: '', color: '#f59e0b' },
    ],
  };

  it('renders band labels and the computed score', () => {
    const data: ReportData = { variables: { anxiety: 5 } };
    const html = generateReportHTML(makeConfig([scale]), data);

    // Scale name and both band labels appear.
    expect(html).toContain('Anxiety');
    expect(html).toContain('Low');
    expect(html).toContain('Elevated');
    // The matched score is rendered (5 -> 5.00 in the score display).
    expect(html).toContain('5.00');
  });

  it('renders a description paragraph when the matched range has a non-empty description', () => {
    const data: ReportData = { variables: { anxiety: 5 } };
    const html = generateReportHTML(makeConfig([scale]), data);

    expect(html).toContain('<p class="score-description">');
    expect(html).toContain('Anxiety is within a healthy range.');
  });

  it('renders no description paragraph when the matched range description is empty', () => {
    // Score 15 matches the "Elevated" band, whose description is ''.
    const data: ReportData = { variables: { anxiety: 15 } };
    const html = generateReportHTML(makeConfig([scale]), data);

    expect(html).toContain('Elevated');
    // The CSS class lives in the stylesheet; assert the paragraph markup is absent.
    expect(html).not.toContain('<p class="score-description">');
  });
});
