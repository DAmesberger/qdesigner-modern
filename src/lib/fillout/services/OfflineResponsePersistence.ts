import { db, type FilloutResponse, type FilloutEvent, type FilloutVariable } from '$lib/services/db/indexeddb';

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
			metadata?: Record<string, unknown>;
		}
	): Promise<void> {
		const record: FilloutResponse = {
			sessionId,
			clientId: crypto.randomUUID(),
			questionId: data.questionId,
			value: data.value,
			reactionTimeUs: data.reactionTimeUs,
			presentedAt: data.presentedAt,
			answeredAt: data.answeredAt,
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
