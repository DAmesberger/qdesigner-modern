import type { HelpEntry } from './types';

export const reportingEntries: HelpEntry[] = [
	{
		key: 'reporting.gridEditor',
		title: 'Report Page Layout',
		description:
			'A report page lays out result widgets on a schematic **12-column grid**. The visual editor lets you place each widget as a box and arrange them without touching coordinates by hand.\n\n' +
			'**Working with widgets:**\n' +
			'- **Drag** a box to move it; drag an **edge or corner handle** to resize it.\n' +
			'- **Keyboard:** arrow keys nudge the selected widget; **Shift + arrows** resize it. Position changes are announced for screen-reader users.\n' +
			'- A **live preview** renders the widgets with sample data as you arrange them, so you see the participant-facing result immediately.\n\n' +
			'Available widget types include text, single-value stats, **Box vs cohort**, and **Reaction vs cohort**. Each widget binds to a variable or a server-computed cohort statistic.',
		category: 'reporting',
		tags: ['report', 'grid', 'layout', 'widget', 'drag', 'resize', 'nudge', 'keyboard', 'preview', 'columns'],
		related: ['reporting.reactionCohortBox', 'variables.serverVariables', 'statisticalFeedback.overview']
	},
	{
		key: 'reporting.reactionCohortBox',
		title: 'Reaction vs Cohort Widget',
		description:
			'The **Reaction vs cohort** widget shows a participant\'s own reaction-time (or accuracy) against the cohort distribution — a box/whisker summary with the participant\'s marker on it — and it resolves entirely offline.\n\n' +
			'**Two bindings drive it:**\n' +
			'- **Binding (the participant marker):** a **reaction question** (reaction-time or reaction-experiment). The marker is computed from that participant\'s own local trials for the question.\n' +
			'- **Cohort source:** a **server variable whose source is Reaction trials** and whose materialization is **Full statistics → Object**. That object bundle (n, min, p25, median, p75, max) is pre-synced to the device, so the cohort whiskers render without a network request.\n\n' +
			'**Disclosure:** the widget honors the server variable\'s **minimum n** floor. Below the floor it either hides or shows a "cohort still forming — n=X of minN" placeholder, per the variable\'s below-floor setting; the cohort n is always disclosed.',
		category: 'reporting',
		tags: ['reaction', 'cohort', 'box', 'whisker', 'widget', 'trials', 'server variable', 'offline', 'minN'],
		related: ['variables.serverVariables', 'reporting.gridEditor', 'reaction.responseSet']
	}
];
