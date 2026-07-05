/**
 * Shared Chart.js setup: single registration of the union of every component
 * used across the app, plus the canonical categorical color palette.
 *
 * Chart.register is idempotent, so registering the union once here is safe;
 * every consumer imports the pre-registered { Chart } from this module rather
 * than registering its own subset. Keep CATEGORICAL_PALETTE values
 * byte-identical — the committed e2e visual-regression baselines depend on
 * the rendered chart colors not drifting.
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
	TimeScale,
	TimeSeriesScale,
} from 'chart.js';

// Register the union of every component any consumer needs (idempotent).
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
	TimeScale,
	TimeSeriesScale,
);

export { Chart };

/**
 * Canonical categorical palette for analytics/psychometrics charts.
 * Values are byte-identical to the previously-duplicated inline arrays;
 * do not change them or the committed visual baselines will drift.
 */
export const CATEGORICAL_PALETTE = [
	'#3B82F6',
	'#EF4444',
	'#10B981',
	'#F59E0B',
	'#8B5CF6',
	'#EC4899',
	'#06B6D4',
	'#84CC16',
	'#F97316',
	'#6366F1',
] as const;
