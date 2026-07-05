import type { QuotaGroup, QuotaDefinition } from '$lib/shared/types/questionnaire';

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
