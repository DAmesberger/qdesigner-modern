import { describe, it, expect } from 'vitest';
import { buildQuestionAnnouncement, type AnnounceableQuestion } from './announce';
import type { QuestionPresentedEvent } from '$lib/runtime/core/QuestionnaireRuntime';

function makeEvent(overrides: Partial<QuestionPresentedEvent>): QuestionPresentedEvent {
	return {
		questionId: 'q1',
		questionType: 'text',
		pageIndex: 0,
		itemIndex: 0,
		category: 'form',
		timestamp: 0,
		...overrides,
	} as QuestionPresentedEvent;
}

const list: AnnounceableQuestion[] = [
	{ id: 'a', title: 'First' },
	{ id: 'b', title: 'Second question' },
	{ id: 'c', text: 'Third text only' },
	{ id: 'd', title: 'Fourth' },
	{ id: 'e', title: 'Fifth' },
];

describe('buildQuestionAnnouncement', () => {
	it('formats "Question N of M: <title>" for an in-list id', () => {
		const event = makeEvent({ questionId: 'b' });
		expect(buildQuestionAnnouncement(event, list)).toBe('Question 2 of 5: Second question');
	});

	it('falls back to text when title is absent', () => {
		const event = makeEvent({ questionId: 'c' });
		expect(buildQuestionAnnouncement(event, list)).toBe('Question 3 of 5: Third text only');
	});

	it('returns the title-only fallback when the id is not in the list', () => {
		const event = makeEvent({ questionId: 'missing', questionType: 'reaction-time' });
		expect(buildQuestionAnnouncement(event, list)).toBe('reaction-time');
	});
});
