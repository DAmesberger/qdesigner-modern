import type { TourDefinition } from '../types';

export const designerIntroTour: TourDefinition = {
	id: 'designer-intro',
	name: 'The Questionnaire Designer',
	description: 'Learn the basics of the visual questionnaire designer.',
	autoTrigger: true,
	triggerKey: 'qd-tour:designer-intro',
	steps: [
		{
			id: 'designer-root',
			target: '[data-testid="designer-root"]',
			title: 'The Questionnaire Designer',
			description:
				'This is the visual designer where you build your questionnaire. It has three main areas: the **tool rail** on the left, the **canvas** in the center, and the **properties panel** on the right.',
			placement: 'bottom',
		},
		{
			id: 'icon-rail',
			target: '[data-testid="designer-icon-rail"]',
			title: 'Tool Rail',
			description:
				'The tool rail gives you quick access to all design tools. Click any icon to open its panel. The icons are organized by function: structure, adding questions, templates, variables, and flow control.',
			placement: 'right',
		},
		{
			id: 'add-questions',
			target: '[data-testid="rail-add"]',
			title: 'Add Questions',
			description:
				'Click here to open the question palette. You can add text inputs, multiple choice, scales, reaction time tasks, and many more question types.',
			placement: 'right',
			interactive: true,
		},
		{
			id: 'canvas',
			target: '[data-testid="designer-canvas"]',
			title: 'The Canvas',
			description:
				'Your questionnaire pages and questions are displayed here. Click any question to select it and edit its properties. Drag to reorder, or use `Alt+Arrow` keys.',
			placement: 'left',
		},
		{
			id: 'right-sidebar',
			target: '[data-testid="designer-right-sidebar"]',
			title: 'Properties Panel',
			description:
				'When you select a question, its properties appear here. Edit text, configure options, set validation rules, and manage scoring from this panel.',
			placement: 'left',
			waitForElement: true,
		},
		{
			id: 'variables',
			target: '[data-testid="rail-variables"]',
			title: 'Variables',
			description:
				'Variables store computed values, scores, and counters. Use formulas like `SUM()`, `AVG()`, and `IF()` to create dynamic calculations that respond to participant answers.',
			placement: 'right',
		},
		{
			id: 'flow-control',
			target: '[data-testid="rail-flow"]',
			title: 'Flow Control',
			description:
				'Flow control lets you create branching logic: skip questions, loop through blocks, or randomize page order based on conditions or participant responses.',
			placement: 'right',
		},
		{
			id: 'preview',
			target: '[data-testid="designer-preview-button"]',
			title: 'Preview',
			description:
				'Preview your questionnaire as a participant would see it. Test the flow, check timing, and verify that branching logic works correctly. Shortcut: `Ctrl+P`.',
			placement: 'bottom',
		},
		{
			id: 'publish',
			target: '[data-testid="designer-publish-button"]',
			title: 'Publish',
			description:
				'When your questionnaire is ready, publish it to generate a shareable link. Participants can then fill it out online or offline.',
			placement: 'bottom',
		},
		{
			id: 'help',
			target: '[data-testid="rail-help"]',
			title: 'Need Help?',
			description:
				'Click the help icon anytime to open keyboard shortcuts and the command palette (`Ctrl+K`). You can also restart this tour from the help menu.',
			placement: 'right',
		},
	],
};
