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
	type ColorRule,
} from './chart-utils';

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
