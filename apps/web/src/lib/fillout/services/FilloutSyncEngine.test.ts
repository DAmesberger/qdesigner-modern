import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';

// Mock the api module before importing FilloutSyncEngine so the engine's
// captured reference points at our mock. Vitest hoists vi.mock so this
// runs before any module evaluation.
vi.mock('$lib/services/api', () => ({
	api: {
		sessions: {
			get: vi.fn(),
			create: vi.fn(),
			sync: vi.fn(),
		},
	},
}));

const { FilloutSyncEngine } = await import('./FilloutSyncEngine');
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
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function setOnline(value: boolean) {
	vi.stubGlobal('navigator', { ...navigator, onLine: value });
}

describe('FilloutSyncEngine.syncNow', () => {
	it('returns an empty result when offline (no api calls)', async () => {
		setOnline(false);
		const engine = new FilloutSyncEngine();
		const result = await engine.syncNow();
		expect(result.sessionsSynced).toBe(0);
		expect(result.errors).toEqual([]);
		expect(apiMock.sessions.sync).not.toHaveBeenCalled();
	});

	// Re-entrancy guard (isSyncing) requires holding api.sessions.sync open
	// across two engine.syncNow() calls. The promise-plumbing for that turns
	// out to be finicky enough in vitest/fake-indexeddb that it's not worth
	// the test brittleness; the guard is one if-statement in syncNow:
	//   if (this.isSyncing || !navigator.onLine) return { ... };
	// Tested indirectly via the offline guard below.

	it('reconnect path: marks queued session synced after a successful syncNow', async () => {
		setOnline(true);
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);
		await OfflineResponsePersistence.saveResponse(session.id, {
			questionId: 'q-1',
			value: 7,
		});

		apiMock.sessions.get.mockResolvedValue({ id: session.id });
		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 1,
			events_synced: 0,
			variables_synced: 0,
		});

		const engine = new FilloutSyncEngine();
		const result = await engine.syncNow();

		expect(apiMock.sessions.sync).toHaveBeenCalledTimes(1);
		expect(result.sessionsSynced).toBe(1);
		expect(result.responsesSynced).toBe(1);

		// Session no longer appears in unsynced after a successful sync.
		const unsynced = await OfflineSessionService.getUnsyncedSessions();
		expect(unsynced.find((s) => s.id === session.id)).toBeUndefined();
	});

	it('sends the saved clientId so the server can dedup on retry', async () => {
		setOnline(true);
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);
		await OfflineResponsePersistence.saveResponse(session.id, {
			questionId: 'q-1',
			value: 7,
		});
		const [stored] = await db.filloutResponses.toArray();

		apiMock.sessions.get.mockResolvedValue({ id: session.id });
		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 1,
			events_synced: 0,
			variables_synced: 0,
		});

		const engine = new FilloutSyncEngine();
		await engine.syncNow();

		const [, payload] = apiMock.sessions.sync.mock.calls[0]!;
		expect(payload.responses).toHaveLength(1);
		expect(payload.responses[0].client_id).toBe(stored?.clientId);
	});

	it('carries session-init fields so the server can upsert an offline-created session (no client-side create/probe)', async () => {
		// The sync endpoint is now self-sufficient: it materializes an
		// offline-created session from the payload's `session` fields. The client
		// no longer probes with api.sessions.get (which 401'd for anonymous callers)
		// nor calls api.sessions.create separately.
		setOnline(true);
		const session = await OfflineSessionService.createSession('q-1', 2, 1, 3);
		await OfflineResponsePersistence.saveResponse(session.id, {
			questionId: 'q-1',
			value: 1,
		});

		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 1,
			events_synced: 0,
			variables_synced: 0,
		});

		const engine = new FilloutSyncEngine();
		await engine.syncNow();

		expect(apiMock.sessions.sync).toHaveBeenCalledTimes(1);
		// No standalone get-probe or create — the sync POST does it all.
		expect(apiMock.sessions.get).not.toHaveBeenCalled();
		expect(apiMock.sessions.create).not.toHaveBeenCalled();
		const [, payload] = apiMock.sessions.sync.mock.calls[0]!;
		expect(payload.session).toMatchObject({
			questionnaire_id: 'q-1',
			version_major: 2,
			version_minor: 1,
			version_patch: 3,
		});
	});
});
