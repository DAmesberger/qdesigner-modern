import type { HelpEntry } from './types';

export const variableEntries: HelpEntry[] = [
	{
		key: 'variables.overview',
		title: 'Variables',
		description:
			'Variables store computed values, track participant state, and drive dynamic questionnaire behavior. They update automatically when their dependencies change.\n\n' +
			'Use variables to:\n' +
			'- Compute scores from responses (sum, average, weighted)\n' +
			'- Create conditional logic based on accumulated answers\n' +
			'- Display personalized feedback with {{variableName}} interpolation\n' +
			'- Track timing and reaction time data\n' +
			'- Pass values between pages and blocks',
		category: 'variables',
		tags: ['variables', 'computed', 'state', 'dynamic', 'values'],
		related: [
			'variables.formula.description',
			'variables.dependencies',
			'variables.interpolation',
			'variables.scope.global'
		]
	},

	// Variable types
	{
		key: 'variables.types.number',
		title: 'Number Variable',
		description:
			'Stores numeric values (integers or decimals). Used for scores, counts, and computed measurements.\n\n' +
			'**Default value:** 0\n\n' +
			'**Example uses:**\n' +
			'- Total score: `SUM(q1, q2, q3)`\n' +
			'- Percentage correct: `correctCount / totalCount * 100`\n' +
			'- Weighted score: `q1 * 0.3 + q2 * 0.7`',
		category: 'variables',
		tags: ['number', 'numeric', 'score', 'count', 'integer', 'decimal'],
		related: ['variables.types.reactionTime', 'variables.formula.description']
	},
	{
		key: 'variables.types.string',
		title: 'String Variable',
		description:
			'Stores text values. Useful for building dynamic messages, capturing text responses, or creating labels.\n\n' +
			'**Default value:** empty string\n\n' +
			'**Example uses:**\n' +
			'- Greeting: `CONCAT("Hello, ", participantName)`\n' +
			'- Feedback label: `IF(score > 80, "Excellent", "Keep practicing")`',
		category: 'variables',
		tags: ['string', 'text', 'message', 'label'],
		related: ['variables.types.number', 'variables.interpolation']
	},
	{
		key: 'variables.types.boolean',
		title: 'Boolean Variable',
		description:
			'Stores true/false values. Used for flags, eligibility checks, and conditional logic.\n\n' +
			'**Default value:** false\n\n' +
			'**Example uses:**\n' +
			'- Eligibility: `age >= 18 AND consent == true`\n' +
			'- Completion flag: `COUNT(responses) >= requiredCount`\n' +
			'- Use in flow control to branch or skip sections',
		category: 'variables',
		tags: ['boolean', 'flag', 'true', 'false', 'condition'],
		related: ['variables.types.number', 'flowControl.branch']
	},
	{
		key: 'variables.types.date',
		title: 'Date Variable',
		description:
			'Stores date values as timestamps. Used for scheduling, time-based conditions, and recording when events occurred.\n\n' +
			'**Default value:** null\n\n' +
			'**Example uses:**\n' +
			'- Session start: `NOW()`\n' +
			'- Elapsed time conditions: `TIME_SINCE(startTime) > 300000`',
		category: 'variables',
		tags: ['date', 'time', 'timestamp', 'schedule'],
		related: ['variables.types.time']
	},
	{
		key: 'variables.types.time',
		title: 'Time Variable',
		description:
			'Stores time durations in milliseconds. Useful for tracking how long participants spend on sections or tasks.\n\n' +
			'**Default value:** 0\n\n' +
			'**Example uses:**\n' +
			'- Page duration: `TIME_SINCE(pageEnterTime)`\n' +
			'- Total session time: `NOW() - sessionStartTime`',
		category: 'variables',
		tags: ['time', 'duration', 'milliseconds', 'elapsed'],
		related: ['variables.types.date', 'variables.types.reactionTime']
	},
	{
		key: 'variables.types.array',
		title: 'Array Variable',
		description:
			'Stores ordered lists of values. Used for collecting multiple responses, recording sequences, or aggregating data across questions.\n\n' +
			'**Default value:** empty array\n\n' +
			'**Example uses:**\n' +
			'- Response sequence: collect all reaction times into a list\n' +
			'- Use with FILTER, MAP, SORT, UNIQUE to process data\n' +
			'- Compute MEAN, STDEV, or PERCENTILE across collected values',
		category: 'variables',
		tags: ['array', 'list', 'collection', 'sequence'],
		related: ['variables.types.object', 'formulas.array.SUM']
	},
	{
		key: 'variables.types.object',
		title: 'Object Variable',
		description:
			'Stores structured data as key-value pairs. Used for complex configurations and grouped data.\n\n' +
			'**Default value:** empty object\n\n' +
			'**Example uses:**\n' +
			'- Group related scores: `{verbal: 85, spatial: 92, memory: 78}`\n' +
			'- Access values with dot notation in formulas',
		category: 'variables',
		tags: ['object', 'structured', 'key-value', 'group'],
		related: ['variables.types.array']
	},
	{
		key: 'variables.types.reactionTime',
		title: 'Reaction Time Variable',
		description:
			'Stores reaction time measurements in microseconds (BIGINT precision). Specifically designed for psychological experiments requiring precise timing.\n\n' +
			'**Default value:** 0\n\n' +
			'**Precision:** Microsecond accuracy using high-resolution timers. Values are stored as integers to avoid floating-point rounding.\n\n' +
			'**Example uses:**\n' +
			'- Stroop task response latency\n' +
			'- IAT trial timing\n' +
			'- Flanker task congruency effects',
		category: 'variables',
		tags: ['reaction', 'time', 'latency', 'microsecond', 'timing', 'precision'],
		related: ['variables.types.number', 'questionTypes.reactionTime']
	},
	{
		key: 'variables.types.stimulusOnset',
		title: 'Stimulus Onset Variable',
		description:
			'Records the precise timestamp when a stimulus was first displayed to the participant. Used as the reference point for reaction time calculations.\n\n' +
			'**Default value:** 0\n\n' +
			'**Usage:** Automatically set by reaction time questions and WebGL stimulus displays. The difference between the response timestamp and stimulus onset gives the true reaction time.',
		category: 'variables',
		tags: ['stimulus', 'onset', 'display', 'timestamp', 'reference'],
		related: ['variables.types.reactionTime', 'questionTypes.reactionTime', 'questionTypes.webgl']
	},

	// Scopes
	{
		key: 'variables.scope.global',
		title: 'Global Scope',
		description:
			'Global variables are accessible from anywhere in the questionnaire. They persist across all pages and blocks.\n\n' +
			'**Use for:** Total scores, participant-level flags, session metadata, and any value that needs to be referenced from multiple locations.',
		category: 'variables',
		tags: ['global', 'scope', 'everywhere', 'persistent'],
		related: ['variables.scope.page', 'variables.scope.block']
	},
	{
		key: 'variables.scope.page',
		title: 'Page Scope',
		description:
			'Page-scoped variables are only accessible within the page where they are defined. They reset when the participant navigates to a different page.\n\n' +
			'**Use for:** Page-specific calculations, temporary display values, and intermediate computations that are only needed on one page.',
		category: 'variables',
		tags: ['page', 'scope', 'local', 'temporary'],
		related: ['variables.scope.global', 'variables.scope.block']
	},
	{
		key: 'variables.scope.block',
		title: 'Block Scope',
		description:
			'Block-scoped variables are only accessible within the block where they are defined. They reset when the block ends (e.g., when a loop iteration completes).\n\n' +
			'**Use for:** Loop iteration counters, per-trial calculations in experimental blocks, and block-level aggregations.',
		category: 'variables',
		tags: ['block', 'scope', 'local', 'loop', 'trial'],
		related: ['variables.scope.global', 'variables.scope.page', 'flowControl.loop']
	},

	// Formulas & features
	{
		key: 'variables.formula.description',
		title: 'Formulas',
		description:
			'Formulas auto-compute variable values using built-in functions and operators. When any dependency changes, the formula recalculates automatically.\n\n' +
			'**Operators:** `+`, `-`, `*`, `/`, `^` (power), `==`, `!=`, `>`, `<`, `>=`, `<=`, `AND`, `OR`, `NOT`\n\n' +
			'**Example formulas:**\n' +
			'- Simple score: `q1 + q2 + q3`\n' +
			'- Average: `MEAN(q1, q2, q3, q4, q5)`\n' +
			'- Conditional: `IF(score > 80, "High", IF(score > 50, "Medium", "Low"))`\n' +
			'- Statistical: `ZSCORE(participantScore, MEAN(allScores), STDEV(allScores))`\n\n' +
			'See the **Formula Reference** for a complete list of 50+ available functions.',
		category: 'variables',
		tags: ['formula', 'compute', 'calculate', 'expression', 'function', 'auto'],
		related: ['variables.dependencies', 'variables.overview']
	},
	{
		key: 'variables.dependencies',
		title: 'Variable Dependencies',
		description:
			'Variables can depend on other variables, forming a reactive dependency graph. When a source variable changes, all dependent variables automatically recalculate in the correct order.\n\n' +
			'**How it works:**\n' +
			'1. You write a formula referencing other variables (e.g., `totalScore = q1 + q2 + q3`)\n' +
			'2. The engine detects that `totalScore` depends on `q1`, `q2`, and `q3`\n' +
			'3. When any of those change, `totalScore` recalculates\n' +
			'4. If another variable depends on `totalScore`, it recalculates too\n\n' +
			'**Circular dependencies** (A depends on B depends on A) are detected and prevented at design time.',
		category: 'variables',
		tags: ['dependencies', 'reactive', 'graph', 'recalculate', 'chain'],
		related: ['variables.formula.description', 'variables.overview']
	},
	{
		key: 'variables.interpolation',
		title: 'Variable Interpolation',
		description:
			'Use `{{variableName}}` syntax in text fields to insert variable values dynamically. The placeholder is replaced with the current value when the participant sees the question.\n\n' +
			'**Where you can use it:**\n' +
			'- Question text and descriptions\n' +
			'- Response option labels\n' +
			'- Page titles and instructions\n' +
			'- Feedback messages\n\n' +
			'**Examples:**\n' +
			'- "Your score is **{{totalScore}}** out of {{maxScore}}."\n' +
			'- "You answered {{correctCount}} questions correctly in {{elapsedTime}} seconds."\n' +
			'- "Based on your responses, your classification is: {{category}}"',
		category: 'variables',
		tags: ['interpolation', 'template', 'dynamic', 'text', 'placeholder', 'mustache'],
		related: ['variables.overview', 'variables.formula.description']
	}
];
