import { describe, it, expect } from 'vitest';
import { flowControlTour } from './flowControlTour';
// Vite `?raw` imports read the component source as a string in both vitest and
// the production build (no node:fs — which would break the browser bundle).
import flowManagerSource from '$lib/components/designer/FlowControlManager.svelte?raw';

// Selector sanity: every step of the flow-control tour must anchor to a real
// id/testid in FlowControlManager. The dead anchors this rewrite replaced
// (rail-flow as entry point, flow-type-select, flow-target-select) broke the
// tour silently at runtime; this test breaks the build instead. The token per
// step is the concrete markup we expect the selector to match.

// Map each step id to the exact markup token its selector resolves against.
// Keep this in lockstep with flowControlTour.steps — a step id missing here
// fails the exhaustiveness check below.
const EXPECTED_TOKEN: Record<string, string> = {
	'flow-panel': 'data-testid="flow-open-add-modal"',
	'rule-types': 'id="flow-type"',
	condition: 'data-testid="flow-condition-input"',
	'screen-out': 'data-testid="flow-screenout-message-input"',
	'visual-editor': 'data-testid="flow-open-visual-editor"',
	'branch-graph': 'data-testid="flow-open-branch-graph"',
};

// The anchors that were never real — no step may target these again.
const DEAD_SELECTORS = ['rail-flow', 'flow-type-select', 'flow-target-select'];

describe('flowControlTour selectors', () => {
	it('every step id has a known expected anchor token', () => {
		for (const step of flowControlTour.steps) {
			expect(EXPECTED_TOKEN[step.id], `step "${step.id}" has an expected token`).toBeDefined();
		}
	});

	it('every step anchors to real markup in FlowControlManager', () => {
		for (const step of flowControlTour.steps) {
			const token = EXPECTED_TOKEN[step.id];
			if (token === undefined) throw new Error(`no expected token for step "${step.id}"`);
			expect(
				flowManagerSource.includes(token),
				`step "${step.id}" selector ${step.target} → expected markup ${token} present`
			).toBe(true);
		}
	});

	it('never targets the dead anchors this rewrite removed', () => {
		for (const step of flowControlTour.steps) {
			for (const dead of DEAD_SELECTORS) {
				expect(step.target, `step "${step.id}" must not use dead anchor ${dead}`).not.toContain(
					dead
				);
			}
		}
	});
});
