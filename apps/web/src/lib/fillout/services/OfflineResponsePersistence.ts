import { db, type FilloutResponse, type FilloutEvent, type FilloutVariable } from '$lib/services/db/indexeddb';

/**
 * Per-response timing provenance (contract C-PROVENANCE). Captured alongside
 * the raw reaction time so downstream analysis can audit HOW a measurement was
 * made (which clock, what latencies, frame health). Persisted as a distinct
 * camelCase field on the offline record and mapped to the snake_case
 * `timing_provenance` column on sync.
 */
export interface TimingProvenance {
	onsetMethod: string;
	responseMethod: string;
	displayLatencyMs?: number;
	outputLatencyMs?: number;
	rawRtMs?: number;
	anticipatory?: boolean;
	frameStats?: { fps: number; droppedFrames: number; jitter: number };
	calibration?: Record<string, unknown>;
}

/**
 * The offline response row carries {@link TimingProvenance} in addition to the
 * columns declared on {@link FilloutResponse}. IndexedDB stores whole
 * structured clones (the schema only declares indexes), so this extra field
 * round-trips without a schema bump; we widen the type here rather than in the
 * shared db module.
 */
export type StoredFilloutResponse = FilloutResponse & {
	timingProvenance?: TimingProvenance;
};

/**
 * Offline-first response persistence using IndexedDB.
 * Each record gets a clientId = crypto.randomUUID() for server-side dedup.
 */
export class OfflineResponsePersistence {
	/**
	 * Save a response to IndexedDB.
	 */
	static async saveResponse(
		sessionId: string,
		data: {
			questionId: string;
			value: unknown;
			reactionTimeUs?: number;
			presentedAt?: string;
			answeredAt?: string;
			timingProvenance?: TimingProvenance;
			metadata?: Record<string, unknown>;
		}
	): Promise<void> {
		const record: StoredFilloutResponse = {
			sessionId,
			clientId: crypto.randomUUID(),
			questionId: data.questionId,
			value: data.value,
			reactionTimeUs: data.reactionTimeUs,
			presentedAt: data.presentedAt,
			answeredAt: data.answeredAt,
			timingProvenance: data.timingProvenance,
			metadata: data.metadata,
			synced: 0,
		};

		await db.filloutResponses.add(record);
	}

	/**
	 * Save an interaction event to IndexedDB.
	 */
	static async saveEvent(
		sessionId: string,
		data: {
			eventType: string;
			questionId?: string;
			timestampUs: number;
			metadata?: Record<string, unknown>;
		}
	): Promise<void> {
		const record: FilloutEvent = {
			sessionId,
			clientId: crypto.randomUUID(),
			eventType: data.eventType,
			questionId: data.questionId,
			timestampUs: data.timestampUs,
			metadata: data.metadata,
			synced: 0,
		};

		await db.filloutEvents.add(record);
	}

	/**
	 * Save a variable value.
	 */
	static async saveVariable(sessionId: string, name: string, value: unknown): Promise<void> {
		const record: FilloutVariable = {
			sessionId,
			name,
			value,
			synced: 0,
		};

		await db.filloutVariables.put(record);
	}

	/**
	 * Get all responses for a session (for resume).
	 */
	static async getSessionResponses(sessionId: string): Promise<FilloutResponse[]> {
		return db.filloutResponses
			.where('sessionId')
			.equals(sessionId)
			.toArray();
	}

	/**
	 * Get all events for a session.
	 */
	static async getSessionEvents(sessionId: string): Promise<FilloutEvent[]> {
		return db.filloutEvents
			.where('sessionId')
			.equals(sessionId)
			.toArray();
	}

	/**
	 * Get all variables for a session.
	 */
	static async getSessionVariables(sessionId: string): Promise<FilloutVariable[]> {
		return db.filloutVariables
			.where('sessionId')
			.equals(sessionId)
			.toArray();
	}

	/**
	 * Distinct session ids that have ANY unsynced child record (response, event,
	 * or variable). The sync engine drives off this — NOT the `filloutSessions`
	 * table — because online-created sessions live only on the server and never
	 * get a local `filloutSessions` row, yet their responses are still queued
	 * here offline-first (contract D2). Keying sync on the session table would
	 * strand every online session's data.
	 */
	static async getSessionIdsWithUnsyncedData(): Promise<string[]> {
		const [responses, events, variables] = await Promise.all([
			db.filloutResponses.where('synced').equals(0).toArray(),
			db.filloutEvents.where('synced').equals(0).toArray(),
			db.filloutVariables.where('synced').equals(0).toArray(),
		]);

		const ids = new Set<string>();
		for (const r of responses) ids.add(r.sessionId);
		for (const e of events) ids.add(e.sessionId);
		for (const v of variables) ids.add(v.sessionId);
		return [...ids];
	}

	/**
	 * Get unsynced responses for a session.
	 */
	static async getUnsyncedResponses(sessionId: string): Promise<FilloutResponse[]> {
		return db.filloutResponses
			.where('[sessionId+synced]')
			.equals([sessionId, 0])
			.toArray();
	}

	/**
	 * Get unsynced events for a session.
	 */
	static async getUnsyncedEvents(sessionId: string): Promise<FilloutEvent[]> {
		return db.filloutEvents
			.where('[sessionId+synced]')
			.equals([sessionId, 0])
			.toArray();
	}

	/**
	 * Get unsynced variables for a session.
	 */
	static async getUnsyncedVariables(sessionId: string): Promise<FilloutVariable[]> {
		return db.filloutVariables
			.where('sessionId')
			.equals(sessionId)
			.filter((v) => v.synced === 0)
			.toArray();
	}

	/**
	 * Mark responses as synced.
	 */
	static async markResponsesSynced(ids: number[]): Promise<void> {
		await db.filloutResponses
			.where('id')
			.anyOf(ids)
			.modify({ synced: 1 });
	}

	/**
	 * Mark events as synced.
	 */
	static async markEventsSynced(ids: number[]): Promise<void> {
		await db.filloutEvents
			.where('id')
			.anyOf(ids)
			.modify({ synced: 1 });
	}

	/**
	 * Mark variables as synced for a session.
	 */
	static async markVariablesSynced(sessionId: string): Promise<void> {
		await db.filloutVariables
			.where('sessionId')
			.equals(sessionId)
			.modify({ synced: 1 });
	}
}
