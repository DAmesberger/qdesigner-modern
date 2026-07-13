import { api } from '$lib/services/api';
import { OfflineResponsePersistence, type TimingProvenance } from './OfflineResponsePersistence';
import { FilloutUploadSync } from './FilloutUploadSync';
import type { ResponseData, InteractionEvent } from '$lib/shared/types/response';

/**
 * Convert a performance.now()-domain timestamp (ms since the document's time
 * origin) to a wall-clock ISO string. Returns undefined for absent/invalid
 * values so optional server columns stay null rather than 1970/NaN.
 */
function toIsoFromPerf(perfMs: number | undefined): string | undefined {
	if (perfMs == null || !Number.isFinite(perfMs) || perfMs <= 0) return undefined;
	const origin = typeof performance !== 'undefined' ? performance.timeOrigin : 0;
	return new Date(origin + perfMs).toISOString();
}

/** performance.now()-domain ms → integer microseconds; 0 for absent/invalid input. */
function toMicros(ms: number | undefined): number {
	if (ms == null || !Number.isFinite(ms)) return 0;
	return Math.floor(ms * 1000);
}

export interface PersistenceOptions {
	sessionId: string;
	syncInterval?: number;
}

/**
 * The participant-data write path (ADR 0023 D2).
 *
 * **Every** record — response, interaction event, variable — is written to
 * IndexedDB EXACTLY ONCE, carrying its own `clientId` UUID, and is then drained
 * to the server by {@link FilloutUploadSync}. The server reconciles idempotently
 * via `ON CONFLICT (client_id) DO NOTHING`, so a replayed drain is a no-op.
 *
 * There is deliberately **no** in-memory batching buffer and **no** direct
 * online-submit branch:
 *
 * - An in-memory buffer strands records on tab close (they were never durable)
 *   and — as the pre-fix `eventQueue` + `saveToOfflineStore()` pair proved —
 *   invites re-persisting the whole buffer on every append (event *k* written
 *   *k* times ⇒ k(k+1)/2 rows, each under a FRESH clientId, so the server's
 *   clientId dedup cannot collapse them).
 * - A direct submit path is a SECOND write path: it bypasses the durable store,
 *   drops fields on the snake↔camel boundary, and loses everything in flight on
 *   a disconnect.
 *
 * Batching still happens — in {@link FilloutUploadSync}, which chunks the durable
 * rows on the wire. Durability first, batching second.
 */
export class ResponsePersistenceService {
	private sessionId: string;
	private syncInterval: number;
	private syncTimer?: number;
	private isSyncing = false;
	private syncEngine: FilloutUploadSync;

	constructor(options: PersistenceOptions) {
		this.sessionId = options.sessionId;
		this.syncInterval = options.syncInterval || 5000; // 5 seconds

		// Drains the IndexedDB response/event/variable queue to the server.
		this.syncEngine = new FilloutUploadSync();

		// Start periodic sync
		this.startPeriodicSync();
	}

	/**
	 * Save a response.
	 *
	 * Contract D2 (offline-first): the response is written to IndexedDB first with
	 * a clientId UUID, then a sync is triggered when online.
	 *
	 * **Throws on a failed durable write.** `OfflineResponsePersistence.saveResponse`
	 * raises on quota exhaustion / write-verify mismatch precisely so the runtime can
	 * react; swallowing it here would let a participant advance past an answer that
	 * no longer exists anywhere. The caller ({@link FilloutRuntime.persistResponse})
	 * halts the run and escalates — mirroring the binary-capture contract in ADR 0029,
	 * where a failed capture blocks loudly instead of vanishing.
	 */
	async saveResponse(response: ResponseData): Promise<void> {
		await OfflineResponsePersistence.saveResponse(this.sessionId, {
			questionId: response.questionId,
			value: response.value,
			reactionTimeUs:
				response.reactionTime != null ? Math.floor(response.reactionTime * 1000) : undefined,
			// `stimulusOnset` / `responseTime` are performance.now()-domain
			// timestamps (ms since time origin); convert to wall-clock ISO for
			// the server's `presented_at` / `answered_at` columns.
			presentedAt: toIsoFromPerf(response.stimulusOnset),
			answeredAt: toIsoFromPerf(response.responseTime),
			// C-PROVENANCE (may be undefined): carried on the response metadata
			// blob when the runtime captured it.
			timingProvenance: response.metadata?.timingProvenance as TimingProvenance | undefined,
			// Preserve the raw high-resolution timing so nothing is dropped on
			// the way to the server (only presented/answered/reaction have
			// dedicated columns; the rest survive in metadata).
			metadata: {
				...response.metadata,
				stimulusOnsetUs:
					response.stimulusOnset != null ? Math.floor(response.stimulusOnset * 1000) : undefined,
				responseTimeUs:
					response.responseTime != null ? Math.floor(response.responseTime * 1000) : undefined,
				timeOnQuestionMs: response.timeOnQuestion,
			},
		});

		// Fire-and-forget flush; syncNow() is a no-op while offline and the
		// server dedups on retry, so double-triggering is safe.
		this.triggerSync();
	}

	/**
	 * Save an interaction event.
	 *
	 * Offline-first and write-once (D2): ONE durable IndexedDB row per event, with
	 * its own clientId, drained by {@link FilloutUploadSync}. The event is durable
	 * the moment this resolves — closing the tab afterwards cannot lose it.
	 *
	 * Unlike a response, a failed event write does NOT halt the run: an interaction
	 * event is provenance/telemetry that the participant did not author, so ADR
	 * 0027's principle applies — infrastructure problems record and continue. (The
	 * realistic cause of a failed write, an exhausted quota, will fail the very next
	 * *response* write, which does halt.) The failure is logged loudly, never
	 * silently dropped.
	 */
	async saveInteractionEvent(event: InteractionEvent): Promise<void> {
		try {
			await OfflineResponsePersistence.saveEvent(this.sessionId, {
				eventType: event.eventType,
				questionId: event.questionId ?? undefined,
				timestampUs: toMicros(event.timestamp),
				metadata: this.eventMetadata(event),
			});
		} catch (error) {
			console.error('Failed to persist interaction event:', error as Error);
			return;
		}

		this.triggerSync();
	}

	/**
	 * The non-column fields of an {@link InteractionEvent}, carried on the event's
	 * metadata blob so nothing is dropped on the way to the server (the durable row
	 * has dedicated slots only for type / questionId / timestamp).
	 */
	private eventMetadata(event: InteractionEvent): Record<string, unknown> | undefined {
		const metadata: Record<string, unknown> = {};
		if (event.eventData != null) metadata.eventData = event.eventData;
		if (event.relativeTime != null) metadata.relativeTimeUs = toMicros(event.relativeTime);
		if (event.frameNumber != null) metadata.frameNumber = event.frameNumber;
		if (event.frameTime != null) metadata.frameTime = event.frameTime;
		return Object.keys(metadata).length > 0 ? metadata : undefined;
	}

	/**
	 * Update session progress
	 */
	async updateSessionProgress(data: {
		currentQuestionId?: string;
		currentPageId?: string;
		progressPercentage?: number;
		status?: string;
	}): Promise<void> {
		// Redundant server round-trip on every answer: progress is a client-side/
		// offline concern and FilloutUploadSync materializes sessions at sync time.
		// Only ping the server when online.
		if (!navigator.onLine) return;
		try {
			await api.sessions.update(this.sessionId, {
				...data,
				last_activity_at: new Date().toISOString()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic session update payload
			} as any);
		} catch (error) {
			console.error('Error updating session:', error as Error);
		}
	}

	/**
	 * Mark session as completed
	 */
	async completeSession(): Promise<void> {
		try {
			// Flush any pending data
			await this.syncAll();

			// Update session status
			await api.sessions.update(this.sessionId, {
				status: 'completed',
				completed_at: new Date().toISOString()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic session update payload
			} as any);
		} catch (error) {
			console.error('Error completing session:', error as Error);
		}
	}

	/**
	 * Save a session variable.
	 *
	 * Offline-first (contract D2): the value is written to IndexedDB keyed by
	 * `[sessionId+name]` (an upsert that re-arms synced:0), then a sync is
	 * triggered when online. FilloutUploadSync drains the unsynced variables to
	 * the server — there is no direct online-upsert branch. `type` is accepted
	 * for call-site compatibility but is not persisted (the Dexie row stores the
	 * raw value).
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- scripting context accepts arbitrary values; type kept for call-site compat
	async saveVariable(name: string, value: any, _type: string = 'string'): Promise<void> {
		try {
			await OfflineResponsePersistence.saveVariable(this.sessionId, name, value);

			this.triggerSync();
		} catch (error) {
			console.error('Error saving variable:', error as Error);
		}
	}

	/**
	 * Start periodic sync
	 */
	private startPeriodicSync(): void {
		this.syncTimer = window.setInterval(() => {
			if (!this.isSyncing && navigator.onLine) {
				this.syncAll();
			}
		}, this.syncInterval);
	}

	/**
	 * Trigger a drain of the durable queue. Fire-and-forget: `syncNow()` is a no-op
	 * while offline and the server dedups on replay, so double-triggering is safe
	 * and a sync failure never affects the (already durable) write.
	 */
	private triggerSync(): void {
		if (navigator.onLine) {
			void this.syncEngine.syncNow();
		}
	}

	/**
	 * Drain the durable queue to the server. Every record already lives in
	 * IndexedDB (D2) — there is nothing else to flush.
	 */
	async syncAll(): Promise<void> {
		if (this.isSyncing) return;

		this.isSyncing = true;
		try {
			if (navigator.onLine) {
				await this.syncEngine.syncNow();
			}
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Cleanup and dispose
	 */
	dispose(): void {
		if (this.syncTimer) {
			clearInterval(this.syncTimer);
		}

		// Final sync attempt
		this.syncAll();
	}
}
