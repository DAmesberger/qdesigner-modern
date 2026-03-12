import type { HelpEntry } from './types';

export const flowControlEntries: HelpEntry[] = [
	{
		key: 'flowControl.overview',
		title: 'Flow Control',
		description:
			'Flow control determines the path participants take through your questionnaire. By default, participants proceed linearly through pages. Flow control lets you create branching paths, skip irrelevant sections, loop through repeated tasks, and terminate early when criteria are met.\n\n' +
			'**Flow control types:**\n' +
			'- **Branch** -- Send participants to different pages based on their responses\n' +
			'- **Skip** -- Skip over questions or pages when conditions are met\n' +
			'- **Loop** -- Repeat a section a fixed number of times or until a condition is met\n' +
			'- **Terminate** -- End the session early (e.g., for screening failures)',
		category: 'flowControl',
		tags: ['flow', 'control', 'logic', 'navigation', 'path', 'routing'],
		related: ['flowControl.branch', 'flowControl.skip', 'flowControl.loop', 'flowControl.terminate']
	},
	{
		key: 'flowControl.branch',
		title: 'Branching',
		description:
			'Branching sends participants to different pages or blocks based on conditions. When a branch condition evaluates to true, the participant jumps to the specified target instead of continuing linearly.\n\n' +
			'**Example uses:**\n' +
			'- Route to different question sets based on age group\n' +
			'- Show different feedback pages based on performance\n' +
			'- Send participants to different experimental conditions\n\n' +
			'**Setting up a branch:**\n' +
			'1. Select the question or page where the branch decision occurs\n' +
			'2. Open the Flow Control section in Properties\n' +
			'3. Add a branch rule with a condition and target\n' +
			'4. Optionally add an "else" target for when no conditions match',
		category: 'flowControl',
		tags: ['branch', 'conditional', 'route', 'jump', 'path'],
		related: ['flowControl.conditions', 'flowControl.targets', 'flowControl.skip']
	},
	{
		key: 'flowControl.skip',
		title: 'Skip Logic',
		description:
			'Skip logic hides questions or entire pages when specified conditions are true. Unlike branching, skipped items are simply passed over -- the participant continues forward without being redirected.\n\n' +
			'**Example uses:**\n' +
			'- Skip follow-up questions when the participant answered "No"\n' +
			'- Skip an entire section for participants who are not eligible\n' +
			'- Skip demographic questions for returning participants\n\n' +
			'**Setting up skip logic:**\n' +
			'1. Select the question or page to conditionally skip\n' +
			'2. Open the Flow Control section in Properties\n' +
			'3. Add a skip condition (when true, the item is hidden)',
		category: 'flowControl',
		tags: ['skip', 'hide', 'conditional', 'display', 'logic'],
		related: ['flowControl.conditions', 'flowControl.branch']
	},
	{
		key: 'flowControl.loop',
		title: 'Loops',
		description:
			'Loops repeat a block of questions multiple times. This is essential for reaction time experiments, practice trials, and repeated-measures designs.\n\n' +
			'**Loop types:**\n' +
			'- **Fixed count** -- Repeat exactly N times (e.g., 20 trials)\n' +
			'- **Condition-based** -- Repeat until a condition is met (e.g., 3 correct in a row)\n\n' +
			'Each iteration can access loop-specific variables like the current iteration number and values accumulated across iterations.\n\n' +
			'**Setting up a loop:**\n' +
			'1. Create a block containing the questions to repeat\n' +
			'2. In the block properties, enable Loop\n' +
			'3. Set the iteration count or termination condition\n' +
			'4. Optionally configure randomization of stimuli across iterations',
		category: 'flowControl',
		tags: ['loop', 'repeat', 'iteration', 'trial', 'cycle'],
		related: ['flowControl.conditions', 'flowControl.terminate', 'variables.scope.block']
	},
	{
		key: 'flowControl.terminate',
		title: 'Early Termination',
		description:
			'Terminate the questionnaire session early when a condition is met. The participant sees a configurable end message and their data is saved up to that point.\n\n' +
			'**Example uses:**\n' +
			'- Screening: end immediately if the participant does not meet inclusion criteria\n' +
			'- Quota full: end if the participant\'s condition has reached its quota\n' +
			'- Quality check: end if response patterns suggest inattention\n\n' +
			'You can configure different completion messages and redirect URLs for terminated sessions versus fully completed sessions.',
		category: 'flowControl',
		tags: ['terminate', 'end', 'early', 'screen', 'quit', 'stop'],
		related: ['flowControl.conditions', 'experimentalDesign.quotas']
	},
	{
		key: 'flowControl.conditions',
		title: 'Conditions',
		description:
			'Conditions are expressions that evaluate to true or false and drive all flow control decisions. They can reference variables, responses, and built-in functions.\n\n' +
			'**Syntax examples:**\n' +
			'- Simple comparison: `age >= 18`\n' +
			'- Response check: `q1 == "Yes"`\n' +
			'- Combined: `age >= 18 AND consent == true`\n' +
			'- Negation: `NOT(isExcluded)`\n' +
			'- Computed: `SUM(q1, q2, q3) > 10`\n' +
			'- Nested: `IF(group == "A", score > 80, score > 60)`\n\n' +
			'Conditions are evaluated in real time as participants respond.',
		category: 'flowControl',
		tags: ['conditions', 'expression', 'comparison', 'boolean', 'logic', 'evaluate'],
		related: ['flowControl.branch', 'flowControl.skip', 'variables.formula.description']
	},
	{
		key: 'flowControl.targets',
		title: 'Branch & Skip Targets',
		description:
			'Branch and skip targets specify where to redirect or what to hide. Targets can be:\n\n' +
			'- **A specific page** -- Jump to any page by name\n' +
			'- **A specific question** -- Jump to a question within a page\n' +
			'- **End of questionnaire** -- Terminate the session\n' +
			'- **Next page** -- Continue to the next page (default behavior)\n\n' +
			'When using branching, the order of rules matters: the first matching condition determines the target. Add an "else" rule as the last entry to catch participants who do not match any condition.',
		category: 'flowControl',
		tags: ['targets', 'destination', 'page', 'question', 'jump', 'redirect'],
		related: ['flowControl.branch', 'flowControl.skip']
	}
];
