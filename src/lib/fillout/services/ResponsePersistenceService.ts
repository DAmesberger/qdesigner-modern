import { supabase } from '$lib/services/supabase';
import type { ResponseData, InteractionEvent } from '$lib/types/response';
import type { Session } from '$lib/types/session';

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
		this.enableOffline = options.enableOffline || true;

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
				stimulus_onset_us: response.stimulusOnset ? Math.floor(response.stimulusOnset * 1000) : null,
				response_time_us: response.responseTime ? Math.floor(response.responseTime * 1000) : null,
				reaction_time_us: response.reactionTime ? Math.floor(response.reactionTime * 1000) : null,
				time_on_question_ms: response.timeOnQuestion || null,
				client_timestamp: new Date().toISOString(),
				is_current: true
			};

			if (this.enableOffline && !navigator.onLine) {
				// Queue for later sync
				this.responseQueue.push(enhancedResponse);
				await this.saveToLocalStorage();
			} else {
				// Save immediately
				const { error } = await supabase
					.from('responses')
					.insert(enhancedResponse);

				if (error) {
					console.error('Failed to save response:', error);
					// Queue for retry
					this.responseQueue.push(enhancedResponse);
				}
			}
		} catch (error) {
			console.error('Error saving response:', error);
			if (this.enableOffline) {
				this.responseQueue.push(response);
				await this.saveToLocalStorage();
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
				await this.saveToLocalStorage();
			} else {
				// Batch events for efficiency
				this.eventQueue.push(enhancedEvent);
				
				if (this.eventQueue.length >= this.batchSize) {
					await this.flushEventQueue();
				}
			}
		} catch (error) {
			console.error('Error saving interaction event:', error);
			if (this.enableOffline) {
				this.eventQueue.push(event);
				await this.saveToLocalStorage();
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
			const updates = {
				...data,
				last_activity_at: new Date().toISOString()
			};

			const { error } = await supabase
				.from('sessions')
				.update(updates)
				.eq('id', this.sessionId);

			if (error) {
				console.error('Failed to update session:', error);
			}
		} catch (error) {
			console.error('Error updating session:', error);
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
			const { error } = await supabase
				.from('sessions')
				.update({
					status: 'completed',
					completed_at: new Date().toISOString(),
					progress_percentage: 100
				})
				.eq('id', this.sessionId);

			if (error) {
				console.error('Failed to complete session:', error);
			}
		} catch (error) {
			console.error('Error completing session:', error);
		}
	}

	/**
	 * Save a session variable
	 */
	async saveVariable(name: string, value: any, type: string = 'string'): Promise<void> {
		try {
			const { error } = await supabase
				.from('session_variables')
				.upsert({
					session_id: this.sessionId,
					name,
					value,
					type,
					last_updated_at: new Date().toISOString()
				}, {
					onConflict: 'session_id,name'
				});

			if (error) {
				console.error('Failed to save variable:', error);
			}
		} catch (error) {
			console.error('Error saving variable:', error);
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

			// Load and sync from local storage
			if (this.enableOffline) {
				await this.syncFromLocalStorage();
			}
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
			const { error } = await supabase
				.from('responses')
				.insert(toSync);

			if (error) {
				// Re-queue failed items
				this.responseQueue.push(...toSync);
				console.error('Failed to sync responses:', error);
			}
		} catch (error) {
			// Re-queue on network error
			this.responseQueue.push(...toSync);
			console.error('Error syncing responses:', error);
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
			const { error } = await supabase
				.from('interaction_events')
				.insert(toSync);

			if (error) {
				// Re-queue failed items
				this.eventQueue.push(...toSync);
				console.error('Failed to sync events:', error);
			}
		} catch (error) {
			// Re-queue on network error
			this.eventQueue.push(...toSync);
			console.error('Error syncing events:', error);
		}
	}

	/**
	 * Save queued data to local storage
	 */
	private async saveToLocalStorage(): Promise<void> {
		try {
			const data = {
				sessionId: this.sessionId,
				responses: this.responseQueue,
				events: this.eventQueue,
				timestamp: Date.now()
			};

			localStorage.setItem(
				`qdesigner_offline_${this.sessionId}`,
				JSON.stringify(data)
			);
		} catch (error) {
			console.error('Failed to save to local storage:', error);
		}
	}

	/**
	 * Load and sync data from local storage
	 */
	private async syncFromLocalStorage(): Promise<void> {
		try {
			const key = `qdesigner_offline_${this.sessionId}`;
			const stored = localStorage.getItem(key);
			
			if (!stored) return;

			const data = JSON.parse(stored);
			
			// Add to queues
			if (data.responses?.length > 0) {
				this.responseQueue.push(...data.responses);
				await this.syncResponses();
			}

			if (data.events?.length > 0) {
				this.eventQueue.push(...data.events);
				await this.flushEventQueue();
			}

			// Clear if successful
			if (this.responseQueue.length === 0 && this.eventQueue.length === 0) {
				localStorage.removeItem(key);
			}
		} catch (error) {
			console.error('Failed to sync from local storage:', error);
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