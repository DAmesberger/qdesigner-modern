import type { HelpEntry } from './types';

export const experimentalDesignEntries: HelpEntry[] = [
	{
		key: 'experimentalDesign.overview',
		title: 'Experimental Design',
		description:
			'The experimental design system supports between-subjects and within-subjects research designs with automatic participant assignment, counterbalancing, and quota management.\n\n' +
			'**Key features:**\n' +
			'- **Conditions** -- Define experimental groups that participants are assigned to\n' +
			'- **Counterbalancing** -- Control the order of stimuli or conditions across participants\n' +
			'- **Quotas** -- Set per-condition participation caps\n' +
			'- **Randomization** -- Random, sequential, or balanced assignment strategies\n\n' +
			'These tools help ensure your study meets methodological standards for controlled experiments.',
		category: 'experimentalDesign',
		tags: ['experimental', 'design', 'research', 'conditions', 'between-subjects', 'within-subjects'],
		related: [
			'experimentalDesign.conditions',
			'experimentalDesign.counterbalancing',
			'experimentalDesign.quotas',
			'experimentalDesign.randomization'
		]
	},
	{
		key: 'experimentalDesign.conditions',
		title: 'Conditions',
		description:
			'Conditions define the experimental groups in a between-subjects design. Each participant is assigned to exactly one condition, which determines what content they see.\n\n' +
			'**Setting up conditions:**\n' +
			'1. Open the Experimental Design panel in the designer\n' +
			'2. Define your conditions (e.g., "Control", "Treatment A", "Treatment B")\n' +
			'3. For each condition, configure which blocks, pages, or stimuli are shown\n' +
			'4. Choose an assignment strategy (random, sequential, or balanced)\n\n' +
			'**Condition variables** are automatically available in formulas and flow control. Use them to branch logic or customize content per condition.\n\n' +
			'The system tracks how many participants have been assigned to each condition, accessible via the analytics dashboard.',
		category: 'experimentalDesign',
		tags: ['conditions', 'groups', 'between-subjects', 'control', 'treatment', 'assignment'],
		related: ['experimentalDesign.randomization', 'experimentalDesign.quotas', 'flowControl.branch']
	},
	{
		key: 'experimentalDesign.counterbalancing',
		title: 'Counterbalancing',
		description:
			'Counterbalancing controls the order in which conditions or stimuli are presented to minimize order effects in within-subjects designs.\n\n' +
			'**Available methods:**\n\n' +
			'**Latin Square**\n' +
			'Each condition appears in each position equally often across participants. Efficient for studies with many conditions -- requires only N orders for N conditions.\n\n' +
			'**Balanced Williams Design**\n' +
			'Extends Latin Square to also balance first-order carry-over effects. Each condition follows every other condition equally often. Requires 2N orders for N conditions (or N if N is even).\n\n' +
			'**Full Permutation**\n' +
			'Every possible ordering is used. Provides the strongest control but requires N! participants for N conditions. Practical only for small numbers of conditions (2-4).\n\n' +
			'The system automatically assigns participants to the next needed order based on current enrollment counts.',
		category: 'experimentalDesign',
		tags: [
			'counterbalancing',
			'order',
			'latin square',
			'williams',
			'permutation',
			'within-subjects',
			'carry-over'
		],
		related: ['experimentalDesign.conditions', 'experimentalDesign.randomization']
	},
	{
		key: 'experimentalDesign.quotas',
		title: 'Quotas',
		description:
			'Quotas set maximum participation caps per condition to ensure balanced group sizes. When a condition reaches its quota, new participants are assigned to other conditions or shown an over-quota message.\n\n' +
			'**Configuration:**\n' +
			'- **Per-condition quotas** -- e.g., 50 participants per group\n' +
			'- **Over-quota behavior** -- redirect to a different URL, show a message, or assign to the least-filled condition\n' +
			'- **Real-time tracking** -- quota counts update as sessions complete\n\n' +
			'Quotas work with all assignment strategies (random, sequential, balanced). The system checks quota availability at the moment of assignment and handles race conditions gracefully.\n\n' +
			'Monitor quota progress from the analytics dashboard or the Experimental Design panel.',
		category: 'experimentalDesign',
		tags: ['quotas', 'cap', 'limit', 'balance', 'enrollment', 'over-quota'],
		related: ['experimentalDesign.conditions', 'experimentalDesign.overview', 'flowControl.terminate']
	},
	{
		key: 'experimentalDesign.randomization',
		title: 'Randomization',
		description:
			'Randomization determines how participants are assigned to conditions.\n\n' +
			'**Strategies:**\n\n' +
			'**Random**\n' +
			'Each participant is assigned to a condition with equal probability (simple randomization). Easy but can produce unequal group sizes, especially with small samples.\n\n' +
			'**Sequential**\n' +
			'Participants are assigned to conditions in a fixed rotation (1, 2, 3, 1, 2, 3...). Guarantees equal group sizes but the assignment pattern is predictable.\n\n' +
			'**Balanced**\n' +
			'Combines randomness with balance. Uses block randomization: within each block of N assignments (where N = number of conditions), each condition appears exactly once in random order. Ensures approximately equal group sizes while maintaining unpredictability.\n\n' +
			'Choose the strategy that fits your study. For most experiments, **balanced** randomization is recommended.',
		category: 'experimentalDesign',
		tags: ['randomization', 'assignment', 'random', 'sequential', 'balanced', 'block'],
		related: ['experimentalDesign.conditions', 'experimentalDesign.quotas']
	}
];
