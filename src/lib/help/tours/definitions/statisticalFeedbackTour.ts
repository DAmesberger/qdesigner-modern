import type { TourDefinition } from '../types';

export const statisticalFeedbackTour: TourDefinition = {
	id: 'statistical-feedback-tour',
	name: 'Statistical Feedback',
	description: 'Learn how to show participants their scores and statistical comparisons.',
	triggerKey: 'qd-tour:statistical-feedback',
	steps: [
		{
			id: 'source-mode',
			target: '[data-testid="stats-source-mode"]',
			title: 'Data Source',
			description:
				'Choose where the statistical data comes from. Use **Current Session** for live scores, **Variable** to reference a computed variable, or **Aggregate** to compare against all participants.',
			placement: 'right',
			waitForElement: true,
		},
		{
			id: 'metric',
			target: '[data-testid="stats-metric"]',
			title: 'Statistical Metrics',
			description:
				'Select which metric to display: **Mean**, **Median**, **Standard Deviation**, **Percentile**, or **Z-Score**. These are computed from all collected responses for the selected data source.',
			placement: 'right',
			waitForElement: true,
		},
		{
			id: 'chart-type',
			target: '[data-testid="stats-chart-type"]',
			title: 'Chart Visualization',
			description:
				'Pick a chart type to visualize the data. Options include **Bar**, **Histogram**, **Gauge**, **Box Plot**, and more. The preview updates in real-time as you configure.',
			placement: 'right',
			waitForElement: true,
		},
		{
			id: 'score-interpretation',
			target: '[data-testid="score-interpretation-section"]',
			title: 'Score Interpretation',
			description:
				'Define score ranges and their interpretations. For example: 0-30 = "Below Average", 31-70 = "Average", 71-100 = "Above Average". Each range can have a label, description, and color.',
			placement: 'top',
			waitForElement: true,
		},
		{
			id: 'preview',
			target: '[data-testid="stats-feedback-preview"]',
			title: 'Live Preview',
			description:
				'See a live preview of how the statistical feedback will appear to participants. The preview uses sample data so you can verify the layout and interpretation logic before publishing.',
			placement: 'top',
			waitForElement: true,
		},
	],
};
