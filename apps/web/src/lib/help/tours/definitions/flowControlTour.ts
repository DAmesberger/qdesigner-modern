import { tick } from 'svelte';
import type { TourDefinition } from '../types';
import { designerStore } from '$lib/stores/designer.svelte';

// Selectors here are anchored to real, stable ids/testids in FlowControlManager
// (verified against the component source, not invented). The dead anchors this
// rewrite replaces — `[data-testid="rail-flow"]` as an entry point, plus the
// never-existed `flow-type-select` / `flow-target-select` — stranded the tour.
//   [data-testid="flow-open-add-modal"]        — "Add Flow" button   (panel-level, always present)
//   #flow-type                                 — Type <Select>       (only when the Add/Edit modal is open)
//   [data-testid="flow-condition-input"]       — Condition input     (modal)
//   [data-testid="flow-screenout-message-input"] — Screen-out message (modal, `terminate` type only)
//   [data-testid="flow-open-visual-editor"]    — Visual editor button (panel-level)
//   [data-testid="flow-open-branch-graph"]     — Branch graph button  (panel-level)
// The condition/rule-type steps live inside a Dialog whose open state is private
// to FlowControlManager, so their beforeShow hooks open the panel and click the
// "Add Flow" button; the MutationObserver in the tour engine (waitForElement)
// then catches the modal mount. Panel-level steps close the modal first.

const ADD_MODAL_BUTTON = '[data-testid="flow-open-add-modal"]';
const ADD_MODAL = '[data-testid="flow-add-modal"]';
const CANCEL_BUTTON = '[data-testid="flow-cancel-button"]';

async function openFlowModal(): Promise<void> {
	designerStore.setPanel('flow');
	await tick();
	if (!document.querySelector(ADD_MODAL)) {
		document.querySelector<HTMLElement>(ADD_MODAL_BUTTON)?.click();
		await tick();
	}
}

async function closeFlowModal(): Promise<void> {
	if (document.querySelector(ADD_MODAL)) {
		document.querySelector<HTMLElement>(CANCEL_BUTTON)?.click();
	}
	designerStore.setPanel('flow');
	await tick();
}

export const flowControlTour: TourDefinition = {
	id: 'flow-control-tour',
	name: 'Flow Control',
	description: 'Learn how to add branching, loops, screen-outs, and validation to your questionnaire.',
	triggerKey: 'qd-tour:flow-control',
	steps: [
		{
			id: 'flow-panel',
			target: ADD_MODAL_BUTTON,
			title: 'Flow Control',
			description:
				'Flow control rules decide the path each participant takes. Open the **Flow** panel from the left rail and click **Add Flow** to create a branch, skip, loop, or terminate rule. Rules are evaluated in order as participants move through the questionnaire.',
			placement: 'bottom',
			beforeShow: closeFlowModal,
			waitForElement: true,
		},
		{
			id: 'rule-types',
			target: '#flow-type',
			title: 'Rule Types',
			description:
				'Every rule has a **type**:\n- **Skip** — jump forward over questions/pages\n- **Branch** — route conditionally to a target\n- **Loop** — repeat a section up to a max number of iterations\n- **Terminate** — end early (optionally as an eligibility screen-out)\n\nThe rest of the form adapts to the type you pick.',
			placement: 'right',
			beforeShow: openFlowModal,
			waitForElement: true,
		},
		{
			id: 'condition',
			target: '[data-testid="flow-condition-input"]',
			title: 'Conditions',
			description:
				'Write the **condition** with variable names and JavaScript expressions, e.g. `age >= 18 && consent === true`. The rule fires only when the condition is true. Invalid or incomplete rules are caught before they can break a flow: **Add Flow** stays disabled until the required fields (condition, plus a target for skip/branch or iterations for loops) are filled, and saved rules that fail validation show an inline error on their card.',
			placement: 'right',
			beforeShow: openFlowModal,
			waitForElement: true,
		},
		{
			id: 'screen-out',
			target: '[data-testid="flow-screenout-message-input"]',
			title: 'Eligibility Screen-outs',
			description:
				'Choose the **Terminate** type to reveal the screen-out fields. Fill the **screen-out message** and/or an optional **redirect URL** to turn an early end into an eligibility screen-out: participants see a distinct "not eligible" screen with no completion code, and can be sent back to your panel (e.g. a Prolific/SONA screen-out link). Leave both blank for a plain early end.',
			placement: 'right',
			beforeShow: openFlowModal,
			waitForElement: false,
		},
		{
			id: 'visual-editor',
			target: '[data-testid="flow-open-visual-editor"]',
			title: 'Visual Flow Editor',
			description:
				'Open the **visual flow editor** for a graphical, interactive view of your questionnaire flow — see how pages connect, where branches split, and how loops fold back, and edit the wiring directly on the diagram.',
			placement: 'bottom',
			beforeShow: closeFlowModal,
			waitForElement: true,
		},
		{
			id: 'branch-graph',
			target: '[data-testid="flow-open-branch-graph"]',
			title: 'Branch Graph & Validation',
			description:
				'The **branch graph** analyses your flow and flags problems: **unreachable pages** no path can arrive at and **unconditional loops** (cycles) that would trap participants. A warning dot appears here when issues are found, and you can simulate variable values to trace the exact path a participant would take.',
			placement: 'bottom',
			beforeShow: closeFlowModal,
			waitForElement: true,
		},
	],
};
