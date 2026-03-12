import { db, type FilloutQuestionnaire } from '$lib/services/db/indexeddb';

/**
 * Manages downloading and caching questionnaires for offline fillout.
 */
export class FilloutOfflineSyncService {
	private static MEDIA_CACHE_NAME = 'fillout-media-v1';

	/**
	 * Download and cache a questionnaire for offline use.
	 */
	static async syncForOffline(accessCode: string, questionnaireData: Record<string, unknown>): Promise<void> {
		const id = questionnaireData.id as string;

		const record: FilloutQuestionnaire = {
			id,
			accessCode: accessCode.toUpperCase(),
			versionMajor: (questionnaireData.version_major as number) ?? 1,
			versionMinor: (questionnaireData.version_minor as number) ?? 0,
			versionPatch: (questionnaireData.version_patch as number) ?? 0,
			data: questionnaireData,
			syncedAt: Date.now(),
		};

		await db.filloutQuestionnaires.put(record);

		// Cache media assets
		await this.cacheMedia(questionnaireData);
	}

	/**
	 * Cache a questionnaire response directly (used by fillout route on online load).
	 */
	static async cacheQuestionnaire(questionnaireData: Record<string, unknown>, accessCode: string): Promise<void> {
		await this.syncForOffline(accessCode, questionnaireData);
	}

	/**
	 * Check if a questionnaire is available offline.
	 */
	static async isAvailableOffline(accessCode: string): Promise<boolean> {
		const record = await db.filloutQuestionnaires
			.where('accessCode')
			.equals(accessCode.toUpperCase())
			.first();
		return !!record;
	}

	/**
	 * Get a cached questionnaire by access code.
	 */
	static async getOfflineQuestionnaire(accessCode: string): Promise<Record<string, unknown> | null> {
		const record = await db.filloutQuestionnaires
			.where('accessCode')
			.equals(accessCode.toUpperCase())
			.first();
		return record?.data ?? null;
	}

	/**
	 * List all offline-available questionnaires.
	 */
	static async listOfflineQuestionnaires(): Promise<FilloutQuestionnaire[]> {
		return db.filloutQuestionnaires.toArray();
	}

	/**
	 * Remove questionnaire from offline storage.
	 */
	static async removeOffline(accessCode: string): Promise<void> {
		const record = await db.filloutQuestionnaires
			.where('accessCode')
			.equals(accessCode.toUpperCase())
			.first();

		if (record) {
			await db.filloutQuestionnaires.delete(record.id);
		}
	}

	/**
	 * Walk questionnaire definition and cache all media URLs via Cache API.
	 */
	private static async cacheMedia(definition: Record<string, unknown>): Promise<void> {
		const urls = this.extractMediaUrls(definition);
		if (urls.length === 0) return;

		try {
			const cache = await caches.open(this.MEDIA_CACHE_NAME);
			await Promise.allSettled(
				urls.map(async (url) => {
					const existing = await cache.match(url);
					if (!existing) {
						try {
							const response = await fetch(url);
							if (response.ok) {
								await cache.put(url, response);
							}
						} catch {
							// Non-critical: media may not be available
						}
					}
				})
			);
		} catch {
			// Cache API not available — continue without media cache
		}
	}

	/**
	 * Extract all media URLs from a questionnaire definition.
	 */
	private static extractMediaUrls(obj: unknown, urls: string[] = []): string[] {
		if (!obj || typeof obj !== 'object') return urls;

		if (Array.isArray(obj)) {
			for (const item of obj) {
				this.extractMediaUrls(item, urls);
			}
			return urls;
		}

		const record = obj as Record<string, unknown>;

		// Look for url fields in media configs
		if (typeof record.url === 'string' && record.url.startsWith('http')) {
			urls.push(record.url);
		}

		// Look for mediaId references that resolve to URLs
		if (typeof record.src === 'string' && record.src.startsWith('http')) {
			urls.push(record.src);
		}

		// Recurse into all values
		for (const value of Object.values(record)) {
			if (value && typeof value === 'object') {
				this.extractMediaUrls(value, urls);
			}
		}

		return urls;
	}
}
