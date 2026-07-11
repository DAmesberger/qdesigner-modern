import type { HelpEntry } from './types';

export const analyticsEntries: HelpEntry[] = [
	{
		key: 'analytics.sessionDetail',
		title: 'Session Detail Browser',
		description:
			'Opening a single session from the analytics sessions table shows everything that session recorded, one participant at a time:\n\n' +
			'- **Answers** — every response with its resolved value, the question id and type, sync client id, and (for reaction items) the reaction time in milliseconds.\n' +
			'- **Reaction-time trials** — a per-trial table (trial number, condition, stimulus kind, reaction time, correctness). Each trial can expand its **timing provenance (raw)** blob so you can inspect exactly how onset and response timestamps were measured.\n' +
			'- **Variables** — the computed variable values for the session.\n' +
			'- **Events** — the interaction event log.\n\n' +
			'Use it to audit an individual participant, verify timing provenance, or debug an unexpected result before running aggregate analysis.',
		category: 'analytics',
		tags: ['analytics', 'session', 'detail', 'answers', 'trials', 'provenance', 'events', 'audit'],
		related: ['analytics.advanced', 'dataQuality.validity', 'questionTypes.reactionTime']
	},
	{
		key: 'analytics.advanced',
		title: 'Advanced Analytics',
		description:
			'The analytics **Advanced** tab adds two exploratory tools on top of the overview:\n\n' +
			'**Segmentation** — pick a numeric field and get descriptive statistics (mean, spread, and distribution) for the responses that pass the current filter. Use it to profile a single measure across a filtered subset.\n\n' +
			'**Cohort comparison** — pick a field with at least two distinct values, choose two of its values as groups, and compare a measure between them side by side. Use it to contrast conditions, demographics, or any grouping variable your data carries.\n\n' +
			'Both tools work on the loaded response rows, so they update as you change filters — no re-export needed.',
		category: 'analytics',
		tags: ['advanced', 'segmentation', 'cohort', 'comparison', 'groups', 'descriptive', 'statistics', 'compare'],
		related: ['analytics.sessionDetail', 'statisticalFeedback.metrics', 'experimentalDesign.conditions']
	}
];
