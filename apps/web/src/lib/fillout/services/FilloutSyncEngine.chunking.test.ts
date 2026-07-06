import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type FilloutResponse } from '$lib/services/db/indexeddb';

// Mock the api module before importing FilloutUploadSync (hoisted-mock pattern).
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
const { api } = await import('$lib/services/api');

const apiMock = api as unknown as {
	sessions: {
		get: ReturnType<typeof vi.fn>;
		create: ReturnType<typeof vi.fn>;
		sync: ReturnType<typeof vi.fn>;
	};
};

interface MockSyncPayload {
	responses: { client_id: string }[];
	events: { client_id: string }[];
	variables: unknown[];
	status?: string;
	session?: unknown;
}

beforeEach(async () => {
	await db.filloutSessions.clear();
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
	apiMock.sessions.sync.mockReset();
	vi.stubGlobal('navigator', { ...navigator, onLine: true });
});

describe('FilloutUploadSync — large-payload chunking (E-OFF-4)', () => {
	it('splits 500 queued responses into 3 chunked sync calls; SyncResult totals equal the sum', async () => {
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);

		// Bulk-insert 500 unsynced responses directly (avoids 500 encrypt round-trips;
		// plaintext values round-trip through the decrypt passthrough on read).
		const records: FilloutResponse[] = Array.from({ length: 500 }, (_, i) => ({
			sessionId: session.id,
			clientId: crypto.randomUUID(),
			questionId: `q-${i}`,
			value: i,
			synced: 0,
		}));
		await db.filloutResponses.bulkAdd(records);

		// Server echoes exactly the client_ids it received in each chunk.
		apiMock.sessions.sync.mockImplementation(async (_id: string, payload: MockSyncPayload) => ({
			responses_synced: payload.responses.length,
			events_synced: payload.events.length,
			variables_synced: payload.variables.length,
			accepted_client_ids: payload.responses.map((r) => r.client_id),
			accepted_variable_names: [] as string[],
		}));

		const engine = new FilloutUploadSync();
		const result = await engine.syncNow();

		// 500 / 200 = ceil → 3 chunked HTTP calls.
		expect(apiMock.sessions.sync).toHaveBeenCalledTimes(3);
		expect(result.chunks).toBe(3);

		// Chunk sizes: 200, 200, 100 — and only the first carries session-init.
		const calls = apiMock.sessions.sync.mock.calls as [string, MockSyncPayload][];
		expect(calls.map(([, p]) => p.responses.length)).toEqual([200, 200, 100]);
		expect(calls[0]![1].session).toBeDefined();
		expect(calls[1]![1].session).toBeUndefined();
		expect(calls[2]![1].session).toBeUndefined();

		// Aggregate totals equal the sum across chunks; nothing rejected.
		expect(result.responsesSynced).toBe(500);
		expect(result.accepted).toBe(500);
		expect(result.rejected).toBe(0);
		expect(result.errors).toEqual([]);

		// Every row landed synced; IndexedDB drained to zero unsynced.
		expect(await db.filloutResponses.where('synced').equals(0).count()).toBe(0);

		// No client_id was transmitted twice across the chunked calls.
		const allSent = calls.flatMap(([, p]) => p.responses.map((r) => r.client_id));
		expect(allSent).toHaveLength(500);
		expect(new Set(allSent).size).toBe(500);
	});
});
