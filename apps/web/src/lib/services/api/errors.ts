/**
 * API error introspection.
 *
 * `callSdk` used to collapse every failure into a bare `Error(message)`, which
 * threw away the HTTP status — so a catch site could not tell "you are offline"
 * from "the server rejected this" from "your session expired". Every one of them
 * read the same to the user. `callSdk` now throws an `ApiError` carrying the
 * status; this module turns that (or any stray error) into the failure class a
 * catch site can actually branch on and report honestly.
 *
 * Sibling of `services/db/errors.ts`, which does the same job for Dexie.
 */

/** An HTTP failure that kept its status. Thrown by `callSdk`. */
export class ApiError extends Error {
	/** HTTP status, or null when the request never got a response (network down). */
	readonly status: number | null;

	constructor(message: string, status: number | null) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

/**
 * The failure classes a caller can act on differently. Anything we cannot
 * confidently place lands in `unknown`, whose message is the server's own —
 * we would rather show the author a raw backend string than invent a reason.
 */
export type ApiFailureKind = 'offline' | 'auth' | 'conflict' | 'server' | 'unknown';

export interface ApiErrorInfo {
	kind: ApiFailureKind;
	/** HTTP status when there was a response; null for network failures. */
	status: number | null;
	/** The underlying message — the server's own text when it sent one. */
	message: string;
}

/** A fetch that never reached the server rejects with a TypeError like this. */
function looksLikeNetworkFailure(message: string): boolean {
	return /failed to fetch|networkerror|network request failed|load failed/i.test(message);
}

export function describeApiError(err: unknown): ApiErrorInfo {
	const message =
		err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error occurred';
	const status = err instanceof ApiError ? err.status : null;

	// The browser knows it is offline, or the request never got a response at all.
	// Checked first: an offline browser cannot have produced a real status anyway.
	const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
	if (browserOffline || (status === null && looksLikeNetworkFailure(message))) {
		return { kind: 'offline', status, message };
	}

	if (status === 401 || status === 403) return { kind: 'auth', status, message };
	if (status === 409) return { kind: 'conflict', status, message };
	if (status !== null && status >= 500) return { kind: 'server', status, message };

	return { kind: 'unknown', status, message };
}
