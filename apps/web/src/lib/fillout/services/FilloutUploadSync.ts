import { browser } from '$app/environment';
import { api } from '$lib/services/api';
import { OfflineSessionService } from './OfflineSessionService';
import { OfflineResponsePersistence, type StoredFilloutResponse } from './OfflineResponsePersistence';
import { OfflineTrialPersistence } from './OfflineTrialPersistence';
import { OfflineBinaryPersistence } from './OfflineBinaryPersistence';
import { SyncLedger } from './integrity/SyncLedger';
import { FilloutContentCache } from './FilloutContentCache';
import { db, filloutDefinitionKey, type FilloutSession, type FilloutResponse, type FilloutEvent, type FilloutVariable, type FilloutTrial } from '$lib/services/db/indexeddb';
import type { SyncPayload, SyncTrialItem } from '$lib/api/generated/types.gen';

/**
 * Structured sync outcome (E-OFF-4, surfaced to the page for E-OFF-6). Beyond the
 * per-store counts it carries how the drain actually went: how many HTTP chunks
 * were issued, how many records the server durably ACCEPTED, how many were
 * REJECTED (not acked → still queued), and whether a retry was scheduled.
 */
export interface SyncResult {
	sessionsSynced: number;
	responsesSynced: number;
	eventsSynced: number;
	variablesSynced: number;
	/** Total per-trial rows (RT-1b) the server freshly inserted across all sessions. */
	trialsSynced: number;
	/** Total `POST /sync` HTTP calls issued across all sessions (large runs chunk). */
	chunks: number;
	/** Total client_ids (responses + events) the server durably acknowledged. */
	accepted: number;
	/** Total sent response/event records NOT acknowledged — retried next pass. */
	rejected: number;
	/** True when a backoff retry was scheduled (an error, or unacked records remain). */
	retriable: boolean;
	errors: string[];
}

/**
 * Max response/event records per `POST /sync` call. A large reaction run can queue
 * thousands of rows offline; splitting into bounded chunks keeps each request well
 * under the server body limit and lets the ack-driven marker flip only what each
 * chunk durably wrote. Server-side each chunk is further split into multi-row
 * INSERT statements (SYNC_BATCH_ROWS), so this only bounds the HTTP body.
 */
const SYNC_CHUNK_SIZE = 200;

function chunkArray<T>(items: T[], size: number): T[][] {
	if (items.length === 0) return [];
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

/**
 * Watches online/offline status and syncs fillout data when connectivity returns.
 * Uses jittered exponential backoff on failure and, where available, a cross-tab
 * Web Lock so many tabs coming online at once don't stampede the same rows.
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
			// Thundering-herd guard (E-OFF-4): stagger the reconnect kick by a small
			// random delay so N tabs regaining connectivity in the same instant don't
			// all fire syncNow synchronously (the cross-tab lock then serializes them).
			const jitter = Math.random() * 500;
			setTimeout(() => {
				if (navigator.onLine) this.syncNow();
			}, jitter);
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

	private emptyResult(): SyncResult {
		return {
			sessionsSynced: 0,
			responsesSynced: 0,
			eventsSynced: 0,
			variablesSynced: 0,
			trialsSynced: 0,
			chunks: 0,
			accepted: 0,
			rejected: 0,
			retriable: false,
			errors: [],
		};
	}

	/**
	 * Manual sync trigger. When the Web Locks API is available, the actual drain
	 * runs under an exclusive `fillout-upload-sync` lock acquired with `ifAvailable`
	 * — a tab that can't get the lock (another tab is already draining) returns an
	 * empty result immediately rather than racing on the same client_ids.
	 */
	async syncNow(): Promise<SyncResult> {
		if (this.isSyncing || !navigator.onLine) {
			return this.emptyResult();
		}

		const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
		if (locks && typeof locks.request === 'function') {
			const result = await locks.request(
				'fillout-upload-sync',
				{ ifAvailable: true },
				async (lock) => (lock ? this.drain() : this.emptyResult())
			);
			return result as SyncResult;
		}

		return this.drain();
	}

	/**
	 * Drain every session with unsynced data. Per-session failures are isolated:
	 * one failing session flags a backoff retry and never blocks the others, and
	 * only fully-acked sessions flip their session-synced flag.
	 */
	private async drain(): Promise<SyncResult> {
		// Re-check inside the lock: another path may have started while we waited.
		if (this.isSyncing) {
			return this.emptyResult();
		}
		this.isSyncing = true;
		this.onSyncStart?.();

		const result = this.emptyResult();
		let needsRetry = false;

		try {
			const sessions = await this.collectSessionsToSync();

			// Version-pinned definitions whose sessions just drained — nudged below.
			const drainedDefinitionKeys = new Set<string>();

			for (const session of sessions) {
				try {
					// E-OFF-5: reconcile locally-acked-but-server-missing rows BEFORE
					// draining, so an over-marked record is re-queued and shipped in this
					// same pass. Best-effort: reconcile short-circuits with no server call
					// when the session has no acked ledger rows, and any failure here must
					// never block the actual upload.
					try {
						await SyncLedger.reconcile(session.id);
					} catch (reconcileErr) {
						console.warn(`[FilloutUploadSync] reconcile skipped for ${session.id}:`, reconcileErr);
					}
					const sessionResult = await this.syncSession(session);
					result.sessionsSynced++;
					result.responsesSynced += sessionResult.responsesSynced;
					result.eventsSynced += sessionResult.eventsSynced;
					result.variablesSynced += sessionResult.variablesSynced;
					result.trialsSynced += sessionResult.trialsSynced;
					result.chunks += sessionResult.chunks;
					result.accepted += sessionResult.accepted;
					result.rejected += sessionResult.rejected;
					// A still-pending binary (upload failed, or its response isn't committed
					// yet) must schedule another pass so the blob is retried (issue #34).
					if (sessionResult.rejected > 0 || sessionResult.binariesPending > 0) needsRetry = true;
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
					// Per-session retry (E-OFF-4): a single failing session must back off
					// independently rather than stranding its data until the next
					// online/periodic tick. Flag it; one scheduleRetry fires below so
					// concurrent failures don't over-double the backoff.
					needsRetry = true;
					// E-OFF-5: a session that errored out (e.g. repeated 500s) burns a sync
					// attempt against every record it was trying to ship, so a permanently-
					// failing row eventually reaches dead-letter (and a visible alert)
					// instead of retrying forever with no escalation. Best-effort.
					try {
						await this.registerSessionFailure(session.id, msg);
						// Once nothing shippable remains (every record escalated to
						// dead-letter/corrupt), stop re-materializing this session — the
						// session-init call would otherwise 404/500 forever (e.g. its
						// questionnaire was deleted server-side) and never let the retry loop
						// settle. The escalated records survive on disk (synced=0) for the
						// export escape hatch; only the futile retry is dropped.
						await this.escalateSessionIfFullyDead(session);
					} catch (ledgerErr) {
						console.warn(`[FilloutUploadSync] failure-accounting skipped for ${session.id}:`, ledgerErr);
					}
				}
			}

			// Server-computed variables (server-computed-variable / E-FEEDBACK-3): the
			// cohort just absorbed these completed sessions — fire-and-forget a FORCED
			// refresh (bypassing the client freshness window) so the next run on this
			// device sees updated aggregates. Uploads are already done; never blocks.
			void this.refreshServerVariables(drainedDefinitionKeys);

			if (needsRetry) {
				result.retriable = true;
				this.scheduleRetry();
			} else {
				// Full success — reset backoff.
				this.retryDelay = 1000;
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Sync failed';
			result.errors.push(msg);
			result.retriable = true;

			// Schedule retry with jittered exponential backoff
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
		// A session whose response already synced (as `pending`) but whose binary
		// upload has not landed yet has no unsynced child record — pull it back in so
		// the blob is retried and the response is patched to its mediaUrl (issue #34).
		const binaryIds = await OfflineBinaryPersistence.getSessionIdsWithPendingBinaries();
		for (const id of [...orphanIds, ...binaryIds]) {
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

	private buildResponseItem(r: FilloutResponse): SyncPayload['responses'][number] {
		// `timingProvenance` is a widened field on the stored row (not on the base
		// FilloutResponse type); read it via the widened alias.
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
	}

	private buildEventItem(e: FilloutEvent): SyncPayload['events'][number] {
		return {
			client_id: e.clientId,
			event_type: e.eventType,
			question_id: e.questionId ?? null,
			timestamp_us: e.timestampUs,
			metadata: e.metadata ?? null,
		};
	}

	private buildTrialItem(t: FilloutTrial): SyncTrialItem {
		// `t.optionId` is already decrypted by getUnsyncedTrials; coerce to the wire
		// shape (string | null). The server's `trials` columns are snake_case.
		return {
			client_id: t.clientId,
			question_id: t.questionId,
			trial_index: t.trialIndex,
			option_id: (t.optionId as string | null) ?? null,
			source: t.source ?? null,
			rt_us: t.rtUs ?? null,
			correct: t.correct ?? null,
			sampled_timings: t.sampledTimings ?? null,
			provenance: t.provenance ?? null,
			invalidated: t.invalidated ?? null,
		};
	}

	/**
	 * Sync a single session's data to the backend, CHUNKED (E-OFF-4). Responses and
	 * events are split into `SYNC_CHUNK_SIZE` batches and uploaded over as many
	 * `POST /sync` calls as needed; the session-init (offline materialization) and
	 * variables ride the FIRST chunk, and the completed-status update rides the LAST
	 * so quota-claim/purge only fire once every record has landed.
	 *
	 * Marking is ACK-DRIVEN: a row flips to `synced=1` only if the server echoed its
	 * `client_id` in `accepted_client_ids` (falling back to marking all sent when an
	 * older server omits the field). Rows the server did not acknowledge stay queued
	 * for the next pass, and the session-synced flag / purge only fire when the whole
	 * session drained with zero rejects.
	 */
	private async syncSession(session: FilloutSession): Promise<{
		responsesSynced: number;
		eventsSynced: number;
		variablesSynced: number;
		trialsSynced: number;
		chunks: number;
		accepted: number;
		rejected: number;
		binariesPending: number;
	}> {
		// Binary answers (issue #34) drain FIRST: each pending blob is uploaded via the
		// session media endpoint and the paired response is patched to its mediaUrl and
		// re-armed (synced=0). Running this before reading the unsynced responses means a
		// just-patched response ships its mediaUrl in the SAME pass.
		const binariesPending = await this.uploadSessionBinaries(session.id);

		const responses = await OfflineResponsePersistence.getUnsyncedResponses(session.id);
		const events = await OfflineResponsePersistence.getUnsyncedEvents(session.id);
		const variables = await OfflineResponsePersistence.getUnsyncedVariables(session.id);
		const trials = await OfflineTrialPersistence.getUnsyncedTrials(session.id);

		const sessionInit: SyncPayload['session'] = session.questionnaireId
			? {
					questionnaire_id: session.questionnaireId,
					participant_id: session.participantId ?? null,
					version_major: session.versionMajor,
					version_minor: session.versionMinor,
					version_patch: session.versionPatch,
					metadata: session.metadata ?? null,
					browser_info: session.browserInfo ?? null,
				}
			: undefined;
		const completed = session.status === 'completed';

		const respChunks = chunkArray(responses, SYNC_CHUNK_SIZE);
		const evtChunks = chunkArray(events, SYNC_CHUNK_SIZE);
		const trialChunks = chunkArray(trials, SYNC_CHUNK_SIZE);
		// At least one call: an empty-child session still needs to push its
		// session-init and/or a completed-status update.
		const numChunks = Math.max(respChunks.length, evtChunks.length, trialChunks.length, 1);

		let responsesSynced = 0;
		let eventsSynced = 0;
		let variablesSynced = 0;
		let trialsSynced = 0;

		// Ack-driven marking state, accumulated across chunks.
		const acceptedIds = new Set<string>();
		// Variable acks: names the server durably upserted, paired with the clientId
		// we sent (the concurrency token markVariablesSynced checks). Undefined until
		// the first chunk resolves; stays undefined when the server omits the field so
		// we fall back to the legacy mark-all-by-session.
		let acceptedVarNames: { name: string; clientId?: string }[] | undefined;
		let variablesAckLegacy = false;

		for (let i = 0; i < numChunks; i++) {
			const respSlice = respChunks[i] ?? [];
			const evtSlice = evtChunks[i] ?? [];
			const trialSlice = trialChunks[i] ?? [];
			const isFirst = i === 0;
			const isLast = i === numChunks - 1;

			const payload: SyncPayload = {
				responses: respSlice.map((r) => this.buildResponseItem(r)),
				events: evtSlice.map((e) => this.buildEventItem(e)),
				// Per-trial rows (RT-1b) ride the same chunked batch as responses/events.
				trials: trialSlice.map((t) => this.buildTrialItem(t)),
				// Variables + session-init on the first chunk only; status on the last.
				variables: isFirst
					? variables.map((v) => ({ variable_name: v.name, variable_value: v.value }))
					: [],
				status: isLast && completed ? 'completed' : undefined,
				// The sync endpoint upserts the session from these init fields
				// (idempotent) and is anonymous-capable, so no separate probe is needed.
				session: isFirst ? sessionInit : undefined,
			};

			const result = await api.sessions.sync(session.id, payload);

			responsesSynced += result.responses_synced ?? 0;
			eventsSynced += result.events_synced ?? 0;
			variablesSynced += result.variables_synced ?? 0;
			trialsSynced += result.trials_synced ?? 0;

			if (result.accepted_client_ids === undefined) {
				// Legacy server: treat everything sent in this chunk as accepted.
				for (const r of respSlice) acceptedIds.add(r.clientId);
				for (const e of evtSlice) acceptedIds.add(e.clientId);
				for (const t of trialSlice) acceptedIds.add(t.clientId);
			} else {
				for (const cid of result.accepted_client_ids) acceptedIds.add(cid);
			}

			if (isFirst && variables.length > 0) {
				if (result.accepted_variable_names === undefined) {
					variablesAckLegacy = true;
				} else {
					acceptedVarNames = result.accepted_variable_names.map((name) => ({
						name,
						clientId: variables.find((v: FilloutVariable) => v.name === name)?.clientId,
					}));
				}
			}
		}

		// Mark by the ack set — only rows the server durably holds.
		const responseIds = responses
			.filter((r) => acceptedIds.has(r.clientId))
			.map((r) => r.id)
			.filter((id): id is number => id !== undefined);
		const eventIds = events
			.filter((e) => acceptedIds.has(e.clientId))
			.map((e) => e.id)
			.filter((id): id is number => id !== undefined);

		// Trials are keyed by their clientId (PK), so mark by the acked clientId set.
		const acceptedTrialClientIds = trials
			.filter((t) => acceptedIds.has(t.clientId))
			.map((t) => t.clientId);

		if (responseIds.length > 0) await OfflineResponsePersistence.markResponsesSynced(responseIds);
		if (eventIds.length > 0) await OfflineResponsePersistence.markEventsSynced(eventIds);
		if (acceptedTrialClientIds.length > 0)
			await OfflineTrialPersistence.markTrialsSynced(acceptedTrialClientIds);
		if (variables.length > 0) {
			if (variablesAckLegacy) {
				await OfflineResponsePersistence.markVariablesSynced(session.id);
			} else {
				await OfflineResponsePersistence.markVariablesSynced(session.id, acceptedVarNames ?? []);
			}
		}

		// E-OFF-5: mirror the ack/attempt decision into the integrity ledger. Acked
		// clientIds → `acked`; sent-but-unacked → an attempt (dead-lettering after K)
		// so a row the server keeps silently dropping is escalated, not retried
		// forever. Variable clientIds are acked from the server-echoed names.
		const rejectedResponseClientIds = responses
			.filter((r) => !acceptedIds.has(r.clientId))
			.map((r) => r.clientId);
		const rejectedEventClientIds = events
			.filter((e) => !acceptedIds.has(e.clientId))
			.map((e) => e.clientId);
		const rejectedTrialClientIds = trials
			.filter((t) => !acceptedIds.has(t.clientId))
			.map((t) => t.clientId);
		const ackedVarClientIds = variablesAckLegacy
			? variables.map((v) => v.clientId).filter((c): c is string => !!c)
			: (acceptedVarNames ?? [])
					.map((a) => a.clientId)
					.filter((c): c is string => !!c);

		await SyncLedger.markAcked([...acceptedIds, ...ackedVarClientIds]);
		const rejectedClientIds = [
			...rejectedResponseClientIds,
			...rejectedEventClientIds,
			...rejectedTrialClientIds,
		];
		if (rejectedClientIds.length > 0) {
			await SyncLedger.markAttempt(rejectedClientIds, 'server did not acknowledge record');
			await OfflineResponsePersistence.recordSyncFailure(
				'response',
				rejectedResponseClientIds,
				'server did not acknowledge record'
			);
			await OfflineResponsePersistence.recordSyncFailure(
				'event',
				rejectedEventClientIds,
				'server did not acknowledge record'
			);
			await OfflineTrialPersistence.recordSyncFailure(
				rejectedTrialClientIds,
				'server did not acknowledge record'
			);
		}

		const rejected =
			responses.length -
			responseIds.length +
			(events.length - eventIds.length) +
			(trials.length - acceptedTrialClientIds.length);

		// Only claim the session fully drained when nothing was left unacked AND no
		// binary answer is still pending (issue #34). A partial drain leaves the
		// session-synced flag at 0 so the next pass revisits it, and skips the
		// destructive purge so unacked rows — and the response rows a pending binary
		// still needs patched — survive.
		if (rejected === 0 && binariesPending === 0) {
			await OfflineSessionService.markSynced(session.id);

			// Purge the now-synced participant data from IndexedDB (F005): once the
			// server holds it, sensitive response/event/variable data must not linger
			// on the device. GATED on a COMPLETED session — an in-progress/resumable
			// session keeps its synced responses locally so resume/carry-forward can
			// rehydrate prior answers. purgeSyncedSessionData deletes only synced===1
			// rows, so anything that arrived after this drain (still unsynced) is safe.
			if (completed) {
				await db.purgeSyncedSessionData(session.id);
			}
		}

		return {
			responsesSynced,
			eventsSynced,
			variablesSynced,
			trialsSynced,
			chunks: numChunks,
			accepted: acceptedIds.size,
			rejected,
			binariesPending,
		};
	}

	/**
	 * Upload every pending binary answer for a session (issue #34) and patch its
	 * paired response value to `{status:'uploaded', mediaUrl}`. Idempotent and
	 * offline-safe:
	 *  - A blob already uploaded (its `mediaUrl` was stored on the row) is never
	 *    re-uploaded; only the patch is retried.
	 *  - The pinned blob is deleted ONLY once its response is patched — so a blob
	 *    captured but not yet committed to a response (participant hasn't advanced)
	 *    survives, and the patch lands on a later pass.
	 *  - A failed upload records the failure and keeps the blob pinned for retry.
	 * Returns the number of binaries STILL pending after this pass.
	 */
	private async uploadSessionBinaries(sessionId: string): Promise<number> {
		const pending = await OfflineBinaryPersistence.getPending(sessionId);
		for (const bin of pending) {
			try {
				let mediaUrl = bin.mediaUrl;
				if (!mediaUrl) {
					const blob = OfflineBinaryPersistence.toBlob(bin);
					const result = await api.sessions.uploadMedia(sessionId, blob, bin.name);
					mediaUrl = result.url;
					// Remember the URL so a patch-only retry never re-uploads the bytes.
					await db.filloutBinaries.update(bin.clientId, { mediaUrl });
				}
				const patched = await OfflineResponsePersistence.patchBinaryResponse(
					sessionId,
					bin.clientId,
					mediaUrl
				);
				if (patched) {
					// Server durably holds the bytes and the response now points at them.
					await OfflineBinaryPersistence.delete(bin.clientId);
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : 'binary upload failed';
				await OfflineBinaryPersistence.recordFailure(bin.clientId, msg);
			}
		}
		return OfflineBinaryPersistence.countPending(sessionId);
	}

	/**
	 * Burn a sync attempt against every still-unsynced record of a session that
	 * errored out mid-drain (E-OFF-5). Reads the raw unsynced clientIds (bypassing
	 * the checksum-verifying getters so an already-corrupt row isn't double-counted)
	 * and records one attempt each — a record the server keeps 500ing on eventually
	 * dead-letters with a visible alert rather than retrying forever in silence.
	 */
	private async registerSessionFailure(sessionId: string, error: string): Promise<void> {
		const [responses, events, variables, trialClientIds] = await Promise.all([
			db.filloutResponses.where('[sessionId+synced]').equals([sessionId, 0]).toArray(),
			db.filloutEvents.where('[sessionId+synced]').equals([sessionId, 0]).toArray(),
			db.filloutVariables.where('sessionId').equals(sessionId).filter((v) => v.synced === 0).toArray(),
			OfflineTrialPersistence.getUnsyncedTrialClientIds(sessionId),
		]);
		const responseClientIds = responses.map((r) => r.clientId);
		const eventClientIds = events.map((e) => e.clientId);
		const variableClientIds = variables
			.map((v) => v.clientId)
			.filter((c): c is string => !!c);

		await SyncLedger.markAttempt(
			[...responseClientIds, ...eventClientIds, ...variableClientIds, ...trialClientIds],
			error
		);
		await OfflineResponsePersistence.recordSyncFailure('response', responseClientIds, error);
		await OfflineResponsePersistence.recordSyncFailure('event', eventClientIds, error);
		await OfflineTrialPersistence.recordSyncFailure(trialClientIds, error);
	}

	/**
	 * Drop a session out of the retry set once it can never make progress: every one
	 * of its unsynced records is already escalated (dead-letter / checksum-corrupt),
	 * so the only thing still failing is the session-init materialization itself
	 * (e.g. the questionnaire was deleted server-side → permanent 404). The
	 * getUnsynced* getters already exclude escalated records, so "all three empty"
	 * means nothing recoverable is left to ship. We flip the local session-synced
	 * flag purely to stop re-materializing it — the escalated records keep synced=0
	 * and survive (the purge only runs on a clean drain), so nothing is discarded and
	 * the export escape hatch still sees them. If real answers arrive later, their
	 * fresh unsynced rows pull the session back into the drain via the orphan path.
	 */
	private async escalateSessionIfFullyDead(session: FilloutSession): Promise<void> {
		const [responses, events, variables, trials] = await Promise.all([
			OfflineResponsePersistence.getUnsyncedResponses(session.id),
			OfflineResponsePersistence.getUnsyncedEvents(session.id),
			OfflineResponsePersistence.getUnsyncedVariables(session.id),
			OfflineTrialPersistence.getUnsyncedTrials(session.id),
		]);
		if (
			responses.length === 0 &&
			events.length === 0 &&
			variables.length === 0 &&
			trials.length === 0
		) {
			await OfflineSessionService.markSynced(session.id);
		}
	}

	private scheduleRetry(): void {
		if (this.retryTimeout) clearTimeout(this.retryTimeout);

		// Jittered backoff (E-OFF-4): add up to +30% so simultaneously-retrying tabs
		// don't re-converge on the same instant.
		const jitter = Math.random() * this.retryDelay * 0.3;
		const delay = this.retryDelay + jitter;

		this.retryTimeout = setTimeout(() => {
			this.retryTimeout = null;
			if (navigator.onLine) {
				this.syncNow();
			}
		}, delay);

		// Exponential backoff
		this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
	}
}
