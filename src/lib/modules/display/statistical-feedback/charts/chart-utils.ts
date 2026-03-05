/**
 * Chart utilities: Chart.js registration, color palette, and statistical math helpers.
 */

import {
	Chart,
	CategoryScale,
	LinearScale,
	BarElement,
	BarController,
	LineElement,
	LineController,
	PointElement,
	ArcElement,
	DoughnutController,
	RadarController,
	RadialLinearScale,
	ScatterController,
	Title,
	Tooltip,
	Legend,
	Filler,
} from 'chart.js';

// Register all components we need (idempotent)
Chart.register(
	CategoryScale,
	LinearScale,
	BarElement,
	BarController,
	LineElement,
	LineController,
	PointElement,
	ArcElement,
	DoughnutController,
	RadarController,
	RadialLinearScale,
	ScatterController,
	Title,
	Tooltip,
	Legend,
	Filler,
);

export { Chart };

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

/** Standard normal CDF via Abramowitz & Stegun approximation */
export function normalCDF(z: number): number {
	const a1 = 0.254829592;
	const a2 = -0.284496736;
	const a3 = 1.421413741;
	const a4 = -1.453152027;
	const a5 = 1.061405429;
	const p = 0.3275911;
	const sign = z < 0 ? -1 : 1;
	const x = Math.abs(z) / Math.SQRT2;
	const t = 1 / (1 + p * x);
	const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
	return 0.5 * (1 + sign * y);
}

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
// Chart.js shared options
// ---------------------------------------------------------------------------

export const BASE_FONT = {
	family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
	size: 12,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyChartOptions = any;
