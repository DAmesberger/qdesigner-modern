import type { TourDefinition } from '../types';

export const reactionTimeTour: TourDefinition = {
	id: 'reaction-time-tour',
	name: 'Reaction Time Tasks',
	description: 'Learn how to configure reaction time experiments with microsecond precision.',
	triggerKey: 'qd-tour:reaction-time',
	steps: [
		{
			id: 'task-type',
			target: '.designer-panel #task-type',
			title: 'Reaction Time Tasks',
			description:
				'Choose a task paradigm: **Standard** for simple RT, **N-Back** for working memory, **Stroop** for interference, **Flanker** for attention, **IAT** for implicit association, or **Dot-Probe** for attentional bias.',
			placement: 'left',
			waitForElement: true,
		},
		{
			id: 'stimulus-config',
			target: '.designer-panel .subsection',
			title: 'Configure Stimuli',
			description:
				'Set up your stimuli for the selected task. Define text, shapes, or images that participants will respond to. Each task type has its own specific configuration for stimuli and response keys.',
			placement: 'left',
			waitForElement: true,
		},
		{
			id: 'timing',
			target: '.designer-panel .form-grid',
			title: 'Timing Settings',
			description:
				'Configure timing with **microsecond precision**: fixation duration, stimulus display time, inter-stimulus interval (ISI), and response timeout. All timing uses high-resolution performance counters.',
			placement: 'left',
			waitForElement: true,
		},
		{
			id: 'trial-sequence',
			target: '.designer-panel .section:nth-child(2)',
			title: 'Trial Sequence',
			description:
				'Define the trial sequence: number of trials, congruent/incongruent ratio, and randomization. The system automatically generates balanced trial lists based on your configuration.',
			placement: 'left',
			waitForElement: true,
		},
		{
			id: 'practice-trials',
			target: '.designer-panel .section:nth-child(3)',
			title: 'Practice Trials',
			description:
				'Add practice trials so participants can learn the task before data collection begins. Practice trials are excluded from analysis but help ensure valid response patterns.',
			placement: 'left',
			waitForElement: true,
		},
	],
};
