import { describe, it, expect, vi } from 'vitest';
import {
  generateReportHTML,
  generateReportBlob,
  type ReportConfig,
  type ReportData,
} from './ReportGenerator';
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

  it('renders a Normative Comparison section with T-score / percentile when a norm is supplied (E-FEEDBACK-2)', () => {
    // Norm mean 10, SD 3 -> a score of 13 is +1 SD -> z=1, ~84th percentile.
    const config: ReportConfig = {
      ...makeConfig([scale]),
      normativeStats: {
        anxiety: {
          sampleCount: 5000,
          mean: 10,
          median: null,
          stdDev: 3,
          min: null,
          max: null,
          p10: null,
          p25: null,
          p50: null,
          p75: null,
          p90: null,
          p95: null,
          p99: null,
        },
      },
    };
    const html = generateReportHTML(config, { variables: { anxiety: 13 } });

    expect(html).toContain('Normative Comparison');
    expect(html).toContain('1.00'); // z-score
    expect(html).toContain('84th'); // percentile
  });

  it('omits the Normative Comparison section when no norm is supplied', () => {
    const html = generateReportHTML(makeConfig([scale]), { variables: { anxiety: 5 } });
    expect(html).not.toContain('Normative Comparison');
  });

  // E-FEEDBACK-6: per-band piped narrative
  const pipedScale: ScoreInterpreterConfig = {
    variableId: 'anxiety',
    scaleName: 'Anxiety',
    ranges: [
      {
        min: 0,
        max: 10,
        label: 'Low',
        description: '',
        color: '#22c55e',
        message: 'Your anxiety score of {{score.anxiety.value}} is in the {{score.anxiety.band}} range.',
      },
      { min: 11, max: 20, label: 'Elevated', description: '', color: '#f59e0b' },
    ],
  };

  it('renders the matched band message with piped score.<scaleId> values substituted (E-FEEDBACK-6)', () => {
    const html = generateReportHTML(makeConfig([pipedScale]), {
      variables: {
        anxiety: 5,
        'score.anxiety': { value: 5, band: 'Low' },
      },
    });

    expect(html).toContain('<p class="score-message">');
    expect(html).toContain('Your anxiety score of 5 is in the Low range.');
    // The raw template tokens must not survive.
    expect(html).not.toContain('{{score.anxiety.value}}');
  });

  it('renders no band message paragraph when the matched band has no message (E-FEEDBACK-6)', () => {
    // Score 15 matches the "Elevated" band, which carries no message.
    const html = generateReportHTML(makeConfig([pipedScale]), {
      variables: {
        anxiety: 15,
        'score.anxiety': { value: 15, band: 'Elevated' },
      },
    });

    expect(html).toContain('Elevated');
    expect(html).not.toContain('<p class="score-message">');
  });
});

describe('generateReportBlob (E-FEEDBACK-5)', () => {
  const scale: ScoreInterpreterConfig = {
    variableId: 'anxiety',
    scaleName: 'Anxiety',
    ranges: [
      { min: 0, max: 10, label: 'Low', description: 'Anxiety is within a healthy range.', color: '#22c55e' },
      { min: 11, max: 20, label: 'Elevated', description: 'Elevated anxiety.', color: '#f59e0b' },
    ],
  };

  // jsdom's Blob does not implement arrayBuffer()/text(); read via FileReader.
  function readBlobBytes(blob: Blob): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(blob);
    });
  }

  async function blobText(blob: Blob): Promise<string> {
    const bytes = await readBlobBytes(blob);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return s;
  }

  async function blobHead(blob: Blob, n: number): Promise<string> {
    const bytes = await readBlobBytes(blob);
    return String.fromCharCode(...bytes.slice(0, n));
  }

  it('produces a non-empty application/pdf Blob and never opens a DOM print dialog', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const data: ReportData = { variables: { anxiety: 5 } };

    const blob = await generateReportBlob(makeConfig([scale]), data);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
    // A real PDF byte stream begins with the "%PDF-" signature.
    expect(await blobHead(blob, 5)).toBe('%PDF-');
    // The Blob path must not fall back to the print flow.
    expect(printSpy).not.toHaveBeenCalled();

    printSpy.mockRestore();
  });

  it('still yields a valid PDF Blob when a normative table is included', async () => {
    const config: ReportConfig = {
      ...makeConfig([scale]),
      normativeStats: {
        anxiety: {
          sampleCount: 5000,
          mean: 10,
          median: null,
          stdDev: 3,
          min: null,
          max: null,
          p10: null,
          p25: null,
          p50: null,
          p75: null,
          p90: null,
          p95: null,
          p99: null,
        },
      },
    };

    const blob = await generateReportBlob(config, { variables: { anxiety: 13 } });

    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
    expect(await blobHead(blob, 5)).toBe('%PDF-');
  });

  it('sanitizes researcher-authored titles before they reach the PDF (no raw markup bytes)', async () => {
    const config = makeConfig([scale]);
    config.title = 'Wellbeing <img src=x onerror=alert(1)> Report';

    const blob = await generateReportBlob(config, { variables: { anxiety: 5 } });
    const text = await blobText(blob);

    // The dangerous markup must not survive into the PDF content stream.
    expect(text).not.toContain('onerror');
    expect(text).not.toContain('<img');
  });
});
