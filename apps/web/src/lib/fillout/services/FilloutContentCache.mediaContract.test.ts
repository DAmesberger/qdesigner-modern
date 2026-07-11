import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, filloutDefinitionKey, type FilloutMediaEntry } from '$lib/services/db/indexeddb';
import { mediaContentUrl } from '$lib/services/mediaService';
import { FilloutContentCache } from './FilloutContentCache';

/**
 * ADR 0026 — reaction media is offline-complete at load and pinned against eviction.
 *
 * Layer 1 (bytes, automatic): the reactive load path caches ALL of a study's assets,
 * including `mediaId`-only reaction-experiment assets resolved through the same-origin
 * proxy — not just direct `url`/`src` fields.
 *
 * Eviction pinning: media owned by a cached reaction-bearing definition is never evicted
 * to make room, even when no session references it — a reaction study must stay
 * offline-complete or it is unrunnable by design.
 */

/** In-memory Cache-API double supporting match/put/delete. */
function installCache(preload: Record<string, number> = {}) {
	const store = new Map<string, number>(Object.entries(preload));
	const deletes: string[] = [];
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
		delete: vi.fn(async (url: string) => {
			deletes.push(url);
			return store.delete(url);
		}),
	};
	vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
	return { cache, store, deletes };
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

/**
 * fetch double that NEVER resolves on its own — it only settles by rejecting when the
 * caller's AbortSignal fires. Models a hung asset (F-58): without the abort cap the caller
 * would hang forever; with it, the fetch rejects at the timeout budget.
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
	await db.filloutQuestionnaires.clear();
	await db.filloutSessions.clear();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('ADR 0026 Layer 1 — reactive load caches mediaId reaction assets', () => {
	it('caches a reaction-experiment mediaId asset through the same-origin proxy', async () => {
		const { store } = installCache();
		const fetchFn = installFetch(50);

		const mediaId = 'rx-asset-1';
		const proxyUrl = mediaContentUrl(mediaId);
		const payload = {
			id: 'qn-l1',
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

		await FilloutContentCache.cacheQuestionnaire(payload, 'LLL');

		// The mediaId-only asset was fetched and cached — the pre-ADR path (direct
		// url/src only) would have missed it entirely.
		// Each fetch is capped with an abort timeout so a hung asset can't stall the load (F-58).
		expect(fetchFn).toHaveBeenCalledWith(
			proxyUrl,
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		expect(store.has(proxyUrl)).toBe(true);

		const rows = await db.filloutMedia
			.where('questionnaireKey')
			.equals(filloutDefinitionKey('qn-l1', 1, 0, 0))
			.toArray();
		expect(rows.map((r) => r.url)).toContain(proxyUrl);
	});
});

describe('F-58 — a hung media asset never stalls the load path', () => {
	it('completes the load (asset skipped + logged) within the per-asset budget', async () => {
		installCache();
		const fetchFn = installHangingFetch();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const key = filloutDefinitionKey('qn-hang', 1, 0, 0);
		const payload = {
			id: 'qn-hang',
			version_major: 1,
			version_minor: 0,
			version_patch: 0,
			definition: {
				pages: [
					{
						questions: [
							{ id: 'q', type: 'reaction-experiment', config: { assets: [{ mediaId: 'hung' }] } },
						],
					},
				],
			},
		};

		await withShortMediaTimeout(20, async () => {
			// Resolves at all — a fetch with no timeout would hang here forever.
			await FilloutContentCache.cacheQuestionnaire(payload, 'HNG');
		});

		expect(fetchFn).toHaveBeenCalledWith(
			mediaContentUrl('hung'),
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		// The definition snapshot still landed — media failure did not fail the load.
		expect(await db.filloutQuestionnaires.get(key)).toBeTruthy();
		// The hung asset was skipped (no accounting row) and logged, not swallowed silently.
		expect(await db.filloutMedia.where('questionnaireKey').equals(key).count()).toBe(0);
		expect(warn).toHaveBeenCalled();

		warn.mockRestore();
	});
});

describe('ADR 0026 — eviction pins reaction-bearing media', () => {
	it('evicts non-reaction media under quota pressure but keeps reaction media', async () => {
		const reactionKey = filloutDefinitionKey('qn-reaction', 1, 0, 0);
		const formKey = filloutDefinitionKey('qn-form', 1, 0, 0);

		await db.filloutQuestionnaires.bulkPut([
			{
				id: reactionKey,
				questionnaireId: 'qn-reaction',
				accessCode: 'RRR',
				versionMajor: 1,
				versionMinor: 0,
				versionPatch: 0,
				data: {
					definition: { pages: [{ questions: [{ id: 'r', type: 'reaction-experiment' }] }] },
				},
				syncedAt: Date.now(),
			},
			{
				id: formKey,
				questionnaireId: 'qn-form',
				accessCode: 'FFF',
				versionMajor: 1,
				versionMinor: 0,
				versionPatch: 0,
				data: { definition: { pages: [{ questions: [{ id: 'f', type: 'text' }] }] } },
				syncedAt: Date.now(),
			},
		]);

		const reactionUrl = '/api/media/reaction/content';
		const formUrl = '/api/media/form/content';
		const media: FilloutMediaEntry[] = [
			{
				url: reactionUrl,
				questionnaireKey: reactionKey,
				questionnaireId: 'qn-reaction',
				versionMajor: 1,
				versionMinor: 0,
				versionPatch: 0,
				size: 100,
				// Newer, so a naive oldest-first eviction would target the form first anyway;
				// make the reaction media OLDER to prove pinning (not recency) protects it.
				cachedAt: Date.now() - 10_000,
			},
			{
				url: formUrl,
				questionnaireKey: formKey,
				questionnaireId: 'qn-form',
				versionMajor: 1,
				versionMinor: 0,
				versionPatch: 0,
				size: 100,
				cachedAt: Date.now(),
			},
		];
		await db.filloutMedia.bulkPut(media);

		const { store, deletes } = installCache({ [reactionUrl]: 100, [formUrl]: 100 });

		// quota 300 → cap = floor(300 * 0.5) = 150 bytes; total 200 > 150, so exactly
		// one group must be evicted. Reaction media is pinned, so it must be the form's.
		const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
		Object.defineProperty(navigator, 'storage', {
			configurable: true,
			value: { estimate: async () => ({ quota: 300 }) },
		});
		try {
			await FilloutContentCache.enforceMediaQuota();
		} finally {
			if (original) Object.defineProperty(navigator, 'storage', original);
			else delete (navigator as unknown as Record<string, unknown>).storage;
		}

		// Only the form media was evicted; the reaction study stays offline-complete.
		expect(deletes).toEqual([formUrl]);
		expect(store.has(reactionUrl)).toBe(true);
		const remaining = await db.filloutMedia.toArray();
		expect(remaining.map((r) => r.questionnaireKey)).toEqual([reactionKey]);
	});
});
