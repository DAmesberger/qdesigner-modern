import { db, type FilloutTrial } from '$lib/services/db/indexeddb';
import type { RuntimeTrialEvent } from '$lib/runtime/core/question-runtime';
import { FilloutCrypto } from './crypto/FilloutCrypto';
import { computeChecksum, verifyChecksum } from './integrity/checksum';
import { SyncLedger } from './integrity/SyncLedger';

/**
 * Offline-first per-trial persistence (RT-1b). Each completed reaction trial is
 * written IMMEDIATELY to IndexedDB as a first-class `filloutTrials` row, keyed by a
 * server-dedup `clientId`, and synced as the fourth record kind through the batch
 * `/sync` path. The question-level response keeps its full block summary unchanged
 * (dual-write) — these rows are the per-trial analytic object, not a slice of it.
 *
 * At-rest encryption (E-OFF-2) mirrors {@link OfflineResponsePersistence}: the
 * participant's ANSWER (`optionId`) is AES-GCM encrypted before write and decrypted
 * before sync; timing/measurement columns stay cleartext, exactly like a response's
 * `reactionTimeUs` / `timingProvenance`.
 */
export class OfflineTrialPersistence {
	/**
	 * Persist one runtime trial event (RT-1b). Maps the {@link RuntimeTrialEvent}
	 * onto a durable `filloutTrials` row: encrypts the answer slot, checksums the
	 * stored content, write-verifies, and enqueues the ledger. Called fire-and-forget
	 * from the fillout runtime's `onTrialComplete` hook so it never blocks the trial
	 * loop; the caller logs (never swallows) a rejection.
	 */
	static async persistTrialEvent(sessionId: string, event: RuntimeTrialEvent): Promise<void> {
		await this.saveTrial(sessionId, {
			questionId: event.questionId,
			trialIndex: event.trialIndex,
			paradigm: event.paradigm,
			optionId: event.optionId,
			source: event.source,
			rtUs: event.rtUs,
			correct: event.correct,
			sampledTimings: event.sampledTimings,
			provenance: event.provenance,
			invalidated: event.invalidated,
		});
	}

	/**
	 * Save a single trial row to IndexedDB.
	 */
	static async saveTrial(
		sessionId: string,
		data: {
			questionId: string;
			trialIndex: number;
			paradigm: string;
			optionId: string | null;
			source?: string | null;
			rtUs?: number | null;
			correct?: boolean | null;
			sampledTimings?: unknown;
			provenance?: unknown;
			invalidated?: string | null;
		}
	): Promise<void> {
		// E-OFF-2: encrypt the participant's answer (optionId) at rest; timing /
		// measurement columns (rtUs / sampledTimings / provenance / invalidated) stay
		// cleartext for offline analytics, exactly like a response's timing columns.
		const clientId = crypto.randomUUID();
		const record: FilloutTrial = {
			clientId,
			sessionId,
			questionId: data.questionId,
			trialIndex: data.trialIndex,
			paradigm: data.paradigm,
			optionId: await FilloutCrypto.encryptField(sessionId, data.optionId),
			source: data.source ?? null,
			rtUs: data.rtUs ?? null,
			correct: data.correct ?? null,
			sampledTimings: data.sampledTimings,
			provenance: data.provenance,
			invalidated: data.invalidated ?? null,
			attempts: 0,
			synced: 0,
		};
		// E-OFF-5: checksum the canonicalized STORED content (post-encryption) so a
		// later partial write / corruption / tamper is detectable on read.
		const checksum = await computeChecksum(this.trialChecksumPayload(record));
		record.checksum = checksum;

		await db.filloutTrials.add(record);
		// Write-verify: re-read the durable row and re-check its checksum before
		// telling the caller the write succeeded.
		await this.assertWritten(await db.filloutTrials.get(clientId), checksum, clientId);
		await SyncLedger.enqueue('trial', clientId, sessionId);
	}

	/** Canonical content of a stored trial row used for its checksum. */
	private static trialChecksumPayload(t: FilloutTrial): unknown {
		return {
			clientId: t.clientId,
			sessionId: t.sessionId,
			questionId: t.questionId,
			trialIndex: t.trialIndex,
			paradigm: t.paradigm,
			optionId: t.optionId,
			source: t.source,
			rtUs: t.rtUs,
			correct: t.correct,
			sampledTimings: t.sampledTimings,
			provenance: t.provenance,
			invalidated: t.invalidated,
		};
	}

	/**
	 * Write-verify (E-OFF-5): assert a just-written trial is durably present and its
	 * stored content still matches the checksum, throwing to the caller otherwise.
	 */
	private static async assertWritten(
		reread: FilloutTrial | undefined,
		expected: string,
		clientId: string
	): Promise<void> {
		if (!reread) {
			throw new Error(`[integrity] durable write failed: trial ${clientId} not found after write`);
		}
		const ok = await verifyChecksum(this.trialChecksumPayload(reread), expected);
		if (!ok || reread.checksum !== expected) {
			throw new Error(`[integrity] write-verify checksum mismatch for trial ${clientId}`);
		}
	}

	/** Decrypt the answer slot of a stored trial row (E-OFF-2). */
	private static async decryptTrial(t: FilloutTrial): Promise<FilloutTrial> {
		return { ...t, optionId: await FilloutCrypto.decryptField(t.sessionId, t.optionId) };
	}

	/**
	 * Get unsynced trials for a session, decrypted and integrity-checked (E-OFF-5).
	 * Dead-lettered rows are skipped (already escalated) and a checksum-mismatch row
	 * is escalated + dropped from the sync stream (but left on disk for recovery).
	 */
	static async getUnsyncedTrials(sessionId: string): Promise<FilloutTrial[]> {
		const rows = await db.filloutTrials
			.where('[sessionId+synced]')
			.equals([sessionId, 0])
			.toArray();
		const dead = await SyncLedger.deadletterClientIds();
		const intact: FilloutTrial[] = [];
		for (const t of rows) {
			if (dead.has(t.clientId)) continue;
			if (await verifyChecksum(this.trialChecksumPayload(t), t.checksum)) {
				intact.push(t);
			} else {
				await SyncLedger.escalateChecksumMismatch('trial', t.clientId, t.sessionId);
			}
		}
		return Promise.all(intact.map((t) => this.decryptTrial(t)));
	}

	/**
	 * Distinct session ids that have ANY unsynced trial row NOT already escalated to
	 * dead-letter. Feeds the sync engine's session-collection so an online-created
	 * session (no local `filloutSessions` row) whose only queued data is trials is
	 * still drained.
	 */
	static async getSessionIdsWithUnsyncedTrials(): Promise<string[]> {
		const [rows, dead] = await Promise.all([
			db.filloutTrials.where('synced').equals(0).toArray(),
			SyncLedger.deadletterClientIds(),
		]);
		const ids = new Set<string>();
		for (const t of rows) if (!dead.has(t.clientId)) ids.add(t.sessionId);
		return [...ids];
	}

	/**
	 * Read a session's local trials for one question (RT-5), synced or not, returning
	 * only the CLEARTEXT measurement columns the offline cohort box needs
	 * (`rtUs` / `correct` / `invalidated`). No decryption — the encrypted `optionId`
	 * answer slot is deliberately not touched, so this stays cheap and side-effect
	 * free on the feedback render path.
	 */
	static async getTrialMeasurements(
		sessionId: string,
		questionId: string
	): Promise<Array<{ rtUs: number | null; correct: boolean | null; invalidated: string | null }>> {
		const rows = await db.filloutTrials.where('sessionId').equals(sessionId).toArray();
		return rows
			.filter((t) => t.questionId === questionId)
			.map((t) => ({
				rtUs: t.rtUs ?? null,
				correct: t.correct ?? null,
				invalidated: t.invalidated ?? null,
			}));
	}

	/** Mark the given trial clientIds synced (ack-driven, E-OFF-4). */
	static async markTrialsSynced(clientIds: string[]): Promise<void> {
		if (clientIds.length === 0) return;
		await db.filloutTrials.where('clientId').anyOf(clientIds).modify({ synced: 1 });
	}

	/**
	 * Record a failed sync attempt against trial rows (E-OFF-5): bumps each row's
	 * `attempts` + `lastError` in lockstep with the ledger dead-letter accounting.
	 */
	static async recordSyncFailure(clientIds: string[], error: string): Promise<void> {
		if (clientIds.length === 0) return;
		for (const clientId of clientIds) {
			await db.filloutTrials
				.where('clientId')
				.equals(clientId)
				.modify((row) => {
					row.attempts = (row.attempts ?? 0) + 1;
					row.lastError = error;
				});
		}
	}

	/**
	 * Raw unsynced trial clientIds for a session, bypassing the checksum-verifying
	 * getter (used by the sync engine's failure-accounting so an already-corrupt row
	 * isn't double-counted). Mirrors the response/event raw reads.
	 */
	static async getUnsyncedTrialClientIds(sessionId: string): Promise<string[]> {
		const rows = await db.filloutTrials.where('[sessionId+synced]').equals([sessionId, 0]).toArray();
		return rows.map((t) => t.clientId);
	}

	/**
	 * Every UNSYNCED trial row across all sessions, decrypted for the export escape
	 * hatch (E-OFF-5). Folded into {@link OfflineResponsePersistence.exportUnsyncedData}.
	 */
	static async exportUnsyncedTrials(): Promise<FilloutTrial[]> {
		const rows = await db.filloutTrials.where('synced').equals(0).toArray();
		return Promise.all(rows.map((t) => this.decryptTrial(t)));
	}
}
