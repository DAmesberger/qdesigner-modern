import { api } from '$lib/services/api';
import { OfflineResponsePersistence, type TimingProvenance } from './OfflineResponsePersistence';
import { FilloutSyncEngine } from './FilloutSyncEngine';
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

export interface PersistenceOptions {
	sessionId: string;
	batchSize?: number;
	syncInterval?: number;
	enableOffline?: boolean;
}

export class ResponsePersistenceService {
	private sessionId: string;
	private batchSize: number;
	private syncInterval: number;
	private enableOffline: boolean;
	private eventQueue: InteractionEvent[] = [];
	private syncTimer?: number;
	private isSyncing = false;
	private syncEngine: FilloutSyncEngine;

	constructor(options: PersistenceOptions) {
		this.sessionId = options.sessionId;
		this.batchSize = options.batchSize || 10;
		this.syncInterval = options.syncInterval || 5000; // 5 seconds
		this.enableOffline = options.enableOffline ?? true;

		// Drains the IndexedDB response/event/variable queue to the server.
		this.syncEngine = new FilloutSyncEngine();

		// Start periodic sync
		this.startPeriodicSync();
	}

	/**
	 * Save a response.
	 *
	 * Contract D2 (offline-first): every response is written to IndexedDB first
	 * with a clientId UUID, then a sync is triggered when online. The server
	 * reconciles idempotently via `ON CONFLICT (client_id) DO NOTHING`, so there
	 * is a single result path — no direct online-submit branch.
	 */
	async saveResponse(response: ResponseData): Promise<void> {
		try {
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
			if (navigator.onLine) {
				void this.syncEngine.syncNow();
			}
		} catch (error) {
			console.error('Error saving response:', error as Error);
		}
	}

	/**
	 * Save an interaction event
	 */
	async saveInteractionEvent(event: InteractionEvent): Promise<void> {
		try {
			const enhancedEvent = {
				...event,
				session_id: this.sessionId,
				timestamp_us: Math.floor(event.timestamp * 1000),
				relative_time_us: event.relativeTime ? Math.floor(event.relativeTime * 1000) : null,
				created_at: new Date().toISOString()
			};

			if (this.enableOffline && !navigator.onLine) {
				this.eventQueue.push(enhancedEvent);
				await this.saveToOfflineStore();
			} else {
				// Batch events for efficiency
				this.eventQueue.push(enhancedEvent);

				if (this.eventQueue.length >= this.batchSize) {
					await this.flushEventQueue();
				}
			}
		} catch (error) {
			console.error('Error saving interaction event:', error as Error);
			if (this.enableOffline) {
				this.eventQueue.push(event);
				await this.saveToOfflineStore();
			}
		}
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
	 * Save a session variable
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- scripting context accepts arbitrary values
	async saveVariable(name: string, value: any, type: string = 'string'): Promise<void> {
		try {
			await api.sessions.upsertVariable(this.sessionId, {
				name,
				value,
				valueType: type,
				source: 'script'
			});
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
	 * Sync all queued data
	 */
	async syncAll(): Promise<void> {
		if (this.isSyncing) return;

		this.isSyncing = true;
		try {
			// Sync events
			if (this.eventQueue.length > 0) {
				await this.flushEventQueue();
			}

			// Responses/variables persist to IndexedDB and are drained to the
			// server by FilloutSyncEngine (the single response pipeline, D2).
			if (navigator.onLine) {
				await this.syncEngine.syncNow();
			}
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Flush event queue
	 */
	private async flushEventQueue(): Promise<void> {
		const toSync = [...this.eventQueue];
		this.eventQueue = [];

		if (toSync.length === 0) return;

		try {
			await api.sessions.submitEvents(this.sessionId, toSync);
		} catch (error) {
			// Re-queue failed items
			this.eventQueue.push(...toSync);
			console.error('Failed to sync events:', error as Error);
		}
	}

	/**
	 * Persist queued events to IndexedDB (via OfflineResponsePersistence).
	 * This ensures the FilloutSyncEngine can pick it up for later sync.
	 * Responses take the offline-first path directly in {@link saveResponse}.
	 */
	private async saveToOfflineStore(): Promise<void> {
		try {
			for (const evt of this.eventQueue) {
				await OfflineResponsePersistence.saveEvent(this.sessionId, {
					eventType: evt.eventType,
					questionId: evt.questionId ?? undefined,
					timestampUs: Math.floor(evt.timestamp * 1000),
					metadata: evt.eventData != null ? { eventData: evt.eventData } : undefined,
				});
			}
		} catch (error) {
			console.error('Failed to save to IndexedDB:', error as Error);
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
