import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';

// Mock the api module before importing FilloutUploadSync so the engine's captured
// reference points at our mock (vitest hoists vi.mock above module evaluation).
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
const { OfflineResponsePersistence } = await import('./OfflineResponsePersistence');
const { SyncLedger, DEAD_LETTER_ATTEMPTS } = await import('./integrity/SyncLedger');
const { api } = await import('$lib/services/api');

const apiMock = api as unknown as {
	sessions: {
		get: ReturnType<typeof vi.fn>;
		create: ReturnType<typeof vi.fn>;
		sync: ReturnType<typeof vi.fn>;
	};
};

beforeEach(async () => {
	await db.filloutSessions.clear();
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
	await db.filloutSyncLedger.clear();
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

/**
 * Drive N sequential drains, awaiting each so the ledger's attempt counter advances
 * deterministically (the engine's own backoff timer is irrelevant here — we pump it
 * by hand and stop it at the end).
 */
async function pump(engine: InstanceType<typeof FilloutUploadSync>, passes: number) {
	for (let i = 0; i < passes; i++) {
		await engine.syncNow();
	}
}

describe('FilloutUploadSync — permanently-rejected session does not retry forever', () => {
	it('escalates records to dead-letter and drops the session from the sync set (banner drains)', async () => {
		setOnline(true);
		// An offline-created session whose questionnaire is later deleted server-side:
		// the sync POST carries session-init, which the server 404s ("Questionnaire not
		// found"). callSdk rethrows it as a plain Error, so api.sessions.sync rejects.
		const session = await OfflineSessionService.createSession('q-deleted', 1, 0, 0);
		await OfflineResponsePersistence.saveResponse(session.id, { questionId: 'q1', value: 7 });

		apiMock.sessions.sync.mockRejectedValue(new Error('Questionnaire not found'));

		// Before any sync: exactly one pending ledger row (the banner's count).
		expect(await SyncLedger.stats()).toMatchObject({ pending: 1, acked: 0, deadletter: 0 });

		const engine = new FilloutUploadSync();
		// DEAD_LETTER_ATTEMPTS drains burn one attempt each until the record escalates.
		await pump(engine, DEAD_LETTER_ATTEMPTS);
		engine.stop();

		// The record is now dead-lettered — it LEFT `pending`, so the "N unsaved answers"
		// banner (pending count) drains to zero instead of growing forever.
		const stats = await SyncLedger.stats();
		expect(stats.pending).toBe(0);
		expect(stats.deadletter).toBe(1);

		// The record is NOT discarded — it survives on disk (synced=0) for the export
		// escape hatch and the participant-facing dead-letter surface.
		const rows = await db.filloutResponses.toArray();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.synced).toBe(0);

		// The session dropped out of the sync set: a further drain issues NO api call,
		// so the retry loop settles instead of 404ing every backoff tick forever.
		const callsAfterEscalation = apiMock.sessions.sync.mock.calls.length;
		await engine.syncNow();
		expect(apiMock.sessions.sync.mock.calls.length).toBe(callsAfterEscalation);
	});

	it('a transient failure that recovers still syncs (not escalated before the threshold)', async () => {
		setOnline(true);
		const session = await OfflineSessionService.createSession('q-live', 1, 0, 0);
		await OfflineResponsePersistence.saveResponse(session.id, { questionId: 'q1', value: 3 });

		// Fail once (transient), then succeed.
		apiMock.sessions.sync
			.mockRejectedValueOnce(new Error('503 Service Unavailable'))
			.mockResolvedValue({ responses_synced: 1, events_synced: 0, variables_synced: 0 });

		const engine = new FilloutUploadSync();
		await engine.syncNow(); // fails, attempts -> 1 (still pending, not dead)
		expect(await SyncLedger.stats()).toMatchObject({ pending: 1, deadletter: 0 });

		await engine.syncNow(); // succeeds
		engine.stop();

		const stats = await SyncLedger.stats();
		expect(stats.pending).toBe(0);
		expect(stats.acked).toBe(1);
		expect(stats.deadletter).toBe(0);

		// The session synced cleanly and no longer appears as unsynced.
		const unsynced = await OfflineSessionService.getUnsyncedSessions();
		expect(unsynced.find((s) => s.id === session.id)).toBeUndefined();
	});
});

describe('OfflineResponsePersistence excludes dead-lettered records from the sync stream', () => {
	it('getUnsyncedResponses skips a clientId in dead-letter state', async () => {
		const sessionId = crypto.randomUUID();
		await OfflineResponsePersistence.saveResponse(sessionId, { questionId: 'q1', value: 1 });
		await OfflineResponsePersistence.saveResponse(sessionId, { questionId: 'q2', value: 2 });

		const [a, b] = await db.filloutResponses.toArray();
		// Force one record into dead-letter.
		for (let i = 0; i < DEAD_LETTER_ATTEMPTS; i++) {
			await SyncLedger.markAttempt([a!.clientId], 'boom');
		}
		expect((await SyncLedger.stats()).deadletter).toBe(1);

		const unsynced = await OfflineResponsePersistence.getUnsyncedResponses(sessionId);
		const ids = unsynced.map((r) => r.clientId);
		expect(ids).toContain(b!.clientId);
		expect(ids).not.toContain(a!.clientId);
	});
});
