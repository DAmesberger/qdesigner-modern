import type { TourDefinition } from '../types';
import { designerStore } from '$lib/stores/designer.svelte';

export const flowControlTour: TourDefinition = {
	id: 'flow-control-tour',
	name: 'Flow Control',
	description: 'Learn how to add branching, loops, and randomization to your questionnaire.',
	triggerKey: 'qd-tour:flow-control',
	steps: [
		{
			id: 'flow-list',
			target: '[data-testid="rail-flow"]',
			title: 'Flow Control List',
			description:
				'Flow control rules determine the path each participant takes through your questionnaire. Open the Flow panel to view and manage all your rules.',
			placement: 'right',
			beforeShow: () => designerStore.setPanel('flow'),
		},
		{
			id: 'add-flow',
			target: '[data-testid="flow-open-add-modal"]',
			title: 'Add Flow Control',
			description:
				'Click **Add Flow Rule** to create a new branching rule, loop, or randomization. Each rule is evaluated in order during the questionnaire flow.',
			placement: 'bottom',
			beforeShow: () => designerStore.setPanel('flow'),
		},
		{
			id: 'type-selector',
			target: '[data-testid="flow-type-select"]',
			title: 'Flow Types',
			description:
				'Choose from several flow types:\n- **Skip Logic**: Jump over questions based on conditions\n- **Display Logic**: Show/hide questions conditionally\n- **Loop**: Repeat a block multiple times\n- **Randomize**: Shuffle page or block order',
			placement: 'right',
			waitForElement: true,
		},
		{
			id: 'condition',
			target: '[data-testid="flow-condition-input"]',
			title: 'Conditions',
			description:
				'Write conditions using variable names and operators. Examples:\n`age >= 18`\n`score > 50 AND group == "experimental"`\nConditions support `AND`, `OR`, `NOT`, and comparison operators.',
			placement: 'right',
			waitForElement: true,
		},
		{
			id: 'target',
			target: '[data-testid="flow-target-select"]',
			title: 'Targets',
			description:
				'Select which page or block the flow rule applies to. For skip logic, this is the destination to jump to. For loops, this is the block to repeat.',
			placement: 'right',
			waitForElement: true,
		},
		{
			id: 'visual-editor',
			target: '[data-testid="flow-open-visual-editor"]',
			title: 'Visual Flow Editor',
			description:
				'Open the visual flow editor for a graphical view of your questionnaire flow. See how pages connect, where branches split, and how loops work -- all in an interactive diagram.',
			placement: 'bottom',
			beforeShow: () => designerStore.setPanel('flow'),
		},
	],
};
