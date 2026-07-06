/**
 * Participant Feedback Report Generator
 *
 * Produces a real, downloadable PDF file for a participant's feedback report —
 * a genuine `application/pdf` byte stream assembled in-process, NOT a browser
 * print dialog. `generateReport` (and its testable core `generateReportBlob`)
 * builds the PDF with a small self-contained encoder (`Pdf` below): standard
 * Helvetica text for the score / band / normative sections plus rasterized
 * Chart.js charts (score overview bar, multi-scale radar profile, and a norm
 * distribution) embedded as JPEG image XObjects. The file is handed to the user
 * via `URL.createObjectURL` + an `<a download>` click.
 *
 * Chart.js is pulled in with a dynamic `import()` so it stays off the fillout
 * critical path (consistent with the project's lazy-load posture) and so the
 * text-only PDF still renders in headless environments where canvas rasterizing
 * is unavailable.
 *
 * `printHTMLAsPDF` survives only as a degraded fallback for the rare case where
 * `Blob` / `URL.createObjectURL` is unavailable; the primary path never opens a
 * print dialog.
 *
 * Researcher-authored strings (titles, subtitles, scale names, descriptions,
 * footer) are routed through the centralized DOMPurify sink (`sanitizeHtml`,
 * P2-T1) and reduced to plain text before they reach the PDF encoder.
 *
 * `generateReportHTML` exposes the inline-styled HTML document on its own for
 * preview and testing.
 */

import type {
  ScoreInterpreterConfig,
  ScoreInterpretation,
  MultiScaleInterpretation,
} from './ScoreInterpreter';
import { interpretMultipleScales, interpretBandMessage } from './ScoreInterpreter';
import { normalCDF } from '$lib/shared/utils/statistics';
import { sanitizeHtml } from '$lib/services/markdownProcessor';
import type { SessionStatsSummary } from '$lib/shared/types/api';

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
 * Generate and trigger download of a real PDF participant report.
 *
 * Primary path: assemble an `application/pdf` Blob (`generateReportBlob`) and
 * hand it to the browser as a file download via `URL.createObjectURL` + an
 * `<a download>` click — no print dialog. The `window.print()` iframe flow is
 * only used as a fallback when Blob / object-URL download is unavailable.
 */
export async function generateReport(
  config: ReportConfig,
  data: ReportData
): Promise<void> {
  if (!blobDownloadSupported()) {
    const interpretation = interpretMultipleScales(data.variables, config.scoreConfigs);
    const html = buildReportHTML(config, data, interpretation);
    await printHTMLAsPDF(html, config.title);
    return;
  }

  const blob = await generateReportBlob(config, data);
  triggerDownload(blob, pdfFilename(config.title));
}

/**
 * Build the participant report as a real `application/pdf` Blob.
 *
 * This is the testable core of {@link generateReport}: it performs NO DOM
 * download and NEVER opens a print dialog. Charts are rasterized best-effort
 * (skipped when canvas rendering is unavailable, e.g. headless test runs) so a
 * valid text-only PDF is always produced.
 */
export async function generateReportBlob(
  config: ReportConfig,
  data: ReportData
): Promise<Blob> {
  const interpretation = interpretMultipleScales(data.variables, config.scoreConfigs);
  const charts = await renderReportCharts(config, interpretation);
  const bytes = buildReportPdf(config, interpretation, charts, data.variables);
  return new Blob([bytes], { type: 'application/pdf' });
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
    sections.push(buildScoreSection(interp, config.normativeStats, data.variables));
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
  normativeStats?: Record<string, SessionStatsSummary>,
  variables: Record<string, unknown> = {}
): string {
  const { score, range, config } = interp;
  const scoreDisplay = Number.isFinite(score) ? score.toFixed(2) : 'N/A';
  const normStats = normativeStats?.[config.variableId];
  const bandMessage = interpretBandMessage(range, variables);

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
      ${range && range.description ? `<p class="score-description">${escape(range.description)}</p>` : ''}
      ${bandMessage ? `<p class="score-message">${escape(bandMessage)}</p>` : ''}
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
// Fallback: Print-to-PDF via Hidden Iframe
//
// Only reached when `Blob` / `URL.createObjectURL` is unavailable (see
// `blobDownloadSupported`). The primary `generateReport` path produces a real
// downloadable PDF file and never invokes this print flow.
// ---------------------------------------------------------------------------

async function printHTMLAsPDF(html: string, _title: string): Promise<void> {
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
// Download trigger
// ---------------------------------------------------------------------------

/** True when a genuine Blob file download is possible in this environment. */
function blobDownloadSupported(): boolean {
  return (
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof document !== 'undefined'
  );
}

/** Turn a report title into a safe `.pdf` filename. */
function pdfFilename(title: string): string {
  const base = (title || 'participant-report')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'participant-report'}.pdf`;
}

/** Trigger a real file download for a PDF Blob (no print dialog). */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Sanitization (P2-T1 centralized DOMPurify sink)
// ---------------------------------------------------------------------------

/**
 * Reduce a researcher-authored string to safe plain text for the PDF encoder.
 *
 * Runs the value through the centralized DOMPurify sink (`sanitizeHtml`) first,
 * then strips the surviving markup so nothing but text reaches the PDF content
 * stream. Belt-and-braces: the PDF text path cannot execute markup anyway, but
 * routing through the shared sink keeps every researcher-content path covered by
 * construction.
 */
function sanitizeText(input: string | undefined | null): string {
  const clean = sanitizeHtml(input ?? '');
  let text: string;
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = clean;
    text = el.textContent ?? '';
  } else {
    text = clean.replace(/<[^>]*>/g, '');
  }
  return text.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Chart rasterization (Chart.js -> JPEG, best-effort)
// ---------------------------------------------------------------------------

interface ChartImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

interface ReportChartImages {
  overview?: ChartImage;
  radar?: ChartImage;
  distribution?: ChartImage;
}

const CHART_PX_W = 900;
const CHART_PX_H = 500;

/**
 * Render the report's charts (score-overview bar, multi-scale radar profile,
 * and a norm distribution) to embedded JPEG images. Every step is best-effort:
 * when canvas rasterization is unavailable (headless test runs, SSR) an empty
 * set is returned and the PDF is produced text-only.
 */
async function renderReportCharts(
  config: ReportConfig,
  interpretation: MultiScaleInterpretation
): Promise<ReportChartImages> {
  if (config.includeChart === false) return {};
  if (typeof document === 'undefined') return {};

  // Probe canvas support before pulling Chart.js in.
  let probe: HTMLCanvasElement;
  try {
    probe = document.createElement('canvas');
    if (!probe.getContext || !probe.getContext('2d')) return {};
  } catch {
    return {};
  }

  let Chart: typeof import('$lib/shared/charts').Chart;
  try {
    ({ Chart } = await import('$lib/shared/charts'));
  } catch {
    return {};
  }

  const valid = interpretation.interpretations.filter((i) => Number.isFinite(i.score));
  if (valid.length === 0) return {};

  const images: ReportChartImages = {};

  // White-background plugin: JPEG has no alpha, so draw white behind the chart.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whiteBg = {
    id: 'report-white-bg',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeDraw(c: any) {
      const ctx = c.ctx as CanvasRenderingContext2D;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.restore();
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rasterize = (build: (canvas: HTMLCanvasElement) => any): ChartImage | undefined => {
    let chart: { toBase64Image: (t: string, q: number) => string; destroy: () => void } | undefined;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CHART_PX_W;
      canvas.height = CHART_PX_H;
      chart = build(canvas);
      const dataUrl = chart!.toBase64Image('image/jpeg', 0.92);
      if (!dataUrl || !dataUrl.startsWith('data:image/jpeg')) return undefined;
      const bytes = dataUrlToBytes(dataUrl);
      if (!bytes || bytes.length === 0) return undefined;
      return { bytes, width: CHART_PX_W, height: CHART_PX_H };
    } catch {
      return undefined;
    } finally {
      try {
        chart?.destroy();
      } catch {
        /* ignore */
      }
    }
  };

  const labels = valid.map((i) => sanitizeText(i.config.scaleName) || i.config.variableId);
  const values = valid.map((i) => i.score);
  const colors = valid.map((i) => i.range?.color || '#3B82F6');

  // Score-overview bar chart (always, when there is at least one score).
  images.overview = rasterize(
    (canvas) =>
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Score',
              data: values,
              backgroundColor: colors.map((c) => hexToRgba(c, 0.8)),
              borderColor: colors,
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: false,
          animation: false,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Score Overview', font: { size: 18 } },
          },
          scales: { y: { beginAtZero: true } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        plugins: [whiteBg],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
  );

  // Radar profile — only meaningful with 3+ scales.
  if (valid.length >= 3) {
    const cohortMean = firstFiniteCohortMean(config, valid);
    images.radar = rasterize(
      (canvas) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const datasets: any[] = [
          {
            label: 'Your Profile',
            data: values,
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.18)',
            borderWidth: 2,
            pointBackgroundColor: '#3B82F6',
          },
        ];
        if (cohortMean !== null) {
          datasets.push({
            label: 'Cohort Average',
            data: new Array(values.length).fill(cohortMean),
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.10)',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
          });
        }
        return new Chart(canvas, {
          type: 'radar',
          data: { labels, datasets },
          options: {
            responsive: false,
            animation: false,
            plugins: {
              legend: { display: datasets.length > 1, position: 'bottom' },
              title: { display: true, text: 'Profile', font: { size: 18 } },
            },
            scales: { r: { beginAtZero: true } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          plugins: [whiteBg],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }
    );
  }

  // Norm distribution — first scale that carries a normative mean/SD.
  const normScale = valid.find((i) => hasNorm(config, i));
  if (normScale) {
    const norm = config.normativeStats![normScale.config.variableId]!;
    const mean = norm.mean!;
    const sd = norm.stdDev!;
    const score = normScale.score;
    images.distribution = rasterize(
      (canvas) => {
        const pts: { x: number; y: number }[] = [];
        const range = 4 * sd;
        const step = (2 * range) / 120;
        for (let i = 0; i <= 120; i++) {
          const x = mean - range + i * step;
          pts.push({ x, y: normalPdf(x, mean, sd) });
        }
        return new Chart(canvas, {
          type: 'line',
          data: {
            datasets: [
              {
                label: `${sanitizeText(normScale.config.scaleName)} — population`,
                data: pts,
                borderColor: '#64748B',
                backgroundColor: 'rgba(100, 116, 139, 0.10)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.3,
              },
              {
                label: 'Your Score',
                data: [
                  { x: score, y: 0 },
                  { x: score, y: normalPdf(score, mean, sd) },
                ],
                borderColor: '#EF4444',
                borderWidth: 2,
                pointRadius: 0,
              },
            ],
          },
          options: {
            responsive: false,
            animation: false,
            plugins: {
              legend: { display: true, position: 'bottom' },
              title: { display: true, text: 'Normative Distribution', font: { size: 18 } },
            },
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Score' } },
              y: { beginAtZero: true, title: { display: true, text: 'Density' } },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          plugins: [whiteBg],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }
    );
  }

  return images;
}

function normalPdf(x: number, mean: number, sd: number): number {
  if (sd <= 0) return 0;
  return (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / sd) ** 2);
}

function hasNorm(config: ReportConfig, interp: ScoreInterpretation): boolean {
  const n = config.normativeStats?.[interp.config.variableId];
  return !!n && n.mean !== null && n.stdDev !== null && n.stdDev > 0 && Number.isFinite(interp.score);
}

function firstFiniteCohortMean(config: ReportConfig, interps: ScoreInterpretation[]): number | null {
  for (const i of interps) {
    const n = config.normativeStats?.[i.config.variableId];
    if (n && n.mean !== null && Number.isFinite(n.mean)) return n.mean;
  }
  return null;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length < 6) return `rgba(59, 130, 246, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Decode a `data:...;base64,` URL to its raw bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const b64 = dataUrl.slice(comma + 1);
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  return bytes;
}

// ---------------------------------------------------------------------------
// Minimal PDF encoder
//
// A dependency-free writer for exactly the features this report needs: A4
// pages, the two standard Helvetica fonts (no embedding required), filled
// rectangles, and JPEG image XObjects (DCTDecode — canvas JPEGs drop straight
// in). Byte offsets are tracked for the xref table; binary image streams are
// kept as raw Uint8Array chunks so they survive assembly intact.
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

const PDF_BLACK: Rgb = [0.06, 0.09, 0.16];
const PDF_MUTED: Rgb = [0.4, 0.45, 0.5];
const PDF_WHITE: Rgb = [1, 1, 1];

class Pdf {
  readonly W = 595.28; // A4 width in pt
  readonly H = 841.89; // A4 height in pt
  readonly margin = 56; // ~20mm

  /** Distance of the layout cursor from the top of the page. */
  y = this.margin;

  private images: { num: number; name: string; bytes: Uint8Array; w: number; h: number }[] = [];
  private pages: { content: string; imgs: Set<string> }[] = [];
  private cur: { content: string; imgs: Set<string> };

  constructor() {
    this.cur = { content: '', imgs: new Set() };
    this.pages.push(this.cur);
  }

  get contentWidth(): number {
    return this.W - 2 * this.margin;
  }

  newPage(): void {
    this.cur = { content: '', imgs: new Set() };
    this.pages.push(this.cur);
    this.y = this.margin;
  }

  /** Break to a new page if `space` pt would overflow the bottom margin. */
  ensure(space: number): void {
    if (this.y + space > this.H - this.margin) this.newPage();
  }

  moveDown(pt: number): void {
    this.y += pt;
  }

  /** Draw one text line with its top at the current cursor; advance the cursor. */
  line(
    text: string,
    opts: { size?: number; bold?: boolean; color?: Rgb; x?: number; gap?: number } = {}
  ): void {
    const size = opts.size ?? 11;
    const lineHeight = size * 1.35;
    this.ensure(lineHeight);
    this.drawTextAt(text, opts.x ?? this.margin, this.y, size, !!opts.bold, opts.color ?? PDF_BLACK);
    this.y += lineHeight + (opts.gap ?? 0);
  }

  /** Word-wrap `text` to the content width and draw each line. */
  paragraph(
    text: string,
    opts: { size?: number; bold?: boolean; color?: Rgb; x?: number; gap?: number } = {}
  ): void {
    const size = opts.size ?? 11;
    const x = opts.x ?? this.margin;
    const maxWidth = this.W - this.margin - x;
    const lines = wrapText(text, size, !!opts.bold, maxWidth);
    for (const ln of lines) {
      this.line(ln, { ...opts, x });
    }
    if (opts.gap) this.y += opts.gap;
  }

  rect(x: number, yTop: number, w: number, h: number, color: Rgb): void {
    const py = (this.H - (yTop + h)).toFixed(2);
    this.cur.content += `${fmtColor(color)} rg\n${x.toFixed(2)} ${py} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;
  }

  /** A colored pill with centered white label (e.g. a band chip). */
  pill(label: string, x: number, yTop: number, color: Rgb): number {
    const size = 10;
    const padX = 8;
    const textW = measureWidth(label, size, true);
    const w = textW + padX * 2;
    const h = 16;
    this.ensure(h);
    this.rect(x, yTop, w, h, color);
    this.drawTextAt(label, x + padX, yTop + 3.5, size, true, PDF_WHITE);
    return w;
  }

  image(handleName: string, xTop: number, yTop: number, w: number, h: number): void {
    this.cur.imgs.add(handleName);
    const py = (this.H - (yTop + h)).toFixed(2);
    this.cur.content += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${xTop.toFixed(2)} ${py} cm ${handleName} Do Q\n`;
  }

  /** Register a JPEG chart; returns the XObject resource name (e.g. `/Im0`). */
  addImage(img: ChartImage): string {
    const name = `/Im${this.images.length}`;
    // Object numbers are assigned in build(); the name is stable.
    this.images.push({ num: -1, name, bytes: img.bytes, w: img.width, h: img.height });
    return name;
  }

  /** Place a chart image scaled to the content width; advances the cursor. */
  placeChart(img: ChartImage, gap = 12): void {
    const name = this.addImage(img);
    const w = this.contentWidth;
    const h = (img.height / img.width) * w;
    this.ensure(h);
    this.image(name, this.margin, this.y, w, h);
    this.y += h + gap;
  }

  private drawTextAt(text: string, x: number, yTop: number, size: number, bold: boolean, color: Rgb): void {
    const font = bold ? '/F2' : '/F1';
    const py = (this.H - (yTop + size)).toFixed(2);
    const safe = pdfEscape(toWinAnsi(text));
    this.cur.content += `${fmtColor(color)} rg\nBT ${font} ${size} Tf ${x.toFixed(2)} ${py} Td (${safe}) Tj ET\n`;
  }

  /** Serialize the document to PDF bytes. */
  build(): Uint8Array {
    // Object numbering: 1 catalog, 2 pages, 3 F1, 4 F2, images, then per-page
    // (content, page) pairs.
    const catalog = 1;
    const pagesObj = 2;
    const f1 = 3;
    const f2 = 4;
    let next = 5;
    for (const im of this.images) im.num = next++;
    const imgByName = new Map(this.images.map((im) => [im.name, im.num]));

    const pageNums: number[] = [];
    const bodies: { num: number; parts: (string | Uint8Array)[] }[] = [];

    bodies.push({ num: f1, parts: [obj(f1, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')] });
    bodies.push({ num: f2, parts: [obj(f2, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')] });

    for (const im of this.images) {
      const header =
        `${im.num} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`;
      bodies.push({ num: im.num, parts: [header, im.bytes, '\nendstream\nendobj\n'] });
    }

    for (const page of this.pages) {
      const contentNum = next++;
      const pageNum = next++;
      pageNums.push(pageNum);

      const contentBytes = latin1Len(page.content);
      bodies.push({
        num: contentNum,
        parts: [`${contentNum} 0 obj\n<< /Length ${contentBytes} >>\nstream\n${page.content}endstream\nendobj\n`],
      });

      let xobjDict = '';
      if (page.imgs.size > 0) {
        const entries = [...page.imgs].map((nm) => `${nm} ${imgByName.get(nm)} 0 R`).join(' ');
        xobjDict = ` /XObject << ${entries} >>`;
      }
      const pageDict =
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${this.W} ${this.H}] ` +
        `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobjDict} >> /Contents ${contentNum} 0 R >>`;
      bodies.push({ num: pageNum, parts: [obj(pageNum, pageDict)] });
    }

    const kids = pageNums.map((n) => `${n} 0 R`).join(' ');
    bodies.push({ num: pagesObj, parts: [obj(pagesObj, `<< /Type /Pages /Count ${pageNums.length} /Kids [ ${kids} ] >>`)] });
    bodies.push({ num: catalog, parts: [obj(catalog, `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`)] });

    const maxNum = next - 1;
    const byNum = new Map(bodies.map((b) => [b.num, b.parts]));

    const parts: (string | Uint8Array)[] = [];
    const offsets: number[] = new Array(maxNum + 1).fill(0);
    let offset = 0;
    const push = (p: string | Uint8Array) => {
      parts.push(p);
      offset += typeof p === 'string' ? latin1Len(p) : p.length;
    };

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    for (let n = 1; n <= maxNum; n++) {
      offsets[n] = offset;
      const bodyParts = byNum.get(n);
      if (!bodyParts) continue;
      for (const p of bodyParts) push(p);
    }

    const xrefOffset = offset;
    let xref = `xref\n0 ${maxNum + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= maxNum; n++) {
      xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    }
    push(xref);
    push(`trailer\n<< /Size ${maxNum + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    return concatParts(parts);
  }
}

function obj(num: number, dict: string): string {
  return `${num} 0 obj\n${dict}\nendobj\n`;
}

function fmtColor(c: Rgb): string {
  return `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Drop code points a standard Helvetica WinAnsi font cannot render. */
function toWinAnsi(s: string): string {
  let out = '';
  for (const ch of s) out += ch.charCodeAt(0) <= 0xff ? ch : '?';
  return out;
}

/** Byte length of a string once Latin1-encoded (1 byte / char). */
function latin1Len(s: string): number {
  return s.length;
}

function latin1Encode(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function concatParts(parts: (string | Uint8Array)[]): Uint8Array {
  const arrs = parts.map((p) => (typeof p === 'string' ? latin1Encode(p) : p));
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

// Approximate Helvetica advance widths (fraction of font size). Good enough for
// wrapping decisions without shipping full AFM metrics.
const AVG_ADVANCE = 0.5;
const AVG_ADVANCE_BOLD = 0.54;

function measureWidth(text: string, size: number, bold: boolean): number {
  return text.length * size * (bold ? AVG_ADVANCE_BOLD : AVG_ADVANCE);
}

function wrapText(text: string, size: number, bold: boolean, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let cur = '';
  const fits = (s: string) => measureWidth(s, size, bold) <= maxWidth;
  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (fits(candidate)) {
      cur = candidate;
      continue;
    }
    if (cur) lines.push(cur);
    if (fits(word)) {
      cur = word;
    } else {
      // Hard-break an over-long token.
      let chunk = '';
      for (const ch of word) {
        if (fits(chunk + ch)) {
          chunk += ch;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      cur = chunk;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------------------
// Report layout -> PDF
// ---------------------------------------------------------------------------

function buildReportPdf(
  config: ReportConfig,
  interpretation: MultiScaleInterpretation,
  charts: ReportChartImages,
  variables: Record<string, unknown> = {}
): Uint8Array {
  const pdf = new Pdf();
  const dateStr =
    sanitizeText(config.date) ||
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Header
  pdf.line(sanitizeText(config.title) || 'Participant Feedback Report', { size: 22, bold: true });
  if (config.subtitle) pdf.line(sanitizeText(config.subtitle), { size: 13, color: PDF_MUTED });
  pdf.line(dateStr, { size: 10, color: PDF_MUTED });
  if (config.participantId) {
    pdf.line(`Participant: ${sanitizeText(config.participantId)}`, { size: 10, color: PDF_MUTED });
  }
  pdf.moveDown(6);
  pdf.rect(pdf.margin, pdf.y, pdf.contentWidth, 1.2, [0.89, 0.91, 0.94]);
  pdf.moveDown(16);

  // Charts (best-effort; skipped when rasterization was unavailable).
  if (charts.overview) pdf.placeChart(charts.overview);
  if (charts.radar) pdf.placeChart(charts.radar);

  // Per-scale sections
  for (const interp of interpretation.interpretations) {
    writeScaleSection(pdf, interp, config.normativeStats, variables);
  }

  // Distribution chart after the scale sections.
  if (charts.distribution) {
    pdf.moveDown(4);
    pdf.placeChart(charts.distribution);
  }

  // Normative comparison table (E-FEEDBACK-2)
  writeNormativeTable(pdf, interpretation, config.normativeStats);

  // Footer
  pdf.moveDown(10);
  pdf.rect(pdf.margin, pdf.y, pdf.contentWidth, 1, [0.89, 0.91, 0.94]);
  pdf.moveDown(10);
  pdf.paragraph(
    sanitizeText(config.footer) ||
      'This report was generated automatically. For clinical interpretation, please consult a qualified professional.',
    { size: 9, color: PDF_MUTED }
  );
  pdf.line(`Generated on ${dateStr}`, { size: 8, color: [0.7, 0.73, 0.76] });

  return pdf.build();
}

function writeScaleSection(
  pdf: Pdf,
  interp: ScoreInterpretation,
  normativeStats?: Record<string, SessionStatsSummary>,
  variables: Record<string, unknown> = {}
): void {
  const { score, range, config } = interp;
  pdf.ensure(60);
  pdf.moveDown(4);
  pdf.line(sanitizeText(config.scaleName) || config.variableId, { size: 14, bold: true });

  const scoreDisplay = Number.isFinite(score) ? score.toFixed(2) : 'N/A';
  // Score value line, then the band pill just below (keeps layout simple).
  pdf.line(`Score: ${scoreDisplay}`, { size: 13, bold: true });
  if (range) {
    pdf.ensure(20);
    pdf.pill(sanitizeText(range.label) || 'Result', pdf.margin, pdf.y, hexToRgb01(range.color));
    pdf.moveDown(22);
  } else {
    pdf.line('No classification', { size: 10, color: PDF_MUTED });
  }

  if (range && range.description) {
    const desc = sanitizeText(range.description);
    if (desc) pdf.paragraph(desc, { size: 11, color: [0.28, 0.33, 0.4] });
  }

  // Personalized band narrative (E-FEEDBACK-6): interpolate the matched band's
  // piped message against the participant's live variables.
  const bandMessage = sanitizeText(interpretBandMessage(range, variables));
  if (bandMessage) {
    pdf.paragraph(bandMessage, { size: 11, color: PDF_BLACK });
  }

  const normStats = normativeStats?.[config.variableId];
  if (normStats && normStats.mean !== null && normStats.stdDev !== null && Number.isFinite(score)) {
    const parts = [`Cohort Mean: ${normStats.mean.toFixed(2)}`, `Cohort SD: ${normStats.stdDev.toFixed(2)}`];
    if (normStats.stdDev > 0) {
      const z = (score - normStats.mean) / normStats.stdDev;
      parts.push(`Z-Score: ${z.toFixed(2)}`);
      parts.push(`Percentile: ${Math.round(normalCDF(z) * 100)}th`);
    }
    pdf.line('Normative Comparison', { size: 11, bold: true, color: [0.22, 0.19, 0.64] });
    pdf.paragraph(parts.join('   '), { size: 10, color: [0.26, 0.22, 0.79] });
  }
  pdf.moveDown(6);
}

function writeNormativeTable(
  pdf: Pdf,
  interpretation: MultiScaleInterpretation,
  normativeStats?: Record<string, SessionStatsSummary>
): void {
  if (!normativeStats) return;
  const rows = interpretation.interpretations.filter((i) => {
    const n = normativeStats[i.config.variableId];
    return !!n && n.mean !== null && n.stdDev !== null && Number.isFinite(i.score);
  });
  if (rows.length === 0) return;

  pdf.ensure(60);
  pdf.moveDown(6);
  pdf.line('Normative Comparison Table', { size: 13, bold: true });
  pdf.moveDown(2);

  const cols = [
    { title: 'Scale', w: 0.34 },
    { title: 'Score', w: 0.13 },
    { title: 'Mean', w: 0.13 },
    { title: 'SD', w: 0.13 },
    { title: 'Z', w: 0.11 },
    { title: 'Pctile', w: 0.16 },
  ];
  const tableW = pdf.contentWidth;
  const xs: number[] = [];
  let acc = pdf.margin;
  for (const c of cols) {
    xs.push(acc);
    acc += c.w * tableW;
  }

  // Header row
  pdf.ensure(18);
  pdf.rect(pdf.margin, pdf.y, tableW, 16, [0.93, 0.94, 0.96]);
  const headerTop = pdf.y;
  cols.forEach((c, i) => {
    pdf.line(c.title, { size: 10, bold: true, x: xs[i]! + 4 });
    pdf.y = headerTop; // keep all header cells on the same line
  });
  pdf.y = headerTop + 16;

  for (const interp of rows) {
    const n = normativeStats[interp.config.variableId]!;
    const z = n.stdDev! > 0 ? (interp.score - n.mean!) / n.stdDev! : null;
    const cells = [
      sanitizeText(interp.config.scaleName) || interp.config.variableId,
      interp.score.toFixed(2),
      n.mean!.toFixed(2),
      n.stdDev!.toFixed(2),
      z !== null ? z.toFixed(2) : 'N/A',
      z !== null ? `${Math.round(normalCDF(z) * 100)}th` : 'N/A',
    ];
    pdf.ensure(16);
    const rowTop = pdf.y;
    cells.forEach((cell, i) => {
      // First column may wrap; keep others single-line for a clean grid.
      const maxW = cols[i]!.w * tableW - 6;
      const text = i === 0 ? clampToWidth(cell, 10, false, maxW) : cell;
      pdf.line(text, { size: 10, x: xs[i]! + 4 });
      pdf.y = rowTop;
    });
    pdf.y = rowTop + 15;
    pdf.rect(pdf.margin, pdf.y - 1, tableW, 0.5, [0.9, 0.92, 0.94]);
  }
  pdf.moveDown(4);
}

/** Truncate text with an ellipsis so it fits within `maxWidth`. */
function clampToWidth(text: string, size: number, bold: boolean, maxWidth: number): string {
  if (measureWidth(text, size, bold) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && measureWidth(out + '…', size, bold) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

function hexToRgb01(hex: string): Rgb {
  const clean = (hex || '').startsWith('#') ? hex.slice(1) : hex;
  if (!clean || clean.length < 6) return [0.58, 0.64, 0.72];
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
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

  .score-message {
    font-size: 13px;
    color: #0f172a;
    line-height: 1.5;
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
