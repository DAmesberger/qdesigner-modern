import type { HelpEntry } from './types';

export const statisticalFeedbackEntries: HelpEntry[] = [
	{
		key: 'statisticalFeedback.overview',
		title: 'Statistical Feedback',
		description:
			'Statistical Feedback questions display computed results to participants during or after the questionnaire. They combine data from the current session, previous participants, or both to present meaningful insights.\n\n' +
			'This is useful for:\n' +
			'- Showing participants their scores immediately after a test\n' +
			'- Comparing a participant\'s performance to group norms\n' +
			'- Providing personalized interpretations based on standardized metrics\n' +
			'- Displaying progress across repeated sessions\n\n' +
			'Statistical feedback supports multiple visualization types (charts, tables, text) and can be combined with variable interpolation for rich, personalized output.',
		category: 'statisticalFeedback',
		tags: ['statistical', 'feedback', 'results', 'display', 'overview'],
		related: [
			'statisticalFeedback.sourceModes',
			'statisticalFeedback.metrics',
			'statisticalFeedback.charts',
			'questionTypes.statisticalFeedback'
		]
	},
	{
		key: 'statisticalFeedback.sourceModes',
		title: 'Source Modes',
		description:
			'Source modes determine where the data for statistical feedback comes from.\n\n' +
			'**Current Session**\n' +
			'Shows values computed from the current participant\'s responses only. No server request needed -- all computation happens client-side.\n\n' +
			'**Cohort**\n' +
			'Aggregates data across all completed sessions for the questionnaire. The server computes statistics (mean, median, percentiles) and returns them. Useful for showing group-level results.\n\n' +
			'**Participant vs. Cohort**\n' +
			'Compares the current participant\'s individual score against the aggregate cohort. Displays both the individual value and the group distribution, often with a z-score or percentile rank.\n\n' +
			'**Participant vs. Participant**\n' +
			'Compares two individual scores side by side. Useful for pre/post designs, dyadic studies, or showing how two participants differ on a measure.',
		category: 'statisticalFeedback',
		tags: ['source', 'mode', 'session', 'cohort', 'comparison', 'participant'],
		related: ['statisticalFeedback.overview', 'statisticalFeedback.metrics']
	},
	{
		key: 'statisticalFeedback.metrics',
		title: 'Available Metrics',
		description:
			'Statistical feedback can display the following metrics:\n\n' +
			'| Metric | Description |\n' +
			'|--------|-------------|\n' +
			'| **count** | Number of responses or sessions |\n' +
			'| **mean** | Arithmetic average |\n' +
			'| **median** | Middle value (50th percentile) |\n' +
			'| **std_dev** | Standard deviation (spread of values) |\n' +
			'| **p90** | 90th percentile |\n' +
			'| **p95** | 95th percentile |\n' +
			'| **p99** | 99th percentile |\n' +
			'| **z_score** | Standard score relative to cohort |\n\n' +
			'Metrics can be displayed as raw numbers, formatted text, or visualized in charts. Combine multiple metrics in a single feedback display for comprehensive summaries.',
		category: 'statisticalFeedback',
		tags: ['metrics', 'statistics', 'mean', 'median', 'percentile', 'z-score', 'standard deviation'],
		related: ['statisticalFeedback.overview', 'statisticalFeedback.sourceModes', 'statisticalFeedback.charts']
	},
	{
		key: 'statisticalFeedback.charts',
		title: 'Feedback Charts',
		description:
			'Statistical feedback can be visualized using several chart types:\n\n' +
			'- **Histogram** -- Distribution of scores across the cohort with the participant\'s position marked\n' +
			'- **Bar chart** -- Compare means across groups or conditions\n' +
			'- **Line chart** -- Show trends over time or across repeated measures\n' +
			'- **Box plot** -- Display quartiles, median, and outliers for cohort data\n' +
			'- **Scatter plot** -- Plot two variables against each other\n' +
			'- **Radar chart** -- Multi-dimensional profile (e.g., personality subscales)\n\n' +
			'Charts update in real time as new data becomes available. Colors and labels are configurable in the Properties panel.',
		category: 'statisticalFeedback',
		tags: ['charts', 'visualization', 'histogram', 'bar', 'line', 'box plot', 'scatter', 'radar'],
		related: ['statisticalFeedback.overview', 'statisticalFeedback.metrics']
	},
	{
		key: 'statisticalFeedback.scoreInterpretation',
		title: 'Score Interpretation',
		description:
			'Score interpretation maps numeric results to meaningful labels or categories. This helps participants understand what their scores mean in context.\n\n' +
			'**Configuration:**\n' +
			'- Define **interpretation ranges** (e.g., 0-4 = "Minimal", 5-9 = "Mild", 10-14 = "Moderate", 15+ = "Severe")\n' +
			'- Set **colors** for each range (green, yellow, orange, red)\n' +
			'- Add **descriptions** explaining what each range means\n' +
			'- Reference **clinical norms** or standardized cutoffs\n\n' +
			'**Example (PHQ-9 Depression Screening):**\n' +
			'- 0-4: Minimal depression\n' +
			'- 5-9: Mild depression\n' +
			'- 10-14: Moderate depression\n' +
			'- 15-19: Moderately severe depression\n' +
			'- 20-27: Severe depression\n\n' +
			'Score interpretations can be displayed as colored badges, progress bars, or within explanatory text using {{variable}} interpolation.',
		category: 'statisticalFeedback',
		tags: ['score', 'interpretation', 'ranges', 'categories', 'norms', 'cutoff', 'clinical'],
		related: ['statisticalFeedback.metrics', 'variables.interpolation']
	}
];
