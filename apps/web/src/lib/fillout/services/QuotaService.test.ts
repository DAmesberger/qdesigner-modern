import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QuotaService } from './QuotaService';
import type { QuotaGroup } from '$lib/shared/types/questionnaire';

const QID = '11111111-1111-1111-1111-111111111111';

function group(quotas: QuotaGroup['quotas']): QuotaGroup {
	return {
		id: 'g1',
		name: 'Gender',
		quotas,
		logic: 'independent',
		variables: ['gender'],
	};
}

function statusResponse(
	rows: Array<{ id: string; target: number; current: number }>
) {
	return {
		ok: true,
		json: async () => ({
			quotas: rows.map((r) => ({
				quota_id: r.id,
				name: r.id,
				target: r.target,
				current: r.current,
				is_full: r.current >= r.target,
			})),
			total_completed: rows.reduce((a, r) => a + r.current, 0),
		}),
	};
}

// The shared test-setup stubs `localStorage` with non-storing vi.fn mocks, so
// install a real in-memory store for the cache round-trip assertions.
function memoryLocalStorage(): Storage {
	const store = new Map<string, string>();
	return {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
		setItem: (k: string, v: string) => void store.set(k, String(v)),
		removeItem: (k: string) => void store.delete(k),
		key: (i: number) => Array.from(store.keys())[i] ?? null,
	} as Storage;
}

describe('QuotaService', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.stubGlobal('localStorage', memoryLocalStorage());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('only blocks the quota whose condition matches the respondent', async () => {
		// male cell is full (2/2), female cell is not (1/2).
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				statusResponse([
					{ id: 'q-male', target: 2, current: 2 },
					{ id: 'q-female', target: 2, current: 1 },
				])
			)
		);

		const groups = [
			group([
				{
					id: 'q-male',
					name: 'Male',
					target: 2,
					condition: 'gender == male',
					overQuotaAction: 'terminate',
					enabled: true,
				},
				{
					id: 'q-female',
					name: 'Female',
					target: 2,
					condition: 'gender == female',
					overQuotaAction: 'terminate',
					enabled: true,
				},
			]),
		];

		// A male respondent matches the FULL male cell → blocked.
		const male = await QuotaService.checkQuotas(
			QID,
			groups,
			new Map([['gender', 'male']])
		);
		expect(male.allowed).toBe(false);
		expect(male.unchecked).toBeUndefined();
		expect(male.fullQuotas.map((q) => q.id)).toEqual(['q-male']);

		// A female respondent matches the NOT-full female cell → allowed,
		// even though another (male) cell is full.
		const female = await QuotaService.checkQuotas(
			QID,
			groups,
			new Map([['gender', 'female']])
		);
		expect(female.allowed).toBe(true);
		expect(female.fullQuotas).toEqual([]);
	});

	it('caches the last good snapshot and reuses it when the fetch later fails', async () => {
		const groups = [
			group([
				{
					id: 'q-male',
					name: 'Male',
					target: 1,
					condition: 'gender == male',
					overQuotaAction: 'terminate',
					enabled: true,
				},
			]),
		];

		// First call succeeds and caches the (full) snapshot.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => statusResponse([{ id: 'q-male', target: 1, current: 1 }]))
		);
		const first = await QuotaService.checkQuotas(
			QID,
			groups,
			new Map([['gender', 'male']])
		);
		expect(first.allowed).toBe(false);
		expect(QuotaService.readCachedQuotaStatus(QID)).not.toBeNull();

		// Now the network fails — the cached full snapshot must still block.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('network down');
			})
		);
		const offline = await QuotaService.checkQuotas(
			QID,
			groups,
			new Map([['gender', 'male']])
		);
		expect(offline.allowed).toBe(false);
		expect(offline.unchecked).toBeUndefined();
		expect(offline.fullQuotas.map((q) => q.id)).toEqual(['q-male']);
	});

	it('returns unchecked when the fetch fails and no snapshot is cached', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('network down');
			})
		);
		const groups = [
			group([
				{
					id: 'q-male',
					name: 'Male',
					target: 1,
					condition: 'gender == male',
					overQuotaAction: 'terminate',
					enabled: true,
				},
			]),
		];
		const result = await QuotaService.checkQuotas(
			QID,
			groups,
			new Map([['gender', 'male']])
		);
		expect(result.allowed).toBe(true);
		expect(result.unchecked).toBe(true);
		expect(result.fullQuotas).toEqual([]);
	});

	it('fetchQuotaStatus throws on a non-OK response instead of returning []', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
		);
		await expect(QuotaService.fetchQuotaStatus(QID)).rejects.toThrow();
	});
});
