import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';

// Mock the api module before importing FilloutUploadSync so the engine's captured
// reference points at our mock (same hoisted-mock pattern as the sibling suites).
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
	apiMock.sessions.get.mockReset();
	apiMock.sessions.create.mockReset();
	apiMock.sessions.sync.mockReset();
	vi.stubGlobal('navigator', { ...navigator, onLine: true });
});

describe('FilloutUploadSync — ack-driven marking (E-OFF-4)', () => {
	it('flips ONLY server-accepted client_ids to synced; the rest stay queued and retry next pass', async () => {
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);
		for (const v of [1, 2, 3]) {
			await OfflineResponsePersistence.saveResponse(session.id, { questionId: `q-${v}`, value: v });
		}
		const stored = await db.filloutResponses.where('sessionId').equals(session.id).sortBy('id');
		expect(stored).toHaveLength(3);
		const acceptedSubset = [stored[0]!.clientId, stored[1]!.clientId]; // accept 2 of 3

		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 2,
			events_synced: 0,
			variables_synced: 0,
			accepted_client_ids: acceptedSubset,
			accepted_variable_names: [],
		});

		const engine = new FilloutUploadSync();
		const result = await engine.syncNow();

		// The two accepted rows are marked synced; the unacked third stays queued.
		const after = await db.filloutResponses.where('sessionId').equals(session.id).sortBy('id');
		expect(after[0]!.synced).toBe(1);
		expect(after[1]!.synced).toBe(1);
		expect(after[2]!.synced).toBe(0);
		expect(await db.filloutResponses.where('synced').equals(0).count()).toBe(1);

		// Structured result surfaces the partial outcome and flags a retry.
		expect(result.accepted).toBe(2);
		expect(result.rejected).toBe(1);
		expect(result.retriable).toBe(true);

		// A partial drain must NOT flip the session-synced flag (so it is revisited).
		const row = await OfflineSessionService.getSession(session.id);
		expect(row?.synced).toBe(0);
	});

	it('marks only the server-accepted variable names, leaving the rest queued', async () => {
		const session = await OfflineSessionService.createSession('q-2', 1, 0, 0);
		await OfflineResponsePersistence.saveVariable(session.id, 'mean_rt', 404.85);
		await OfflineResponsePersistence.saveVariable(session.id, 'accuracy', 1);

		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 0,
			events_synced: 0,
			variables_synced: 2,
			accepted_client_ids: [],
			accepted_variable_names: ['mean_rt'], // only one durably upserted
		});

		const engine = new FilloutUploadSync();
		await engine.syncNow();

		expect((await db.filloutVariables.get([session.id, 'mean_rt']))?.synced).toBe(1);
		expect((await db.filloutVariables.get([session.id, 'accuracy']))?.synced).toBe(0);
	});

	it('legacy fallback: a server that omits accepted_* marks everything sent synced', async () => {
		const session = await OfflineSessionService.createSession('q-3', 1, 0, 0);
		await OfflineResponsePersistence.saveResponse(session.id, { questionId: 'q-1', value: 7 });
		await OfflineResponsePersistence.saveVariable(session.id, 'score', 5);

		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 1,
			events_synced: 0,
			variables_synced: 1,
			// No accepted_client_ids / accepted_variable_names — older server.
		});

		const engine = new FilloutUploadSync();
		const result = await engine.syncNow();

		expect(await db.filloutResponses.where('synced').equals(0).count()).toBe(0);
		expect(await db.filloutVariables.where('synced').equals(0).count()).toBe(0);
		expect(result.rejected).toBe(0);
		expect(result.retriable).toBe(false);
	});

	it('markVariablesSynced concurrency token: a value re-saved mid-flight is not falsely acked', async () => {
		const sessionId = 's-conc';
		await OfflineResponsePersistence.saveVariable(sessionId, 'x', 1);
		const sent = await db.filloutVariables.get([sessionId, 'x']);
		const sentClientId = sent!.clientId!;

		// Simulate a re-write during the sync round-trip → new value + new clientId.
		await OfflineResponsePersistence.saveVariable(sessionId, 'x', 2);
		const afterRewrite = await db.filloutVariables.get([sessionId, 'x']);
		expect(afterRewrite!.clientId).not.toBe(sentClientId);

		// Ack the STALE clientId → the row (now carrying the newer clientId) is skipped.
		await OfflineResponsePersistence.markVariablesSynced(sessionId, [
			{ name: 'x', clientId: sentClientId },
		]);
		expect((await db.filloutVariables.get([sessionId, 'x']))?.synced).toBe(0);

		// Ack the CURRENT clientId → now it flips.
		await OfflineResponsePersistence.markVariablesSynced(sessionId, [
			{ name: 'x', clientId: afterRewrite!.clientId },
		]);
		expect((await db.filloutVariables.get([sessionId, 'x']))?.synced).toBe(1);
	});
});
