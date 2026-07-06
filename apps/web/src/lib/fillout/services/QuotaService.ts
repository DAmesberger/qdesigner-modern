import type { QuotaGroup, QuotaDefinition, QuotaCell } from '$lib/shared/types/questionnaire';

export interface QuotaCheckResult {
	allowed: boolean;
	fullQuotas: QuotaDefinition[];
	action?: 'terminate' | 'redirect' | 'skip-to-end' | 'continue';
	redirectUrl?: string;
	message?: string;
	/**
	 * True when the quota state could not be verified against the server AND
	 * no cached snapshot was available (e.g. first-ever offline start). The
	 * caller proceeds but records `quotaUnchecked` on the session so unverified
	 * completions can be filtered later.
	 */
	unchecked?: boolean;
}

interface CachedQuotaSnapshot {
	fetchedAt: string;
	statuses: QuotaStatus[];
}

const QUOTA_CACHE_PREFIX = 'qd-quota-status:';

export interface QuotaStatus {
	quotaId: string;
	name: string;
	target: number;
	current: number;
	isFull: boolean;
}

export interface QuotaStatusResponse {
	quotas: Array<{
		quota_id: string;
		name: string;
		target: number;
		current: number;
		is_full: boolean;
	}>;
	total_completed: number;
}

/** Live occupancy of one interlocking quota cell, from GET /quota-cells. */
export interface QuotaCellStatus {
	cellKey: string;
	target: number;
	current: number;
	isFull: boolean;
}

export interface QuotaCellsResponse {
	cells: Array<{
		cell_key: string;
		target: number;
		current: number;
		is_full: boolean;
	}>;
}

/**
 * Result of selecting the participant's interlocking cell (E-FLOW-7).
 * `cellKey` is the canonical serialized tuple (also exposed to the flow as the
 * `_quotaCell` variable). `allowed` is false only when THAT cell is full.
 */
export interface CellCheckResult {
	/** The participant's selected cell key, or `null` if no cross-quota matched. */
	cellKey: string | null;
	/** The matched cell definition (with its per-cell target), if any. */
	cell: QuotaCell | null;
	/** False only when the participant's own cell is full (independent-cell semantics). */
	allowed: boolean;
	action?: QuotaDefinition['overQuotaAction'];
	redirectUrl?: string;
	message?: string;
	/** True when cell occupancy could not be verified and no snapshot existed. */
	unchecked?: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export class QuotaService {
	/**
	 * Fetch the live quota snapshot from the server. On success the snapshot is
	 * cached to localStorage so an offline start can still enforce quotas.
	 *
	 * THROWS on a non-OK response or a network error (previously it swallowed
	 * both and returned `[]`, which silently allowed participation past a full
	 * quota). Callers must catch and decide the fallback.
	 */
	static async fetchQuotaStatus(questionnaireId: string): Promise<QuotaStatus[]> {
		const res = await fetch(
			`${API_BASE}/api/questionnaires/${questionnaireId}/quota-status`
		);
		if (!res.ok) {
			throw new Error(`Quota status request failed: ${res.status}`);
		}

		const data: QuotaStatusResponse = await res.json();
		const statuses = data.quotas.map((q) => ({
			quotaId: q.quota_id,
			name: q.name,
			target: q.target,
			current: q.current,
			isFull: q.is_full,
		}));

		this.cacheQuotaStatus(questionnaireId, statuses);
		return statuses;
	}

	/** Persist the last good snapshot for offline-start enforcement. */
	private static cacheQuotaStatus(questionnaireId: string, statuses: QuotaStatus[]): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const snapshot: CachedQuotaSnapshot = {
				fetchedAt: new Date().toISOString(),
				statuses,
			};
			localStorage.setItem(QUOTA_CACHE_PREFIX + questionnaireId, JSON.stringify(snapshot));
		} catch {
			// Storage full / disabled — non-fatal, we just lose the cache.
		}
	}

	/** Read the last cached snapshot, or `null` if none exists / is unreadable. */
	static readCachedQuotaStatus(questionnaireId: string): QuotaStatus[] | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			const raw = localStorage.getItem(QUOTA_CACHE_PREFIX + questionnaireId);
			if (!raw) return null;
			const snapshot = JSON.parse(raw) as CachedQuotaSnapshot;
			return Array.isArray(snapshot.statuses) ? snapshot.statuses : null;
		} catch {
			return null;
		}
	}

	static async checkQuotas(
		questionnaireId: string,
		quotaGroups: QuotaGroup[],
		currentValues: Map<string, unknown>
	): Promise<QuotaCheckResult> {
		// Prefer a live snapshot; on failure fall back to the last cached one.
		// If neither exists we proceed but flag the result as unchecked so the
		// caller can mark the session for later filtering.
		let statuses: QuotaStatus[];
		try {
			statuses = await this.fetchQuotaStatus(questionnaireId);
		} catch {
			const cached = this.readCachedQuotaStatus(questionnaireId);
			if (cached === null) {
				return { allowed: true, unchecked: true, fullQuotas: [] };
			}
			statuses = cached;
		}
		const statusMap = new Map(statuses.map((s) => [s.quotaId, s]));

		const fullQuotas: QuotaDefinition[] = [];

		for (const group of quotaGroups) {
			for (const quota of group.quotas) {
				if (!quota.enabled) continue;

				const status = statusMap.get(quota.id);
				if (!status) continue;

				// Check if this quota's condition matches the current respondent
				const conditionMatches = this.evaluateQuotaCondition(
					quota.condition,
					currentValues
				);

				if (conditionMatches && status.isFull) {
					fullQuotas.push({ ...quota, current: status.current });
				}
			}
		}

		if (fullQuotas.length === 0) {
			return { allowed: true, fullQuotas: [] };
		}

		// Use the first full quota's action as the primary action
		const primaryQuota = fullQuotas[0]!;
		return {
			allowed: primaryQuota.overQuotaAction === 'continue',
			fullQuotas,
			action: primaryQuota.overQuotaAction,
			redirectUrl: primaryQuota.overQuotaRedirectUrl,
			message:
				primaryQuota.overQuotaMessage ||
				'This study has reached its target number of participants. Thank you for your interest.',
		};
	}

	// ── Interlocking cross-quota cells (E-FLOW-7) ────────────────────

	/**
	 * Canonical serialization of an interlocking cell's value tuple — sorted
	 * `name=value` pairs joined by `|`. MUST match the server
	 * `sync::quota_cell_key` so a client-pinned key matches the server-resolved
	 * cell exactly.
	 */
	static quotaCellKey(values: Record<string, string>): string {
		return Object.keys(values)
			.sort()
			.map((k) => `${k}=${values[k] ?? ''}`)
			.join('|');
	}

	/**
	 * Select the participant's interlocking cell from a `logic: 'cross'` group
	 * by matching every one of the cell's `values` against the participant's
	 * live in-survey variables. Returns the single matching cell (and its key),
	 * or `null` when none matches (participant falls outside the grid). A cell's
	 * `values` map may omit a variable to mean "any value" (a marginal cell).
	 */
	static selectCell(
		group: QuotaGroup,
		currentValues: Map<string, unknown>
	): { cell: QuotaCell; cellKey: string } | null {
		if (group.logic !== 'cross' || !group.cells) return null;
		for (const cell of group.cells) {
			const matches = Object.entries(cell.values).every(
				([varName, expected]) => String(currentValues.get(varName)) === String(expected)
			);
			if (matches) {
				return { cell, cellKey: this.quotaCellKey(cell.values) };
			}
		}
		return null;
	}

	/**
	 * Fetch live per-cell occupancy from the server. Cells with no completions
	 * yet are simply absent (occupancy 0 ⇒ room available). Throws on a non-OK
	 * response so the caller can decide the offline fallback (mirrors
	 * {@link fetchQuotaStatus}).
	 */
	static async fetchCellStatus(questionnaireId: string): Promise<QuotaCellStatus[]> {
		const res = await fetch(`${API_BASE}/api/questionnaires/${questionnaireId}/quota-cells`);
		if (!res.ok) {
			throw new Error(`Quota cells request failed: ${res.status}`);
		}
		const data: QuotaCellsResponse = await res.json();
		return data.cells.map((c) => ({
			cellKey: c.cell_key,
			target: c.target,
			current: c.current,
			isFull: c.is_full,
		}));
	}

	/**
	 * Evaluate the interlocking cell gate for the participant against their live
	 * in-survey variables. Selects the participant's cell, fetches live
	 * occupancy, and blocks ONLY when that cell is full — sibling cells being
	 * full is irrelevant (independent-cell semantics). On a fetch failure with
	 * no cached snapshot the participant proceeds with `unchecked: true`.
	 *
	 * Designed to be re-invoked after in-survey demographic questions resolve
	 * the participant's cell, not only at entry.
	 */
	static async checkCells(
		questionnaireId: string,
		quotaGroups: QuotaGroup[],
		currentValues: Map<string, unknown>
	): Promise<CellCheckResult> {
		// Find the participant's cell across all cross-quota groups (first match).
		let selected: { group: QuotaGroup; cell: QuotaCell; cellKey: string } | null = null;
		for (const group of quotaGroups) {
			const hit = this.selectCell(group, currentValues);
			if (hit) {
				selected = { group, ...hit };
				break;
			}
		}

		if (!selected) {
			// No interlocking cell matched — cross-quota does not gate this participant.
			return { cellKey: null, cell: null, allowed: true };
		}

		let statuses: QuotaCellStatus[];
		try {
			statuses = await this.fetchCellStatus(questionnaireId);
			this.cacheCellStatus(questionnaireId, statuses);
		} catch {
			const cached = this.readCachedCellStatus(questionnaireId);
			if (cached === null) {
				return {
					cellKey: selected.cellKey,
					cell: selected.cell,
					allowed: true,
					unchecked: true,
				};
			}
			statuses = cached;
		}

		const live = statuses.find((s) => s.cellKey === selected!.cellKey);
		const target = selected.cell.target ?? 0;
		const current = live?.current ?? 0;
		const isFull = target > 0 && current >= target;

		if (!isFull) {
			return { cellKey: selected.cellKey, cell: { ...selected.cell, current }, allowed: true };
		}

		// The participant's own cell is full — block. Cross cells reuse the flat
		// over-quota action fields of the first quota in the group (if any).
		const action = selected.group.quotas[0]?.overQuotaAction ?? 'terminate';
		return {
			cellKey: selected.cellKey,
			cell: { ...selected.cell, current },
			allowed: action === 'continue',
			action,
			redirectUrl: selected.group.quotas[0]?.overQuotaRedirectUrl,
			message:
				selected.group.quotas[0]?.overQuotaMessage ||
				'This study has reached its target for your demographic group. Thank you for your interest.',
		};
	}

	private static readonly CELL_CACHE_PREFIX = 'qd-quota-cells:';

	private static cacheCellStatus(questionnaireId: string, statuses: QuotaCellStatus[]): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(
				this.CELL_CACHE_PREFIX + questionnaireId,
				JSON.stringify({ fetchedAt: new Date().toISOString(), statuses })
			);
		} catch {
			// non-fatal
		}
	}

	static readCachedCellStatus(questionnaireId: string): QuotaCellStatus[] | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			const raw = localStorage.getItem(this.CELL_CACHE_PREFIX + questionnaireId);
			if (!raw) return null;
			const snapshot = JSON.parse(raw) as { statuses?: QuotaCellStatus[] };
			return Array.isArray(snapshot.statuses) ? snapshot.statuses : null;
		} catch {
			return null;
		}
	}

	static evaluateQuotaCondition(
		condition: string,
		values: Map<string, unknown>
	): boolean {
		if (!condition || condition.trim() === '') return true;

		try {
			// Simple condition evaluation: supports basic comparisons
			// Format: "variableName == value" or "variableName != value"
			// or just "true" / "1" for catch-all quotas
			const trimmed = condition.trim();

			if (trimmed === 'true' || trimmed === '1') return true;
			if (trimmed === 'false' || trimmed === '0') return false;

			// Parse simple comparison: var == val, var != val, var > val, var < val
			const match = trimmed.match(
				/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/
			);
			if (!match) return true; // Unknown format, allow by default

			const [, varName, operator, rawValue] = match as RegExpMatchArray;
			const actual = values.get(varName!);

			// Parse the comparison value
			let expected: unknown;
			const rv = rawValue!.trim();
			if (rv.startsWith('"') && rv.endsWith('"')) {
				expected = rv.slice(1, -1);
			} else if (rv === 'true') {
				expected = true;
			} else if (rv === 'false') {
				expected = false;
			} else if (!isNaN(Number(rv))) {
				expected = Number(rv);
			} else {
				expected = rv;
			}

			switch (operator) {
				case '==':
					return String(actual) === String(expected);
				case '!=':
					return String(actual) !== String(expected);
				case '>':
					return Number(actual) > Number(expected);
				case '<':
					return Number(actual) < Number(expected);
				case '>=':
					return Number(actual) >= Number(expected);
				case '<=':
					return Number(actual) <= Number(expected);
				default:
					return true;
			}
		} catch {
			return true; // On error, allow by default
		}
	}
}
