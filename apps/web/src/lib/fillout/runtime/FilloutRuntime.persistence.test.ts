import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import { QuestionnaireRuntime } from '$lib/runtime/core/QuestionnaireRuntime';
import type { FormHostPresentation, FormQuestionHost } from '$lib/runtime/core/FormQuestionHost';
import type { Questionnaire } from '$lib/shared';

/**
 * A failed DURABLE WRITE of a participant answer is unrecoverable data loss — you
 * cannot re-run a participant. `OfflineResponsePersistence.saveResponse` throws on a
 * quota / write-verify failure precisely so the runtime can react; the pre-fix code
 * caught it in two places and only logged, so the answer vanished with ZERO UI signal
 * (no ledger row ⇒ the pending counter and the sync panel kept saying "all saved") and
 * the participant advanced to the next question.
 *
 * Contract now (ADR 0029 parity — block loudly at capture):
 *   halt the run · escalate on the SyncLedger · notify the host · offer a retry ·
 *   never record the lost answer as though it were stored.
 */

vi.mock('$lib/services/api', () => ({
	api: {
		sessions: {
			get: vi.fn(),
			create: vi.fn(),
			sync: vi.fn(),
			update: vi.fn(),
			start: vi.fn(),
			submitEvents: vi.fn(),
		},
	},
}));

const { FilloutRuntime } = await import('./FilloutRuntime');
const { OfflineResponsePersistence } = await import('../services/OfflineResponsePersistence');
const { OfflineSessionService } = await import('../services/OfflineSessionService');
const { SyncLedger } = await import('../services/integrity/SyncLedger');
type PersistenceFailure = import('./FilloutRuntime').PersistenceFailure;

const SESSION = '11111111-2222-3333-4444-555555555555';

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
		id: 'qn-persist-1',
		name: 'Persistence failure fixture',
		version: '1.0.0',
		versionMajor: 1,
		versionMinor: 0,
		versionPatch: 0,
		created: new Date(),
		modified: new Date(),
		variables: [],
		questions: [mkQuestion('q1', 1), mkQuestion('q2', 2)],
		pages: [{ id: 'p1', name: 'Page 1', questions: ['q1', 'q2'] }],
		flow: [],
		settings: {},
	} as unknown as Questionnaire;
}

/** Let the (microtask + timer) persistence chain settle. */
async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

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

beforeEach(async () => {
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
	await db.filloutSessions.clear();
	await db.filloutTrials.clear();
	await db.filloutBinaries.clear();
	await db.filloutSyncLedger.clear();
	// Offline: no server round-trips, and the durable IndexedDB path is the only one
	// there is (D2), so the run behaves identically either way.
	vi.stubGlobal('navigator', { ...navigator, onLine: false });
	// The shared test setup installs a monotonic performance.now() mock; afterEach's
	// restoreAllMocks() strips its implementation, so re-arm a deterministic clock here
	// (the runtime does arithmetic on it — an undefined now() would poison every timing
	// variable with NaN).
	let clock = 1000;
	vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1));
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function harness() {
	const presented: FormHostPresentation[] = [];
	const host: FormQuestionHost = {
		present: (presentation) => presented.push(presentation),
		clear: () => {},
	};
	const failures: PersistenceFailure[] = [];

	const runtime = new FilloutRuntime({
		canvas: document.createElement('canvas'),
		questionnaire: buildQuestionnaire(),
		sessionId: SESSION,
		formHost: host,
		syncInterval: 1_000_000,
		onPersistenceFailure: (failure) => failures.push(failure),
	});

	return { runtime, presented, failures };
}

describe('a lost answer halts the run instead of vanishing', () => {
	it('surfaces the failure, halts, ledgers it, and records nothing as if it were stored', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const pause = vi.spyOn(QuestionnaireRuntime.prototype, 'pause');
		const cursor = vi.spyOn(OfflineSessionService, 'updateProgress');

		const { runtime, presented, failures } = harness();
		await runtime.start();
		expect(presented).toHaveLength(1);
		cursor.mockClear();

		// The device's storage is full: the durable write of the answer fails.
		vi.spyOn(OfflineResponsePersistence, 'saveResponse').mockRejectedValue(
			new Error('QuotaExceededError: the disk is full')
		);

		presented[0]!.onSubmit('a');
		await settle();

		// 1. The host is told — loudly and with the real cause (this is what a blocking
		//    integrity dialog renders). Pre-fix: nothing fired at all.
		expect(failures).toHaveLength(1);
		expect(failures[0]!.questionId).toBe('q1');
		expect(failures[0]!.unstoredCount).toBe(1);
		expect(failures[0]!.message).toContain('QuotaExceededError');
		expect(runtime.hasUnstoredResponses).toBe(true);

		// 2. The run is HALTED — the participant cannot answer on past the lost answer
		//    (pause() freezes the collector AND gates showCurrentItem()).
		expect(pause).toHaveBeenCalled();

		// 3. The sync state tells the truth: a dead-letter row for this session is what
		//    flips the connectivity panel to its destructive "N answers could not be
		//    submitted" state and the completion screen's syncFailedCount. Pre-fix the
		//    ledger had NO row for the lost answer, so the UI reported "all saved".
		const stats = await SyncLedger.statsForSessions(new Set([SESSION]));
		expect(stats.deadletter).toBe(1);
		const [dead] = await SyncLedger.deadletters();
		expect(dead!.kind).toBe('response');
		expect(dead!.lastError).toContain('q1');

		// 4. Nothing downstream treats the answer as stored:
		//    - no response row (the write failed);
		expect(await db.filloutResponses.count()).toBe(0);
		//    - no 'response_submitted' interaction event;
		const events = await db.filloutEvents.toArray();
		expect(events.filter((e) => e.eventType === 'response_submitted')).toHaveLength(0);
		//    - and crucially NO resume cursor: `answeredQuestionIds` would have listed q1,
		//      so a reload would have SKIPPED the question whose answer was just lost.
		expect(cursor).not.toHaveBeenCalled();

		runtime.dispose();
	});

	it('retryFailedPersistence() re-writes the exact answer and resumes the run', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const resume = vi.spyOn(QuestionnaireRuntime.prototype, 'resume');

		const { runtime, presented, failures } = harness();
		await runtime.start();

		const failing = vi
			.spyOn(OfflineResponsePersistence, 'saveResponse')
			.mockRejectedValue(new Error('QuotaExceededError'));

		presented[0]!.onSubmit('a');
		await settle();
		expect(failures).toHaveLength(1);
		expect(await db.filloutResponses.count()).toBe(0);

		// Storage frees up; the participant (or the host's retry affordance) tries again.
		failing.mockRestore();
		await expect(runtime.retryFailedPersistence()).resolves.toBe(true);

		// The answer is durable now — exactly once, with its own clientId.
		const rows = await db.filloutResponses.toArray();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.questionId).toBe('q1');
		expect(rows[0]!.synced).toBe(0);

		// The escalation is withdrawn (the loss was recovered) and the run un-freezes.
		const stats = await SyncLedger.statsForSessions(new Set([SESSION]));
		expect(stats.deadletter).toBe(0);
		expect(runtime.hasUnstoredResponses).toBe(false);
		expect(resume).toHaveBeenCalled();

		runtime.dispose();
	});
});

describe('interaction events are written once per interaction', () => {
	it('writes ONE page_navigation row per page change (it was emitted twice)', async () => {
		const { runtime } = harness();
		await runtime.start();
		await settle();

		const nav = (await db.filloutEvents.toArray()).filter(
			(e) => e.eventType === 'page_navigation'
		);
		expect(nav).toHaveLength(1);

		runtime.dispose();
	});

	it('writes ONE response_submitted row per answer', async () => {
		const { runtime, presented } = harness();
		await runtime.start();

		presented[0]!.onSubmit('a');
		await settle();

		const submitted = (await db.filloutEvents.toArray()).filter(
			(e) => e.eventType === 'response_submitted'
		);
		expect(submitted).toHaveLength(1);
		expect(await db.filloutResponses.count()).toBe(1);

		runtime.dispose();
	});
});
