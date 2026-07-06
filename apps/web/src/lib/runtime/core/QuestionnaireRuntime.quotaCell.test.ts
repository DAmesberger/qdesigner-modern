import { beforeAll, describe, expect, it } from 'vitest';
import { QuestionnaireRuntime } from './QuestionnaireRuntime';
import type { FormQuestionHost, FormHostPresentation } from './FormQuestionHost';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import type { Questionnaire } from '$lib/shared';

/**
 * Regression for the fillout-runtime crash caught by M5 exit-gate live-QA.
 *
 * FilloutPageController.svelte.ts calls `runtime.setFlowVariable('_quotaCell', …)` and
 * `setFlowVariable('_eligible', true)` UNCONDITIONALLY on every session start (E-FLOW-7,
 * quota-cell / eligibility gating). But `_quotaCell` and `_eligible` were never registered
 * — `initializeVariables()` only registered `_participantId`/`_currentPage`/`_totalPages` —
 * so `setVariable` threw "Variable _quotaCell not found", which surfaced as
 * "Unable to load questionnaire — Variable _quotaCell not found" BEFORE any question rendered.
 * Every published questionnaire's fillout crashed at startup regardless of quotas/loops.
 *
 * The fix registers `_quotaCell` (string, default '') and `_eligible` (boolean, default true)
 * as built-in flow variables. This test drives the exact FilloutPageController call sequence
 * against a questionnaire with NO quota configuration; it throws pre-fix and passes post-fix.
 */

function basicQuestionnaire(): Questionnaire {
	return {
		id: 'qn-quota',
		name: 'Quota-cell regression fixture',
		version: '1.0.0',
		versionMajor: 1,
		versionMinor: 0,
		versionPatch: 0,
		created: new Date(),
		modified: new Date(),
		variables: [],
		questions: [
			{
				id: 'q1',
				type: 'text-input',
				order: 1,
				display: { prompt: 'Question q1' },
				response: { saveAs: 'q1', transform: 'none' },
			},
		],
		pages: [{ id: 'p1', name: 'Page 1', questions: ['q1'] }],
		flow: [],
		settings: {},
	} as unknown as Questionnaire;
}

function noopHost(): FormQuestionHost {
	return {
		present(_presentation: FormHostPresentation) {
			/* no-op */
		},
		clear() {
			/* no-op */
		},
	};
}

describe('QuestionnaireRuntime quota/eligibility flow built-ins (fillout-startup regression)', () => {
	beforeAll(async () => {
		if (typeof (globalThis as { AudioContext?: unknown }).AudioContext === 'undefined') {
			(globalThis as { AudioContext?: unknown }).AudioContext = class {
				decodeAudioData() {
					return Promise.resolve({});
				}
				close() {
					return Promise.resolve();
				}
			};
		}
		await ensureModulesRegistered();
	});

	it('registers _quotaCell / _eligible so FilloutPageController can set them at session start', async () => {
		const runtime = new QuestionnaireRuntime({
			canvas: document.createElement('canvas'),
			questionnaire: basicQuestionnaire(),
			formHost: noopHost(),
		});
		await runtime.start();

		// The exact underlying calls FilloutRuntime.setFlowVariable makes at session start
		// (setFlowVariable -> getVariableEngine().setValue) — must NOT throw
		// (pre-fix: "Variable _quotaCell not found").
		const engine = runtime.getVariableEngine();
		expect(() => {
			engine.setValue('_quotaCell', 'cell-a' as never);
			engine.setValue('_eligible', true as never);
		}).not.toThrow();

		const vars = runtime.getVariableEngine().getAllVariables();
		expect(vars.quotaCell).toBe('cell-a');
		expect(vars.eligible).toBe(true);

		runtime.dispose();
	});

	it('defaults _quotaCell to empty string and _eligible to true when never set', async () => {
		const runtime = new QuestionnaireRuntime({
			canvas: document.createElement('canvas'),
			questionnaire: basicQuestionnaire(),
			formHost: noopHost(),
		});
		await runtime.start();

		const vars = runtime.getVariableEngine().getAllVariables();
		expect(vars.quotaCell).toBe('');
		expect(vars.eligible).toBe(true);

		runtime.dispose();
	});
});
