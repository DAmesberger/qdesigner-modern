import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `static/sw.js` — the offline queue must not swallow engine-owned fillout mutations.
 *
 * `fetchWithOfflineQueue` answers a failed POST with a SYNTHETIC `202 {queued:true}`.
 * For `POST /api/sessions/{id}/media` that fake ack is participant-data loss (the sync
 * engine would unpin and delete the captured blob — ADR 0029 pin-until-ack), and for
 * `POST /api/sessions` it yields a session with no id. Both are engine-owned, exactly
 * like `/sync`: the real network error must propagate so the app-level retry owns them.
 *
 * The SW is a plain script with top-level `self.addEventListener`, so it is evaluated
 * here inside a function scope with a stubbed worker global.
 */

const SW_SOURCE = readFileSync(
	resolve(__dirname, '../../static/sw.js'),
	'utf8'
);

type FetchListener = (event: {
	request: FakeRequest;
	respondWith: (p: Promise<Response>) => void;
}) => void;

interface FakeRequest {
	url: string;
	method: string;
	mode: string;
	headers: Headers;
	clone(): FakeRequest;
	text(): Promise<string>;
}

interface LoadedSw {
	isFilloutSyncOwned: (url: URL, method: string) => boolean;
	fetchListener: FetchListener;
}

function loadServiceWorker(networkFetch: typeof fetch): LoadedSw {
	const listeners: Record<string, unknown> = {};
	const selfStub = {
		location: { origin: 'https://study.example.org' },
		addEventListener: (type: string, handler: unknown) => {
			listeners[type] = handler;
		},
		registration: { sync: { register: async () => undefined } },
		clients: { claim: async () => undefined },
		skipWaiting: async () => undefined,
	};
	class BroadcastChannelStub {
		postMessage() {}
		close() {}
	}
	const cachesStub = { open: async () => ({ match: async () => undefined, put: async () => {} }) };

	const factory = new Function(
		'self',
		'caches',
		'BroadcastChannel',
		'fetch',
		'console',
		`${SW_SOURCE}\n;return { isFilloutSyncOwned };`
	) as (
		self: unknown,
		caches: unknown,
		BroadcastChannel: unknown,
		fetch: unknown,
		console: unknown
	) => { isFilloutSyncOwned: (url: URL, method: string) => boolean };

	const exported = factory(selfStub, cachesStub, BroadcastChannelStub, networkFetch, {
		...console,
		log: () => {},
		warn: () => {},
		error: () => {},
	});

	return {
		isFilloutSyncOwned: exported.isFilloutSyncOwned,
		fetchListener: listeners.fetch as FetchListener,
	};
}

function postRequest(path: string): FakeRequest {
	const request: FakeRequest = {
		url: `https://study.example.org${path}`,
		method: 'POST',
		mode: 'cors',
		headers: new Headers({ 'content-type': 'application/json' }),
		clone: () => request,
		text: async () => '{}',
	};
	return request;
}

/** Drive the SW's fetch listener offline and return whatever it answered with. */
async function respondOffline(sw: LoadedSw, request: FakeRequest): Promise<Response> {
	let responded: Promise<Response> | undefined;
	sw.fetchListener({ request, respondWith: (p) => (responded = p) });
	if (!responded) throw new Error('service worker did not respond to the request');
	return responded;
}

const OFFLINE = () => Promise.reject(new TypeError('Failed to fetch'));

let sw: LoadedSw;

beforeEach(() => {
	sw = loadServiceWorker(vi.fn(OFFLINE) as unknown as typeof fetch);
});

describe('service worker — engine-owned fillout mutations are never faked as accepted', () => {
	const sessionId = '3f6e4b52-1f0b-4f1e-9d1a-1c2d3e4f5a6b';

	it('treats POST /api/sessions/{id}/media as engine-owned (binary answer upload)', () => {
		const url = new URL(`https://study.example.org/api/sessions/${sessionId}/media`);
		expect(sw.isFilloutSyncOwned(url, 'POST')).toBe(true);
	});

	it('treats POST /api/sessions as engine-owned (session create)', () => {
		expect(sw.isFilloutSyncOwned(new URL('https://study.example.org/api/sessions'), 'POST')).toBe(
			true
		);
	});

	it('propagates the network error for a binary upload instead of a synthetic 202', async () => {
		await expect(
			respondOffline(sw, postRequest(`/api/sessions/${sessionId}/media`))
		).rejects.toThrow(/failed to fetch/i);
	});

	it('propagates the network error for session create instead of a synthetic 202', async () => {
		await expect(respondOffline(sw, postRequest('/api/sessions'))).rejects.toThrow(
			/failed to fetch/i
		);
	});

	it('still queues a non-fillout mutation offline (the queue itself is intact)', async () => {
		const response = await respondOffline(sw, postRequest('/api/projects'));
		expect(response.status).toBe(202);
		await expect(response.json()).resolves.toMatchObject({ queued: true });
	});

	it('keeps /sync, /responses and /events engine-owned', () => {
		for (const path of ['sync', 'responses', 'events']) {
			const url = new URL(`https://study.example.org/api/sessions/${sessionId}/${path}`);
			expect(sw.isFilloutSyncOwned(url, 'POST')).toBe(true);
		}
	});
});
