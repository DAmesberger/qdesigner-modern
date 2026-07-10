import { db, type FilloutResponse, type FilloutEvent, type FilloutVariable, type FilloutTrial } from '$lib/services/db/indexeddb';
import { FilloutCrypto } from './crypto/FilloutCrypto';
import { computeChecksum, verifyChecksum } from './integrity/checksum';
import { SyncLedger } from './integrity/SyncLedger';
import { OfflineTrialPersistence } from './OfflineTrialPersistence';

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
		// E-OFF-2: encrypt the sensitive slots (participant answer + free-form
		// metadata) at rest. Timing columns (reactionTimeUs / presentedAt /
		// answeredAt / timingProvenance) stay cleartext for local analytics and
		// index-free querying, and never carry response content.
		const record: StoredFilloutResponse = {
			sessionId,
			clientId: crypto.randomUUID(),
			questionId: data.questionId,
			value: await FilloutCrypto.encryptField(sessionId, data.value),
			reactionTimeUs: data.reactionTimeUs,
			presentedAt: data.presentedAt,
			answeredAt: data.answeredAt,
			timingProvenance: data.timingProvenance,
			metadata: (await FilloutCrypto.encryptField(sessionId, data.metadata)) as
				| Record<string, unknown>
				| undefined,
			attempts: 0,
			synced: 0,
		};
		// E-OFF-5: checksum the canonicalized STORED content (post-encryption) so a
		// later partial write / corruption / tamper is detectable on read.
		const checksum = await computeChecksum(this.responseChecksumPayload(record));
		record.checksum = checksum;

		await db.filloutResponses.add(record);
		// Write-verify: re-read the durable row and re-check its checksum before
		// telling the runtime the write succeeded, so a failed IndexedDB write
		// surfaces immediately instead of being silently assumed durable.
		await this.assertWritten(
			await db.filloutResponses.where('clientId').equals(record.clientId).first(),
			checksum,
			(r) => this.responseChecksumPayload(r as StoredFilloutResponse),
			`response ${record.clientId}`
		);
		await SyncLedger.enqueue('response', record.clientId, sessionId);
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
			attempts: 0,
			synced: 0,
		};
		const checksum = await computeChecksum(this.eventChecksumPayload(record));
		record.checksum = checksum;

		await db.filloutEvents.add(record);
		await this.assertWritten(
			await db.filloutEvents.where('clientId').equals(record.clientId).first(),
			checksum,
			(r) => this.eventChecksumPayload(r as FilloutEvent),
			`event ${record.clientId}`
		);
		await SyncLedger.enqueue('event', record.clientId, sessionId);
	}

	/**
	 * Save a variable value.
	 */
	static async saveVariable(sessionId: string, name: string, value: unknown): Promise<void> {
		const clientId = crypto.randomUUID();
		const record: FilloutVariable = {
			sessionId,
			name,
			value: await FilloutCrypto.encryptField(sessionId, value),
			// E-OFF-4: fresh concurrency token on every write so an ack for an older
			// value never marks a newer (re-saved) value synced. Keyed [sessionId+name]
			// so put() overwrites in place — the clientId is what distinguishes versions.
			clientId,
			attempts: 0,
			synced: 0,
		};
		const checksum = await computeChecksum(this.variableChecksumPayload(record));
		record.checksum = checksum;

		await db.filloutVariables.put(record);
		// Write-verify by the composite key (put overwrites in place).
		await this.assertWritten(
			await db.filloutVariables.get([sessionId, name]),
			checksum,
			(r) => this.variableChecksumPayload(r as FilloutVariable),
			`variable ${sessionId}/${name}`
		);
		await SyncLedger.enqueue('variable', clientId, sessionId);
	}

	// ── Integrity helpers (E-OFF-5) ──────────────────────────────────────

	/** Canonical content of a stored response row used for its checksum. */
	private static responseChecksumPayload(r: StoredFilloutResponse): unknown {
		return {
			sessionId: r.sessionId,
			clientId: r.clientId,
			questionId: r.questionId,
			value: r.value,
			reactionTimeUs: r.reactionTimeUs,
			presentedAt: r.presentedAt,
			answeredAt: r.answeredAt,
			timingProvenance: r.timingProvenance,
			metadata: r.metadata,
		};
	}

	private static eventChecksumPayload(e: FilloutEvent): unknown {
		return {
			sessionId: e.sessionId,
			clientId: e.clientId,
			eventType: e.eventType,
			questionId: e.questionId,
			timestampUs: e.timestampUs,
			metadata: e.metadata,
		};
	}

	private static variableChecksumPayload(v: FilloutVariable): unknown {
		return { sessionId: v.sessionId, name: v.name, value: v.value, clientId: v.clientId };
	}

	/**
	 * Write-verify (E-OFF-5 step 2): assert a just-written row is durably present
	 * and its stored content still matches the checksum, throwing a clear error to
	 * the runtime when it does not. A durable write that silently failed (quota,
	 * eviction mid-transaction) surfaces here instead of being assumed successful.
	 */
	private static async assertWritten<T extends { checksum?: string }>(
		reread: T | undefined,
		expected: string,
		payload: (r: T) => unknown,
		label: string
	): Promise<void> {
		if (!reread) {
			throw new Error(`[integrity] durable write failed: ${label} not found after write`);
		}
		const ok = await verifyChecksum(payload(reread), expected);
		if (!ok || reread.checksum !== expected) {
			throw new Error(`[integrity] write-verify checksum mismatch for ${label}`);
		}
	}

	/**
	 * Verify a stored row's checksum before it enters the sync stream. On mismatch
	 * the row is escalated (ledger dead-letter + visible alert) and EXCLUDED from
	 * the returned set so corrupt content is never synced as if intact — but the
	 * row is left in IndexedDB so it can be exported/recovered.
	 */
	private static async verifyStored(
		kind: 'response' | 'event' | 'variable',
		clientId: string,
		sessionId: string,
		checksum: string | undefined,
		payload: unknown
	): Promise<boolean> {
		if (await verifyChecksum(payload, checksum)) return true;
		await SyncLedger.escalateChecksumMismatch(kind, clientId, sessionId);
		return false;
	}

	/**
	 * Record a failed sync attempt against the durable rows (E-OFF-5): bumps each
	 * record's `attempts` + `lastError` in lockstep with the ledger dead-letter
	 * accounting. Response/event rows are keyed by their indexed `clientId`.
	 */
	static async recordSyncFailure(
		kind: 'response' | 'event',
		clientIds: string[],
		error: string
	): Promise<void> {
		if (clientIds.length === 0) return;
		const bump = (row: FilloutResponse | FilloutEvent) => {
			row.attempts = (row.attempts ?? 0) + 1;
			row.lastError = error;
		};
		for (const clientId of clientIds) {
			if (kind === 'response') {
				await db.filloutResponses.where('clientId').equals(clientId).modify(bump);
			} else {
				await db.filloutEvents.where('clientId').equals(clientId).modify(bump);
			}
		}
	}

	/**
	 * Manual escape hatch (E-OFF-5 step 7): a JSON-serializable snapshot of every
	 * UNSYNCED row across all sessions, plus the ledger dead-letters, so a device
	 * that can never reach the server is still recoverable. Sensitive slots are
	 * decrypted so the export is human-usable off-device.
	 */
	static async exportUnsyncedData(): Promise<{
		exportedAt: string;
		responses: FilloutResponse[];
		events: FilloutEvent[];
		variables: FilloutVariable[];
		trials: FilloutTrial[];
		deadletters: Awaited<ReturnType<typeof SyncLedger.deadletters>>;
	}> {
		const [responses, events, variables] = await Promise.all([
			db.filloutResponses.where('synced').equals(0).toArray(),
			db.filloutEvents.where('synced').equals(0).toArray(),
			db.filloutVariables.where('synced').equals(0).toArray(),
		]);
		const decRes = await Promise.all(responses.map((r) => this.decryptResponse(r)));
		const decVars = await Promise.all(variables.map((v) => this.decryptVariable(v)));
		return {
			exportedAt: new Date().toISOString(),
			responses: decRes,
			events,
			variables: decVars,
			// RT-1b: per-trial rows are recoverable through the same escape hatch.
			trials: await OfflineTrialPersistence.exportUnsyncedTrials(),
			deadletters: await SyncLedger.deadletters(),
		};
	}

	/**
	 * Decrypt the sensitive slots of a stored response row (E-OFF-2). A row whose
	 * value/metadata are plaintext (legacy or insecure-context) round-trips
	 * unchanged via {@link FilloutCrypto.decryptField}.
	 */
	private static async decryptResponse(r: FilloutResponse): Promise<FilloutResponse> {
		return {
			...r,
			value: await FilloutCrypto.decryptField(r.sessionId, r.value),
			metadata: (await FilloutCrypto.decryptField(r.sessionId, r.metadata)) as
				| Record<string, unknown>
				| undefined,
		};
	}

	private static async decryptVariable(v: FilloutVariable): Promise<FilloutVariable> {
		return { ...v, value: await FilloutCrypto.decryptField(v.sessionId, v.value) };
	}

	/**
	 * Get all responses for a session (for resume).
	 */
	static async getSessionResponses(sessionId: string): Promise<FilloutResponse[]> {
		const rows = await db.filloutResponses
			.where('sessionId')
			.equals(sessionId)
			.toArray();
		return Promise.all(rows.map((r) => this.decryptResponse(r)));
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
		const rows = await db.filloutVariables
			.where('sessionId')
			.equals(sessionId)
			.toArray();
		return Promise.all(rows.map((v) => this.decryptVariable(v)));
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
		const [responses, events, variables, dead] = await Promise.all([
			db.filloutResponses.where('synced').equals(0).toArray(),
			db.filloutEvents.where('synced').equals(0).toArray(),
			db.filloutVariables.where('synced').equals(0).toArray(),
			// Dead-lettered records still carry synced=0 (never discarded) but must not
			// keep a session in the sync set — a session whose ONLY unsynced rows are all
			// escalated has nothing left to ship, so draining it would only re-fail forever.
			SyncLedger.deadletterClientIds(),
		]);

		const ids = new Set<string>();
		for (const r of responses) if (!dead.has(r.clientId)) ids.add(r.sessionId);
		for (const e of events) if (!dead.has(e.clientId)) ids.add(e.sessionId);
		for (const v of variables) if (!v.clientId || !dead.has(v.clientId)) ids.add(v.sessionId);
		// RT-1b: a session whose only queued data is per-trial rows must still drain.
		for (const id of await OfflineTrialPersistence.getSessionIdsWithUnsyncedTrials()) ids.add(id);
		return [...ids];
	}

	/**
	 * Get unsynced responses for a session.
	 */
	static async getUnsyncedResponses(sessionId: string): Promise<FilloutResponse[]> {
		const rows = await db.filloutResponses
			.where('[sessionId+synced]')
			.equals([sessionId, 0])
			.toArray();
		// E-OFF-5: skip dead-lettered rows (already escalated; re-shipping them just
		// re-fails forever) and verify each remaining row's checksum; a corrupt row is
		// escalated and dropped from the sync stream (never synced) but kept on disk.
		const dead = await SyncLedger.deadletterClientIds();
		const intact: StoredFilloutResponse[] = [];
		for (const r of rows) {
			if (dead.has(r.clientId)) continue;
			const ok = await this.verifyStored(
				'response',
				r.clientId,
				r.sessionId,
				(r as StoredFilloutResponse).checksum,
				this.responseChecksumPayload(r as StoredFilloutResponse)
			);
			if (ok) intact.push(r as StoredFilloutResponse);
		}
		return Promise.all(intact.map((r) => this.decryptResponse(r)));
	}

	/**
	 * Get unsynced events for a session.
	 */
	static async getUnsyncedEvents(sessionId: string): Promise<FilloutEvent[]> {
		const rows = await db.filloutEvents
			.where('[sessionId+synced]')
			.equals([sessionId, 0])
			.toArray();
		const dead = await SyncLedger.deadletterClientIds();
		const intact: FilloutEvent[] = [];
		for (const e of rows) {
			if (dead.has(e.clientId)) continue;
			const ok = await this.verifyStored(
				'event',
				e.clientId,
				e.sessionId,
				e.checksum,
				this.eventChecksumPayload(e)
			);
			if (ok) intact.push(e);
		}
		return intact;
	}

	/**
	 * Get unsynced variables for a session.
	 */
	static async getUnsyncedVariables(sessionId: string): Promise<FilloutVariable[]> {
		const rows = await db.filloutVariables
			.where('sessionId')
			.equals(sessionId)
			.filter((v) => v.synced === 0)
			.toArray();
		const dead = await SyncLedger.deadletterClientIds();
		const intact: FilloutVariable[] = [];
		for (const v of rows) {
			if (v.clientId && dead.has(v.clientId)) continue;
			const ok = await this.verifyStored(
				'variable',
				v.clientId ?? `${v.sessionId}/${v.name}`,
				v.sessionId,
				v.checksum,
				this.variableChecksumPayload(v)
			);
			if (ok) intact.push(v);
		}
		return Promise.all(intact.map((v) => this.decryptVariable(v)));
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
	 * Mark session variables synced (E-OFF-4).
	 *
	 * Ack-driven when `accepted` is supplied: flips ONLY the named rows the server
	 * durably upserted, and only while the row still carries the clientId that was
	 * sent — a value re-written during the sync round-trip has a newer clientId and
	 * is left unsynced for the next pass. This replaces the old mark-ALL-by-session
	 * semantics that raced with mid-flight writes.
	 *
	 * Backward-compatible fallback: with `accepted` omitted (older server that does
	 * not echo `accepted_variable_names`), it marks every row for the session synced
	 * — the legacy behaviour, preserving idempotent drain against such servers.
	 */
	static async markVariablesSynced(
		sessionId: string,
		accepted?: { name: string; clientId?: string }[]
	): Promise<void> {
		if (accepted === undefined) {
			await db.filloutVariables
				.where('sessionId')
				.equals(sessionId)
				.modify({ synced: 1 });
			return;
		}

		for (const { name, clientId } of accepted) {
			await db.filloutVariables
				.where('[sessionId+name]')
				.equals([sessionId, name])
				// Guard on the concurrency token: skip a row overwritten mid-flight
				// (its clientId no longer matches the one the server acked). When the
				// sent record had no clientId (legacy row), fall through and mark it.
				.filter((v) => clientId === undefined || v.clientId === clientId)
				.modify({ synced: 1 });
		}
	}
}
