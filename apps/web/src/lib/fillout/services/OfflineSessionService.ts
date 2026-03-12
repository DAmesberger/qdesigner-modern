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
