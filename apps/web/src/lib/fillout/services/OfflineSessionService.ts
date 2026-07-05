import { db, type FilloutSession } from '$lib/services/db/indexeddb';
import { browser } from '$app/environment';

/**
 * Manages fillout sessions offline-first using IndexedDB.
 * Sessions are created client-side with crypto.randomUUID() — no server round-trip needed.
 */
export class OfflineSessionService {
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
		const session: FilloutSession = {
			id: crypto.randomUUID(),
			questionnaireId,
			status: 'active',
			versionMajor,
			versionMinor,
			versionPatch,
			participantId,
			metadata,
			browserInfo,
			createdAt: Date.now(),
			synced: 0,
		};

		await db.filloutSessions.put(session);
		return session;
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
		const session: FilloutSession = {
			id: input.id,
			questionnaireId: input.questionnaireId,
			status: existing?.status ?? 'active',
			versionMajor: input.versionMajor,
			versionMinor: input.versionMinor,
			versionPatch: input.versionPatch,
			participantId: input.participantId ?? existing?.participantId,
			metadata: input.metadata ?? existing?.metadata,
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
		return session;
	}

	/**
	 * Find active session for a questionnaire.
	 */
	static async findActiveSession(questionnaireId: string): Promise<FilloutSession | null> {
		const session = await db.filloutSessions
			.where('[questionnaireId+status]')
			.equals([questionnaireId, 'active'])
			.first();
		return session ?? null;
	}

	/**
	 * Update session progress metadata.
	 */
	static async updateProgress(sessionId: string, progress: Record<string, unknown>): Promise<void> {
		const session = await db.filloutSessions.get(sessionId);
		if (!session) return;

		await db.filloutSessions.update(sessionId, {
			metadata: { ...session.metadata, progress },
			synced: 0,
		});
	}

	/**
	 * Shallow-merge a metadata patch into an existing session row, preserving
	 * prior keys, and re-arm synced:0 so FilloutSyncEngine.collectSessionsToSync
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

		await db.filloutSessions.update(sessionId, {
			metadata: { ...(s.metadata ?? {}), ...cleaned },
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
		return db.filloutSessions.get(sessionId);
	}

	/**
	 * Get all unsynced sessions.
	 */
	static async getUnsyncedSessions(): Promise<FilloutSession[]> {
		return db.filloutSessions
			.where('synced')
			.equals(0)
			.toArray();
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
