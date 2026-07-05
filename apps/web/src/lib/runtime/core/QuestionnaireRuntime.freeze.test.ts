import { beforeAll, describe, expect, it } from 'vitest';
import { QuestionnaireRuntime } from './QuestionnaireRuntime';
import type { FormQuestionHost, FormHostPresentation } from './FormQuestionHost';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import type { Questionnaire } from '$lib/shared';

/**
 * FIX-fillout-freeze regression. A modern question (designer- or API-created) is a
 * BaseQuestion with `type`/`response`/`display` and NO legacy `responseType`. Before the
 * fix, QuestionnaireRuntime.inferVariableType defaulted such questions' `${id}_value`
 * variable to type 'object'; writing a string/number answer into it threw in
 * VariableEngine.validateType ("Value X is not an object"). That throw fired inside the
 * fire-and-forget `void handleCollectedResponse(...)`, so it became a silent unhandled
 * rejection and the advance (`currentItemIndex += 1; showCurrentItem()`) never ran — the
 * fillout froze on Q1 while each Continue click wrote a duplicate response row.
 *
 * These tests drive the real runtime over modern questions and assert the participant
 * ADVANCES and the coerced answer is recorded. They fail against the pre-fix default of
 * 'object' (the runtime stays on Q1) and pass with the modern inference + 'string' default.
 */

/** Modern text-input question: no `responseType`, only the concrete module shape. */
function modernTextInput(id: string, order: number) {
	return {
		id,
		type: 'text-input',
		order,
		display: { prompt: `Question ${id}`, placeholder: 'Type here' },
		response: { saveAs: id, transform: 'none' },
	};
}

/** Modern number-input question: no `responseType`, only the concrete module shape. */
function modernNumberInput(id: string, order: number) {
	return {
		id,
		type: 'number-input',
		order,
		display: { prompt: `Question ${id}`, min: 0, max: 100 },
		response: { saveAs: id },
	};
}

function buildModernQuestionnaire(): Questionnaire {
	// One question per page so answering an item advances to the next page.
	return {
		id: 'qn-modern',
		name: 'Modern fillout fixture',
		version: '1.0.0',
		versionMajor: 1,
		versionMinor: 0,
		versionPatch: 0,
		created: new Date(),
		modified: new Date(),
		variables: [],
		questions: [modernTextInput('q1', 1), modernNumberInput('q2', 2)],
		pages: [
			{ id: 'p1', name: 'Page 1', questions: ['q1'] },
			{ id: 'p2', name: 'Page 2', questions: ['q2'] },
		],
		flow: [],
		settings: {},
	} as unknown as Questionnaire;
}

/**
 * A form host that records what it presents and hands the test the pending onSubmit
 * callback so the test can answer each interactive item deterministically, one at a time.
 */
function drivingHost(): {
	host: FormQuestionHost;
	presented: string[];
	answer: (value: unknown) => Promise<void>;
} {
	const presented: string[] = [];
	let pending: ((value: unknown, meta?: never) => void) | null = null;

	const host: FormQuestionHost = {
		present(presentation: FormHostPresentation) {
			presented.push(presentation.item.id);
			pending = presentation.interactive ? (presentation.onSubmit as typeof pending) : null;
		},
		clear() {
			/* no-op */
		},
	};

	const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

	async function answer(value: unknown): Promise<void> {
		const cb = pending;
		pending = null;
		cb?.(value);
		// Let the async response commit + next present settle before returning.
		await flush();
	}

	return { host, presented, answer };
}

describe('QuestionnaireRuntime modern-question freeze (FIX-fillout-freeze)', () => {
	beforeAll(async () => {
		// ResourceManager eagerly constructs an AudioContext; jsdom has no Web Audio API.
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

	it('advances past a modern text-input question and records the coerced answer', async () => {
		const rejections: unknown[] = [];
		const onRejection = (event: PromiseRejectionEvent) => {
			event.preventDefault();
			rejections.push(event.reason);
		};
		globalThis.addEventListener?.('unhandledrejection', onRejection);

		try {
			const driver = drivingHost();
			const runtime = new QuestionnaireRuntime({
				canvas: document.createElement('canvas'),
				questionnaire: buildModernQuestionnaire(),
				formHost: driver.host,
			});

			await runtime.start();
			expect(driver.presented).toEqual(['q1']);

			// Answering Q1 must ADVANCE to Q2 — pre-fix this throws (silent rejection) and
			// the runtime stays frozen on q1.
			await driver.answer('hello');

			expect(driver.presented).toEqual(['q1', 'q2']);

			// The q1 value variable holds the coerced string answer (name-keyed: q1_value has name 'q1').
			const vars = runtime.getVariableEngine().getAllVariables();
			expect(vars.q1).toBe('hello');

			// Give any deferred rejection a tick to surface.
			await new Promise((r) => setTimeout(r, 0));
			expect(rejections).toEqual([]);

			runtime.dispose();
		} finally {
			globalThis.removeEventListener?.('unhandledrejection', onRejection);
		}
	});

	it('advances past a modern number-input question and records the numeric answer', async () => {
		const driver = drivingHost();
		const runtime = new QuestionnaireRuntime({
			canvas: document.createElement('canvas'),
			questionnaire: buildModernQuestionnaire(),
			formHost: driver.host,
		});

		await runtime.start();

		// Answer q1 (text) to reach the number-input q2.
		await driver.answer('first');
		expect(driver.presented).toEqual(['q1', 'q2']);

		// Answer q2 with a number: it must be recorded as 29 and the run completes without freezing.
		await driver.answer(29);

		const vars = runtime.getVariableEngine().getAllVariables();
		expect(vars.q2).toBe(29);
		expect(driver.presented).toEqual(['q1', 'q2']);

		runtime.dispose();
	});
});
