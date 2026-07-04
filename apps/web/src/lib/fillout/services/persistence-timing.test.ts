import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';

// Mock the api module before importing FilloutSyncEngine so the engine's
// captured reference points at our mock. Vitest hoists vi.mock so this runs
// before any module evaluation (same pattern as FilloutSyncEngine.test.ts).
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

// A representative C-PROVENANCE object (see the SHARED CONTRACTS block).
const PROVENANCE = {
	onsetMethod: 'rvfc',
	responseMethod: 'event.timeStamp',
	displayLatencyMs: 8.3,
	rawRtMs: 421.5,
	anticipatory: false,
	frameStats: { fps: 60, droppedFrames: 1, jitter: 0.42 },
};

const PRESENTED_AT = '2026-07-04T00:00:00.000Z';
const ANSWERED_AT = '2026-07-04T00:00:00.421Z';

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

describe('timing provenance round-trip', () => {
	it('OfflineResponsePersistence stores reactionTimeUs, presentedAt, answeredAt and timingProvenance on the record', async () => {
		await OfflineResponsePersistence.saveResponse('s-1', {
			questionId: 'q-1',
			value: { choice: 'left' },
			reactionTimeUs: 421_500,
			presentedAt: PRESENTED_AT,
			answeredAt: ANSWERED_AT,
			timingProvenance: PROVENANCE,
		});

		const [record] = await db.filloutResponses.toArray();
		expect(record?.reactionTimeUs).toBe(421_500);
		expect(record?.presentedAt).toBe(PRESENTED_AT);
		expect(record?.answeredAt).toBe(ANSWERED_AT);
		// timingProvenance is a widened field (not on the base FilloutResponse type).
		expect((record as { timingProvenance?: unknown })?.timingProvenance).toEqual(PROVENANCE);
	});

	it('FilloutSyncEngine builds a snake_case payload carrying reaction_time_us, presented_at, answered_at and timing_provenance', async () => {
		setOnline(true);
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);
		await OfflineResponsePersistence.saveResponse(session.id, {
			questionId: 'q-1',
			value: 7,
			reactionTimeUs: 421_500,
			presentedAt: PRESENTED_AT,
			answeredAt: ANSWERED_AT,
			timingProvenance: PROVENANCE,
		});

		apiMock.sessions.get.mockResolvedValue({ id: session.id });
		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 1,
			events_synced: 0,
			variables_synced: 0,
		});

		const engine = new FilloutSyncEngine();
		await engine.syncNow();

		expect(apiMock.sessions.sync).toHaveBeenCalledTimes(1);
		const [, payload] = apiMock.sessions.sync.mock.calls[0]!;
		expect(payload.responses).toHaveLength(1);
		const [item] = payload.responses;
		expect(item.reaction_time_us).toBe(421_500);
		expect(item.presented_at).toBe(PRESENTED_AT);
		expect(item.answered_at).toBe(ANSWERED_AT);
		expect(item.timing_provenance).toEqual(PROVENANCE);
	});

	it('syncs an online-created session that has NO filloutSessions row (golden path — responses must not be stranded)', async () => {
		setOnline(true);

		// Online sessions live only on the server: a response is queued
		// offline-first under a sessionId that was never written to
		// filloutSessions. The sync engine must still drain it.
		const onlineSessionId = 'server-only-session-1';
		await OfflineResponsePersistence.saveResponse(onlineSessionId, {
			questionId: 'q-9',
			value: 3,
			reactionTimeUs: 250_000,
			timingProvenance: PROVENANCE,
		});

		expect(await db.filloutSessions.get(onlineSessionId)).toBeUndefined();

		apiMock.sessions.get.mockResolvedValue({ id: onlineSessionId });
		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 1,
			events_synced: 0,
			variables_synced: 0,
		});

		const engine = new FilloutSyncEngine();
		await engine.syncNow();

		expect(apiMock.sessions.sync).toHaveBeenCalledTimes(1);
		const [syncedId, payload] = apiMock.sessions.sync.mock.calls[0]!;
		expect(syncedId).toBe(onlineSessionId);
		expect(payload.responses).toHaveLength(1);
		expect(payload.responses[0].timing_provenance).toEqual(PROVENANCE);
		// The queued response is marked synced so it is not re-sent.
		const [record] = await db.filloutResponses.toArray();
		expect(record?.synced).toBe(1);
		// A create must NOT be attempted — the server session already exists.
		expect(apiMock.sessions.create).not.toHaveBeenCalled();
	});

	it('still syncs when the session GET returns 401 (anonymous fillout — the probe cannot auth)', async () => {
		// Regression for the live-QA bug: for an anonymous participant the session
		// GET in ensureServerSession returns 401 "Missing Authorization header" even
		// though the session EXISTS on the server. That 401 must NOT abort the sync —
		// otherwise every anonymous participant's responses are stranded locally.
		// (Unit tests previously mocked get() to resolve, hiding this entirely.)
		setOnline(true);
		const sessionId = 'anon-online-session-1';
		await OfflineResponsePersistence.saveResponse(sessionId, {
			questionId: 'q-1',
			value: 'blue',
			reactionTimeUs: 300_000,
		});

		apiMock.sessions.get.mockRejectedValue(new Error('Missing Authorization header'));
		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 1,
			events_synced: 0,
			variables_synced: 0,
		});

		const engine = new FilloutSyncEngine();
		await engine.syncNow();

		// The 401 did NOT abort: the sync POST happened and the response is marked synced.
		expect(apiMock.sessions.sync).toHaveBeenCalledTimes(1);
		expect(apiMock.sessions.create).not.toHaveBeenCalled();
		const [record] = await db.filloutResponses.toArray();
		expect(record?.synced).toBe(1);
	});
});
