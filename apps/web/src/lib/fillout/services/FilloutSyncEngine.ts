import { browser } from '$app/environment';
import { api } from '$lib/services/api';
import { OfflineSessionService } from './OfflineSessionService';
import { OfflineResponsePersistence } from './OfflineResponsePersistence';
import type { FilloutSession } from '$lib/services/db/indexeddb';

export interface SyncResult {
	sessionsSynced: number;
	responsesSynced: number;
	eventsSynced: number;
	variablesSynced: number;
	errors: string[];
}

/**
 * Watches online/offline status and syncs fillout data when connectivity returns.
 * Uses exponential backoff on failure.
 */
export class FilloutSyncEngine {
	private onlineHandler: (() => void) | null = null;
	private isSyncing = false;
	private retryTimeout: ReturnType<typeof setTimeout> | null = null;
	private retryDelay = 1000; // Start at 1s, exponential backoff
	private maxRetryDelay = 60000; // Max 60s
	private onSyncComplete?: (result: SyncResult) => void;
	private onSyncStart?: () => void;

	constructor(options?: {
		onSyncComplete?: (result: SyncResult) => void;
		onSyncStart?: () => void;
	}) {
		this.onSyncComplete = options?.onSyncComplete;
		this.onSyncStart = options?.onSyncStart;
	}

	/**
	 * Start watching for connectivity changes.
	 */
	start(): void {
		if (!browser) return;

		this.onlineHandler = () => {
			this.retryDelay = 1000; // Reset backoff
			this.syncNow();
		};

		window.addEventListener('online', this.onlineHandler);

		// Attempt initial sync if online
		if (navigator.onLine) {
			this.syncNow();
		}
	}

	/**
	 * Stop watching.
	 */
	stop(): void {
		if (this.onlineHandler) {
			window.removeEventListener('online', this.onlineHandler);
			this.onlineHandler = null;
		}
		if (this.retryTimeout) {
			clearTimeout(this.retryTimeout);
			this.retryTimeout = null;
		}
	}

	/**
	 * Manual sync trigger.
	 */
	async syncNow(): Promise<SyncResult> {
		if (this.isSyncing || !navigator.onLine) {
			return { sessionsSynced: 0, responsesSynced: 0, eventsSynced: 0, variablesSynced: 0, errors: [] };
		}

		this.isSyncing = true;
		this.onSyncStart?.();

		const result: SyncResult = {
			sessionsSynced: 0,
			responsesSynced: 0,
			eventsSynced: 0,
			variablesSynced: 0,
			errors: [],
		};

		try {
			const unsyncedSessions = await OfflineSessionService.getUnsyncedSessions();

			for (const session of unsyncedSessions) {
				try {
					const sessionResult = await this.syncSession(session);
					result.sessionsSynced++;
					result.responsesSynced += sessionResult.responsesSynced;
					result.eventsSynced += sessionResult.eventsSynced;
					result.variablesSynced += sessionResult.variablesSynced;
				} catch (err) {
					const msg = err instanceof Error ? err.message : 'Unknown sync error';
					result.errors.push(`Session ${session.id}: ${msg}`);
				}
			}

			// Reset backoff on success
			this.retryDelay = 1000;
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Sync failed';
			result.errors.push(msg);

			// Schedule retry with exponential backoff
			this.scheduleRetry();
		} finally {
			this.isSyncing = false;
			this.onSyncComplete?.(result);
		}

		return result;
	}

	/**
	 * Sync a single session's data to the backend.
	 */
	private async syncSession(session: FilloutSession): Promise<{
		responsesSynced: number;
		eventsSynced: number;
		variablesSynced: number;
	}> {
		const responses = await OfflineResponsePersistence.getUnsyncedResponses(session.id);
		const events = await OfflineResponsePersistence.getUnsyncedEvents(session.id);
		const variables = await OfflineResponsePersistence.getUnsyncedVariables(session.id);

		// Build sync payload
		const payload = {
			responses: responses.map((r) => ({
				client_id: r.clientId,
				question_id: r.questionId,
				value: r.value,
				reaction_time_us: r.reactionTimeUs ?? null,
				presented_at: r.presentedAt ?? null,
				answered_at: r.answeredAt ?? null,
				metadata: r.metadata ?? null,
			})),
			events: events.map((e) => ({
				client_id: e.clientId,
				event_type: e.eventType,
				question_id: e.questionId ?? null,
				timestamp_us: e.timestampUs,
				metadata: e.metadata ?? null,
			})),
			variables: variables.map((v) => ({
				variable_name: v.name,
				variable_value: v.value,
			})),
			status: session.status === 'completed' ? 'completed' : undefined,
		};

		// First ensure the session exists on the server
		await this.ensureServerSession(session);

		// Sync data via the bulk sync endpoint
		const result = await api.sessions.sync(session.id, payload);

		// Mark records as synced
		const responseIds = responses.map((r) => r.id).filter((id): id is number => id !== undefined);
		const eventIds = events.map((e) => e.id).filter((id): id is number => id !== undefined);

		if (responseIds.length > 0) await OfflineResponsePersistence.markResponsesSynced(responseIds);
		if (eventIds.length > 0) await OfflineResponsePersistence.markEventsSynced(eventIds);
		if (variables.length > 0) await OfflineResponsePersistence.markVariablesSynced(session.id);

		// Mark session as synced if all data is sent
		await OfflineSessionService.markSynced(session.id);

		return {
			responsesSynced: result.responses_synced ?? 0,
			eventsSynced: result.events_synced ?? 0,
			variablesSynced: result.variables_synced ?? 0,
		};
	}

	/**
	 * Ensure the session exists on the server (create if not).
	 */
	private async ensureServerSession(session: FilloutSession): Promise<void> {
		try {
			await api.sessions.get(session.id);
			return;
		} catch (error) {
			const message = error instanceof Error ? error.message.toLowerCase() : '';
			if (!message.includes('not found')) {
				throw error;
			}
		}

		await api.sessions.create({
			questionnaireId: session.questionnaireId,
			participantId: session.participantId ?? undefined,
			metadata: session.metadata,
			browserInfo: session.browserInfo as Record<string, unknown> | undefined,
			versionMajor: session.versionMajor ?? undefined,
			versionMinor: session.versionMinor ?? undefined,
			versionPatch: session.versionPatch ?? undefined,
		});
	}

	private scheduleRetry(): void {
		if (this.retryTimeout) clearTimeout(this.retryTimeout);

		this.retryTimeout = setTimeout(() => {
			if (navigator.onLine) {
				this.syncNow();
			}
		}, this.retryDelay);

		// Exponential backoff
		this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
	}
}
