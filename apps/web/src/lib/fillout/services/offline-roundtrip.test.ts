import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';

// Mock the api module BEFORE importing FilloutSyncEngine so the engine's
// captured `api` reference points at our mock. Vitest hoists vi.mock so this
// runs before any module evaluation (same pattern as FilloutSyncEngine.test.ts
// and persistence-timing.test.ts).
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

// ── Shape of the sync payload the engine builds (see FilloutSyncEngine.syncSession).
// Typing the mock-call tuple keeps the assertions strict instead of `any`.
interface SyncResponse {
	client_id: string;
	question_id: string;
	value: unknown;
	reaction_time_us: number | null;
	presented_at: string | null;
	answered_at: string | null;
	timing_provenance: unknown;
	metadata: Record<string, unknown> | null;
}
interface SyncEvent {
	client_id: string;
	event_type: string;
	question_id: string | null;
	timestamp_us: number;
	metadata: Record<string, unknown> | null;
}
interface SyncVariable {
	variable_name: string;
	variable_value: unknown;
}
interface SyncPayload {
	responses: SyncResponse[];
	events: SyncEvent[];
	variables: SyncVariable[];
	status?: string;
}

/** Strongly-typed accessor for the i-th `api.sessions.sync(sessionId, payload)` call. */
function syncCall(i: number): [string, SyncPayload] {
	return apiMock.sessions.sync.mock.calls[i] as [string, SyncPayload];
}

/** All response client_ids sent across every sync call (for exactly-once assertions). */
function allSentResponseClientIds(): string[] {
	return apiMock.sessions.sync.mock.calls.flatMap(
		(call) => (call[1] as SyncPayload).responses.map((r) => r.client_id),
	);
}

// Two representative C-PROVENANCE objects (see the SHARED CONTRACTS block).
const PROVENANCE_A = {
	onsetMethod: 'rvfc',
	responseMethod: 'event.timeStamp',
	displayLatencyMs: 8.3,
	outputLatencyMs: 2.1,
	rawRtMs: 421.5,
	anticipatory: false,
	frameStats: { fps: 60, droppedFrames: 1, jitter: 0.42 },
};
const PROVENANCE_B = {
	onsetMethod: 'raf',
	responseMethod: 'pointer.timeStamp',
	displayLatencyMs: 16.6,
	rawRtMs: 388.2,
	anticipatory: false,
	frameStats: { fps: 60, droppedFrames: 0, jitter: 0.11 },
};

const PRESENTED_AT_1 = '2026-07-04T00:00:00.000Z';
const ANSWERED_AT_1 = '2026-07-04T00:00:00.421Z';
const PRESENTED_AT_2 = '2026-07-04T00:00:01.000Z';
const ANSWERED_AT_2 = '2026-07-04T00:00:01.388Z';

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

describe('offline completion round-trip: reconciles exactly once on reconnect', () => {
	it('golden path — capture offline, drain on reconnect, never re-send', async () => {
		// ── 1. OFFLINE: capture a full completed session with no server contact ──
		setOnline(false);

		const session = await OfflineSessionService.createSession(
			'quest-1',
			2,
			3,
			1,
			'participant-7',
		);

		// Several responses: two carry reaction time + provenance, one is a plain
		// survey answer with no timing (exercises the `?? null` mapping branch).
		await OfflineResponsePersistence.saveResponse(session.id, {
			questionId: 'q-stroop-1',
			value: { choice: 'red' },
			reactionTimeUs: 421_500,
			presentedAt: PRESENTED_AT_1,
			answeredAt: ANSWERED_AT_1,
			timingProvenance: PROVENANCE_A,
			metadata: { block: 'practice' },
		});
		await OfflineResponsePersistence.saveResponse(session.id, {
			questionId: 'q-stroop-2',
			value: { choice: 'green' },
			reactionTimeUs: 388_200,
			presentedAt: PRESENTED_AT_2,
			answeredAt: ANSWERED_AT_2,
			timingProvenance: PROVENANCE_B,
		});
		await OfflineResponsePersistence.saveResponse(session.id, {
			questionId: 'q-likert-1',
			value: 4,
		});

		// Interaction events (one with a questionId, one without).
		await OfflineResponsePersistence.saveEvent(session.id, {
			eventType: 'stimulus_onset',
			questionId: 'q-stroop-1',
			timestampUs: 1_000_000,
			metadata: { frame: 42 },
		});
		await OfflineResponsePersistence.saveEvent(session.id, {
			eventType: 'keypress',
			timestampUs: 1_421_500,
		});

		// Computed variables.
		await OfflineResponsePersistence.saveVariable(session.id, 'mean_rt', 404.85);
		await OfflineResponsePersistence.saveVariable(session.id, 'accuracy', 1);

		// Participant finishes the questionnaire while still offline.
		await OfflineSessionService.completeSession(session.id);

		// Attempting a sync while offline must be a pure no-op: nothing leaves the
		// device, and nothing is marked synced.
		const engine = new FilloutSyncEngine();
		const offlineResult = await engine.syncNow();

		expect(apiMock.sessions.sync).not.toHaveBeenCalled();
		expect(apiMock.sessions.get).not.toHaveBeenCalled();
		expect(apiMock.sessions.create).not.toHaveBeenCalled();
		expect(offlineResult.sessionsSynced).toBe(0);
		expect(offlineResult.responsesSynced).toBe(0);
		expect(offlineResult.errors).toEqual([]);

		// Everything is still queued unsynced.
		expect(await db.filloutResponses.where('synced').equals(0).count()).toBe(3);
		expect(await db.filloutEvents.where('synced').equals(0).count()).toBe(2);
		expect(await db.filloutVariables.where('synced').equals(0).count()).toBe(2);
		expect((await OfflineSessionService.getSession(session.id))?.synced).toBe(0);
		expect((await OfflineSessionService.getSession(session.id))?.status).toBe('completed');

		// ── 2. ONLINE: reconnect and run the sync ──
		setOnline(true);
		apiMock.sessions.get.mockResolvedValue({ id: session.id });
		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 3,
			events_synced: 2,
			variables_synced: 2,
		});

		const firstResult = await engine.syncNow();

		// Exactly one sync call, targeting our session, and no create (get succeeded).
		expect(apiMock.sessions.sync).toHaveBeenCalledTimes(1);
		expect(apiMock.sessions.create).not.toHaveBeenCalled();
		const [syncedId, payload] = syncCall(0);
		expect(syncedId).toBe(session.id);

		// Completion is reconciled in the same payload.
		expect(payload.status).toBe('completed');

		// ── Responses: ALL present, snake_case, correct field mapping ──
		expect(payload.responses).toHaveLength(3);

		const rStroop1 = payload.responses.find((r) => r.question_id === 'q-stroop-1')!;
		expect(rStroop1).toMatchObject({
			question_id: 'q-stroop-1',
			value: { choice: 'red' },
			reaction_time_us: 421_500,
			presented_at: PRESENTED_AT_1,
			answered_at: ANSWERED_AT_1,
			timing_provenance: PROVENANCE_A,
			metadata: { block: 'practice' },
		});
		expect(typeof rStroop1.client_id).toBe('string');

		const rStroop2 = payload.responses.find((r) => r.question_id === 'q-stroop-2')!;
		expect(rStroop2.reaction_time_us).toBe(388_200);
		expect(rStroop2.timing_provenance).toEqual(PROVENANCE_B);
		// Field omitted at save time maps to explicit null, not undefined.
		expect(rStroop2.metadata).toBeNull();

		// Plain survey answer: every timing field is null (not undefined/omitted).
		const rLikert = payload.responses.find((r) => r.question_id === 'q-likert-1')!;
		expect(rLikert.value).toBe(4);
		expect(rLikert.reaction_time_us).toBeNull();
		expect(rLikert.presented_at).toBeNull();
		expect(rLikert.answered_at).toBeNull();
		expect(rLikert.timing_provenance).toBeNull();

		// ── Events: ALL present, snake_case ──
		expect(payload.events).toHaveLength(2);
		const eOnset = payload.events.find((e) => e.event_type === 'stimulus_onset')!;
		expect(eOnset).toMatchObject({
			event_type: 'stimulus_onset',
			question_id: 'q-stroop-1',
			timestamp_us: 1_000_000,
			metadata: { frame: 42 },
		});
		expect(typeof eOnset.client_id).toBe('string');
		const eKey = payload.events.find((e) => e.event_type === 'keypress')!;
		expect(eKey.timestamp_us).toBe(1_421_500);
		expect(eKey.question_id).toBeNull();

		// ── Variables: mapped to variable_name / variable_value ──
		expect(payload.variables).toHaveLength(2);
		expect(payload.variables).toEqual(
			expect.arrayContaining([
				{ variable_name: 'mean_rt', variable_value: 404.85 },
				{ variable_name: 'accuracy', variable_value: 1 },
			]),
		);

		// Aggregate result mirrors the server ack.
		expect(firstResult.sessionsSynced).toBe(1);
		expect(firstResult.responsesSynced).toBe(3);
		expect(firstResult.eventsSynced).toBe(2);
		expect(firstResult.variablesSynced).toBe(2);
		expect(firstResult.errors).toEqual([]);

		// F005: this session was COMPLETED before its final sync, so after the
		// server ack its now-synced participant data is PURGED from IndexedDB —
		// no sensitive response/event/variable data lingers on the device, and
		// the session row itself (synced===1) is removed too. Nothing unsynced
		// remains anywhere either.
		expect(await db.filloutResponses.where('sessionId').equals(session.id).count()).toBe(0);
		expect(await db.filloutEvents.where('sessionId').equals(session.id).count()).toBe(0);
		expect(await db.filloutVariables.where('sessionId').equals(session.id).count()).toBe(0);
		expect(await db.filloutResponses.where('synced').equals(0).count()).toBe(0);
		expect(await db.filloutEvents.where('synced').equals(0).count()).toBe(0);
		expect(await db.filloutVariables.where('synced').equals(0).count()).toBe(0);
		expect(await OfflineSessionService.getSession(session.id)).toBeUndefined();

		// Idempotency contract: every response carried a distinct client_id.
		const firstIds = payload.responses.map((r) => r.client_id);
		expect(new Set(firstIds).size).toBe(firstIds.length);

		// ── 3. EXACTLY ONCE: a second sync must not re-send anything ──
		const secondResult = await engine.syncNow();

		// Still exactly one sync call in total — nothing was re-sent.
		expect(apiMock.sessions.sync).toHaveBeenCalledTimes(1);
		expect(secondResult.sessionsSynced).toBe(0);
		expect(secondResult.responsesSynced).toBe(0);
		expect(secondResult.eventsSynced).toBe(0);
		expect(secondResult.variablesSynced).toBe(0);

		// No response client_id was ever transmitted twice across all sync calls.
		const sentIds = allSentResponseClientIds();
		expect(sentIds).toHaveLength(3);
		expect(new Set(sentIds).size).toBe(sentIds.length);
	});

	it('online-created session (no filloutSessions row) — drains and reconciles exactly once', async () => {
		// Locks the Phase-1 critical fix: sync must drive off unsynced CHILD records
		// (collectSessionsToSync), not the filloutSessions table. An online-created
		// session lives only on the server, so its queued responses would be
		// stranded if sync keyed on the local session table.
		setOnline(true);
		const onlineSessionId = 'server-only-session-42';

		await OfflineResponsePersistence.saveResponse(onlineSessionId, {
			questionId: 'q-1',
			value: 5,
			reactionTimeUs: 300_000,
			presentedAt: PRESENTED_AT_1,
			answeredAt: ANSWERED_AT_1,
			timingProvenance: PROVENANCE_A,
		});
		await OfflineResponsePersistence.saveEvent(onlineSessionId, {
			eventType: 'response',
			questionId: 'q-1',
			timestampUs: 500_000,
		});
		await OfflineResponsePersistence.saveVariable(onlineSessionId, 'score', 5);

		// Precondition: there is genuinely no local session row.
		expect(await db.filloutSessions.get(onlineSessionId)).toBeUndefined();

		apiMock.sessions.get.mockResolvedValue({ id: onlineSessionId });
		apiMock.sessions.sync.mockResolvedValue({
			responses_synced: 1,
			events_synced: 1,
			variables_synced: 1,
		});

		const engine = new FilloutSyncEngine();
		await engine.syncNow();

		expect(apiMock.sessions.sync).toHaveBeenCalledTimes(1);
		const [syncedId, payload] = syncCall(0);
		expect(syncedId).toBe(onlineSessionId);
		expect(payload.responses).toHaveLength(1);
		expect(payload.responses[0]?.reaction_time_us).toBe(300_000);
		expect(payload.responses[0]?.timing_provenance).toEqual(PROVENANCE_A);
		expect(payload.events).toHaveLength(1);
		expect(payload.variables).toEqual([{ variable_name: 'score', variable_value: 5 }]);
		// A stub session carries no 'completed' status → status stays undefined.
		expect(payload.status).toBeUndefined();

		// The server session already exists → NO create attempt.
		expect(apiMock.sessions.create).not.toHaveBeenCalled();

		// Records marked synced.
		expect(await db.filloutResponses.where('synced').equals(0).count()).toBe(0);
		expect(await db.filloutEvents.where('synced').equals(0).count()).toBe(0);
		expect(await db.filloutVariables.where('synced').equals(0).count()).toBe(0);

		// EXACTLY ONCE: re-running sync sends nothing further.
		const secondResult = await engine.syncNow();
		expect(apiMock.sessions.sync).toHaveBeenCalledTimes(1);
		expect(secondResult.responsesSynced).toBe(0);

		const sentIds = allSentResponseClientIds();
		expect(sentIds).toHaveLength(1);
		expect(new Set(sentIds).size).toBe(1);
	});
});

describe('offline variable persistence: keyed upsert + sync flag', () => {
	it('saveVariable writes a [sessionId+name]-keyed row with synced:0 and upserts on repeat', async () => {
		const sessionId = 'var-session-1';

		await OfflineResponsePersistence.saveVariable(sessionId, 'mean_rt', 404.85);
		await OfflineResponsePersistence.saveVariable(sessionId, 'accuracy', 1);

		// Rows are keyed by the compound [sessionId+name] PK and start unsynced.
		expect(await db.filloutVariables.where('sessionId').equals(sessionId).count()).toBe(2);
		const meanRt = await db.filloutVariables.get([sessionId, 'mean_rt']);
		expect(meanRt).toMatchObject({ sessionId, name: 'mean_rt', value: 404.85, synced: 0 });

		// getUnsyncedVariables surfaces both.
		const unsynced = await OfflineResponsePersistence.getUnsyncedVariables(sessionId);
		expect(unsynced.map((v) => v.name).sort()).toEqual(['accuracy', 'mean_rt']);

		// A second save of the SAME name upserts in place — no duplicate row.
		await OfflineResponsePersistence.saveVariable(sessionId, 'mean_rt', 500);
		expect(await db.filloutVariables.where('sessionId').equals(sessionId).count()).toBe(2);
		expect((await db.filloutVariables.get([sessionId, 'mean_rt']))?.value).toBe(500);

		// markVariablesSynced flips every row for the session to synced:1.
		await OfflineResponsePersistence.markVariablesSynced(sessionId);
		expect((await OfflineResponsePersistence.getUnsyncedVariables(sessionId)).length).toBe(0);
		expect((await db.filloutVariables.get([sessionId, 'mean_rt']))?.synced).toBe(1);

		// Re-saving an already-synced name re-arms synced:0 (needs re-sync).
		await OfflineResponsePersistence.saveVariable(sessionId, 'mean_rt', 501);
		expect((await db.filloutVariables.get([sessionId, 'mean_rt']))?.synced).toBe(0);
		expect(await db.filloutVariables.where('sessionId').equals(sessionId).count()).toBe(2);
	});
});
