import type { TourDefinition } from '../types';
import { designerStore } from '$lib/stores/designer.svelte';

export const variablesTour: TourDefinition = {
	id: 'variables-tour',
	name: 'Variables & Formulas',
	description: 'Learn how to create variables and use formulas in your questionnaires.',
	triggerKey: 'qd-tour:variables',
	steps: [
		{
			id: 'variable-list',
			target: '[data-testid="rail-variables"]',
			title: 'Variable List',
			description:
				'Variables are the data backbone of your questionnaire. They store scores, computed values, and counters. Click here to open the Variables panel.',
			placement: 'right',
			beforeShow: () => designerStore.setPanel('variables'),
		},
		{
			id: 'add-variable',
			target: 'button:has(> span):is([class*="bg-primary"])',
			title: 'Add a Variable',
			description:
				'Click **Add Variable** to create a new variable. Give it a descriptive name like `totalScore` or `reactionTime`. Variable names must be unique.',
			placement: 'bottom',
			beforeShow: () => designerStore.setPanel('variables'),
		},
		{
			id: 'type-selector',
			target: '#var-type',
			title: 'Variable Types',
			description:
				'Choose the right type for your data: **Number** for scores and calculations, **Text** for labels, **True/False** for conditions, **Reaction Time** for timing data, and more.',
			placement: 'right',
			waitForElement: true,
		},
		{
			id: 'scope',
			target: '#var-name',
			title: 'Variable Scope',
			description:
				'Variables can be **global** (available everywhere) or **local** (scoped to a specific block). Use global for scores that span your whole questionnaire.',
			placement: 'right',
			waitForElement: true,
		},
		{
			id: 'formula',
			target: '#var-formula',
			title: 'Formulas',
			description:
				'Write formulas to compute values automatically. Use functions like `SUM()`, `AVG()`, `IF()`, `RANDOM()`, and reference other variables by name. Example: `totalScore / questionCount * 100`.',
			placement: 'right',
			waitForElement: true,
		},
		{
			id: 'default-value',
			target: '#var-default',
			title: 'Default Values',
			description:
				'Set an initial value for the variable. This is used before the participant provides any responses. For computed variables, the formula result takes precedence.',
			placement: 'right',
			waitForElement: true,
		},
		{
			id: 'dependency-graph',
			target: 'button:has(> .lucide-network)',
			title: 'Dependency Graph',
			description:
				'Toggle the dependency graph to visualize how variables relate to each other. Arrows show which variables depend on others -- useful for debugging complex scoring logic.',
			placement: 'bottom',
			beforeShow: () => designerStore.setPanel('variables'),
		},
	],
};
