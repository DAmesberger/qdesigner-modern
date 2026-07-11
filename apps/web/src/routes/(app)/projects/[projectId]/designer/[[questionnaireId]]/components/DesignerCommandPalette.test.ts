import { describe, it, expect } from 'vitest';
// `?raw` reads the component source as a string (works in vitest and the
// production build — no node:fs, which would break the browser bundle).
import paletteSource from './DesignerCommandPalette.svelte?raw';
import { reactionTimeTour } from '$lib/help/tours/definitions/reactionTimeTour';
import { statisticalFeedbackTour } from '$lib/help/tours/definitions/statisticalFeedbackTour';
import { flowControlTour } from '$lib/help/tours/definitions/flowControlTour';

// The command palette is the launcher for the designer help tours. Each tour
// wired here must (a) resolve to a real definition file and (b) reference the
// exact named export the palette imports at runtime. A renamed export or a
// dropped command silently loses the launcher; this test breaks the build
// instead.
describe('DesignerCommandPalette tour launchers', () => {
	const WIRED = [
		{ command: 'help-getting-started', path: 'designerIntro', named: 'designerIntroTour' },
		{ command: 'help-variables-tour', path: 'variablesTour', named: 'variablesTour' },
		{ command: 'help-reaction-time-tour', path: 'reactionTimeTour', named: 'reactionTimeTour' },
		{
			command: 'help-statistical-feedback-tour',
			path: 'statisticalFeedbackTour',
			named: 'statisticalFeedbackTour',
		},
		{ command: 'help-flow-control-tour', path: 'flowControlTour', named: 'flowControlTour' },
	];

	for (const { command, path, named } of WIRED) {
		it(`wires the ${command} command to definitions/${path}`, () => {
			expect(paletteSource, `command id ${command}`).toContain(`id: '${command}'`);
			expect(paletteSource, `dynamic import of ${path}`).toContain(
				`import('$lib/help/tours/definitions/${path}')`
			);
			expect(paletteSource, `named export ${named}`).toContain(`mod.${named}`);
			expect(paletteSource, `${command} launches the tour engine`).toContain('tourEngine.start(tour)');
		});
	}

	it('starts the tour engine from a Help-section command', () => {
		expect(paletteSource).toContain("section: 'Help'");
	});

	// The reaction and statistical-feedback tours we newly exposed must point at
	// definitions that actually exist and carry steps (guards against wiring a
	// launcher for a tour that was deleted or emptied).
	it('exposes tours that resolve to real, non-empty definitions', () => {
		expect(reactionTimeTour.steps.length).toBeGreaterThan(0);
		expect(statisticalFeedbackTour.steps.length).toBeGreaterThan(0);
		expect(flowControlTour.steps.length).toBeGreaterThan(0);
	});
});
