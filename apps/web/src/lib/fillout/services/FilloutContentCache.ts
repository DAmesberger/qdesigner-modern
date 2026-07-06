import {
	db,
	filloutDefinitionKey,
	type FilloutQuestionnaire,
	type FilloutMediaEntry,
	type FilloutServerVariable,
} from '$lib/services/db/indexeddb';
import {
	collectServerVariables,
	declHash,
	type ServerVariableStats,
	type Variable,
} from '@qdesigner/questionnaire-core';
import type { NumericStatsSummary, ServerVariablesResponse } from '$lib/api/generated/types.gen';

/** Fetch-skip window when a definition's `settings.report.refreshMs` is unset (24h). */
const DEFAULT_SERVER_VARS_REFRESH_MS = 24 * 60 * 60 * 1000;

/** Map the server's `NumericStatsSummary` onto the cached {@link ServerVariableStats}. */
function mapServerStats(s: NumericStatsSummary): ServerVariableStats {
	return {
		mean: s.mean ?? 0,
		stdDev: s.std_dev ?? 0,
		min: s.min ?? 0,
		max: s.max ?? 0,
		p10: s.p10 ?? 0,
		p25: s.p25 ?? 0,
		median: s.median ?? 0,
		p75: s.p75 ?? 0,
		p90: s.p90 ?? 0,
		p95: s.p95 ?? 0,
		p99: s.p99 ?? 0,
	};
}

/**
 * Pull the definition content object out of a raw by-code / cached questionnaire
 * payload. Server-computed variable declarations live on `definition.variables`
 * (the JSONB `content` the server reads); some cached rows carry a flattened
 * `variables` array at the top level, so accept either.
 */
function definitionContent(questionnaireData: Record<string, unknown>): Record<string, unknown> {
	const def = questionnaireData.definition;
	if (def && typeof def === 'object') return def as Record<string, unknown>;
	return questionnaireData;
}

/**
 * Manages downloading and caching questionnaires for offline fillout.
 *
 * Definitions are stored version-pinned (see {@link filloutDefinitionKey}): a background
 * refresh to a newer version adds a new row rather than overwriting the snapshot an in-flight
 * session pinned. `pruneDefinitions()` GCs versions no local session still references, and
 * `enforceMediaQuota()` bounds the `fillout-media-v*` Cache-API store — both never discard
 * anything a session with unsynced data still needs.
 */
export class FilloutContentCache {
	// Must match FILLOUT_MEDIA_CACHE in static/sw.js — the service worker serves and
	// GC-cleans this exact cache, so a mismatch orphans everything the eager prefetcher writes.
	private static MEDIA_CACHE_NAME = 'fillout-media-v2';

	/** Bound the fillout media cache to this fraction of the origin storage quota. */
	private static MEDIA_QUOTA_FRACTION = 0.5;
	/** Hard ceiling used when navigator.storage.estimate() is unavailable. */
	private static MEDIA_HARD_CAP_BYTES = 256 * 1024 * 1024;

	/**
	 * Download and cache a questionnaire for offline use as a version-pinned row.
	 */
	static async syncForOffline(accessCode: string, questionnaireData: Record<string, unknown>): Promise<void> {
		const questionnaireId = questionnaireData.id as string;
		const versionMajor = (questionnaireData.version_major as number) ?? 1;
		const versionMinor = (questionnaireData.version_minor as number) ?? 0;
		const versionPatch = (questionnaireData.version_patch as number) ?? 0;
		const key = filloutDefinitionKey(questionnaireId, versionMajor, versionMinor, versionPatch);

		const record: FilloutQuestionnaire = {
			id: key,
			questionnaireId,
			accessCode: accessCode.toUpperCase(),
			versionMajor,
			versionMinor,
			versionPatch,
			data: questionnaireData,
			syncedAt: Date.now(),
		};

		await db.filloutQuestionnaires.put(record);

		// Cache media assets, tagged with this version so eviction can protect pinned ones.
		await this.cacheMedia(questionnaireData, key, questionnaireId, versionMajor, versionMinor, versionPatch);
	}

	/**
	 * Cache a questionnaire response directly (used by fillout route on online load).
	 */
	static async cacheQuestionnaire(questionnaireData: Record<string, unknown>, accessCode: string): Promise<void> {
		await this.syncForOffline(accessCode, questionnaireData);
	}

	/**
	 * Fetch and cache the SERVER-COMPUTED VARIABLE aggregates for a definition
	 * (server-computed-variable / E-FEEDBACK-3), so they resolve OFFLINE from the
	 * one VariableEngine at runtime construction.
	 *
	 * Version-pinned: rows are keyed `[definitionKey+variableId]` on the exact
	 * `(id, version)` the participant runs against, so a background refresh to a
	 * newer version never clobbers the aggregates an in-flight session pinned.
	 *
	 * Cost controls, in order:
	 *  1. ZERO network when the definition declares no server variables
	 *     ({@link collectServerVariables} empty) — the common case.
	 *  2. Freshness skip: no fetch while the newest cached row for this
	 *     definitionKey is younger than `settings.report.refreshMs` (default 24h).
	 *  3. Each fetched entry's `decl_hash` is cross-checked against the local
	 *     declaration ({@link declHash}); a mismatch (client/server disagree on the
	 *     declaration) is dropped rather than cached.
	 *
	 * Never throws: a network / parse failure leaves prior rows intact (offline
	 * correctness beats freshness) and the caller's load path is unaffected.
	 *
	 * @param version Optional pin — when resuming an older version, fetch that
	 *   version's aggregates for ITS declarations rather than the latest.
	 * @param options `force: true` bypasses the freshness-skip window — used by the
	 *   post-sync refresh so the cohort that just absorbed this participant updates
	 *   promptly (still bounded by the server's own result-cache TTL).
	 */
	static async cacheServerVariables(
		questionnaireData: Record<string, unknown>,
		version?: { major: number; minor: number; patch: number },
		options?: { force?: boolean }
	): Promise<void> {
		const questionnaireId = questionnaireData.id as string | undefined;
		if (!questionnaireId) return;

		const content = definitionContent(questionnaireData);
		const rawVariables = Array.isArray(content.variables) ? (content.variables as Variable[]) : [];
		const declared = collectServerVariables({ variables: rawVariables });
		// (1) Zero declarations → zero fetch cost. Short-circuits before any I/O.
		if (declared.length === 0) return;

		const versionMajor = version?.major ?? (questionnaireData.version_major as number) ?? 1;
		const versionMinor = version?.minor ?? (questionnaireData.version_minor as number) ?? 0;
		const versionPatch = version?.patch ?? (questionnaireData.version_patch as number) ?? 0;
		const definitionKey = filloutDefinitionKey(questionnaireId, versionMajor, versionMinor, versionPatch);

		// (2) Freshness skip.
		const settings = (content.settings ?? {}) as Record<string, unknown>;
		const report = (settings.report ?? {}) as Record<string, unknown>;
		const refreshMs =
			typeof report.refreshMs === 'number' && report.refreshMs > 0
				? report.refreshMs
				: DEFAULT_SERVER_VARS_REFRESH_MS;
		if (!options?.force) {
			const existing = await db.filloutServerVariables
				.where('definitionKey')
				.equals(definitionKey)
				.toArray();
			if (existing.length > 0) {
				const newest = existing.reduce((max, row) => Math.max(max, row.syncedAt), 0);
				if (Date.now() - newest < refreshMs) return;
			}
		}

		// Local declaration hashes for the (3) cross-check. Keyed by both id and
		// name so we can match whichever the response entry carries.
		const localHashById = new Map<string, string>();
		const localHashByName = new Map<string, string>();
		for (const v of declared) {
			if (!v.server) continue;
			const hash = declHash(v.server);
			localHashById.set(v.id, hash);
			localHashByName.set(v.name, hash);
		}

		// The client sends ZERO filters — only the optional version pin. The server
		// evaluates only its published declarations (the authorization model).
		const versionParam = version
			? `?version=${versionMajor}.${versionMinor}.${versionPatch}`
			: '';
		let resp: ServerVariablesResponse;
		try {
			const r = await fetch(`/api/questionnaires/${questionnaireId}/server-variables${versionParam}`);
			if (!r.ok) return;
			resp = (await r.json()) as ServerVariablesResponse;
		} catch {
			return; // Offline / network error — keep whatever we already cached.
		}

		const now = Date.now();
		const rows: FilloutServerVariable[] = [];
		for (const entry of resp.variables ?? []) {
			// (3) Cross-check declHash: only persist a row whose declaration the
			// client agrees with byte-for-byte.
			const localHash = localHashById.get(entry.id) ?? localHashByName.get(entry.name);
			if (localHash && localHash !== entry.decl_hash) continue;

			rows.push({
				definitionKey,
				variableId: entry.id,
				name: entry.name,
				declHash: entry.decl_hash,
				questionnaireId,
				n: entry.sample_count,
				stats: entry.stats ? mapServerStats(entry.stats) : null,
				computedAt: resp.computed_at,
				syncedAt: now,
			});
		}

		if (rows.length > 0) {
			await db.filloutServerVariables.bulkPut(rows);
		}
	}

	/**
	 * Check if any version of a questionnaire is available offline.
	 */
	static async isAvailableOffline(accessCode: string): Promise<boolean> {
		const count = await db.filloutQuestionnaires
			.where('accessCode')
			.equals(accessCode.toUpperCase())
			.count();
		return count > 0;
	}

	/**
	 * Get the LATEST cached version's data for a code (newest semver, tie-broken by syncedAt).
	 * Used to start a NEW offline session.
	 */
	static async getLatestOfflineQuestionnaire(accessCode: string): Promise<Record<string, unknown> | null> {
		const rows = await db.filloutQuestionnaires
			.where('accessCode')
			.equals(accessCode.toUpperCase())
			.toArray();
		const latest = this.pickLatest(rows);
		return latest?.data ?? null;
	}

	/**
	 * Get the EXACT pinned version's snapshot (null when this device never cached it — e.g. a
	 * session started on another device or a GC'd version). Used to RESUME a session against the
	 * version it started on, never the latest.
	 */
	static async getPinnedOfflineQuestionnaire(
		questionnaireId: string,
		versionMajor: number,
		versionMinor: number,
		versionPatch: number
	): Promise<Record<string, unknown> | null> {
		const row = await db.filloutQuestionnaires.get(
			filloutDefinitionKey(questionnaireId, versionMajor, versionMinor, versionPatch)
		);
		return row?.data ?? null;
	}

	/**
	 * Back-compat alias — returns the latest cached version for a code.
	 */
	static async getOfflineQuestionnaire(accessCode: string): Promise<Record<string, unknown> | null> {
		return this.getLatestOfflineQuestionnaire(accessCode);
	}

	/**
	 * List all offline-available questionnaire versions.
	 */
	static async listOfflineQuestionnaires(): Promise<FilloutQuestionnaire[]> {
		return db.filloutQuestionnaires.toArray();
	}

	/**
	 * Remove every cached version (and its tracked media) for a code.
	 */
	static async removeOffline(accessCode: string): Promise<void> {
		const rows = await db.filloutQuestionnaires
			.where('accessCode')
			.equals(accessCode.toUpperCase())
			.toArray();

		for (const row of rows) {
			await this.evictDefinitionMedia(row.id);
			await db.filloutQuestionnaires.delete(row.id);
		}
	}

	// ── Definition GC (slice 2.3) ────────────────────────────────────────

	/**
	 * Prune version-pinned definition rows no local session still needs.
	 *
	 * Keeps a version when it is (a) pinned by a session that is active or has unsynced data,
	 * or (b) the latest version for its questionnaire (so a fresh offline start still has a
	 * snapshot). Everything else — stale versions left behind by background refreshes whose
	 * sessions already synced — is dropped along with its media.
	 */
	static async pruneDefinitions(): Promise<void> {
		const rows = await db.filloutQuestionnaires.toArray();

		const keep = await this.protectedVersionKeys();

		// Always retain the newest version per questionnaire for future offline starts.
		const latestByQuestionnaire = new Map<string, FilloutQuestionnaire>();
		for (const row of rows) {
			const cur = latestByQuestionnaire.get(row.questionnaireId);
			if (!cur || this.compareVersion(row, cur) > 0) latestByQuestionnaire.set(row.questionnaireId, row);
		}
		for (const row of latestByQuestionnaire.values()) keep.add(row.id);

		for (const row of rows) {
			if (!keep.has(row.id)) {
				await this.evictDefinitionMedia(row.id);
				await db.filloutQuestionnaires.delete(row.id);
			}
		}

		// Drop server-computed-variable aggregates for any definition version that
		// was just GC'd (or that no cached definition/session references anymore).
		// `keep` still holds every protected (pinned / unsynced) and latest version,
		// so a session with in-flight data keeps its injected server values.
		await this.pruneServerVariables(keep);
	}

	/**
	 * Delete cached server-variable aggregate rows whose `definitionKey` is not in
	 * the retained set. Bounded, index-scoped delete per orphaned key.
	 */
	private static async pruneServerVariables(keep: Set<string>): Promise<void> {
		const keys = new Set<string>();
		for (const row of await db.filloutServerVariables.toArray()) keys.add(row.definitionKey);
		for (const key of keys) {
			if (keep.has(key)) continue;
			await db.filloutServerVariables.where('definitionKey').equals(key).delete();
		}
	}

	// ── Media cache bounding (slice 2.6) ─────────────────────────────────

	/**
	 * Bound the `fillout-media-v*` cache to a fraction of the origin storage quota
	 * (navigator.storage.estimate when available, else a hard cap). Evicts oldest-questionnaire
	 * first and NEVER evicts media for a version pinned by a session with unsynced data.
	 */
	static async enforceMediaQuota(): Promise<void> {
		const entries = await db.filloutMedia.toArray();
		if (entries.length === 0) return;

		const cap = await this.mediaCap();
		let total = entries.reduce((sum, e) => sum + (e.size || 0), 0);
		if (total <= cap) return;

		const protectedKeys = await this.protectedVersionKeys();

		// Group tracked media by owning version; group age = newest cachedAt in the group.
		const groups = new Map<string, { size: number; newest: number }>();
		for (const e of entries) {
			const g = groups.get(e.questionnaireKey) ?? { size: 0, newest: 0 };
			g.size += e.size || 0;
			g.newest = Math.max(g.newest, e.cachedAt);
			groups.set(e.questionnaireKey, g);
		}

		// Evict non-protected groups, oldest (least-recently cached) first, until under cap.
		const evictable = [...groups.entries()]
			.filter(([key]) => !protectedKeys.has(key))
			.sort((a, b) => a[1].newest - b[1].newest);

		for (const [key] of evictable) {
			if (total <= cap) break;
			// Subtract only bytes actually removed from the Cache — media shared with a
			// retained/protected version is NOT freed, so counting the group's nominal
			// size would under-report cache size and stop eviction while still over cap.
			total -= await this.evictDefinitionMedia(key);
		}
	}

	/** Resolve the media-cache byte budget from the storage quota when available. */
	private static async mediaCap(): Promise<number> {
		try {
			if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
				const { quota } = await navigator.storage.estimate();
				if (quota && quota > 0) {
					return Math.min(this.MEDIA_HARD_CAP_BYTES, Math.floor(quota * this.MEDIA_QUOTA_FRACTION));
				}
			}
		} catch {
			// estimate() unavailable — fall back to the hard cap.
		}
		return this.MEDIA_HARD_CAP_BYTES;
	}

	/**
	 * Delete a version's tracked media rows, removing each URL from the Cache API only when no
	 * OTHER version still references it (media URLs can be shared across versions).
	 */
	private static async evictDefinitionMedia(questionnaireKey: string): Promise<number> {
		const rows = await db.filloutMedia.where('questionnaireKey').equals(questionnaireKey).toArray();
		if (rows.length === 0) return 0;

		let cache: Cache | null = null;
		try {
			cache = await caches.open(this.MEDIA_CACHE_NAME);
		} catch {
			cache = null;
		}

		let freed = 0;
		for (const row of rows) {
			const others = await db.filloutMedia.where('url').equals(row.url).toArray();
			const stillReferenced = others.some((o) => o.questionnaireKey !== questionnaireKey);
			if (!stillReferenced && cache) {
				try {
					await cache.delete(row.url);
					freed += row.size || 0;
				} catch {
					// Cache entry may already be gone.
				}
			}
			await db.filloutMedia.delete([row.url, questionnaireKey]);
		}
		return freed;
	}

	/**
	 * Version keys (filloutDefinitionKey) that must never be GC'd or media-evicted: pinned by a
	 * session that is active, not-yet-synced, or has any unsynced child records.
	 */
	static async protectedVersionKeys(): Promise<Set<string>> {
		const keys = new Set<string>();
		const sessions = await db.filloutSessions.toArray();
		const byId = new Map(sessions.map((s) => [s.id, s]));

		for (const s of sessions) {
			if (s.status === 'active' || s.synced === 0) {
				keys.add(filloutDefinitionKey(s.questionnaireId, s.versionMajor, s.versionMinor, s.versionPatch));
			}
		}

		const unsynced = new Set<string>();
		for (const r of await db.filloutResponses.where('synced').equals(0).toArray()) unsynced.add(r.sessionId);
		for (const e of await db.filloutEvents.where('synced').equals(0).toArray()) unsynced.add(e.sessionId);
		for (const v of await db.filloutVariables.where('synced').equals(0).toArray()) unsynced.add(v.sessionId);
		for (const sid of unsynced) {
			const s = byId.get(sid);
			if (s) keys.add(filloutDefinitionKey(s.questionnaireId, s.versionMajor, s.versionMinor, s.versionPatch));
		}

		return keys;
	}

	private static pickLatest(rows: FilloutQuestionnaire[]): FilloutQuestionnaire | null {
		let best: FilloutQuestionnaire | null = null;
		for (const row of rows) {
			if (!best || this.compareVersion(row, best) > 0) best = row;
		}
		return best;
	}

	/** Compare two version rows; >0 when `a` is newer (semver, tie-broken by syncedAt). */
	private static compareVersion(a: FilloutQuestionnaire, b: FilloutQuestionnaire): number {
		if (a.versionMajor !== b.versionMajor) return a.versionMajor - b.versionMajor;
		if (a.versionMinor !== b.versionMinor) return a.versionMinor - b.versionMinor;
		if (a.versionPatch !== b.versionPatch) return a.versionPatch - b.versionPatch;
		return a.syncedAt - b.syncedAt;
	}

	/**
	 * Walk questionnaire definition and cache all media URLs via the Cache API, recording an
	 * accounting row per URL so `enforceMediaQuota` can bound the cache.
	 */
	private static async cacheMedia(
		definition: Record<string, unknown>,
		questionnaireKey: string,
		questionnaireId: string,
		versionMajor: number,
		versionMinor: number,
		versionPatch: number
	): Promise<void> {
		const urls = this.extractMediaUrls(definition);
		if (urls.length === 0) return;

		let cache: Cache;
		try {
			cache = await caches.open(this.MEDIA_CACHE_NAME);
		} catch {
			// Cache API not available — continue without media cache.
			return;
		}

		await Promise.allSettled(
			urls.map(async (url) => {
				try {
					const existing = await cache.match(url);
					let size = 0;
					if (existing) {
						size = Number(existing.headers.get('content-length') ?? '0') || 0;
					} else {
						const response = await fetch(url);
						if (!response.ok) return;
						// Read the length header before put() consumes the body.
						size = Number(response.headers.get('content-length') ?? '0') || 0;
						await cache.put(url, response);
					}

					const entry: FilloutMediaEntry = {
						url,
						questionnaireKey,
						questionnaireId,
						versionMajor,
						versionMinor,
						versionPatch,
						size,
						cachedAt: Date.now(),
					};
					await db.filloutMedia.put(entry);
				} catch {
					// Non-critical: media may not be available.
				}
			})
		);

		// Bound the cache after adding this version's assets.
		await this.enforceMediaQuota().catch(() => {});
	}

	/**
	 * Extract all cacheable media URLs from a questionnaire definition. Accepts absolute URLs
	 * and same-origin streaming-proxy paths (`/api/media/...`, shared contract D1).
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
		if (typeof record.url === 'string' && this.isCacheableMediaUrl(record.url)) {
			urls.push(record.url);
		}

		// Look for mediaId references that resolve to URLs
		if (typeof record.src === 'string' && this.isCacheableMediaUrl(record.src)) {
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

	private static isCacheableMediaUrl(value: string): boolean {
		return value.startsWith('http') || value.startsWith('/api/media');
	}
}
