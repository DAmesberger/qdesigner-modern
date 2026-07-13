import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';

/**
 * The participant-data write path (ADR 0023 D2): every record is written to
 * IndexedDB EXACTLY ONCE under its own clientId, and FilloutUploadSync drains it.
 *
 * These are regression locks for two data-integrity bugs:
 *
 * 1. **Quadratic event writes.** `saveInteractionEvent` used to push the event onto
 *    an in-memory `eventQueue` and then re-persist the WHOLE queue (which it never
 *    cleared), so event *k* was written *k* times ⇒ k(k+1)/2 rows, each under a
 *    FRESH clientId — invisible to the server's `ON CONFLICT (client_id) DO NOTHING`
 *    dedup, so they landed as distinct interaction_events rows.
 * 2. **Events stranded in memory.** The ONLINE branch batched events in that same
 *    in-memory queue and submitted them straight to the API, so up to `batchSize - 1`
 *    events were lost on tab close and NOTHING went through IndexedDB at all.
 * 3. **Swallowed response-write failure.** `saveResponse` caught the write-verify /
 *    quota error that `OfflineResponsePersistence.saveResponse` raises on purpose and
 *    only logged it, so the participant advanced past an answer that no longer existed.
 */

vi.mock('$lib/services/api', () => ({
	api: {
		sessions: {
			get: vi.fn(),
			create: vi.fn(),
			sync: vi.fn(),
			update: vi.fn(),
			submitEvents: vi.fn(),
		},
	},
}));

const { ResponsePersistenceService } = await import('./ResponsePersistenceService');
const { OfflineResponsePersistence } = await import('./OfflineResponsePersistence');
const { api } = await import('$lib/services/api');

const apiMock = api as unknown as {
	sessions: { sync: ReturnType<typeof vi.fn>; submitEvents: ReturnType<typeof vi.fn> };
};

const SESSION = 'rps-session-1';

function setOnline(value: boolean) {
	vi.stubGlobal('navigator', { ...navigator, onLine: value });
}

function makeService() {
	// A long sync interval keeps the periodic timer out of the way; every test disposes.
	return new ResponsePersistenceService({ sessionId: SESSION, syncInterval: 1_000_000 });
}

beforeEach(async () => {
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
	await db.filloutSessions.clear();
	await db.filloutTrials.clear();
	await db.filloutBinaries.clear();
	await db.filloutSyncLedger.clear();
	apiMock.sessions.sync.mockReset();
	apiMock.sessions.submitEvents.mockReset();
	setOnline(false);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('interaction events are written exactly once (D2 write-once)', () => {
	it('persists N events as EXACTLY N durable rows offline — not N(N+1)/2', async () => {
		const service = makeService();
		const N = 100;

		for (let i = 0; i < N; i++) {
			await service.saveInteractionEvent({
				questionId: `q-${i}`,
				eventType: 'click',
				eventData: { i },
				timestamp: 1000 + i,
			});
		}
		service.dispose();

		// The regression lock. With the old queue-and-re-persist bug this was
		// N(N+1)/2 = 5050 rows.
		expect(await db.filloutEvents.count()).toBe(N);

		const rows = await db.filloutEvents.where('sessionId').equals(SESSION).toArray();
		expect(rows).toHaveLength(N);

		// Every row is a DISTINCT event with its own clientId: no event body appears
		// twice (the duplicates the bug produced were byte-identical apart from a fresh
		// clientId each, which is exactly why the server could not dedup them).
		expect(new Set(rows.map((r) => r.clientId)).size).toBe(N);
		expect(new Set(rows.map((r) => r.questionId)).size).toBe(N);
		expect(new Set(rows.map((r) => r.timestampUs)).size).toBe(N);

		// And each one is queued for the server exactly once.
		const ledger = await db.filloutSyncLedger.toArray();
		expect(ledger.filter((l) => l.kind === 'event')).toHaveLength(N);
	});

	it('persists an event durably the moment the call resolves, ONLINE too (nothing stranded in memory)', async () => {
		setOnline(true);
		const service = makeService();

		// Fewer events than the old `batchSize` (10) — the old ONLINE path held these in
		// an in-memory array and wrote NOTHING durable until the batch filled, so closing
		// the tab here lost all three.
		for (let i = 0; i < 3; i++) {
			await service.saveInteractionEvent({
				questionId: 'q-1',
				eventType: 'keypress',
				eventData: { i },
				timestamp: 10 + i,
			});
		}

		// Durable immediately — no flush(), no dispose(), no batch threshold.
		expect(await db.filloutEvents.count()).toBe(3);

		// And there is no second write path: the direct online submit is gone, so the
		// event cannot be sent to the server without first being durable + dedupable.
		expect(apiMock.sessions.submitEvents).not.toHaveBeenCalled();

		service.dispose();
	});

	it('carries relativeTime through to the durable row instead of dropping it offline', async () => {
		const service = makeService();

		await service.saveInteractionEvent({
			questionId: 'q-1',
			eventType: 'response_submitted',
			eventData: { value: 'a' },
			timestamp: 500,
			relativeTime: 12.5,
		});
		service.dispose();

		const [row] = await db.filloutEvents.toArray();
		expect(row!.timestampUs).toBe(500_000);
		expect(row!.metadata).toMatchObject({ eventData: { value: 'a' }, relativeTimeUs: 12_500 });
	});

	it('records a failed event write loudly but does not halt the run (telemetry, not the answer)', async () => {
		const service = makeService();
		const spy = vi
			.spyOn(OfflineResponsePersistence, 'saveEvent')
			.mockRejectedValue(new Error('QuotaExceededError'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			service.saveInteractionEvent({
				questionId: 'q-1',
				eventType: 'click',
				eventData: null,
				timestamp: 1,
			})
		).resolves.toBeUndefined();

		expect(spy).toHaveBeenCalledTimes(1);
		expect(logged).toHaveBeenCalled();
		service.dispose();
	});
});

describe('a failed durable RESPONSE write is not swallowed', () => {
	it('propagates the write-verify / quota error to the caller', async () => {
		const service = makeService();
		vi.spyOn(OfflineResponsePersistence, 'saveResponse').mockRejectedValue(
			new Error('[integrity] write-verify checksum mismatch for response abc')
		);

		// The runtime MUST be able to see this: the participant's answer is gone.
		await expect(
			service.saveResponse({ questionId: 'q-1', value: 'a', valid: true })
		).rejects.toThrow('[integrity] write-verify checksum mismatch');

		service.dispose();
	});

	it('still writes the response through the single offline-first path when it succeeds', async () => {
		const service = makeService();

		await service.saveResponse({
			questionId: 'q-1',
			value: 'a',
			valid: true,
			reactionTime: 421.5,
		});
		service.dispose();

		const rows = await db.filloutResponses.toArray();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.questionId).toBe('q-1');
		expect(rows[0]!.reactionTimeUs).toBe(421_500);
		expect(rows[0]!.synced).toBe(0);
	});
});
