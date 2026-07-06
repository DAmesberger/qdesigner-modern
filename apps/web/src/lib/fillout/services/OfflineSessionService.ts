import { db, type FilloutSession } from '$lib/services/db/indexeddb';
import { browser } from '$app/environment';
import type { ResumeState } from '$lib/runtime/core/ResumeState';
import { FilloutCrypto } from './crypto/FilloutCrypto';

type SessionMetadata = Record<string, unknown> | undefined;

/**
 * Manages fillout sessions offline-first using IndexedDB.
 * Sessions are created client-side with crypto.randomUUID() — no server round-trip needed.
 */
export class OfflineSessionService {
	/**
	 * E-OFF-2: encrypt a session's `metadata` blob (consent, url params,
	 * fingerprint, progress) at rest. `browserInfo`/version/status stay cleartext —
	 * the latter are indexed and non-content. Undefined passes through untouched.
	 */
	private static async encryptMeta(sessionId: string, meta: SessionMetadata): Promise<SessionMetadata> {
		return (await FilloutCrypto.encryptField(sessionId, meta)) as SessionMetadata;
	}

	/** Decrypt a stored metadata slot back to a plain object (or undefined). */
	private static async decryptMeta(sessionId: string, meta: unknown): Promise<SessionMetadata> {
		return (await FilloutCrypto.decryptField(sessionId, meta)) as SessionMetadata;
	}

	/**
	 * Return a copy of a stored session row with its `metadata` decrypted, so all
	 * callers see plaintext regardless of at-rest encryption. No-op on undefined.
	 */
	private static async decryptRow(
		row: FilloutSession | undefined
	): Promise<FilloutSession | undefined> {
		if (!row) return row;
		if (row.metadata === undefined) return row;
		return { ...row, metadata: await this.decryptMeta(row.id, row.metadata) };
	}

	/**
	 * Create a new session locally.
	 */
	static async createSession(
		questionnaireId: string,
		versionMajor: number,
		versionMinor: number,
		versionPatch: number,
		participantId?: string,
		metadata?: Record<string, unknown>,
		browserInfo?: Record<string, unknown>,
	): Promise<FilloutSession> {
		const id = crypto.randomUUID();
		const session: FilloutSession = {
			id,
			questionnaireId,
			status: 'active',
			versionMajor,
			versionMinor,
			versionPatch,
			participantId,
			metadata: await this.encryptMeta(id, metadata),
			browserInfo,
			createdAt: Date.now(),
			synced: 0,
		};

		await db.filloutSessions.put(session);
		// Return the plaintext view to the caller (the stored row is encrypted).
		return { ...session, metadata };
	}

	/**
	 * Record a durable LOCAL pin row for a session that was created on the SERVER
	 * (online path). Online sessions otherwise have no `filloutSessions` row, which
	 * would make their pinned definition/media invisible to `protectedVersionKeys`
	 * (GC/eviction could discard an in-flight session's assets) and unavailable for
	 * offline resume. Written with `synced = 1` so `getUnsyncedSessions()` never
	 * treats it as a session needing a server create — the sync engine drains this
	 * session's data via its unsynced CHILD records, and `ensureServerSession`
	 * short-circuits on `api.sessions.get`. Idempotent (keyed by id).
	 */
	static async recordServerSession(input: {
		id: string;
		questionnaireId: string;
		versionMajor: number;
		versionMinor: number;
		versionPatch: number;
		participantId?: string;
		metadata?: Record<string, unknown>;
	}): Promise<void> {
		const existing = await db.filloutSessions.get(input.id);
		// New metadata is encrypted; when absent, keep the existing (already
		// encrypted) row value untouched.
		const metadata =
			input.metadata !== undefined
				? await this.encryptMeta(input.id, input.metadata)
				: existing?.metadata;
		const session: FilloutSession = {
			id: input.id,
			questionnaireId: input.questionnaireId,
			status: existing?.status ?? 'active',
			versionMajor: input.versionMajor,
			versionMinor: input.versionMinor,
			versionPatch: input.versionPatch,
			participantId: input.participantId ?? existing?.participantId,
			metadata,
			browserInfo: existing?.browserInfo,
			createdAt: existing?.createdAt ?? Date.now(),
			completedAt: existing?.completedAt,
			synced: 1,
		};
		await db.filloutSessions.put(session);
	}

	/**
	 * Resume an existing session from IndexedDB.
	 */
	static async resumeSession(sessionId: string): Promise<FilloutSession | null> {
		const session = await db.filloutSessions.get(sessionId);
		if (!session || session.status === 'completed') return null;
		return (await this.decryptRow(session)) ?? null;
	}

	/**
	 * Find active session for a questionnaire.
	 */
	static async findActiveSession(questionnaireId: string): Promise<FilloutSession | null> {
		const session = await db.filloutSessions
			.where('[questionnaireId+status]')
			.equals([questionnaireId, 'active'])
			.first();
		return (await this.decryptRow(session)) ?? null;
	}

	/**
	 * Update session progress metadata and, optionally, the durable resume cursor
	 * (E-OFF-1). `progress` keeps its historical home under `metadata.progress`; the
	 * typed `cursor` fields (authoritative `answeredQuestionIds` + `lastItemIndex` /
	 * `lastPageId` hints) are written as top-level columns so a reload / offline resume
	 * has a durable pointer even before any child record syncs. Bumps `updatedAt` and
	 * re-arms `synced:0`. No-op when the row is absent (online session with no local pin).
	 */
	static async updateProgress(
		sessionId: string,
		progress: Record<string, unknown>,
		cursor?: {
			lastItemIndex?: number;
			lastPageId?: string;
			answeredQuestionIds?: string[];
		},
	): Promise<void> {
		const session = await db.filloutSessions.get(sessionId);
		if (!session) return;

		// Decrypt the current metadata before merging, then re-encrypt the result.
		const currentMeta = (await this.decryptMeta(sessionId, session.metadata)) ?? {};
		const patch: Partial<FilloutSession> = {
			metadata: await this.encryptMeta(sessionId, { ...currentMeta, progress }),
			updatedAt: Date.now(),
			synced: 0,
		};
		if (cursor) {
			if (cursor.lastItemIndex !== undefined) patch.lastItemIndex = cursor.lastItemIndex;
			if (cursor.lastPageId !== undefined) patch.lastPageId = cursor.lastPageId;
			if (cursor.answeredQuestionIds !== undefined)
				patch.answeredQuestionIds = cursor.answeredQuestionIds;
		}

		await db.filloutSessions.update(sessionId, patch);
	}

	/**
	 * Persist the full true save-and-continue snapshot (E-FLOW-3) on the local session
	 * row and re-arm synced:0 so FilloutUploadSync mirrors it to `sessions.state_snapshot`.
	 * No-op when the row is absent (online-created session with no local pin yet) — the
	 * offline-first response/cursor write path (updateProgress) still covers resume then.
	 */
	static async updateResumeState(sessionId: string, resumeState: ResumeState): Promise<void> {
		const session = await db.filloutSessions.get(sessionId);
		if (!session) return;

		await db.filloutSessions.update(sessionId, {
			resumeState,
			updatedAt: Date.now(),
			synced: 0,
		});
	}

	/**
	 * Read the persisted {@link ResumeState} for a session, if any. Undefined when the
	 * row is missing or predates E-FLOW-3 (only the E-OFF-1 answer cursor was stored).
	 */
	static async getResumeState(sessionId: string): Promise<ResumeState | undefined> {
		const session = await db.filloutSessions.get(sessionId);
		return session?.resumeState;
	}

	/**
	 * Discard the persisted {@link ResumeState} for a session (E-FLOW-3, FIX-F12). Called
	 * when a participant chooses "Start over" on the welcome screen so a subsequent reload
	 * does not silently resume the abandoned position. No-op when the row is absent.
	 */
	static async clearResumeState(sessionId: string): Promise<void> {
		const session = await db.filloutSessions.get(sessionId);
		if (!session) return;

		await db.filloutSessions.update(sessionId, {
			resumeState: undefined,
			updatedAt: Date.now(),
			synced: 0,
		});
	}

	/**
	 * Shallow-merge a metadata patch into an existing session row, preserving
	 * prior keys, and re-arm synced:0 so FilloutUploadSync.collectSessionsToSync
	 * ships the merged metadata (its payload carries session.metadata). No-op when
	 * the row is absent (online-created session with no local pin yet). Undefined
	 * patch values are dropped so they don't clobber existing keys.
	 */
	static async mergeMetadata(sessionId: string, patch: Record<string, unknown>): Promise<void> {
		const s = await db.filloutSessions.get(sessionId);
		if (!s) return;

		const cleaned: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(patch)) {
			if (v !== undefined) cleaned[k] = v;
		}

		const currentMeta = (await this.decryptMeta(sessionId, s.metadata)) ?? {};
		await db.filloutSessions.update(sessionId, {
			metadata: await this.encryptMeta(sessionId, { ...currentMeta, ...cleaned }),
			synced: 0,
		});
	}

	/**
	 * Mark session as completed.
	 */
	static async completeSession(sessionId: string): Promise<void> {
		await db.filloutSessions.update(sessionId, {
			status: 'completed',
			completedAt: Date.now(),
			synced: 0,
		});
	}

	/**
	 * Mark session as abandoned.
	 */
	static async abandonSession(sessionId: string): Promise<void> {
		await db.filloutSessions.update(sessionId, {
			status: 'abandoned',
			synced: 0,
		});
	}

	/**
	 * Get a session row by id (undefined when it exists only on the server).
	 */
	static async getSession(sessionId: string): Promise<FilloutSession | undefined> {
		return this.decryptRow(await db.filloutSessions.get(sessionId));
	}

	/**
	 * Get all unsynced sessions.
	 */
	static async getUnsyncedSessions(): Promise<FilloutSession[]> {
		const rows = await db.filloutSessions
			.where('synced')
			.equals(0)
			.toArray();
		return Promise.all(rows.map((r) => this.decryptRow(r) as Promise<FilloutSession>));
	}

	/**
	 * Mark session as synced.
	 */
	static async markSynced(sessionId: string): Promise<void> {
		await db.filloutSessions.update(sessionId, { synced: 1 });
	}

	/**
	 * Collect device and browser info.
	 */
	static getDeviceInfo(): Record<string, unknown> {
		if (!browser) return {};

		return {
			userAgent: navigator.userAgent,
			platform: navigator.platform,
			language: navigator.language,
			screen: {
				width: window.screen.width,
				height: window.screen.height,
				pixelRatio: window.devicePixelRatio,
			},
			viewport: {
				width: window.innerWidth,
				height: window.innerHeight,
			},
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			touchSupport: 'ontouchstart' in window,
		};
	}
}
