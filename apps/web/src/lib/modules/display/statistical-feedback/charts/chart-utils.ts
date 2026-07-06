/**
 * Chart utilities: Chart.js registration, color palette, and statistical math helpers.
 */

import { normalCDF } from '$lib/shared/utils/statistics';
import type { ChartSeriesContract } from '$lib/services/sessionAnalytics';

export { Chart } from '$lib/shared/charts';

// ---------------------------------------------------------------------------
// Color Palette
// ---------------------------------------------------------------------------

export const COLORS = {
	participant: '#3B82F6',
	participantFill: 'rgba(59, 130, 246, 0.18)',
	cohort: '#8B5CF6',
	cohortFill: 'rgba(139, 92, 246, 0.12)',
	curve: '#64748B',
	curveFill: 'rgba(100, 116, 139, 0.06)',
	marker: '#EF4444',
	mean: '#10B981',
	meanFill: 'rgba(16, 185, 129, 0.08)',
	grid: 'rgba(148, 163, 184, 0.15)',
	text: '#334155',
	textLight: '#94A3B8',
	palette: [
		'#3B82F6',
		'#8B5CF6',
		'#06B6D4',
		'#10B981',
		'#F59E0B',
		'#EF4444',
		'#EC4899',
		'#84CC16',
		'#F97316',
		'#6366F1',
	],
} as const;

export function paletteColor(index: number): string {
	return COLORS.palette[index % COLORS.palette.length]!;
}

export function paletteColorAlpha(index: number, alpha: number): string {
	const hex = paletteColor(index);
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Statistical Math
// ---------------------------------------------------------------------------

export function normalPDF(x: number, mean: number, sd: number): number {
	if (sd <= 0) return 0;
	return (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / sd) ** 2);
}

/** Standard normal CDF via Abramowitz & Stegun approximation (shared impl) */
export { normalCDF };

export function zScore(value: number, mean: number, sd: number): number {
	return sd > 0 ? (value - mean) / sd : 0;
}

export function percentileFromZ(z: number): number {
	return Math.round(normalCDF(z) * 100);
}

/** Generate points along a normal distribution curve for Chart.js */
export function generateCurvePoints(
	mean: number,
	sd: number,
	n = 200,
): { x: number; y: number }[] {
	if (sd <= 0) return [];
	const range = 4 * sd;
	const step = (2 * range) / n;
	const points: { x: number; y: number }[] = [];
	for (let i = 0; i <= n; i++) {
		const x = mean - range + i * step;
		points.push({ x, y: normalPDF(x, mean, sd) });
	}
	return points;
}

/** Create histogram bins from raw data */
export function createBins(
	data: number[],
	binCount = 15,
): { start: number; end: number; count: number }[] {
	if (data.length === 0) return [];
	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;
	const width = range / binCount;
	const bins: { start: number; end: number; count: number }[] = [];
	for (let i = 0; i < binCount; i++) {
		bins.push({ start: min + i * width, end: min + (i + 1) * width, count: 0 });
	}
	for (const v of data) {
		const idx = Math.min(Math.floor((v - min) / width), binCount - 1);
		bins[idx]!.count++;
	}
	return bins;
}

/** Calculate box plot stats (Q1, median, Q3, whiskers, outliers) */
export function boxPlotStats(data: number[]): {
	min: number;
	q1: number;
	median: number;
	q3: number;
	max: number;
	outliers: number[];
} {
	if (data.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [] };
	const sorted = [...data].sort((a, b) => a - b);
	const q = (p: number) => {
		const idx = p * (sorted.length - 1);
		const lo = Math.floor(idx);
		const hi = Math.ceil(idx);
		const w = idx - lo;
		return (sorted[lo]! ?? 0) * (1 - w) + (sorted[hi]! ?? 0) * w;
	};
	const q1 = q(0.25);
	const median = q(0.5);
	const q3 = q(0.75);
	const iqr = q3 - q1;
	const lo = q1 - 1.5 * iqr;
	const hi = q3 + 1.5 * iqr;
	const outliers = sorted.filter((v) => v < lo || v > hi);
	return {
		min: Math.max(sorted[0]!, lo),
		q1,
		median,
		q3,
		max: Math.min(sorted[sorted.length - 1]!, hi),
		outliers,
	};
}

// ---------------------------------------------------------------------------
// Conditional Coloring
// ---------------------------------------------------------------------------

export interface ColorRule {
	min: number;
	max: number;
	color: string;
	label?: string;
}

/**
 * Resolve a color for a value based on ordered color rules (e.g., score interpretation ranges).
 * Falls back to `fallback` if no rule matches.
 */
export function resolveColor(value: number, rules: ColorRule[], fallback: string): string {
	if (!Number.isFinite(value) || rules.length === 0) return fallback;
	for (const rule of rules) {
		if (value >= rule.min && value <= rule.max) return rule.color;
	}
	return fallback;
}

/** Convert a hex color to rgba */
export function hexToRgba(hex: string, alpha: number): string {
	const clean = hex.startsWith('#') ? hex.slice(1) : hex;
	if (clean.length < 6) return `rgba(0,0,0,${alpha})`;
	const r = parseInt(clean.slice(0, 2), 16);
	const g = parseInt(clean.slice(2, 4), 16);
	const b = parseInt(clean.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Reference bands (designable) — drawn as a Chart.js inline plugin
// ---------------------------------------------------------------------------

/**
 * An inline Chart.js plugin that shades horizontal (or vertical) reference-band
 * regions behind the plotted data from a set of {@link ColorRule}s (e.g. score
 * interpretation ranges). Inline plugins passed via the chart config's
 * `plugins: []` array do NOT require `Chart.register`, so this keeps the single
 * centralized registration site (P5-T3) intact.
 *
 * @param rules ordered color rules (min/max/color)
 * @param axis  which scale carries the value ('y' for bar/line/trajectory)
 * @param alpha fill opacity for the band regions
 */
export function makeReferenceBandsPlugin(
	rules: ColorRule[],
	axis: 'x' | 'y' = 'y',
	alpha = 0.1,
	id = 'referenceBands',
): AnyChartOptions {
	return {
		id,
		beforeDatasetsDraw(chart: AnyChartOptions) {
			if (!rules || rules.length === 0) return;
			const scale = chart.scales?.[axis];
			const area = chart.chartArea;
			if (!scale || !area) return;
			const ctx = chart.ctx as CanvasRenderingContext2D;
			ctx.save();
			for (const rule of rules) {
				if (!Number.isFinite(rule.min) || !Number.isFinite(rule.max)) continue;
				const a = scale.getPixelForValue(rule.min);
				const b = scale.getPixelForValue(rule.max);
				ctx.fillStyle = hexToRgba(rule.color, alpha);
				if (axis === 'y') {
					const top = Math.min(a, b);
					const height = Math.abs(b - a);
					ctx.fillRect(area.left, top, area.right - area.left, height);
				} else {
					const left = Math.min(a, b);
					const width = Math.abs(b - a);
					ctx.fillRect(left, area.top, width, area.bottom - area.top);
				}
			}
			ctx.restore();
		},
	};
}

// ---------------------------------------------------------------------------
// Table row-building (chart type: table)
// ---------------------------------------------------------------------------

/** A resolved score.<scaleId> bundle (E-FEEDBACK-1) as far as the table cares. */
export interface ScoreScaleSource {
	label: string;
	value: number | null;
	tScore?: number | null;
	percentile?: number | null;
	band?: string | null;
	/** Band color (from the matched interpretation range), if any. */
	color?: string | null;
}

export interface FeedbackTableRow {
	label: string;
	value: number | null;
	tScore: number | null;
	percentile: number | null;
	band: string | null;
	/** Resolved color for the band cell (rule color, or resolved from colorRules). */
	color: string | null;
}

function num(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Build accessible table rows for the `table` chart type. When per-scale score
 * sources (score.<scaleId> value/T/percentile/band) are supplied they win — one
 * row per scale, richest data. Otherwise fall back to the raw `series.points`
 * (label/value), coloring the band cell via `colorRules` when present.
 */
export function buildTableRows(
	series: ChartSeriesContract | null | undefined,
	scales: ScoreScaleSource[] = [],
	colorRules: ColorRule[] = [],
): FeedbackTableRow[] {
	if (scales.length > 0) {
		return scales.map((s) => {
			const value = num(s.value);
			const color =
				s.color ?? (value !== null ? resolveColor(value, colorRules, '') || null : null);
			return {
				label: s.label,
				value,
				tScore: num(s.tScore),
				percentile: num(s.percentile),
				band: s.band ?? null,
				color,
			};
		});
	}

	const points = series?.points ?? [];
	return points.map((p) => {
		const value = num(p.value);
		const color = value !== null ? resolveColor(value, colorRules, '') || null : null;
		return { label: p.label, value, tScore: null, percentile: null, band: null, color };
	});
}

// ---------------------------------------------------------------------------
// Trajectory point ordering (chart type: trajectory)
// ---------------------------------------------------------------------------

export interface TrajectoryPoint {
	label: string;
	value: number | null;
	/** Ordinal position along the trajectory (0-based, post-ordering). */
	index: number;
}

/**
 * Order a series' points into an administration trajectory (pre → mid → post).
 * When every label ends in an integer (e.g. `RT-1`, `RT-2`, `RT-10`) the points
 * are sorted by that trailing number so they read numerically rather than
 * lexically; otherwise the given series order is preserved.
 */
export function buildTrajectoryPoints(
	series: ChartSeriesContract | null | undefined,
): TrajectoryPoint[] {
	const points = series?.points ?? [];
	const annotated = points.map((p, orig) => {
		const match = /(\d+)\s*$/.exec(p.label ?? '');
		return {
			label: p.label,
			value: typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null,
			orig,
			num: match ? parseInt(match[1]!, 10) : null,
		};
	});

	const allNumbered = annotated.length > 0 && annotated.every((p) => p.num !== null);
	const ordered = allNumbered
		? [...annotated].sort((a, b) => a.num! - b.num! || a.orig - b.orig)
		: annotated;

	return ordered.map((p, index) => ({ label: p.label, value: p.value, index }));
}

// ---------------------------------------------------------------------------
// Chart.js shared options
// ---------------------------------------------------------------------------

export const BASE_FONT = {
	family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
	size: 12,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyChartOptions = any;

// ---------------------------------------------------------------------------
// Accessible text alternative (chart aria-label)
// ---------------------------------------------------------------------------

type FeedbackChartKind =
	| 'bar'
	| 'line'
	| 'radar'
	| 'scatter'
	| 'histogram'
	| 'box'
	| 'trajectory';

const CHART_TYPE_WORD: Record<FeedbackChartKind, string> = {
	bar: 'Bar chart',
	line: 'Line chart',
	radar: 'Radar chart',
	scatter: 'Scatter plot',
	histogram: 'Histogram',
	box: 'Box plot',
	trajectory: 'Trajectory line chart',
};

/** Round to at most 2 decimals, dropping any trailing zeros. */
function formatScore(value: number): string {
	return String(Math.round(value * 100) / 100);
}

/**
 * Build a screen-reader text alternative summarizing the plotted data for a
 * participant-facing feedback chart. Used as the canvas `aria-label` so the
 * numeric meaning (not just the color channel) is exposed to assistive tech.
 */
export function buildChartLabel(
	series: ChartSeriesContract | null | undefined,
	chartType: FeedbackChartKind,
	scoreName: string,
	cohortMean: number | null | undefined,
	cohortStdDev: number | null | undefined,
	cohortValues: number[] | null | undefined,
): string {
	// Distribution charts summarize the cohort sample size rather than a score.
	if (chartType === 'histogram' || chartType === 'box') {
		const n = cohortValues?.length ?? series?.points.length ?? 0;
		return `${CHART_TYPE_WORD[chartType]} of cohort distribution, ${n} values`;
	}

	const scoreLabel = scoreName?.trim() ? scoreName : 'Value';

	// Trajectory summarizes the ordered administrations (pre → post).
	if (chartType === 'trajectory') {
		const ordered = buildTrajectoryPoints(series);
		const parts = [`${CHART_TYPE_WORD.trajectory} of ${scoreLabel} across ${ordered.length} administrations.`];
		for (const p of ordered) {
			parts.push(`${p.label}: ${p.value != null ? formatScore(p.value) : 'no data'}.`);
		}
		if (cohortMean != null) parts.push(`Reference mean: ${formatScore(cohortMean)}.`);
		return parts.join(' ');
	}

	const label = scoreLabel;
	const parts: string[] = [`${CHART_TYPE_WORD[chartType]} of ${label}.`];

	const primary = series?.points.find((p) => p.value != null);
	if (primary?.value != null) {
		parts.push(`Your score: ${formatScore(primary.value)}.`);
	}
	if (cohortMean != null) {
		parts.push(`Cohort mean: ${formatScore(cohortMean)}.`);
	}
	if (cohortStdDev != null) {
		parts.push(`Cohort SD: ${formatScore(cohortStdDev)}.`);
	}

	return parts.join(' ');
}
