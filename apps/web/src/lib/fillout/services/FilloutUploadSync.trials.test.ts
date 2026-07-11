import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';
import type { RuntimeTrialEvent } from '$lib/runtime/core/question-runtime';

// Mock the api module before importing FilloutUploadSync (vitest hoists vi.mock).
vi.mock('$lib/services/api', () => ({
	api: {
		sessions: {
			get: vi.fn(),
			create: vi.fn(),
			sync: vi.fn(),
		},
	},
}));

const { FilloutUploadSync } = await import('./FilloutUploadSync');
const { OfflineSessionService } = await import('./OfflineSessionService');
const { OfflineTrialPersistence } = await import('./OfflineTrialPersistence');
const { SyncLedger, DEAD_LETTER_ATTEMPTS } = await import('./integrity/SyncLedger');
const { api } = await import('$lib/services/api');

const apiMock = api as unknown as {
	sessions: {
		get: ReturnType<typeof vi.fn>;
		create: ReturnType<typeof vi.fn>;
		sync: ReturnType<typeof vi.fn>;
	};
};

function makeEvent(overrides: Partial<RuntimeTrialEvent> = {}): RuntimeTrialEvent {
	return {
		questionId: 'q-rt',
		trialIndex: 1,
		paradigm: 'flanker',
		optionId: 'left',
		source: 'keyboard',
		rtUs: 380_000,
		correct: true,
		sampledTimings: { phases: [] },
		provenance: {},
		invalidated: null,
		...overrides,
	};
}

beforeEach(async () => {
	await db.filloutSessions.clear();
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
	await db.filloutTrials.clear();
	await db.filloutSyncLedger.clear();
	// #34: the drain also unions in sessions with pending binary rows, so clear
	// filloutBinaries too or a stray binary from a binary test file leaks a session in.
	await db.filloutBinaries.clear();
	apiMock.sessions.get.mockReset();
	apiMock.sessions.create.mockReset();
	apiMock.sessions.sync.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function setOnline(value: boolean) {
	vi.stubGlobal('navigator', { ...navigator, onLine: value });
}

async function pump(engine: InstanceType<typeof FilloutUploadSync>, passes: number) {
	for (let i = 0; i < passes; i++) {
		await engine.syncNow();
	}
}

describe('FilloutUploadSync — per-trial rows (RT-1b)', () => {
	it('ships unsynced trials in the payload and marks them synced on ack', async () => {
		setOnline(true);
		const session = await OfflineSessionService.createSession('q-rt', 1, 0, 0);
		await OfflineTrialPersistence.persistTrialEvent(session.id, makeEvent({ trialIndex: 1 }));
		await OfflineTrialPersistence.persistTrialEvent(session.id, makeEvent({ trialIndex: 2 }));
		const stored = await db.filloutTrials.toArray();
		const clientIds = stored.map((t) => t.clientId);

		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 0,
			events_synced: 0,
			variables_synced: 0,
			trials_synced: 2,
			accepted_client_ids: clientIds,
		});

		const engine = new FilloutUploadSync();
		const result = await engine.syncNow();

		// The payload carried both trial rows in snake_case wire shape.
		const [, payload] = apiMock.sessions.sync.mock.calls[0]!;
		expect(payload.trials).toHaveLength(2);
		expect(payload.trials[0]).toMatchObject({
			question_id: 'q-rt',
			trial_index: expect.any(Number),
			option_id: 'left',
			rt_us: 380_000,
			correct: true,
		});
		expect(payload.trials.map((t: { client_id: string }) => t.client_id).sort()).toEqual(
			[...clientIds].sort()
		);

		expect(result.trialsSynced).toBe(2);

		// Acked → rows flip synced=1 and the ledger records them acked.
		const after = await db.filloutTrials.toArray();
		expect(after.every((t) => t.synced === 1)).toBe(true);
		expect((await SyncLedger.stats()).acked).toBe(2);
		expect(await OfflineTrialPersistence.getUnsyncedTrials(session.id)).toHaveLength(0);
	});

	it('a permanently-rejected trial dead-letters (not retried forever)', async () => {
		setOnline(true);
		const session = await OfflineSessionService.createSession('q-rt', 1, 0, 0);
		await OfflineTrialPersistence.persistTrialEvent(session.id, makeEvent());

		// Server never acks the trial: it keeps rejecting (a 500-style hard error).
		apiMock.sessions.sync.mockRejectedValue(new Error('Questionnaire not found'));

		expect(await SyncLedger.stats()).toMatchObject({ pending: 1, deadletter: 0 });

		const engine = new FilloutUploadSync();
		await pump(engine, DEAD_LETTER_ATTEMPTS);
		engine.stop();

		const stats = await SyncLedger.stats();
		expect(stats.pending).toBe(0);
		expect(stats.deadletter).toBe(1);

		// The trial survives on disk (synced=0) for the export escape hatch.
		const rows = await db.filloutTrials.toArray();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.synced).toBe(0);

		// Dropped from the sync set: a further drain issues no api call.
		const callsBefore = apiMock.sessions.sync.mock.calls.length;
		await engine.syncNow();
		expect(apiMock.sessions.sync.mock.calls.length).toBe(callsBefore);
	});
});
