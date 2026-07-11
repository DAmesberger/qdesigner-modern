import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, filloutDefinitionKey } from '$lib/services/db/indexeddb';
import { mediaContentUrl } from '$lib/services/mediaService';
import { FilloutContentCache } from './FilloutContentCache';

/**
 * F-57 — a same-version REPUBLISH must serve fresh content AND fresh media.
 *
 * The definition snapshot is keyed by (questionnaireId, version), so a republish without a
 * bump reuses the key and the `.put` refreshes it. But the previously-cached media (Cache-API
 * bytes + accounting rows) would otherwise linger, so a swapped/removed asset keeps serving
 * its HISTORICAL bytes at run time. On a detected content change the cache must evict this
 * version's stale media and re-fetch only the current asset set.
 */

/** In-memory Cache-API double supporting match/put/delete. */
function installCache(preload: Record<string, number> = {}) {
	const store = new Map<string, number>(Object.entries(preload));
	const cache = {
		match: vi.fn(async (url: string) =>
			store.has(url)
				? ({ headers: { get: () => String(store.get(url)) } } as unknown as Response)
				: undefined
		),
		put: vi.fn(async (url: string, res: Response) => {
			store.set(url, Number(res.headers.get('content-length') ?? '0') || 0);
		}),
		delete: vi.fn(async (url: string) => store.delete(url)),
	};
	vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
	return { cache, store };
}

/** fetch double returning an OK response carrying a fixed content-length. */
function installFetch(sizeBytes = 50) {
	const fn = vi.fn(
		async () =>
			({
				ok: true,
				headers: { get: (h: string) => (h === 'content-length' ? String(sizeBytes) : null) },
			}) as unknown as Response
	);
	vi.stubGlobal('fetch', fn);
	return fn;
}

const QID = 'qn-republish';
const KEY = filloutDefinitionKey(QID, 1, 0, 0);

/** A v1 by-code payload whose single reaction asset is `mediaId`. */
function payload(mediaId: string) {
	return {
		id: QID,
		version_major: 1,
		version_minor: 0,
		version_patch: 0,
		definition: {
			pages: [
				{
					questions: [
						{
							id: 'q',
							type: 'reaction-experiment',
							config: { assets: [{ mediaId, kind: 'image' }] },
						},
					],
				},
			],
		},
	};
}

async function mediaUrlsForVersion(): Promise<string[]> {
	const rows = await db.filloutMedia.where('questionnaireKey').equals(KEY).toArray();
	return rows.map((r) => r.url).sort();
}

beforeEach(async () => {
	await db.filloutMedia.clear();
	await db.filloutQuestionnaires.clear();
	await db.filloutSessions.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('F-57 — same-version republish', () => {
	it('replaces the definition AND the media set when content changed at the same version', async () => {
		const { store } = installCache();
		installFetch(50);

		const urlA = mediaContentUrl('asset-A');
		const urlB = mediaContentUrl('asset-B');

		// Publish v1 → asset A.
		await FilloutContentCache.cacheQuestionnaire(payload('asset-A'), 'AAAAAA');
		expect(store.has(urlA)).toBe(true);
		expect(await mediaUrlsForVersion()).toEqual([urlA]);

		// Republish v1 (same version) → asset B swapped in.
		await FilloutContentCache.cacheQuestionnaire(payload('asset-B'), 'AAAAAA');

		// Definition snapshot the runtime reads is now content B.
		const def = await db.filloutQuestionnaires.get(KEY);
		expect(JSON.stringify(def?.data)).toContain('asset-B');
		expect(JSON.stringify(def?.data)).not.toContain('asset-A');

		// The stale asset A is gone from BOTH the Cache-API store and the accounting rows;
		// only the current asset B remains, so no historical media loads at gate time.
		expect(store.has(urlA)).toBe(false);
		expect(store.has(urlB)).toBe(true);
		expect(await mediaUrlsForVersion()).toEqual([urlB]);
	});

	it('does NOT evict/re-fetch media on an unchanged reload (offline correctness)', async () => {
		const { store } = installCache();
		const fetchFn = installFetch(50);
		const urlA = mediaContentUrl('asset-A');

		await FilloutContentCache.cacheQuestionnaire(payload('asset-A'), 'AAAAAA');
		const fetchesAfterFirst = fetchFn.mock.calls.length;
		expect(store.has(urlA)).toBe(true);

		// Re-cache identical content: media already present → no eviction, no re-fetch of it.
		await FilloutContentCache.cacheQuestionnaire(payload('asset-A'), 'AAAAAA');

		expect(store.has(urlA)).toBe(true);
		expect(await mediaUrlsForVersion()).toEqual([urlA]);
		// fetchAndCacheAsset short-circuits on a cache hit, so no NEW network fetch happened.
		expect(fetchFn.mock.calls.length).toBe(fetchesAfterFirst);
	});
});
