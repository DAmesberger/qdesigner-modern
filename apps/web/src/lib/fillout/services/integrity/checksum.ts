/**
 * Content checksums for offline fillout integrity (E-OFF-5).
 *
 * Every durable participant record (response / event / variable) carries a
 * checksum of its canonicalized content, computed at write time and re-verified
 * on read. A mismatch means the stored bytes changed underneath us — a partial
 * write, a corrupted structured clone, or tampering — and the record is escalated
 * rather than synced as if it were intact.
 *
 * Algorithm tagging: the checksum string is `"<algo>:<hex>"`. Production secure
 * contexts use SHA-256 via `crypto.subtle.digest`; a context without WebCrypto
 * (insecure origin, some test runners) falls back to a deterministic non-crypto
 * FNV-1a digest so integrity checking still functions. Verification recomputes
 * with the SAME algorithm the stored checksum was tagged with, so a record never
 * fails verification merely because the environment changed — and when the tagged
 * algorithm is unavailable to recompute, verification abstains (returns `true`)
 * instead of falsely escalating an intact record.
 */

/** Recursively key-sorted, whitespace-free JSON. Arrays keep their order. */
export function canonicalize(value: unknown): string {
	return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortValue);
	}
	if (value && typeof value === 'object') {
		// Preserve nothing environment-specific; sort keys for stability.
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			const v = (value as Record<string, unknown>)[key];
			// Drop `undefined` (JSON.stringify would anyway) so an explicit-undefined
			// slot and an absent slot hash identically.
			if (v !== undefined) out[key] = sortValue(v);
		}
		return out;
	}
	return value;
}

function toHex(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let out = '';
	for (let i = 0; i < bytes.length; i++) {
		out += (bytes[i] ?? 0).toString(16).padStart(2, '0');
	}
	return out;
}

/** Deterministic 32-bit FNV-1a over a UTF-16-ish code-unit stream, hex-encoded. */
function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		// 32-bit FNV prime multiply via shifts to stay in the safe integer range.
		hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

function subtle(): SubtleCrypto | undefined {
	const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
	return c && typeof c.subtle?.digest === 'function' ? c.subtle : undefined;
}

async function digestWithAlgo(algo: string, canonical: string): Promise<string | null> {
	if (algo === 'sha256') {
		const s = subtle();
		if (!s) return null;
		const bytes = new TextEncoder().encode(canonical);
		const digest = await s.digest('SHA-256', bytes);
		return `sha256:${toHex(digest)}`;
	}
	if (algo === 'fnv1a') {
		return `fnv1a:${fnv1a(canonical)}`;
	}
	return null;
}

/**
 * Compute the checksum of a record's content. Prefers SHA-256; falls back to a
 * tagged FNV-1a digest where WebCrypto is unavailable.
 */
export async function computeChecksum(payload: unknown): Promise<string> {
	const canonical = canonicalize(payload);
	const sha = await digestWithAlgo('sha256', canonical);
	return sha ?? (await digestWithAlgo('fnv1a', canonical))!;
}

/**
 * Verify a payload against a stored checksum. Returns `true` when they match.
 *
 * Abstains (returns `true`) — never escalates — when:
 *  - no checksum is stored (legacy record predating E-OFF-5), or
 *  - the tagged algorithm can't be recomputed in this environment (e.g. a
 *    SHA-256 checksum on a context that lost `crypto.subtle`).
 * Both are "cannot verify", which must not be conflated with "verified corrupt".
 */
export async function verifyChecksum(payload: unknown, expected: string | undefined): Promise<boolean> {
	if (!expected) return true;
	const algo = expected.split(':', 1)[0] ?? '';
	const actual = await digestWithAlgo(algo, canonicalize(payload));
	if (actual === null) return true; // cannot recompute — do not falsely escalate
	return actual === expected;
}
