import { db, type FilloutSyncLedgerEntry } from '$lib/services/db/indexeddb';

/**
 * Sync-integrity ledger + no-silent-loss escalation (E-OFF-5).
 *
 * The ledger is an append-only audit of every durable participant record's sync
 * journey: `pending` when first enqueued, `acked` once the server durably holds
 * it, `deadletter` after {@link DEAD_LETTER_ATTEMPTS} failed attempts. A record is
 * NEVER silently deleted — a permanently-failing row is escalated to a human via
 * {@link onIntegrityAlert} and left in place (recoverable through the unsynced
 * export escape hatch), and `reconcile()` re-queues anything the client marked
 * acked that the server turns out not to actually have.
 */

/** Attempts before a record is escalated to the dead-letter state. */
export const DEAD_LETTER_ATTEMPTS = 5;

export type LedgerKind = FilloutSyncLedgerEntry['kind'];

export interface IntegrityAlert {
	type: 'deadletter' | 'checksum-mismatch';
	kind: LedgerKind;
	clientId: string;
	sessionId: string;
	attempts: number;
	reason: string;
	at: number;
}

export interface LedgerStats {
	pending: number;
	acked: number;
	deadletter: number;
	total: number;
}

const listeners = new Set<(alert: IntegrityAlert) => void>();
// Ring buffer of recent alerts so a researcher-facing readout mounted AFTER an
// escalation fired can still surface it (the pub-sub only reaches live subscribers).
const recentAlerts: IntegrityAlert[] = [];
const MAX_RECENT_ALERTS = 200;

/**
 * Subscribe to integrity escalations (dead-letter, checksum mismatch). Returns an
 * unsubscribe. Consumed by the connectivity UX (E-OFF-6) and the researcher data-
 * integrity readout so a silent-loss condition is always visible somewhere.
 */
export function onIntegrityAlert(cb: (alert: IntegrityAlert) => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

/** Recent escalations, newest last. Snapshot copy. */
export function recentIntegrityAlerts(): IntegrityAlert[] {
	return [...recentAlerts];
}

function emitAlert(alert: IntegrityAlert): void {
	recentAlerts.push(alert);
	if (recentAlerts.length > MAX_RECENT_ALERTS) recentAlerts.shift();
	// A dead-letter / corrupt record must be LOUD — never a silent drop.
	console.error(
		`[SyncLedger] integrity escalation (${alert.type}) for ${alert.kind} ${alert.clientId}: ${alert.reason}`
	);
	for (const cb of listeners) {
		try {
			cb(alert);
		} catch (err) {
			console.warn('[SyncLedger] integrity alert listener threw:', err);
		}
	}
}

export class SyncLedger {
	/**
	 * Record (or refresh) a `pending` ledger row when a record is enqueued. A row
	 * already in `acked`/`deadletter` is left as-is unless it is being re-queued
	 * (that goes through {@link reconcile}), so re-saving keeps the audit honest.
	 */
	static async enqueue(kind: LedgerKind, clientId: string, sessionId: string): Promise<void> {
		const existing = await db.filloutSyncLedger.get(clientId);
		if (existing && existing.state === 'acked') return;
		await db.filloutSyncLedger.put({
			clientId,
			sessionId,
			kind,
			state: 'pending',
			attempts: existing?.attempts ?? 0,
			lastError: existing?.lastError,
			updatedAt: Date.now()
		});
	}

	/** Flip the given clientIds to `acked` (idempotent). */
	static async markAcked(clientIds: Iterable<string>): Promise<void> {
		const now = Date.now();
		for (const clientId of clientIds) {
			const existing = await db.filloutSyncLedger.get(clientId);
			if (!existing) continue;
			if (existing.state === 'acked') continue;
			await db.filloutSyncLedger.update(clientId, { state: 'acked', updatedAt: now });
		}
	}

	/**
	 * Register a failed sync attempt for the given records (sent but not acked, or
	 * an outright error). Increments `attempts`; a row that reaches
	 * {@link DEAD_LETTER_ATTEMPTS} transitions to `deadletter` and emits a visible
	 * alert. Returns the clientIds that JUST crossed into dead-letter.
	 */
	static async markAttempt(
		clientIds: Iterable<string>,
		error?: string
	): Promise<string[]> {
		const now = Date.now();
		const newlyDead: string[] = [];
		for (const clientId of clientIds) {
			const existing = await db.filloutSyncLedger.get(clientId);
			if (!existing) continue;
			if (existing.state === 'acked' || existing.state === 'deadletter') continue;
			const attempts = existing.attempts + 1;
			const state: FilloutSyncLedgerEntry['state'] =
				attempts >= DEAD_LETTER_ATTEMPTS ? 'deadletter' : 'pending';
			await db.filloutSyncLedger.update(clientId, {
				attempts,
				lastError: error ?? existing.lastError,
				state,
				updatedAt: now
			});
			if (state === 'deadletter') {
				newlyDead.push(clientId);
				emitAlert({
					type: 'deadletter',
					kind: existing.kind,
					clientId,
					sessionId: existing.sessionId,
					attempts,
					reason:
						error ??
						`Record failed to sync after ${attempts} attempts and was escalated to dead-letter.`,
					at: now
				});
			}
		}
		return newlyDead;
	}

	/**
	 * Escalate a record whose stored content failed checksum verification on read
	 * (E-OFF-5 step 1). Marks the ledger row `deadletter` (it must not be synced as
	 * if intact) and emits a visible alert. The underlying record is NOT deleted so
	 * it can still be exported/inspected.
	 */
	static async escalateChecksumMismatch(
		kind: LedgerKind,
		clientId: string,
		sessionId: string
	): Promise<void> {
		const now = Date.now();
		const existing = await db.filloutSyncLedger.get(clientId);
		await db.filloutSyncLedger.put({
			clientId,
			sessionId,
			kind,
			state: 'deadletter',
			attempts: existing?.attempts ?? 0,
			lastError: 'checksum mismatch — stored content does not match its integrity digest',
			updatedAt: now
		});
		emitAlert({
			type: 'checksum-mismatch',
			kind,
			clientId,
			sessionId,
			attempts: existing?.attempts ?? 0,
			reason: 'Stored record failed checksum verification; excluded from sync and flagged for recovery.',
			at: now
		});
	}

	/** Aggregate ledger counts, for the connectivity UX and integrity readout. */
	static async stats(): Promise<LedgerStats> {
		const [pending, acked, deadletter, total] = await Promise.all([
			db.filloutSyncLedger.where('state').equals('pending').count(),
			db.filloutSyncLedger.where('state').equals('acked').count(),
			db.filloutSyncLedger.where('state').equals('deadletter').count(),
			db.filloutSyncLedger.count()
		]);
		return { pending, acked, deadletter, total };
	}

	/** Dead-letter rows (permanently-failing records) for the integrity readout. */
	static async deadletters(): Promise<FilloutSyncLedgerEntry[]> {
		return db.filloutSyncLedger.where('state').equals('deadletter').toArray();
	}

	/**
	 * Reconcile locally-`acked` rows against what the server actually holds
	 * (E-OFF-5 step 5). Fetches the server's durably-held clientIds for the
	 * session and re-queues any ledger row we marked acked that the server does NOT
	 * report — i.e. a client-side over-marking that would otherwise strand data.
	 *
	 * Re-queuing resets the ledger row to `pending` AND clears the underlying
	 * record's `synced` flag so the upload engine ships it again. Dead-letter rows
	 * are left untouched (they're already escalated). Returns the requeued clientIds.
	 *
	 * `fetchServerClientIds` is injectable for testing; the default hits
	 * `GET /api/sessions/{id}/synced-client-ids`.
	 */
	static async reconcile(
		sessionId: string,
		fetchServerClientIds: (sessionId: string) => Promise<string[]> = defaultFetchSyncedClientIds
	): Promise<string[]> {
		const ackedRows = await db.filloutSyncLedger
			.where('[sessionId+state]')
			.equals([sessionId, 'acked'])
			.toArray();
		// Nothing locally acked → nothing to reconcile; avoid a needless server call.
		if (ackedRows.length === 0) return [];

		const serverIds = new Set(await fetchServerClientIds(sessionId));

		const requeued: string[] = [];
		for (const row of ackedRows) {
			if (serverIds.has(row.clientId)) continue;
			// Server does not actually have this record — undo the over-marking.
			await db.filloutSyncLedger.update(row.clientId, {
				state: 'pending',
				lastError: 'reconcile: server did not hold a locally-acked record — re-queued',
				updatedAt: Date.now()
			});
			await SyncLedger.resetRecordUnsynced(row);
			requeued.push(row.clientId);
		}
		return requeued;
	}

	/** Clear the underlying record's `synced` flag so it re-enters the upload queue. */
	private static async resetRecordUnsynced(row: FilloutSyncLedgerEntry): Promise<void> {
		if (row.kind === 'response') {
			await db.filloutResponses.where('clientId').equals(row.clientId).modify({ synced: 0 });
		} else if (row.kind === 'event') {
			await db.filloutEvents.where('clientId').equals(row.clientId).modify({ synced: 0 });
		} else {
			// Variables aren't indexed by clientId — scope by session then match.
			await db.filloutVariables
				.where('sessionId')
				.equals(row.sessionId)
				.filter((v) => v.clientId === row.clientId)
				.modify({ synced: 0 });
		}
	}
}

/**
 * Default reconcile fetcher: the lightweight `GET /api/sessions/{id}/synced-client-ids`
 * endpoint, returning the response + event clientIds the server durably holds.
 * Same-origin fillout, so a relative URL under the configured API base works;
 * credentials are included so an authenticated session carries its cookie.
 */
export async function defaultFetchSyncedClientIds(sessionId: string): Promise<string[]> {
	const base = import.meta.env.VITE_API_URL || '';
	const res = await fetch(`${base}/api/sessions/${sessionId}/synced-client-ids`, {
		method: 'GET',
		credentials: 'include',
		headers: { 'X-Requested-With': 'XMLHttpRequest' }
	});
	if (!res.ok) {
		throw new Error(`synced-client-ids fetch failed: ${res.status}`);
	}
	const body = (await res.json()) as { client_ids?: string[] };
	return Array.isArray(body.client_ids) ? body.client_ids : [];
}
