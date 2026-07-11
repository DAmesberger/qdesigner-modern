import { describe, it, expect } from 'vitest';
import { reactionTimeTour } from './reactionTimeTour';
// Vite `?raw` imports read the component source as a string in both vitest and
// the production build (no node:fs — which would break the browser bundle).
import designerSource from '$lib/modules/questions/reaction-time/ReactionTimeDesigner.svelte?raw';
import timingSpecSource from '$lib/modules/questions/reaction-time/designer/TimingSpecField.svelte?raw';
import responseSetSource from '$lib/modules/questions/reaction-time/designer/ResponseSetEditor.svelte?raw';

// Selector sanity: every step of the reaction tour must anchor to a real
// id/class in the live reaction-designer components. A renamed or removed anchor
// (e.g. the old `.designer-panel #task-type` that no longer exists) breaks the
// tour silently at runtime; this test breaks the build instead. The token per
// step is the concrete markup we expect the selector to match.
const combinedSource = designerSource + timingSpecSource + responseSetSource;

// Map each step id to the exact markup token its selector resolves against.
// Keep this in lockstep with reactionTimeTour.steps — a step id missing here
// fails the exhaustiveness check below.
const EXPECTED_TOKEN: Record<string, string> = {
	paradigm: 'id="task-type"',
	stimulus: 'id="stimulus-type"',
	'timing-jitter': 'jitter-toggle',
	'response-device': 'id="response-mode"',
	'response-set': 'id="responseset-enable"',
	trials: 'id="test-trials"',
	'timing-precision': 'id="target-fps"',
};

describe('reactionTimeTour selectors', () => {
	it('every step id has a known expected anchor token', () => {
		for (const step of reactionTimeTour.steps) {
			expect(EXPECTED_TOKEN[step.id], `step "${step.id}" has an expected token`).toBeDefined();
		}
	});

	it('every step anchors to real markup in the reaction designer', () => {
		for (const step of reactionTimeTour.steps) {
			const token = EXPECTED_TOKEN[step.id];
			if (token === undefined) throw new Error(`no expected token for step "${step.id}"`);
			expect(
				combinedSource.includes(token),
				`step "${step.id}" selector ${step.target} → expected markup ${token} present`
			).toBe(true);
		}
	});

	it('uses stable id/class selectors, not the deleted .designer-panel scope', () => {
		for (const step of reactionTimeTour.steps) {
			expect(step.target, `step "${step.id}" is not scoped to .designer-panel`).not.toContain(
				'.designer-panel'
			);
		}
	});
});
