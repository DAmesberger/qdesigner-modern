import type { HelpEntry } from './types';

export const dataQualityEntries: HelpEntry[] = [
	{
		key: 'dataQuality.checks',
		title: 'Data Quality Checks',
		description:
			'Study settings include automatic quality flags that mark suspect sessions without blocking anyone:\n\n' +
			'- **Speeder detection** — flag pages completed faster than a **minimum page time**, or a whole session completed faster than a **minimum total time**.\n' +
			'- **Flatline detection** — flag blocks where a threshold fraction of responses match a repetitive pattern (all the same, alternating, or sequential).\n' +
			'- **Attention checks** — flag a session after a set number of failed attention-check questions. Mark a question as an attention check in its Advanced Settings.\n' +
			'- **Survey time limit** — optionally end the whole session after a number of minutes, either auto-submitting or terminating.\n\n' +
			'These produce flags on the session, not hard stops — you decide during analysis whether to exclude flagged data.',
		category: 'dataQuality',
		tags: ['data quality', 'speeder', 'flatline', 'attention', 'flag', 'time limit', 'exclude'],
		related: ['dataQuality.validity', 'analytics.sessionDetail']
	},
	{
		key: 'dataQuality.validity',
		title: 'Timing Validity & Invalidated Trials',
		description:
			'Reaction timing can degrade for reasons outside a study\'s control — a participant switching tabs, a browser throttling timers, or a page that is not cross-origin isolated (which clamps timer resolution).\n\n' +
			'The **Timing validity** policy (Study settings) chooses the response — **Record and continue** (the default) or **Enforce**.\n\n' +
			'**Record and continue (the default).** When timing validity degrades, QDesigner stamps the affected trial or session with explicit provenance rather than stopping the participant. A trial can carry an **`invalidated`** marker — for example `visibility` (the tab was backgrounded or blurred during the trial) or `no-stimulus` (the stimulus never confirmed onset). Provenance also records whether the page was cross-origin isolated and the measured timer resolution.\n\n' +
			'**Enforce (opt-in), for timing-critical studies.** Two protections engage. A reaction study refuses to start on a browser or server that cannot provide cross-origin isolation — the participant sees a "Precise timing required" screen before any data is collected. And a participant who switches tabs mid-trial has that trial aborted: the task pauses on a "return to the study" overlay until they come back, and the trial re-runs at the end of the block (up to three re-runs per block, after which it is recorded as invalidated-and-lost). Provenance records the aborted attempts, re-runs, and per-block requeue counts.\n\n' +
			'**What an invalidated stamp means:** the trial ran, but its timing may not be trustworthy. The value is kept and disclosed rather than silently dropped, so you can exclude it deliberately in analysis. Server-computed **trial aggregates** exclude invalidated trials by default (an **Include invalidated trials** toggle overrides this per aggregate).\n\n' +
			'The design principle: missing stimulus data fails closed and refuses to run, but *degraded timing* is measurable, so under Record it is stamped and continues — never guessed at, never hidden.',
		category: 'dataQuality',
		tags: ['timing', 'validity', 'invalidated', 'provenance', 'visibility', 'cross-origin', 'isolation', 'reaction', 'enforce', 'record'],
		related: ['dataQuality.checks', 'analytics.sessionDetail', 'reaction.timingSpec', 'variables.serverVariables', 'designer.studySettings.validity']
	}
];
