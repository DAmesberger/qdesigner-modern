import { api } from '$lib/services/api';
import { OfflineResponsePersistence } from './OfflineResponsePersistence';
import type { ResponseData, InteractionEvent } from '$lib/types/response';

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
	private responseQueue: ResponseData[] = [];
	private eventQueue: InteractionEvent[] = [];
	private syncTimer?: number;
	private isSyncing = false;

	constructor(options: PersistenceOptions) {
		this.sessionId = options.sessionId;
		this.batchSize = options.batchSize || 10;
		this.syncInterval = options.syncInterval || 5000; // 5 seconds
		this.enableOffline = options.enableOffline ?? true;

		// Start periodic sync
		this.startPeriodicSync();
	}

	/**
	 * Save a response to the database
	 */
	async saveResponse(response: ResponseData): Promise<void> {
		try {
			// Add microsecond timestamp
			const enhancedResponse = {
				...response,
				session_id: this.sessionId,
				stimulus_onset_us: response.stimulusOnset != null ? Math.floor(response.stimulusOnset * 1000) : null,
				response_time_us: response.responseTime != null ? Math.floor(response.responseTime * 1000) : null,
				reaction_time_us: response.reactionTime != null ? Math.floor(response.reactionTime * 1000) : null,
				time_on_question_ms: response.timeOnQuestion ?? null,
				client_timestamp: new Date().toISOString(),
				is_current: true
			};

			if (this.enableOffline && !navigator.onLine) {
				// Queue for later sync
				this.responseQueue.push(enhancedResponse);
				await this.saveToOfflineStore();
			} else {
				try {
					await api.sessions.submitResponses(this.sessionId, [enhancedResponse]);
				} catch (err) {
					console.error('Failed to save response:', err);
					// Queue for retry
					this.responseQueue.push(enhancedResponse);
				}
			}
		} catch (error) {
			console.error('Error saving response:', error as Error);
			if (this.enableOffline) {
				this.responseQueue.push(response);
				await this.saveToOfflineStore();
			}
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
			// Sync responses
			if (this.responseQueue.length > 0) {
				await this.syncResponses();
			}

			// Sync events
			if (this.eventQueue.length > 0) {
				await this.flushEventQueue();
			}

			// Note: IndexedDB offline data is synced by FilloutSyncEngine (single pipeline)
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Sync queued responses
	 */
	private async syncResponses(): Promise<void> {
		const toSync = [...this.responseQueue];
		this.responseQueue = [];

		if (toSync.length === 0) return;

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic response payload
			await api.sessions.submitResponses(this.sessionId, toSync as any);
		} catch (error) {
			// Re-queue failed items
			this.responseQueue.push(...toSync);
			console.error('Failed to sync responses:', error as Error);
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
	 * Persist queued data to IndexedDB (via OfflineResponsePersistence).
	 * This ensures the FilloutSyncEngine can pick it up for later sync.
	 */
	private async saveToOfflineStore(): Promise<void> {
		try {
			for (const resp of this.responseQueue) {
				await OfflineResponsePersistence.saveResponse(this.sessionId, {
					questionId: resp.questionId,
					value: resp.value,
					reactionTimeUs: resp.reactionTime != null ? Math.floor(resp.reactionTime * 1000) : undefined,
					metadata: resp.metadata,
				});
			}
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
