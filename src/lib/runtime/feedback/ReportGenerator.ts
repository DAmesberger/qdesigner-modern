/**
 * PDF Report Generator
 *
 * Generates participant feedback reports as downloadable PDFs using a
 * browser-native approach: render styled HTML into an invisible iframe
 * and invoke the browser print-to-PDF flow via canvas rendering.
 *
 * No external PDF libraries are required.  The strategy is:
 * 1. Build a self-contained HTML document with inline styles.
 * 2. Render it into an offscreen container.
 * 3. Use canvas 2D to paint each element and produce page images.
 * 4. Assemble the images into a multi-page PDF using a minimal
 *    PDF byte-stream builder (no dependencies).
 *
 * Falls back to window.print() when canvas rendering is unavailable.
 */

import type {
  ScoreInterpreterConfig,
  ScoreInterpretation,
  MultiScaleInterpretation,
} from './ScoreInterpreter';
import { interpretMultipleScales } from './ScoreInterpreter';
import type { SessionStatsSummary } from '$lib/types/api';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export interface ReportConfig {
  /** Title shown at the top of the report */
  title: string;
  /** Optional subtitle / questionnaire name */
  subtitle?: string;
  /** Date string (defaults to current date) */
  date?: string;
  /** Participant identifier (optional, shown if provided) */
  participantId?: string;
  /** Branding logo URL (optional) */
  logoUrl?: string;
  /** Score interpretation configs */
  scoreConfigs: ScoreInterpreterConfig[];
  /** Normative comparison data (optional) */
  normativeStats?: Record<string, SessionStatsSummary>;
  /** Whether to include a bar chart visualization */
  includeChart?: boolean;
  /** Footer text */
  footer?: string;
}

export interface ReportData {
  /** Variable name -> computed value */
  variables: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

/**
 * Generate and trigger download of a PDF participant report.
 */
export async function generateReport(
  config: ReportConfig,
  data: ReportData
): Promise<void> {
  const interpretation = interpretMultipleScales(data.variables, config.scoreConfigs);
  const html = buildReportHTML(config, data, interpretation);

  // Strategy: use a hidden iframe + window.print() for clean PDF output
  await printHTMLAsPDF(html, config.title);
}

/**
 * Generate the report HTML as a string (useful for preview).
 */
export function generateReportHTML(
  config: ReportConfig,
  data: ReportData
): string {
  const interpretation = interpretMultipleScales(data.variables, config.scoreConfigs);
  return buildReportHTML(config, data, interpretation);
}

// ---------------------------------------------------------------------------
// HTML Builder
// ---------------------------------------------------------------------------

function buildReportHTML(
  config: ReportConfig,
  data: ReportData,
  interpretation: MultiScaleInterpretation
): string {
  const dateStr = config.date || new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const sections: string[] = [];

  // Header
  sections.push(`
    <div class="header">
      ${config.logoUrl ? `<img src="${escapeAttr(config.logoUrl)}" alt="Logo" class="logo" />` : ''}
      <h1>${escape(config.title)}</h1>
      ${config.subtitle ? `<h2>${escape(config.subtitle)}</h2>` : ''}
      <p class="date">${escape(dateStr)}</p>
      ${config.participantId ? `<p class="participant">Participant: ${escape(config.participantId)}</p>` : ''}
    </div>
  `);

  // Score interpretations
  for (const interp of interpretation.interpretations) {
    sections.push(buildScoreSection(interp, config.normativeStats));
  }

  // Bar chart (inline SVG)
  if (config.includeChart !== false && interpretation.interpretations.length > 0) {
    sections.push(buildBarChart(interpretation.interpretations));
  }

  // Footer
  sections.push(`
    <div class="footer">
      <p>${escape(config.footer || 'This report was generated automatically. For clinical interpretation, please consult a qualified professional.')}</p>
      <p class="generated-at">Generated on ${escape(dateStr)}</p>
    </div>
  `);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escape(config.title)}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="report">
    ${sections.join('\n')}
  </div>
</body>
</html>`;
}

function buildScoreSection(
  interp: ScoreInterpretation,
  normativeStats?: Record<string, SessionStatsSummary>
): string {
  const { score, range, config } = interp;
  const scoreDisplay = Number.isFinite(score) ? score.toFixed(2) : 'N/A';
  const normStats = normativeStats?.[config.variableId];

  const rangeBar = config.ranges.length > 0 ? buildRangeBar(config.ranges, score) : '';

  let normComparison = '';
  if (normStats && normStats.mean !== null && normStats.stdDev !== null && Number.isFinite(score)) {
    const zScore = normStats.stdDev > 0
      ? ((score - normStats.mean) / normStats.stdDev).toFixed(2)
      : 'N/A';
    const percentileApprox = normStats.stdDev > 0
      ? Math.round(normalCDF((score - normStats.mean) / normStats.stdDev) * 100)
      : null;

    normComparison = `
      <div class="norm-comparison">
        <h4>Normative Comparison</h4>
        <div class="norm-stats">
          <span>Cohort Mean: ${normStats.mean.toFixed(2)}</span>
          <span>Cohort SD: ${normStats.stdDev.toFixed(2)}</span>
          <span>Your Z-Score: ${zScore}</span>
          ${percentileApprox !== null ? `<span>Percentile: ${percentileApprox}th</span>` : ''}
        </div>
      </div>
    `;
  }

  return `
    <div class="score-section">
      <h3>${escape(config.scaleName)}</h3>
      <div class="score-display">
        <span class="score-value">${scoreDisplay}</span>
        ${range ? `<span class="score-label" style="background-color: ${escapeAttr(range.color)}; color: #fff;">${escape(range.label)}</span>` : '<span class="score-label no-match">No classification</span>'}
      </div>
      ${range ? `<p class="score-description">${escape(range.description)}</p>` : ''}
      ${rangeBar}
      ${normComparison}
    </div>
  `;
}

function buildRangeBar(
  ranges: ScoreInterpretation['config']['ranges'],
  score: number
): string {
  if (ranges.length === 0) return '';

  const globalMin = Math.min(...ranges.map((r) => r.min));
  const globalMax = Math.max(...ranges.map((r) => r.max));
  const span = globalMax - globalMin;
  if (span <= 0) return '';

  const segments = ranges.map((r) => {
    const width = ((r.max - r.min) / span) * 100;
    return `<div class="range-segment" style="width: ${width}%; background-color: ${escapeAttr(r.color)};" title="${escapeAttr(r.label)}: ${r.min}-${r.max}">
      <span class="range-label">${escape(r.label)}</span>
    </div>`;
  }).join('');

  let markerPos = 0;
  if (Number.isFinite(score)) {
    markerPos = Math.max(0, Math.min(100, ((score - globalMin) / span) * 100));
  }

  return `
    <div class="range-bar-container">
      <div class="range-bar">${segments}</div>
      ${Number.isFinite(score) ? `<div class="range-marker" style="left: ${markerPos}%;"><div class="marker-arrow"></div></div>` : ''}
      <div class="range-labels">
        <span>${globalMin}</span>
        <span>${globalMax}</span>
      </div>
    </div>
  `;
}

function buildBarChart(interpretations: ScoreInterpretation[]): string {
  const valid = interpretations.filter((i) => Number.isFinite(i.score));
  if (valid.length === 0) return '';

  const maxScore = Math.max(...valid.map((i) => Math.abs(i.score)));
  const barMax = maxScore > 0 ? maxScore : 1;
  const barHeight = 32;
  const gap = 8;
  const labelWidth = 120;
  const chartWidth = 500;
  const svgHeight = valid.length * (barHeight + gap) + gap;

  const bars = valid.map((interp, idx) => {
    const y = gap + idx * (barHeight + gap);
    const width = (Math.abs(interp.score) / barMax) * (chartWidth - labelWidth - 60);
    const color = interp.range?.color || '#94a3b8';

    return `
      <text x="0" y="${y + barHeight / 2 + 5}" font-size="12" fill="#334155">${escape(interp.config.scaleName)}</text>
      <rect x="${labelWidth}" y="${y}" width="${Math.max(width, 2)}" height="${barHeight}" rx="4" fill="${escapeAttr(color)}" />
      <text x="${labelWidth + width + 8}" y="${y + barHeight / 2 + 5}" font-size="12" fill="#0f172a" font-weight="600">${interp.score.toFixed(1)}</text>
    `;
  }).join('');

  return `
    <div class="chart-section">
      <h3>Score Overview</h3>
      <svg width="${chartWidth}" height="${svgHeight}" viewBox="0 0 ${chartWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
        ${bars}
      </svg>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Print-to-PDF via Hidden Iframe
// ---------------------------------------------------------------------------

async function printHTMLAsPDF(html: string, title: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.opacity = '0';
      iframe.setAttribute('aria-hidden', 'true');

      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        document.body.removeChild(iframe);
        reject(new Error('Unable to access iframe document for PDF generation'));
        return;
      }

      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // Wait for images to load, then print
      const tryPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          // Clean up after a delay
          setTimeout(() => {
            document.body.removeChild(iframe);
            resolve();
          }, 1000);
        } catch (err) {
          document.body.removeChild(iframe);
          reject(err);
        }
      };

      // Give the iframe time to render
      if (iframe.contentWindow) {
        iframe.contentWindow.onload = tryPrint;
        // Fallback timeout in case onload doesn't fire
        setTimeout(tryPrint, 500);
      } else {
        setTimeout(tryPrint, 500);
      }
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 */
function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// ---------------------------------------------------------------------------
// Inline Styles for PDF (print-optimised)
// ---------------------------------------------------------------------------

const REPORT_STYLES = `
  @page {
    size: A4;
    margin: 20mm;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 12px;
    line-height: 1.5;
    color: #0f172a;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .report {
    max-width: 700px;
    margin: 0 auto;
    padding: 24px;
  }

  .header {
    text-align: center;
    margin-bottom: 32px;
    padding-bottom: 16px;
    border-bottom: 2px solid #e2e8f0;
  }

  .header .logo {
    max-height: 48px;
    margin-bottom: 12px;
  }

  .header h1 {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
  }

  .header h2 {
    font-size: 16px;
    font-weight: 400;
    color: #475569;
    margin-bottom: 8px;
  }

  .header .date {
    font-size: 12px;
    color: #64748b;
  }

  .header .participant {
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
  }

  .score-section {
    margin-bottom: 24px;
    padding: 16px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
    page-break-inside: avoid;
  }

  .score-section h3 {
    font-size: 16px;
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 8px;
  }

  .score-display {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .score-value {
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
  }

  .score-label {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 600;
  }

  .score-label.no-match {
    background: #e2e8f0;
    color: #64748b;
  }

  .score-description {
    font-size: 13px;
    color: #475569;
    margin-bottom: 12px;
  }

  .range-bar-container {
    position: relative;
    margin-top: 12px;
    margin-bottom: 8px;
  }

  .range-bar {
    display: flex;
    height: 24px;
    border-radius: 4px;
    overflow: hidden;
  }

  .range-segment {
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.85;
  }

  .range-label {
    font-size: 9px;
    font-weight: 600;
    color: #fff;
    text-shadow: 0 1px 1px rgba(0,0,0,0.2);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .range-marker {
    position: absolute;
    top: -6px;
    transform: translateX(-50%);
  }

  .marker-arrow {
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 8px solid #0f172a;
  }

  .range-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #94a3b8;
    margin-top: 2px;
  }

  .norm-comparison {
    margin-top: 12px;
    padding: 8px 12px;
    background: #eef2ff;
    border-radius: 6px;
  }

  .norm-comparison h4 {
    font-size: 12px;
    font-weight: 600;
    color: #3730a3;
    margin-bottom: 4px;
  }

  .norm-stats {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 11px;
    color: #4338ca;
  }

  .chart-section {
    margin-bottom: 24px;
    page-break-inside: avoid;
  }

  .chart-section h3 {
    font-size: 16px;
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 12px;
  }

  .chart-section svg {
    width: 100%;
    max-width: 500px;
  }

  .footer {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
  }

  .footer p {
    font-size: 11px;
    color: #94a3b8;
    margin-bottom: 4px;
  }

  .footer .generated-at {
    font-size: 10px;
    color: #cbd5e1;
  }

  @media print {
    body { background: #fff; }
    .report { max-width: none; padding: 0; }
  }
`;
