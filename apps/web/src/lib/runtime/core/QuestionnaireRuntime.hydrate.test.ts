import { beforeAll, describe, expect, it } from 'vitest';
import { QuestionnaireRuntime } from './QuestionnaireRuntime';
import type { FormQuestionHost, FormHostPresentation } from './FormQuestionHost';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import type { Questionnaire, Response } from '$lib/shared';

/**
 * E-OFF-1: hydrate() must seed prior answers and make start() land on the first
 * UNANSWERED item — never re-presenting an item that already has a response.
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

	return {
		id: 'qn-1',
		name: 'Resume fixture',
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
		pages: [{ id: 'p1', name: 'Page 1', questions: ['q1', 'q2', 'q3', 'q4'] }],
		flow: [],
		settings: {},
		// The fixture questions are a simplified single-choice shape; the runtime only
		// reads id/type/order/responseType/display here.
	} as unknown as Questionnaire;
}

function recordingHost(): { host: FormQuestionHost; presented: string[] } {
	const presented: string[] = [];
	const host: FormQuestionHost = {
		present(presentation: FormHostPresentation) {
			presented.push(presentation.item.id);
		},
		clear() {
			/* no-op for the test */
		},
	};
	return { host, presented };
}

function answer(questionId: string): Response {
	return {
		id: `restored-${questionId}`,
		questionId,
		timestamp: 1,
		value: 'a',
		valid: true,
	};
}

describe('QuestionnaireRuntime.hydrate', () => {
	beforeAll(async () => {
		// ResourceManager eagerly constructs an AudioContext; jsdom has no Web Audio API.
		// A no-op stub suffices — the form-only fixture never decodes audio.
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

	it('records the answered set and prior responses before start()', () => {
		const { host } = recordingHost();
		const runtime = new QuestionnaireRuntime({
			canvas: document.createElement('canvas'),
			questionnaire: buildQuestionnaire(),
			formHost: host,
		});

		runtime.hydrate({ responses: [answer('q1'), answer('q2')], variables: {} });

		const cursor = runtime.getResumeCursor();
		expect(cursor.answeredQuestionIds).toEqual(['q1', 'q2']);

		runtime.dispose();
	});

	it('start() presents the first unanswered item and skips answered ones', async () => {
		const { host, presented } = recordingHost();
		const runtime = new QuestionnaireRuntime({
			canvas: document.createElement('canvas'),
			questionnaire: buildQuestionnaire(),
			formHost: host,
		});

		// Answered q1 + q2 in a prior session; resume should skip straight to q3.
		runtime.hydrate({ responses: [answer('q1'), answer('q2')], variables: {} });
		await runtime.start();

		// Exactly one item presented, and it is the third (first unanswered) question.
		expect(presented).toEqual(['q3']);
		expect(presented).not.toContain('q1');
		expect(presented).not.toContain('q2');

		runtime.dispose();
	});

	it('start() presents the first item when there is nothing to resume', async () => {
		const { host, presented } = recordingHost();
		const runtime = new QuestionnaireRuntime({
			canvas: document.createElement('canvas'),
			questionnaire: buildQuestionnaire(),
			formHost: host,
		});

		await runtime.start();
		expect(presented).toEqual(['q1']);

		runtime.dispose();
	});
});
