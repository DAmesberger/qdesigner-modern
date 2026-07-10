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
					condition: 'gender == "male"',
					overQuotaAction: 'terminate',
					enabled: true,
				},
				{
					id: 'q-female',
					name: 'Female',
					target: 2,
					condition: 'gender == "female"',
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
					condition: 'gender == "male"',
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
					condition: 'gender == "male"',
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

describe('QuotaService interlocking cells (E-FLOW-7)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.stubGlobal('localStorage', memoryLocalStorage());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function crossGroup(): QuotaGroup {
		return {
			id: 'cg1',
			name: 'Age x Gender',
			logic: 'cross',
			variables: ['age', 'gender'],
			quotas: [],
			cells: [
				{ id: 'c1', values: { age: '25-34', gender: 'male' }, target: 2 },
				{ id: 'c2', values: { age: '25-34', gender: 'female' }, target: 2 },
				{ id: 'c3', values: { age: '18-24', gender: 'male' }, target: 2 },
			],
		};
	}

	function cellsResponse(rows: Array<{ key: string; target: number; current: number }>) {
		return {
			ok: true,
			json: async () => ({
				cells: rows.map((r) => ({
					cell_key: r.key,
					target: r.target,
					current: r.current,
					is_full: r.current >= r.target,
				})),
			}),
		};
	}

	it('serializes a cell key as sorted name=value pairs joined by "|"', () => {
		expect(QuotaService.quotaCellKey({ gender: 'male', age: '25-34' })).toBe(
			'age=25-34|gender=male'
		);
	});

	it('selects the single cell whose values all match the live variables', () => {
		const hit = QuotaService.selectCell(
			crossGroup(),
			new Map<string, unknown>([
				['age', '25-34'],
				['gender', 'male'],
			])
		);
		expect(hit?.cellKey).toBe('age=25-34|gender=male');
		expect(hit?.cell.id).toBe('c1');
	});

	it('returns null when no cell matches the participant', () => {
		const hit = QuotaService.selectCell(
			crossGroup(),
			new Map<string, unknown>([
				['age', '65+'],
				['gender', 'male'],
			])
		);
		expect(hit).toBeNull();
	});

	it('blocks ONLY when the participant own cell is full, not a sibling', async () => {
		// male 25-34 cell is FULL (2/2); female 25-34 is NOT (0/2).
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				cellsResponse([{ key: 'age=25-34|gender=male', target: 2, current: 2 }])
			)
		);

		const maleFull = await QuotaService.checkCells(
			QID,
			[crossGroup()],
			new Map<string, unknown>([
				['age', '25-34'],
				['gender', 'male'],
			])
		);
		expect(maleFull.cellKey).toBe('age=25-34|gender=male');
		expect(maleFull.allowed).toBe(false);

		// The female participant's own cell is empty → allowed, even though the
		// male sibling cell is full.
		const femaleOk = await QuotaService.checkCells(
			QID,
			[crossGroup()],
			new Map<string, unknown>([
				['age', '25-34'],
				['gender', 'female'],
			])
		);
		expect(femaleOk.cellKey).toBe('age=25-34|gender=female');
		expect(femaleOk.allowed).toBe(true);
	});

	it('allows a participant whose cell has no live count yet (occupancy 0)', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => cellsResponse([])));
		const res = await QuotaService.checkCells(
			QID,
			[crossGroup()],
			new Map<string, unknown>([
				['age', '18-24'],
				['gender', 'male'],
			])
		);
		expect(res.allowed).toBe(true);
		expect(res.cellKey).toBe('age=18-24|gender=male');
	});

	it('returns unchecked when cells cannot be fetched and no snapshot is cached', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline');
			})
		);
		const res = await QuotaService.checkCells(
			QID,
			[crossGroup()],
			new Map<string, unknown>([
				['age', '25-34'],
				['gender', 'male'],
			])
		);
		expect(res.allowed).toBe(true);
		expect(res.unchecked).toBe(true);
		expect(res.cellKey).toBe('age=25-34|gender=male');
	});
});

describe('QuotaService.evaluateQuotaCondition (F-45: real formula evaluation)', () => {
	const vars = (entries: Array<[string, unknown]>) => new Map<string, unknown>(entries);

	it('treats a blank/empty condition as a catch-all match (true)', async () => {
		expect(await QuotaService.evaluateQuotaCondition('', vars([]))).toBe(true);
		expect(await QuotaService.evaluateQuotaCondition('   ', vars([]))).toBe(true);
	});

	it('evaluates literal true / false through the engine', async () => {
		expect(await QuotaService.evaluateQuotaCondition('true', vars([]))).toBe(true);
		expect(await QuotaService.evaluateQuotaCondition('false', vars([]))).toBe(false);
	});

	it('matches a single string-equality comparison (backward compat)', async () => {
		expect(
			await QuotaService.evaluateQuotaCondition('gender == "male"', vars([['gender', 'male']]))
		).toBe(true);
		expect(
			await QuotaService.evaluateQuotaCondition('gender == "male"', vars([['gender', 'female']]))
		).toBe(false);
		expect(
			await QuotaService.evaluateQuotaCondition('gender != "male"', vars([['gender', 'female']]))
		).toBe(true);
	});

	it('matches single numeric comparisons across all operators', async () => {
		expect(await QuotaService.evaluateQuotaCondition('age >= 18', vars([['age', 18]]))).toBe(true);
		expect(await QuotaService.evaluateQuotaCondition('age >= 18', vars([['age', 17]]))).toBe(false);
		expect(await QuotaService.evaluateQuotaCondition('age < 65', vars([['age', 40]]))).toBe(true);
		expect(await QuotaService.evaluateQuotaCondition('age > 21', vars([['age', 21]]))).toBe(false);
		expect(await QuotaService.evaluateQuotaCondition('age <= 30', vars([['age', 30]]))).toBe(true);
	});

	it('coerces string-typed variable values in numeric comparisons', async () => {
		// Live answers often arrive as strings; loose `>=` coercion still compares.
		expect(await QuotaService.evaluateQuotaCondition('age >= 18', vars([['age', '25']]))).toBe(
			true
		);
	});

	it('evaluates a compound AND condition (both sides must hold)', async () => {
		const cond = 'gender == "male" && age >= 18';
		expect(
			await QuotaService.evaluateQuotaCondition(cond, vars([['gender', 'male'], ['age', 30]]))
		).toBe(true);
		expect(
			await QuotaService.evaluateQuotaCondition(cond, vars([['gender', 'male'], ['age', 15]]))
		).toBe(false);
		expect(
			await QuotaService.evaluateQuotaCondition(cond, vars([['gender', 'female'], ['age', 30]]))
		).toBe(false);
	});

	it('evaluates a compound OR condition (either side suffices)', async () => {
		const cond = 'country == "US" || country == "CA"';
		expect(
			await QuotaService.evaluateQuotaCondition(cond, vars([['country', 'CA']]))
		).toBe(true);
		expect(
			await QuotaService.evaluateQuotaCondition(cond, vars([['country', 'MX']]))
		).toBe(false);
	});

	it('respects parentheses / operator grouping', async () => {
		const cond = '(age >= 18 && age <= 65) && gender == "female"';
		expect(
			await QuotaService.evaluateQuotaCondition(cond, vars([['age', 40], ['gender', 'female']]))
		).toBe(true);
		expect(
			await QuotaService.evaluateQuotaCondition(cond, vars([['age', 70], ['gender', 'female']]))
		).toBe(false);
	});

	// The load-bearing regression: the old regex stub returned TRUE for ANY
	// compound condition (its `^var op value$` pattern never matched), silently
	// gating respondents against a full quota they should not have matched. The
	// real evaluator returns the CORRECT false here.
	it('FAIL-PRE / PASS-POST: a non-matching compound returns false (stub returned true)', async () => {
		const nonMatching = 'gender == "male" && age >= 30';
		expect(
			await QuotaService.evaluateQuotaCondition(
				nonMatching,
				vars([['gender', 'male'], ['age', 25]])
			)
		).toBe(false);
	});

	it('treats an unknown variable as non-matching (undefined comparison is falsy)', async () => {
		// `income` is absent from the respondent's variables → resolves undefined.
		expect(
			await QuotaService.evaluateQuotaCondition('income > 50000', vars([['age', 40]]))
		).toBe(false);
	});

	it('fails NON-MATCHING and warns on a syntax parse error', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(
			await QuotaService.evaluateQuotaCondition('gender ==', vars([['gender', 'male']]))
		).toBe(false);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('fails NON-MATCHING and warns on an evaluation error (unknown function)', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(
			await QuotaService.evaluateQuotaCondition('NONEXISTENT(age)', vars([['age', 40]]))
		).toBe(false);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});
