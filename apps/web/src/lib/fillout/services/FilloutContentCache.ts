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
import { mediaContentUrl } from '$lib/services/mediaService';

/** Fetch-skip window when a definition's `settings.report.refreshMs` is unset (24h). */
const DEFAULT_SERVER_VARS_REFRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Per-request budget (ms) for the server-variable aggregate fetch. The aggregate is a
 * small JSON payload, so it gets the tight 3s cap the load path always intended (F-58) —
 * mirroring the abort-timeout applied to the media fetch in {@link
 * FilloutContentCache.fetchAndCacheAsset} — so one hung request can never stall the load.
 */
const SERVER_VARS_FETCH_TIMEOUT_MS = 3000;

/**
 * Result of {@link FilloutContentCache.prepareOffline} / {@link FilloutContentCache.checkOfflineReadiness}
 * (explicit offline provisioning, F-21). Recomputed from Cache-API membership so it survives a
 * reload without any new schema — a fully-cached definition reads back `ready` on next mount.
 */
export interface OfflineReadiness {
	/** Total cacheable media assets a full run needs (direct url/src + mediaId references). */
	total: number;
	/** How many of them are present in the media Cache-API bucket. */
	cached: number;
	/** How many could not be fetched this pass (0 for a pure membership recompute). */
	failed: number;
	/** Every asset is cached — the study can run offline (given the definition snapshot). */
	ready: boolean;
	/** This definition's media exceeds the media-cache budget, so it can't all be retained. */
	quotaExceeded: boolean;
}

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
	 * Per-asset fetch budget (ms). A media asset is larger than the server-variable
	 * aggregate `cacheServerVariables` fetches, so it gets a more generous cap than that
	 * 3s ceiling — but it is still bounded so ONE hung asset can never stall the load path
	 * (ADR 0026 Layer 1: byte-caching is best-effort; the block-level decode gate is the
	 * hard offline guarantee).
	 */
	private static MEDIA_FETCH_TIMEOUT_MS = 10_000;

	/**
	 * Byte-cache a single media asset, capping the network fetch with an abort timeout so a
	 * hung asset can't stall the caller. Returns whether the asset ended up in the Cache API
	 * and its recorded size. Throws on fetch/abort/cache error; callers apply their own
	 * failure semantics — the eager load path logs and moves on, `prepareOffline` counts it
	 * as failed.
	 */
	private static async fetchAndCacheAsset(
		cache: Cache,
		url: string,
		timeoutMs: number
	): Promise<{ inCache: boolean; size: number }> {
		const existing = await cache.match(url);
		if (existing) {
			return { inCache: true, size: Number(existing.headers.get('content-length') ?? '0') || 0 };
		}
		const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
		if (!response.ok) return { inCache: false, size: 0 };
		// Read the length header before put() consumes the body.
		const size = Number(response.headers.get('content-length') ?? '0') || 0;
		await cache.put(url, response);
		return { inCache: true, size };
	}

	/**
	 * Download and cache a questionnaire for offline use as a version-pinned row.
	 */
	static async syncForOffline(accessCode: string, questionnaireData: Record<string, unknown>): Promise<void> {
		const questionnaireId = questionnaireData.id as string;
		const versionMajor = (questionnaireData.version_major as number) ?? 1;
		const versionMinor = (questionnaireData.version_minor as number) ?? 0;
		const versionPatch = (questionnaireData.version_patch as number) ?? 0;
		const key = filloutDefinitionKey(questionnaireId, versionMajor, versionMinor, versionPatch);

		// F-57 — same-version REPUBLISH invalidation. A republish without a version bump
		// reuses this exact key, so the definition `.put` below refreshes the snapshot — but
		// the media already cached under this key (Cache-API bytes + accounting rows) would
		// otherwise linger, so a swapped/removed/edited asset keeps serving its HISTORICAL
		// bytes at run time. Detect a content change against the previously-cached snapshot
		// and, when it changed, evict this version's media first so `cacheMedia` re-fetches
		// ONLY the current asset set fresh. Gated on an actual change: an unchanged reload
		// (the common case) keeps its cache, and a true-offline run never reaches this path
		// (the load only caches while online), so its pinned cache is untouched.
		const previous = await db.filloutQuestionnaires.get(key);
		const contentChanged =
			!!previous &&
			JSON.stringify(definitionContent(previous.data)) !==
				JSON.stringify(definitionContent(questionnaireData));

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

		if (contentChanged) {
			// Drop the stale media (Cache-API entries not shared with another version + this
			// version's accounting rows) before re-caching the fresh asset set.
			await this.evictDefinitionMedia(key);
		}

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
			const r = await fetch(
				`/api/questionnaires/${questionnaireId}/server-variables${versionParam}`,
				{ signal: AbortSignal.timeout(SERVER_VARS_FETCH_TIMEOUT_MS) }
			);
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

		// ADR 0026 eviction pinning: a reaction study must be offline-COMPLETE or it is
		// unrunnable — a timed block can never run with partial stimuli. So media owned
		// by any cached reaction-bearing definition is PINNED against eviction regardless
		// of session state. If such a study's own media overflows the budget we keep it
		// (leaving the cache over cap) and let the honest "unrunnable / quota-exceeded"
		// state surface through prepareOffline/the Layer-2 gate, rather than silently
		// evicting stimuli it will then fail to load.
		for (const key of await this.reactionBearingVersionKeys()) protectedKeys.add(key);

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

	/** v1 WebGL/reaction module types whose media must be offline-complete (ADR 0026). */
	private static readonly REACTION_QUESTION_TYPES = new Set([
		'reaction-time',
		'reaction-experiment',
		'webgl',
	]);

	/**
	 * Version keys (filloutDefinitionKey) whose cached definition contains a reaction /
	 * WebGL question — their media is pinned against quota eviction (ADR 0026). Scans the
	 * cached by-code payloads once; a definition with no such question contributes nothing.
	 */
	private static async reactionBearingVersionKeys(): Promise<Set<string>> {
		const keys = new Set<string>();
		for (const row of await db.filloutQuestionnaires.toArray()) {
			if (this.definitionIsReactionBearing(row.data)) keys.add(row.id);
		}
		return keys;
	}

	/** True when a cached definition references a reaction/WebGL question anywhere in its tree. */
	private static definitionIsReactionBearing(data: Record<string, unknown> | undefined): boolean {
		if (!data) return false;
		let found = false;
		const walk = (value: unknown): void => {
			if (found || !value || typeof value !== 'object') return;
			if (Array.isArray(value)) {
				for (const item of value) walk(item);
				return;
			}
			const record = value as Record<string, unknown>;
			if (typeof record.type === 'string' && this.REACTION_QUESTION_TYPES.has(record.type)) {
				found = true;
				return;
			}
			for (const child of Object.values(record)) walk(child);
		};
		walk(definitionContent(data));
		return found;
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

	// ── Explicit offline provisioning (F-21) ─────────────────────────────
	//
	// The eager load path caches media as a side effect (`cacheMedia` over `extractMediaUrls`).
	// A field participant who knows they'll lose signal needs an *explicit* affordance instead:
	// prefetch everything a full run needs, confirm it, and survive a reload. These three
	// methods back that "Prepare offline" control on the welcome screen.

	/**
	 * Enumerate the cacheable media URLs a full offline run needs from a runtime definition:
	 * direct `url` / `src` fields ({@link extractMediaUrls}) PLUS every `mediaId` reference
	 * resolved to its stable same-origin proxy URL ({@link mediaContentUrl}). The latter covers
	 * reaction-experiment assets, which carry only a `mediaId` in the definition and are missed
	 * by the eager `extractMediaUrls`-only cache. Deduplicated.
	 */
	static offlineMediaUrls(definition: Record<string, unknown>): string[] {
		const direct = this.extractMediaUrls(definition);
		const byId = this.extractMediaIds(definition).map((id) => mediaContentUrl(id));
		return [...new Set([...direct, ...byId])];
	}

	/**
	 * Recompute offline readiness from Cache-API membership alone — ZERO network. Used on
	 * welcome mount so a reload reflects "Ready for offline use" without persisting a flag: a
	 * definition whose every media asset is already in the cache reads back `ready`. A definition
	 * with no media is ready as soon as its snapshot is cached (the load path did that).
	 */
	static async checkOfflineReadiness(definition: Record<string, unknown>): Promise<OfflineReadiness> {
		const urls = this.offlineMediaUrls(definition);
		const total = urls.length;
		if (total === 0) {
			return { total: 0, cached: 0, failed: 0, ready: true, quotaExceeded: false };
		}

		let cache: Cache | null = null;
		try {
			cache = await caches.open(this.MEDIA_CACHE_NAME);
		} catch {
			cache = null;
		}
		if (!cache) return { total, cached: 0, failed: 0, ready: false, quotaExceeded: false };

		let cached = 0;
		for (const url of urls) {
			if (await cache.match(url)) cached++;
		}
		return { total, cached, failed: 0, ready: cached === total, quotaExceeded: false };
	}

	/**
	 * Explicitly prefetch every media asset a full run needs into the media Cache-API bucket,
	 * reporting per-asset progress (F-21). Idempotent: assets already cached are counted, not
	 * re-fetched. Each fetched asset gets a version-tagged accounting row so quota bounding and
	 * pin-protection see it (the same rows `enforceMediaQuota` reads).
	 *
	 * Never evicts to make room — if this definition's own media exceeds the cache budget it
	 * reports `quotaExceeded` so the caller can say so honestly, rather than silently thrashing
	 * the cache. Per-asset failures are counted (`failed`) so a partial result can offer a retry.
	 */
	static async prepareOffline(
		questionnaireId: string,
		version: { major: number; minor: number; patch: number },
		definition: Record<string, unknown>,
		options?: { onProgress?: (done: number, total: number) => void }
	): Promise<OfflineReadiness> {
		const urls = this.offlineMediaUrls(definition);
		const total = urls.length;
		const onProgress = options?.onProgress;
		onProgress?.(0, total);
		if (total === 0) {
			return { total: 0, cached: 0, failed: 0, ready: true, quotaExceeded: false };
		}

		let cache: Cache | null = null;
		try {
			cache = await caches.open(this.MEDIA_CACHE_NAME);
		} catch {
			cache = null;
		}
		if (!cache) return { total, cached: 0, failed: total, ready: false, quotaExceeded: false };

		const key = filloutDefinitionKey(questionnaireId, version.major, version.minor, version.patch);
		let cached = 0;
		let failed = 0;
		let done = 0;
		for (const url of urls) {
			let inCache = false;
			let size = 0;
			try {
				// Same per-asset timeout cap as the eager load path; here a failure is
				// reported honestly (`failed++`), not swallowed.
				({ inCache, size } = await this.fetchAndCacheAsset(cache, url, this.MEDIA_FETCH_TIMEOUT_MS));
			} catch {
				inCache = false;
			}

			if (inCache) {
				cached++;
				const entry: FilloutMediaEntry = {
					url,
					questionnaireKey: key,
					questionnaireId,
					versionMajor: version.major,
					versionMinor: version.minor,
					versionPatch: version.patch,
					size,
					cachedAt: Date.now(),
				};
				await db.filloutMedia.put(entry).catch(() => {});
			} else {
				failed++;
			}
			done++;
			onProgress?.(done, total);
		}

		// Quota honesty: sum this version's tracked media against the cache budget. When the
		// definition alone overflows the budget, report it rather than evicting to fit — the
		// caller surfaces "too large to store offline" instead of a false "Ready".
		let quotaExceeded = false;
		try {
			const cap = await this.mediaCap();
			const versionBytes = (await db.filloutMedia.where('questionnaireKey').equals(key).toArray())
				.reduce((sum, e) => sum + (e.size || 0), 0);
			quotaExceeded = versionBytes > cap;
		} catch {
			// estimate/read failure — leave quotaExceeded false; readiness still reflects membership.
		}

		return { total, cached, failed, ready: cached === total && failed === 0, quotaExceeded };
	}

	/**
	 * Walk questionnaire definition and cache all media URLs via the Cache API, recording an
	 * accounting row per URL so `enforceMediaQuota` can bound the cache.
	 *
	 * ADR 0026 Layer 1 (bytes, per study, automatic): this runs as part of the reactive load
	 * path, so opening a media-bearing study caches ALL its assets — including `mediaId`-only
	 * reaction-experiment assets resolved through the same-origin proxy ({@link offlineMediaUrls}),
	 * which the direct-`url`/`src`-only {@link extractMediaUrls} misses. Per-URL failures while
	 * online are swallowed (non-blocking); what BLOCKS a run is the per-block decode gate (Layer 2).
	 */
	private static async cacheMedia(
		definition: Record<string, unknown>,
		questionnaireKey: string,
		questionnaireId: string,
		versionMajor: number,
		versionMinor: number,
		versionPatch: number
	): Promise<void> {
		const urls = this.offlineMediaUrls(definition);
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
					const { inCache, size } = await this.fetchAndCacheAsset(
						cache,
						url,
						this.MEDIA_FETCH_TIMEOUT_MS
					);
					if (!inCache) return;

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
				} catch (err) {
					// Best-effort byte-cache (ADR 0026 Layer 1): a per-asset failure or fetch
					// timeout must never fail the load path — log and move on. The block-level
					// decode gate (Layer 2) is what actually blocks a run on missing stimuli.
					console.warn(`[FilloutContentCache] media prefetch skipped: ${url}`, err);
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

	/**
	 * Collect every `mediaId` reference in a definition (reaction-experiment `config.assets`
	 * entries, stimulus media configs, …). The runtime resolves these to `mediaContentUrl(id)`
	 * at play time, so explicit offline provisioning must prefetch that same proxy URL.
	 */
	private static extractMediaIds(obj: unknown, ids: string[] = []): string[] {
		if (!obj || typeof obj !== 'object') return ids;

		if (Array.isArray(obj)) {
			for (const item of obj) {
				this.extractMediaIds(item, ids);
			}
			return ids;
		}

		const record = obj as Record<string, unknown>;
		if (typeof record.mediaId === 'string' && record.mediaId) {
			ids.push(record.mediaId);
		}

		for (const value of Object.values(record)) {
			if (value && typeof value === 'object') {
				this.extractMediaIds(value, ids);
			}
		}

		return ids;
	}
}
