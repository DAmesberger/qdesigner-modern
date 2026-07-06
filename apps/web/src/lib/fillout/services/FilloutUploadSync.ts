import { browser } from '$app/environment';
import { api } from '$lib/services/api';
import { OfflineSessionService } from './OfflineSessionService';
import { OfflineResponsePersistence, type StoredFilloutResponse } from './OfflineResponsePersistence';
import { FilloutContentCache } from './FilloutContentCache';
import { db, filloutDefinitionKey, type FilloutSession } from '$lib/services/db/indexeddb';
import type { SyncPayload } from '$lib/api/generated/types.gen';

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
export class FilloutUploadSync {
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

			// Version-pinned definitions whose sessions just drained — nudged below.
			const drainedDefinitionKeys = new Set<string>();

			for (const session of sessions) {
				try {
					const sessionResult = await this.syncSession(session);
					result.sessionsSynced++;
					result.responsesSynced += sessionResult.responsesSynced;
					result.eventsSynced += sessionResult.eventsSynced;
					result.variablesSynced += sessionResult.variablesSynced;
					// A stub (online-created) session has no local definition to refresh.
					if (session.questionnaireId) {
						drainedDefinitionKeys.add(
							filloutDefinitionKey(
								session.questionnaireId,
								session.versionMajor,
								session.versionMinor,
								session.versionPatch
							)
						);
					}
				} catch (err) {
					const msg = err instanceof Error ? err.message : 'Unknown sync error';
					result.errors.push(`Session ${session.id}: ${msg}`);
				}
			}

			// Server-computed variables (server-computed-variable / E-FEEDBACK-3): the
			// cohort just absorbed these completed sessions — fire-and-forget a FORCED
			// refresh (bypassing the client freshness window) so the next run on this
			// device sees updated aggregates. Uploads are already done; never blocks.
			void this.refreshServerVariables(drainedDefinitionKeys);

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
	 * Force-refresh the server-computed variable aggregates for every drained
	 * definition version, reading each version's cached definition to resolve its
	 * declarations. Best-effort: a missing definition row or a failed fetch is
	 * skipped and never surfaces in the sync result.
	 */
	private async refreshServerVariables(definitionKeys: Set<string>): Promise<void> {
		for (const key of definitionKeys) {
			try {
				const row = await db.filloutQuestionnaires.get(key);
				if (!row) continue;
				await FilloutContentCache.cacheServerVariables(
					row.data,
					{ major: row.versionMajor, minor: row.versionMinor, patch: row.versionPatch },
					{ force: true }
				);
			} catch {
				// Best-effort refresh — never affects the upload result.
			}
		}
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
		const payload: SyncPayload = {
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
			// Carry session-creation fields so the server can materialize an
			// OFFLINE-created session (one that exists only locally) at sync time.
			// Omitted for a stub (an online session that already exists on the
			// server and has no local definition to send). This replaces the old
			// ensureServerSession get-probe, which 401'd for anonymous callers and
			// stranded their responses.
			session: session.questionnaireId
				? {
						questionnaire_id: session.questionnaireId,
						participant_id: session.participantId ?? null,
						version_major: session.versionMajor,
						version_minor: session.versionMinor,
						version_patch: session.versionPatch,
						metadata: session.metadata ?? null,
						browser_info: session.browserInfo ?? null,
					}
				: undefined,
		};

		// The sync endpoint is self-sufficient: it upserts the session from the
		// init fields above (idempotent) and is anonymous-capable, so no separate
		// existence probe is needed.
		const result = await api.sessions.sync(session.id, payload);

		// Mark records as synced
		const responseIds = responses.map((r) => r.id).filter((id): id is number => id !== undefined);
		const eventIds = events.map((e) => e.id).filter((id): id is number => id !== undefined);

		if (responseIds.length > 0) await OfflineResponsePersistence.markResponsesSynced(responseIds);
		if (eventIds.length > 0) await OfflineResponsePersistence.markEventsSynced(eventIds);
		if (variables.length > 0) await OfflineResponsePersistence.markVariablesSynced(session.id);

		// Mark session as synced if all data is sent
		await OfflineSessionService.markSynced(session.id);

		// Purge the now-synced participant data from IndexedDB (F005): once the
		// server holds it, sensitive response/event/variable data must not linger
		// on the device. GATED on a COMPLETED session — an in-progress/resumable
		// session keeps its synced responses locally so resume/carry-forward can
		// rehydrate prior answers. purgeSyncedSessionData deletes only synced===1
		// rows, so anything that arrived after this drain (still unsynced) is safe.
		if (session.status === 'completed') {
			await db.purgeSyncedSessionData(session.id);
		}

		return {
			responsesSynced: result.responses_synced ?? 0,
			eventsSynced: result.events_synced ?? 0,
			variablesSynced: result.variables_synced ?? 0,
		};
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
