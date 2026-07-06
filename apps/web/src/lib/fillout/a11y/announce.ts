import type { QuestionPresentedEvent } from '$lib/runtime/core/QuestionnaireRuntime';

/**
 * Minimal shape of a question item as it appears in the fillout `questionList`.
 * Kept structural (not the full `Question` union) so this helper stays a pure,
 * dependency-light string builder that is trivially unit-testable.
 */
export interface AnnounceableQuestion {
	id: string;
	title?: string;
	text?: string;
}

/**
 * Build the screen-reader announcement for a newly presented item.
 *
 * When the presented item is found in `questionList`, emits
 * `"Question N of M: <title>"` (1-based N). When it is not — e.g. WebGL reaction
 * stimuli that never reach the DOM overlay, or items excluded from the visible
 * list — falls back to the item title (then text, then question type) alone, with
 * no positional prefix.
 */
export function buildQuestionAnnouncement(
	event: QuestionPresentedEvent,
	questionList: AnnounceableQuestion[]
): string {
	const idx = questionList.findIndex((q) => q.id === event.questionId);
	const n = idx >= 0 ? idx + 1 : null;
	const m = questionList.length;
	const title = questionList[idx]?.title ?? questionList[idx]?.text ?? event.questionType;
	return n ? `Question ${n} of ${m}: ${title}` : title;
}
