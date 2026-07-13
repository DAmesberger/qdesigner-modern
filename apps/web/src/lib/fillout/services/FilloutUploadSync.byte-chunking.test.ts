import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type FilloutResponse } from '$lib/services/db/indexeddb';

/**
 * Byte-budgeted chunking (latent data-loss class).
 *
 * `SYNC_CHUNK_SIZE = 200` rows is not a bound on the BODY: a reaction-time row carries a
 * `timing_provenance` blob (phaseTimeline + frameStats), so 200 of them can be megabytes.
 * The server accepts 26 MiB; a long high-refresh-rate run could exceed even that, and the
 * client would then retry the identical oversized payload forever until the session
 * dead-letters — the data never reaching the server.
 *
 * Chunks are therefore bounded by BOTH the row cap and a serialized-byte budget, whichever
 * binds first, and a single row that alone exceeds the budget is sent ALONE (never dropped).
 */

vi.mock('$lib/services/api', () => ({
	api: {
		sessions: {
			get: vi.fn(),
			create: vi.fn(),
			sync: vi.fn(),
			uploadMedia: vi.fn(),
		},
	},
}));

const { FilloutUploadSync, SYNC_CHUNK_MAX_BYTES } = await import('./FilloutUploadSync');
const { OfflineSessionService } = await import('./OfflineSessionService');
const { api } = await import('$lib/services/api');

const apiMock = api as unknown as {
	sessions: {
		get: ReturnType<typeof vi.fn>;
		create: ReturnType<typeof vi.fn>;
		sync: ReturnType<typeof vi.fn>;
		uploadMedia: ReturnType<typeof vi.fn>;
	};
};

interface MockSyncPayload {
	responses: { client_id: string }[];
	events: { client_id: string }[];
	trials?: { client_id: string }[];
	variables: unknown[];
}

const encoder = new TextEncoder();
const bodyBytes = (payload: MockSyncPayload) => encoder.encode(JSON.stringify(payload)).length;

/**
 * A response row whose `timingProvenance` serializes to ~`kib` KiB — what a real
 * reaction-time row looks like once its phaseTimeline + frameStats are attached.
 * An ASCII string of N chars is exactly N + 2 bytes of JSON, so sizes are exact.
 */
function provenanceRow(sessionId: string, i: number, kib: number): FilloutResponse {
	return {
		sessionId,
		clientId: crypto.randomUUID(),
		questionId: `q-${i}`,
		value: i,
		synced: 0,
		// Widened stored field (StoredFilloutResponse) — buildResponseItem ships it.
		timingProvenance: { frameStats: 'x'.repeat(kib * 1024) },
	} as unknown as FilloutResponse;
}

function smallRow(sessionId: string, i: number): FilloutResponse {
	return {
		sessionId,
		clientId: crypto.randomUUID(),
		questionId: `q-${i}`,
		value: i,
		synced: 0,
	};
}

beforeEach(async () => {
	await db.filloutSessions.clear();
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
	await db.filloutTrials.clear();
	await db.filloutBinaries.clear();
	await db.filloutSyncLedger.clear();
	apiMock.sessions.sync.mockReset();
	apiMock.sessions.sync.mockImplementation(async (_id: string, payload: MockSyncPayload) => ({
		responses_synced: payload.responses.length,
		events_synced: payload.events.length,
		variables_synced: payload.variables.length,
		accepted_client_ids: payload.responses.map((r) => r.client_id),
		accepted_variable_names: [] as string[],
	}));
	vi.stubGlobal('navigator', { ...navigator, onLine: true });
});

describe('FilloutUploadSync — byte-budgeted sync chunking', () => {
	it('splits provenance-heavy rows so no chunk body exceeds the byte budget', async () => {
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);

		// 30 rows × ~1 MiB of provenance ≈ 30 MiB — one row-capped chunk (200 rows) would
		// blow straight past the server's 26 MiB limit and never land.
		const rows = Array.from({ length: 30 }, (_, i) => provenanceRow(session.id, i, 1024));
		await db.filloutResponses.bulkAdd(rows);

		const engine = new FilloutUploadSync();
		const result = await engine.syncNow();

		const calls = apiMock.sessions.sync.mock.calls as [string, MockSyncPayload][];

		// The byte budget bound before the row cap: more than one chunk, none of them
		// anywhere near 200 rows.
		expect(calls.length).toBeGreaterThan(1);
		for (const [, payload] of calls) {
			expect(bodyBytes(payload)).toBeLessThanOrEqual(SYNC_CHUNK_MAX_BYTES);
		}

		// Nothing was dropped and nothing was sent twice.
		const sent = calls.flatMap(([, p]) => p.responses.map((r) => r.client_id));
		expect(sent).toHaveLength(30);
		expect(new Set(sent).size).toBe(30);
		expect(result.rejected).toBe(0);
		expect(await db.filloutResponses.where('synced').equals(0).count()).toBe(0);

		engine.stop();
	});

	it('still applies the 200-row cap to small rows (the byte budget never binds)', async () => {
		const session = await OfflineSessionService.createSession('q-2', 1, 0, 0);
		await db.filloutResponses.bulkAdd(Array.from({ length: 250 }, (_, i) => smallRow(session.id, i)));

		const engine = new FilloutUploadSync();
		await engine.syncNow();

		const calls = apiMock.sessions.sync.mock.calls as [string, MockSyncPayload][];
		expect(calls.map(([, p]) => p.responses.length)).toEqual([200, 50]);
		for (const [, payload] of calls) {
			expect(bodyBytes(payload)).toBeLessThanOrEqual(SYNC_CHUNK_MAX_BYTES);
		}

		engine.stop();
	});

	it('sends a single row that alone exceeds the budget ALONE, never silently dropping it', async () => {
		const session = await OfflineSessionService.createSession('q-3', 1, 0, 0);

		// One monster row (~10 MiB provenance) larger than the 8 MiB packing budget but
		// still under the server's 26 MiB limit, plus ordinary neighbours.
		const monster = provenanceRow(session.id, 0, 10 * 1024);
		const neighbours = Array.from({ length: 3 }, (_, i) => smallRow(session.id, i + 1));
		await db.filloutResponses.bulkAdd([monster, ...neighbours]);

		const engine = new FilloutUploadSync();
		const result = await engine.syncNow();

		const calls = apiMock.sessions.sync.mock.calls as [string, MockSyncPayload][];
		const monsterCall = calls.find(([, p]) =>
			p.responses.some((r) => r.client_id === monster.clientId)
		);
		expect(monsterCall).toBeDefined();
		// It rode alone — not wedged behind rows it could never fit with, not dropped.
		expect(monsterCall![1].responses).toHaveLength(1);

		const sent = calls.flatMap(([, p]) => p.responses.map((r) => r.client_id));
		expect(new Set(sent).size).toBe(4);
		expect(result.rejected).toBe(0);
		expect(await db.filloutResponses.where('synced').equals(0).count()).toBe(0);

		engine.stop();
	});
});
