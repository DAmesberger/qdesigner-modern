import { describe, it, expect } from 'vitest';
import {
	normalPDF,
	normalCDF,
	zScore,
	percentileFromZ,
	generateCurvePoints,
	createBins,
	boxPlotStats,
	paletteColor,
	paletteColorAlpha,
	resolveColor,
	hexToRgba,
	buildChartLabel,
	buildTableRows,
	buildTrajectoryPoints,
	type ColorRule,
	type ScoreScaleSource,
} from './chart-utils';
import type { ChartSeriesContract } from '$lib/services/sessionAnalytics';

describe('normalPDF', () => {
	it('peaks at the mean', () => {
		const atMean = normalPDF(50, 50, 10);
		const offset = normalPDF(55, 50, 10);
		expect(atMean).toBeGreaterThan(offset);
	});

	it('returns 0 for sd <= 0', () => {
		expect(normalPDF(5, 5, 0)).toBe(0);
		expect(normalPDF(5, 5, -1)).toBe(0);
	});

	it('is symmetric around the mean', () => {
		const left = normalPDF(40, 50, 10);
		const right = normalPDF(60, 50, 10);
		expect(left).toBeCloseTo(right, 10);
	});
});

describe('normalCDF', () => {
	it('returns ~0.5 for z=0', () => {
		expect(normalCDF(0)).toBeCloseTo(0.5, 5);
	});

	it('returns ~0.841 for z=1', () => {
		expect(normalCDF(1)).toBeCloseTo(0.8413, 3);
	});

	it('returns ~0.159 for z=-1', () => {
		expect(normalCDF(-1)).toBeCloseTo(0.1587, 3);
	});

	it('returns ~0.975 for z=1.96', () => {
		expect(normalCDF(1.96)).toBeCloseTo(0.975, 2);
	});
});

describe('zScore', () => {
	it('computes correctly', () => {
		expect(zScore(70, 50, 10)).toBe(2);
		expect(zScore(50, 50, 10)).toBe(0);
		expect(zScore(30, 50, 10)).toBe(-2);
	});

	it('returns 0 for sd=0', () => {
		expect(zScore(70, 50, 0)).toBe(0);
	});
});

describe('percentileFromZ', () => {
	it('returns 50 for z=0', () => {
		expect(percentileFromZ(0)).toBe(50);
	});

	it('returns 84 for z=1', () => {
		expect(percentileFromZ(1)).toBe(84);
	});

	it('returns 98 for z=2', () => {
		expect(percentileFromZ(2)).toBe(98);
	});
});

describe('generateCurvePoints', () => {
	it('generates correct number of points', () => {
		const points = generateCurvePoints(50, 10, 100);
		expect(points).toHaveLength(101);
	});

	it('returns empty for sd <= 0', () => {
		expect(generateCurvePoints(50, 0)).toHaveLength(0);
	});

	it('centers around mean', () => {
		const points = generateCurvePoints(100, 15, 200);
		const maxPoint = points.reduce((a, b) => (b.y > a.y ? b : a));
		expect(maxPoint.x).toBeCloseTo(100, 0);
	});
});

describe('createBins', () => {
	it('creates correct number of bins', () => {
		const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const bins = createBins(data, 5);
		expect(bins).toHaveLength(5);
	});

	it('total count matches data length', () => {
		const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const bins = createBins(data, 5);
		const total = bins.reduce((s, b) => s + b.count, 0);
		expect(total).toBe(10);
	});

	it('handles empty data', () => {
		expect(createBins([])).toHaveLength(0);
	});

	it('handles single value', () => {
		const bins = createBins([5], 3);
		expect(bins).toHaveLength(3);
		const total = bins.reduce((s, b) => s + b.count, 0);
		expect(total).toBe(1);
	});
});

describe('boxPlotStats', () => {
	it('computes basic stats', () => {
		const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const stats = boxPlotStats(data);
		expect(stats.median).toBeCloseTo(5.5, 1);
		expect(stats.q1).toBeCloseTo(3.25, 1);
		expect(stats.q3).toBeCloseTo(7.75, 1);
	});

	it('handles empty data', () => {
		const stats = boxPlotStats([]);
		expect(stats.min).toBe(0);
		expect(stats.median).toBe(0);
	});

	it('detects outliers', () => {
		const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
		const stats = boxPlotStats(data);
		expect(stats.outliers.length).toBeGreaterThan(0);
		expect(stats.outliers).toContain(100);
	});
});

describe('paletteColor', () => {
	it('returns colors cyclically', () => {
		const c0 = paletteColor(0);
		const c10 = paletteColor(10);
		expect(c0).toBe(c10);
		expect(c0).toBe('#3B82F6');
	});
});

describe('paletteColorAlpha', () => {
	it('returns rgba string', () => {
		const rgba = paletteColorAlpha(0, 0.5);
		expect(rgba).toBe('rgba(59, 130, 246, 0.5)');
	});
});

describe('resolveColor', () => {
	const rules: ColorRule[] = [
		{ min: 0, max: 10, color: '#22c55e', label: 'Low' },
		{ min: 11, max: 20, color: '#eab308', label: 'Moderate' },
		{ min: 21, max: 30, color: '#ef4444', label: 'High' },
	];

	it('returns matching color for value within a range', () => {
		expect(resolveColor(5, rules, '#000')).toBe('#22c55e');
		expect(resolveColor(15, rules, '#000')).toBe('#eab308');
		expect(resolveColor(25, rules, '#000')).toBe('#ef4444');
	});

	it('returns color for boundary values (inclusive)', () => {
		expect(resolveColor(0, rules, '#000')).toBe('#22c55e');
		expect(resolveColor(10, rules, '#000')).toBe('#22c55e');
		expect(resolveColor(11, rules, '#000')).toBe('#eab308');
		expect(resolveColor(30, rules, '#000')).toBe('#ef4444');
	});

	it('returns fallback for value outside all ranges', () => {
		expect(resolveColor(-5, rules, '#000')).toBe('#000');
		expect(resolveColor(31, rules, '#000')).toBe('#000');
	});

	it('returns fallback for empty rules', () => {
		expect(resolveColor(10, [], '#abc')).toBe('#abc');
	});

	it('returns fallback for NaN/Infinity', () => {
		expect(resolveColor(NaN, rules, '#000')).toBe('#000');
		expect(resolveColor(Infinity, rules, '#000')).toBe('#000');
	});
});

describe('hexToRgba', () => {
	it('converts hex to rgba', () => {
		expect(hexToRgba('#3B82F6', 0.5)).toBe('rgba(59, 130, 246, 0.5)');
	});

	it('handles hex without #', () => {
		expect(hexToRgba('3B82F6', 0.75)).toBe('rgba(59, 130, 246, 0.75)');
	});

	it('returns fallback for short hex', () => {
		expect(hexToRgba('#abc', 0.5)).toBe('rgba(0,0,0,0.5)');
	});

	it('handles black', () => {
		expect(hexToRgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
	});

	it('handles white', () => {
		expect(hexToRgba('#FFFFFF', 0.3)).toBe('rgba(255, 255, 255, 0.3)');
	});
});

describe('buildChartLabel', () => {
	const barSeries: ChartSeriesContract = {
		mode: 'participant-vs-cohort',
		metric: 'mean',
		points: [
			{ label: 'You', value: 42 },
			{ label: 'Cohort', value: 38 },
		],
	};

	it('summarizes a bar chart with participant score and cohort mean', () => {
		const label = buildChartLabel(barSeries, 'bar', 'Anxiety score', 38, null, undefined);
		expect(label).toBe('Bar chart of Anxiety score. Your score: 42. Cohort mean: 38.');
	});

	it('includes cohort SD when provided', () => {
		const label = buildChartLabel(barSeries, 'line', 'Anxiety score', 38, 5, undefined);
		expect(label).toBe(
			'Line chart of Anxiety score. Your score: 42. Cohort mean: 38. Cohort SD: 5.',
		);
	});

	it('summarizes a histogram by cohort sample size', () => {
		const values = Array.from({ length: 100 }, (_, i) => i);
		const label = buildChartLabel(barSeries, 'histogram', 'Anxiety score', null, null, values);
		expect(label).toBe('Histogram of cohort distribution, 100 values');
	});

	it('summarizes a box plot by cohort sample size', () => {
		const label = buildChartLabel(barSeries, 'box', 'Anxiety score', null, null, [1, 2, 3]);
		expect(label).toBe('Box plot of cohort distribution, 3 values');
	});

	it('guards missing series and cohort stats', () => {
		expect(buildChartLabel(null, 'bar', '', null, null, null)).toBe('Bar chart of Value.');
	});

	it('summarizes a trajectory by its ordered administrations', () => {
		const traj: ChartSeriesContract = {
			mode: 'self-baseline',
			metric: 'mean',
			points: [
				{ label: 'Pre', value: 10 },
				{ label: 'Post', value: 14 },
			],
		};
		const label = buildChartLabel(traj, 'trajectory', 'Anxiety', 12, null, undefined);
		expect(label).toBe(
			'Trajectory line chart of Anxiety across 2 administrations. Pre: 10. Post: 14. Reference mean: 12.',
		);
	});
});

describe('buildTableRows', () => {
	const series: ChartSeriesContract = {
		mode: 'current-session',
		metric: 'mean',
		points: [
			{ label: 'Anxiety', value: 12 },
			{ label: 'Depression', value: 7 },
		],
	};

	it('builds one row per point from series when no scales are supplied', () => {
		const rows = buildTableRows(series);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ label: 'Anxiety', value: 12, tScore: null, percentile: null, band: null });
		expect(rows[1]!.label).toBe('Depression');
	});

	it('colors the band cell from colorRules on the series fallback', () => {
		const rules: ColorRule[] = [
			{ min: 0, max: 9, color: '#22c55e', label: 'Low' },
			{ min: 10, max: 20, color: '#ef4444', label: 'High' },
		];
		const rows = buildTableRows(series, [], rules);
		expect(rows[0]!.color).toBe('#ef4444'); // value 12 → High
		expect(rows[1]!.color).toBe('#22c55e'); // value 7 → Low
	});

	it('prefers per-scale sources (value/T/percentile/band) over raw points', () => {
		const scales: ScoreScaleSource[] = [
			{ label: 'Anxiety', value: 12, tScore: 65, percentile: 93, band: 'High', color: '#ef4444' },
		];
		const rows = buildTableRows(series, scales);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			label: 'Anxiety',
			value: 12,
			tScore: 65,
			percentile: 93,
			band: 'High',
			color: '#ef4444',
		});
	});

	it('coerces non-finite score fields to null', () => {
		const scales: ScoreScaleSource[] = [
			{ label: 'Scale', value: NaN, tScore: Infinity, percentile: null, band: null },
		];
		const rows = buildTableRows(series, scales);
		expect(rows[0]).toMatchObject({ value: null, tScore: null, percentile: null, band: null });
	});
});

describe('buildTrajectoryPoints', () => {
	it('preserves series order for non-numeric labels', () => {
		const series: ChartSeriesContract = {
			mode: 'self-baseline',
			metric: 'mean',
			points: [
				{ label: 'Baseline', value: 10 },
				{ label: 'Current', value: 14 },
			],
		};
		const pts = buildTrajectoryPoints(series);
		expect(pts.map((p) => p.label)).toEqual(['Baseline', 'Current']);
		expect(pts.map((p) => p.index)).toEqual([0, 1]);
	});

	it('sorts numerically by a trailing integer label (T2 before T10)', () => {
		const series: ChartSeriesContract = {
			mode: 'current-session',
			metric: 'mean',
			points: [
				{ label: 'RT-10', value: 3 },
				{ label: 'RT-2', value: 1 },
				{ label: 'RT-1', value: 0 },
			],
		};
		const pts = buildTrajectoryPoints(series);
		expect(pts.map((p) => p.label)).toEqual(['RT-1', 'RT-2', 'RT-10']);
		expect(pts.map((p) => p.value)).toEqual([0, 1, 3]);
		expect(pts.map((p) => p.index)).toEqual([0, 1, 2]);
	});

	it('coerces null/non-finite values and handles empty series', () => {
		expect(buildTrajectoryPoints(null)).toEqual([]);
		const series: ChartSeriesContract = {
			mode: 'self-baseline',
			metric: 'mean',
			points: [{ label: 'Pre', value: null }],
		};
		expect(buildTrajectoryPoints(series)[0]).toEqual({ label: 'Pre', value: null, index: 0 });
	});
});
