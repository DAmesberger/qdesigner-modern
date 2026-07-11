import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, filloutDefinitionKey } from '$lib/services/db/indexeddb';
import { mediaContentUrl } from '$lib/services/mediaService';
import { FilloutContentCache } from './FilloutContentCache';

/**
 * F-21 explicit offline provisioning: `prepareOffline` prefetches every media asset a full
 * run needs (direct url/src fields + mediaId references resolved through the same-origin
 * proxy) into the media Cache-API bucket with per-asset progress, and `checkOfflineReadiness`
 * recomputes readiness from cache membership alone so it survives a reload with no new schema.
 */

const QID = 'qn-offline-prep';
const KEY = filloutDefinitionKey(QID, 1, 0, 0);
const VERSION = { major: 1, minor: 0, patch: 0 };

const DIRECT_URL = 'https://cdn.example.com/stimulus.png';
const SRC_URL = '/api/media/direct-src/content';
const MEDIA_ID = 'm-reaction-1';
const MEDIA_ID_URL = mediaContentUrl(MEDIA_ID);

/** Definition mixing a direct `url`, a `src`, and a reaction-asset `mediaId` reference. */
function definition() {
	return {
		questions: [
			{ id: 'q1', stimulus: { url: DIRECT_URL } },
			{ id: 'q2', src: SRC_URL },
			{ id: 'q3', config: { assets: [{ mediaId: MEDIA_ID, kind: 'image' }] } },
		],
	};
}

/** In-memory Cache-API double: presence in `store` == cached; value == content-length. */
function installCache(preload: Record<string, number> = {}) {
	const store = new Map<string, number>(Object.entries(preload));
	const cache = {
		match: vi.fn(async (url: string) =>
			store.has(url)
				? ({ headers: { get: () => String(store.get(url)) } } as unknown as Response)
				: undefined
		),
		put: vi.fn(async (url: string, res: Response) => {
			const len = Number(res.headers.get('content-length') ?? '0') || 0;
			store.set(url, len);
		}),
	};
	vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
	return { cache, store };
}

/** fetch double returning an OK response carrying a fixed content-length. */
function installFetch(sizeBytes = 100, ok = true) {
	const fn = vi.fn(
		async () =>
			({
				ok,
				headers: { get: (h: string) => (h === 'content-length' ? String(sizeBytes) : null) },
			}) as unknown as Response
	);
	vi.stubGlobal('fetch', fn);
	return fn;
}

/**
 * fetch double that never resolves on its own — it settles only by rejecting when the
 * caller's AbortSignal fires (models a hung asset, F-58).
 */
function installHangingFetch() {
	const fn = vi.fn(
		(_url: string, init?: { signal?: AbortSignal }) =>
			new Promise<Response>((_resolve, reject) => {
				const signal = init?.signal;
				if (signal) {
					signal.addEventListener('abort', () =>
						reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
					);
				}
			})
	);
	vi.stubGlobal('fetch', fn);
	return fn;
}

/** Run `body` with the per-asset fetch budget temporarily shortened for fast timeout tests. */
async function withShortMediaTimeout(ms: number, body: () => Promise<void>): Promise<void> {
	const holder = FilloutContentCache as unknown as { MEDIA_FETCH_TIMEOUT_MS: number };
	const original = holder.MEDIA_FETCH_TIMEOUT_MS;
	holder.MEDIA_FETCH_TIMEOUT_MS = ms;
	try {
		await body();
	} finally {
		holder.MEDIA_FETCH_TIMEOUT_MS = original;
	}
}

beforeEach(async () => {
	await db.filloutMedia.clear();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('FilloutContentCache.offlineMediaUrls', () => {
	it('enumerates url + src fields and mediaId proxy URLs, deduplicated', () => {
		const urls = FilloutContentCache.offlineMediaUrls(definition());
		expect(new Set(urls)).toEqual(new Set([DIRECT_URL, SRC_URL, MEDIA_ID_URL]));
		// A repeated mediaId collapses to one URL.
		const dupUrls = FilloutContentCache.offlineMediaUrls({
			questions: [
				{ id: 'a', config: { assets: [{ mediaId: MEDIA_ID }] } },
				{ id: 'b', config: { assets: [{ mediaId: MEDIA_ID }] } },
			],
		});
		expect(dupUrls).toEqual([MEDIA_ID_URL]);
	});

	it('returns no URLs for a media-free definition', () => {
		expect(FilloutContentCache.offlineMediaUrls({ questions: [{ id: 'q', type: 'text' }] })).toEqual(
			[]
		);
	});
});

describe('FilloutContentCache.prepareOffline', () => {
	it('fetches every asset, counts them cached, reports N-of-M progress, and confirms ready', async () => {
		const { store } = installCache();
		const fetchFn = installFetch(100);
		const progress: Array<[number, number]> = [];

		const readiness = await FilloutContentCache.prepareOffline(QID, VERSION, definition(), {
			onProgress: (done, total) => progress.push([done, total]),
		});

		expect(readiness).toMatchObject({ total: 3, cached: 3, failed: 0, ready: true });
		expect(fetchFn).toHaveBeenCalledTimes(3);
		// Progress fires an initial 0-of-N then one tick per asset, ending at N-of-N.
		expect(progress[0]).toEqual([0, 3]);
		expect(progress[progress.length - 1]).toEqual([3, 3]);
		// Each cached asset is tracked with a version-tagged accounting row.
		expect(store.size).toBe(3);
		const rows = await db.filloutMedia.where('questionnaireKey').equals(KEY).toArray();
		expect(rows).toHaveLength(3);
	});

	it('does not re-fetch assets already in the cache (idempotent)', async () => {
		installCache({ [DIRECT_URL]: 100, [SRC_URL]: 100, [MEDIA_ID_URL]: 100 });
		const fetchFn = installFetch(100);

		const readiness = await FilloutContentCache.prepareOffline(QID, VERSION, definition());

		expect(readiness).toMatchObject({ cached: 3, ready: true });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('reports a partial result when an asset fails to fetch', async () => {
		installCache();
		// Fail only the mediaId proxy URL; the other two succeed.
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const ok = url !== MEDIA_ID_URL;
				return {
					ok,
					headers: { get: (h: string) => (h === 'content-length' ? '100' : null) },
				} as unknown as Response;
			})
		);

		const readiness = await FilloutContentCache.prepareOffline(QID, VERSION, definition());

		expect(readiness).toMatchObject({ total: 3, cached: 2, failed: 1, ready: false });
	});

	it('caps a hung asset at the fetch budget and reports it as failed (F-58)', async () => {
		installCache();
		const fetchFn = installHangingFetch();

		let readiness!: Awaited<ReturnType<typeof FilloutContentCache.prepareOffline>>;
		await withShortMediaTimeout(20, async () => {
			// Resolves at all — a fetch with no timeout would hang forever on the first asset.
			readiness = await FilloutContentCache.prepareOffline(QID, VERSION, definition());
		});

		// Explicit provisioning reports honestly: every hung asset is counted failed, not swallowed.
		expect(readiness).toMatchObject({ total: 3, cached: 0, failed: 3, ready: false });
		expect(fetchFn).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});

	it('reports quotaExceeded when the definition media overflows the cache budget', async () => {
		installCache();
		installFetch(100); // 3 × 100 = 300 bytes
		const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
		// quota 100 → cap = floor(100 * 0.5) = 50 bytes, so 300 bytes overflows.
		Object.defineProperty(navigator, 'storage', {
			configurable: true,
			value: { estimate: async () => ({ quota: 100 }) },
		});
		try {
			const readiness = await FilloutContentCache.prepareOffline(QID, VERSION, definition());
			expect(readiness.quotaExceeded).toBe(true);
		} finally {
			if (original) Object.defineProperty(navigator, 'storage', original);
			else delete (navigator as unknown as Record<string, unknown>).storage;
		}
	});

	it('is ready with no fetch for a media-free definition', async () => {
		installCache();
		const fetchFn = installFetch();
		const readiness = await FilloutContentCache.prepareOffline(QID, VERSION, {
			questions: [{ id: 'q', type: 'text' }],
		});
		expect(readiness).toMatchObject({ total: 0, ready: true });
		expect(fetchFn).not.toHaveBeenCalled();
	});
});

describe('FilloutContentCache.checkOfflineReadiness', () => {
	it('reads readiness back from cache membership with no network', async () => {
		installCache({ [DIRECT_URL]: 100, [SRC_URL]: 100, [MEDIA_ID_URL]: 100 });
		const fetchFn = installFetch();

		const readiness = await FilloutContentCache.checkOfflineReadiness(definition());

		expect(readiness).toMatchObject({ total: 3, cached: 3, ready: true });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('is not ready when only some assets are cached', async () => {
		installCache({ [DIRECT_URL]: 100 });
		installFetch();

		const readiness = await FilloutContentCache.checkOfflineReadiness(definition());

		expect(readiness).toMatchObject({ total: 3, cached: 1, ready: false });
	});

	it('is ready for a media-free definition', async () => {
		installCache();
		const readiness = await FilloutContentCache.checkOfflineReadiness({
			questions: [{ id: 'q', type: 'text' }],
		});
		expect(readiness.ready).toBe(true);
	});
});
