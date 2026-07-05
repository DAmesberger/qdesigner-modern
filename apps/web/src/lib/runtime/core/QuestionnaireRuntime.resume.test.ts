import { beforeAll, describe, expect, it } from 'vitest';
import { QuestionnaireRuntime } from './QuestionnaireRuntime';
import type { ResumeState } from './ResumeState';
import { RESUME_STATE_VERSION } from './ResumeState';
import type { FormQuestionHost, FormHostPresentation } from './FormQuestionHost';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import type { Questionnaire } from '$lib/shared';

/**
 * E-FLOW-3: true save-and-continue. captureResumeState() must snapshot the live cursor
 * + variable context; a fresh runtime built with `resumeFrom` must land on the exact
 * page/item the participant left and restore prior variables — without re-presenting
 * already-answered items. A version-drifted state must be discarded and restart at 0.
 */

function buildQuestionnaire(): Questionnaire {
	const mkQuestion = (id: string, order: number) => ({
		id,
		type: 'single-choice',
		order,
		display: {
			prompt: `Question ${id}`,
			options: [
				{ id: 'a', label: 'A', value: 'a' },
				{ id: 'b', label: 'B', value: 'b' },
			],
		},
		responseType: { type: 'single' },
	});

	// One question per page so answering an item advances to the next page.
	return {
		id: 'qn-1',
		name: 'Save-and-continue fixture',
		version: '1.0.0',
		versionMajor: 1,
		versionMinor: 0,
		versionPatch: 0,
		created: new Date(),
		modified: new Date(),
		variables: [],
		questions: [
			mkQuestion('q1', 1),
			mkQuestion('q2', 2),
			mkQuestion('q3', 3),
			mkQuestion('q4', 4),
		],
		pages: [
			{ id: 'p1', name: 'Page 1', questions: ['q1'] },
			{ id: 'p2', name: 'Page 2', questions: ['q2'] },
			{ id: 'p3', name: 'Page 3', questions: ['q3'] },
			{ id: 'p4', name: 'Page 4', questions: ['q4'] },
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

describe('QuestionnaireRuntime save-and-continue (E-FLOW-3)', () => {
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

	it('captures the live cursor + variables and resumes on the same page', async () => {
		const first = drivingHost();
		const runtime1 = new QuestionnaireRuntime({
			canvas: document.createElement('canvas'),
			questionnaire: buildQuestionnaire(),
			formHost: first.host,
		});

		await runtime1.start();
		// Drive through pages 1 and 2; the runtime then presents the page-3 item (q3).
		await first.answer('a'); // answer q1 -> page 2 presents q2
		await first.answer('b'); // answer q2 -> page 3 presents q3

		expect(first.presented).toEqual(['q1', 'q2', 'q3']);

		const snapshot = runtime1.captureResumeState();
		expect(snapshot.schemaVersion).toBe(RESUME_STATE_VERSION);
		expect(snapshot.questionnaireVersion).toBe('1.0.0');
		expect(snapshot.currentPageIndex).toBe(2); // 0-based -> page 3
		expect(snapshot.presentedItemIds).toEqual(['q1', 'q2']);

		runtime1.dispose();

		// Reconstruct a fresh runtime from the snapshot.
		const second = drivingHost();
		const runtime2 = new QuestionnaireRuntime({
			canvas: document.createElement('canvas'),
			questionnaire: buildQuestionnaire(),
			formHost: second.host,
			resumeFrom: snapshot,
		});

		await runtime2.start();

		// Lands directly on the first unanswered item (q3) — never re-presents q1/q2.
		expect(second.presented).toEqual(['q3']);

		// Prior answer variables are intact (name-keyed: q1_value has name 'q1').
		const vars = runtime2.getVariableEngine().getAllVariables();
		expect(vars.q1).toBe('a');
		expect(vars.q2).toBe('b');

		runtime2.dispose();
	});

	it('discards a version-drifted resume state and restarts at page 0', async () => {
		const drifted: ResumeState = {
			schemaVersion: RESUME_STATE_VERSION,
			questionnaireVersion: '2.0.0', // does not match the fixture's 1.0.0
			currentPageIndex: 2,
			currentItemIndex: 0,
			loopIterationState: {},
			variableSnapshot: {},
			presentedItemIds: ['q1', 'q2'],
			capturedAt: Date.now(),
		};

		const { host, presented } = drivingHost();
		const runtime = new QuestionnaireRuntime({
			canvas: document.createElement('canvas'),
			questionnaire: buildQuestionnaire(),
			formHost: host,
			resumeFrom: drifted,
		});

		await runtime.start();

		// Drift guard: ignored the cursor, started fresh at q1.
		expect(presented).toEqual(['q1']);

		const session = (runtime as unknown as { session: { metadata?: { custom?: Record<string, unknown> } } })
			.session;
		expect(session.metadata?.custom?.resumeDiscarded).toMatchObject({
			reason: 'questionnaire_version_drift',
			capturedVersion: '2.0.0',
			currentVersion: '1.0.0',
		});

		runtime.dispose();
	});

	it('restores loop-iteration counters', async () => {
		const snapshot: ResumeState = {
			schemaVersion: RESUME_STATE_VERSION,
			questionnaireVersion: '1.0.0',
			currentPageIndex: 0,
			currentItemIndex: 0,
			loopIterationState: { 'loop-rule-1': 2 },
			variableSnapshot: {},
			presentedItemIds: [],
			capturedAt: Date.now(),
		};

		const { host } = drivingHost();
		const runtime = new QuestionnaireRuntime({
			canvas: document.createElement('canvas'),
			questionnaire: buildQuestionnaire(),
			formHost: host,
			resumeFrom: snapshot,
		});

		await runtime.start();

		const loops = (runtime as unknown as { loopIterations: Map<string, number> }).loopIterations;
		expect(loops.get('loop-rule-1')).toBe(2);

		runtime.dispose();
	});
});
