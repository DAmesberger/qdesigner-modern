import type { TourDefinition } from '../types';

// Selectors here are anchored to real, stable ids/classes in ReactionTimeDesigner
// and its sub-editors (verified against the components, not invented):
//   #task-type          — the Paradigm <Select>            (always present)
//   #stimulus-type      — the Stimulus Type <Select>       (always present)
//   .jitter-toggle      — TimingSpecField's Jitter toggle  (only paradigms with a
//                         TimingSpec field; waitForElement:false degrades gracefully)
//   #response-mode      — the Response Device <Select>      (always present)
//   #responseset-enable — "Customize response set" button   (editable paradigms with
//                         no custom set yet; waitForElement:false degrades gracefully)
//   #test-trials        — Number of Test Trials             (standard/custom paradigms)
//   #target-fps         — Target FPS <Select>               (always present)
// The reaction question must be selected so the designer panel is mounted.
export const reactionTimeTour: TourDefinition = {
	id: 'reaction-time-tour',
	name: 'Reaction Time Tasks',
	description: 'Learn how to configure reaction time experiments with frame-accurate, high-resolution timing.',
	triggerKey: 'qd-tour:reaction-time',
	steps: [
		{
			id: 'paradigm',
			target: '#task-type',
			title: 'Choose a Paradigm',
			description:
				'A **paradigm** is the scientific procedure the task follows — Standard, PVT, Stroop, Flanker, IAT, Go/No-Go, Simon, and more, plus a **Custom Trial Plan**. It fixes the trial structure and what counts as correct. Switching it reloads that paradigm\'s starter parameters, so pick it first.',
			placement: 'left',
			waitForElement: true,
		},
		{
			id: 'stimulus',
			target: '#stimulus-type',
			title: 'Configure the Stimulus',
			description:
				'Choose what participants respond to: text, a shape, or an image / video / audio asset from the media library. The fixation settings below control the pre-stimulus cross or dot.',
			placement: 'left',
			waitForElement: true,
		},
		{
			id: 'timing-jitter',
			target: '.jitter-toggle',
			title: 'Fixed or Jittered Timing',
			description:
				'Each authored phase duration is a **TimingSpec**. Leave **Jitter** off for a single fixed value, or turn it on for a **min / max** range. Jittered durations are sampled once per trial by the seeded generator when the block is built — reproducible from the seed and recorded as trial data. (Only paradigms with a TimingSpec field show this toggle.)',
			placement: 'left',
			waitForElement: false,
		},
		{
			id: 'response-device',
			target: '#response-mode',
			title: 'Response Device',
			description:
				'Pick how participants respond: keyboard, mouse or touch (spatial click against a target region), or a gamepad button box. External **HID button boxes** are bound in the response set below (Chromium only).',
			placement: 'left',
			waitForElement: true,
		},
		{
			id: 'response-set',
			target: '#responseset-enable',
			title: 'Author the Response Set',
			description:
				'**Customize response set** gives each answer a stable **id** (what analysis and export key on) and one or more **bindings** — a keyboard key, a click region, a gamepad or HID button — with a **Correct** flag. Standard and Custom paradigms are editable here; other paradigms define their responses procedurally.',
			placement: 'left',
			waitForElement: false,
		},
		{
			id: 'trials',
			target: '#test-trials',
			title: 'Trials & Practice',
			description:
				'Set the number of test trials, add practice trials so participants learn the task first (practice is excluded from analysis), and optionally show per-response feedback.',
			placement: 'left',
			waitForElement: false,
		},
		{
			id: 'timing-precision',
			target: '#target-fps',
			title: 'Timing Precision',
			description:
				'Stimuli render in the WebGL runtime with explicit frame pacing. Set **Target FPS** to match the experiment device — higher refresh rates give more precise onset and response timing.',
			placement: 'left',
			waitForElement: true,
		},
	],
};
