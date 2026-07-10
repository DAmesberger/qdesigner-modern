/**
 * Dexie / IndexedDB error introspection.
 *
 * A bundled/minified Dexie throws instances whose CONSTRUCTOR name is mangled
 * (it surfaces in the console as e.g. `DexieError2`), which tells a debugger
 * nothing. The meaningful signal lives on `.name` (`DatabaseClosedError`,
 * `QuotaExceededError`, `ConstraintError`, `VersionError`, …) and, for the
 * wrapped native failure, on `.inner` (the underlying DOMException). These
 * helpers pull those out so a catch site can log an honest, actionable string
 * and branch on the real failure class instead of an opaque minified name.
 */

export interface DexieErrorInfo {
	/** Dexie's semantic error name (NOT the minified constructor name). */
	name: string;
	message: string;
	/** Name of the wrapped native DOMException, when Dexie wrapped one. */
	innerName?: string;
	innerMessage?: string;
	/** The device ran out of storage quota (surface a "free up space" message). */
	isQuotaExceeded: boolean;
	/** The connection was closed under us — typically another tab upgraded the DB. */
	isDatabaseClosed: boolean;
}

interface DexieLikeError {
	name?: string;
	message?: string;
	inner?: { name?: string; message?: string } | null;
}

export function describeDexieError(err: unknown): DexieErrorInfo {
	const e = (err ?? {}) as DexieLikeError;
	const name = e.name || (err instanceof Error ? err.name : 'UnknownError');
	const message = e.message || (err instanceof Error ? err.message : String(err));
	const innerName = e.inner?.name || undefined;
	const innerMessage = e.inner?.message || undefined;

	const mentionsQuota = (s?: string) => !!s && /quota/i.test(s);
	const isQuotaExceeded =
		name === 'QuotaExceededError' ||
		innerName === 'QuotaExceededError' ||
		mentionsQuota(message) ||
		mentionsQuota(innerMessage);

	const isDatabaseClosed =
		name === 'DatabaseClosedError' || innerName === 'DatabaseClosedError';

	return { name, message, innerName, innerMessage, isQuotaExceeded, isDatabaseClosed };
}

/** One-line, log-friendly rendering of a Dexie/IndexedDB error. */
export function formatDexieError(err: unknown): string {
	const info = describeDexieError(err);
	const inner = info.innerName
		? ` (inner ${info.innerName}${info.innerMessage ? `: ${info.innerMessage}` : ''})`
		: '';
	return `${info.name}: ${info.message}${inner}`;
}
