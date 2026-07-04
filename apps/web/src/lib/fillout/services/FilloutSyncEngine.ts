import { browser } from '$app/environment';
import { api } from '$lib/services/api';
import { OfflineSessionService } from './OfflineSessionService';
import { OfflineResponsePersistence, type StoredFilloutResponse } from './OfflineResponsePersistence';
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
			const sessions = await this.collectSessionsToSync();

			for (const session of sessions) {
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
	 * The set of sessions with data to sync: the union of locally-tracked
	 * unsynced sessions AND any session id that has unsynced child records.
	 *
	 * The second half is load-bearing: an online-created session lives only on
	 * the server (no `filloutSessions` row), so it would never appear in
	 * `getUnsyncedSessions()`, yet its responses are queued offline-first. We
	 * also never gate draining on a session's own `synced` flag — new responses
	 * arriving after a session was marked synced are picked up here again.
	 */
	private async collectSessionsToSync(): Promise<FilloutSession[]> {
		const byId = new Map<string, FilloutSession>();

		for (const session of await OfflineSessionService.getUnsyncedSessions()) {
			byId.set(session.id, session);
		}

		const orphanIds = await OfflineResponsePersistence.getSessionIdsWithUnsyncedData();
		for (const id of orphanIds) {
			if (byId.has(id)) continue;
			const row = await OfflineSessionService.getSession(id);
			byId.set(id, row ?? this.stubSession(id));
		}

		return [...byId.values()];
	}

	/**
	 * Minimal session object for an online-created session that has no local
	 * `filloutSessions` row. Only `id`/`status` are load-bearing here: the
	 * server session already exists, so `ensureServerSession` short-circuits on
	 * `api.sessions.get` and never needs the version/questionnaire fields.
	 */
	private stubSession(id: string): FilloutSession {
		return {
			id,
			questionnaireId: '',
			status: 'active',
			versionMajor: 0,
			versionMinor: 0,
			versionPatch: 0,
			createdAt: 0,
			synced: 0,
		};
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
			responses: responses.map((r) => {
				// `timingProvenance` is a widened field on the stored row (not on
				// the base FilloutResponse type); read it via the widened alias.
				const stored = r as StoredFilloutResponse;
				return {
					client_id: r.clientId,
					question_id: r.questionId,
					value: r.value,
					reaction_time_us: r.reactionTimeUs ?? null,
					presented_at: r.presentedAt ?? null,
					answered_at: r.answeredAt ?? null,
					timing_provenance: stored.timingProvenance ?? null,
					metadata: r.metadata ?? null,
				};
			}),
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
			// CRITICAL: the session GET requires an Authorization header, so an
			// ANONYMOUS fillout caller receives 401 here even when the session
			// EXISTS on the server (the common case — an online session is created
			// with the server's id at the fillout entry point). A non-"not found"
			// error is therefore NOT evidence the session is missing: proceed to the
			// sync POST, which is anonymous-capable and idempotent (ON CONFLICT
			// client_id). Rethrowing here strands every anonymous participant's
			// responses locally. Only a definitive "not found" (below) triggers a
			// recreate.
			if (!message.includes('not found')) {
				return;
			}
		}

		// A stub session (online-created, no local row) carries no questionnaire
		// id, so it cannot be recreated. In practice the server session exists and
		// the `get` above already returned; reaching here means the record is
		// genuinely orphaned — surface it rather than POSTing an invalid create.
		if (!session.questionnaireId) {
			throw new Error(`Session ${session.id} not found on server and has no local definition to recreate it`);
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
