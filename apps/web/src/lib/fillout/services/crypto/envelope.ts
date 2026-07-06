/**
 * Encryption-at-rest envelope (E-OFF-2).
 *
 * A sensitive value (a response `value`/`metadata`, a variable `value`, a
 * session `metadata` blob) is serialized to JSON, encrypted with a per-session
 * AES-GCM key, and stored in IndexedDB as one of these envelopes IN PLACE of the
 * plaintext. IndexedDB persists whole structured clones, and `Uint8Array` /
 * `ArrayBuffer` round-trip losslessly, so no base64 hop is needed.
 *
 * The `__enc: 1` discriminator lets read paths tell an envelope apart from a
 * legacy plaintext row (pre-E-OFF-2) or a plaintext fallback row written on an
 * insecure context where `crypto.subtle` was unavailable — those are returned
 * as-is. Bumping the tag lets a future format coexist during migration.
 */
export interface EncryptedEnvelope {
	/** Format discriminator / version. Distinguishes an envelope from plaintext. */
	__enc: 1;
	/** Per-message AES-GCM initialization vector (96-bit, fresh per encryption). */
	iv: Uint8Array;
	/** AES-GCM ciphertext (includes the 128-bit auth tag). */
	ciphertext: ArrayBuffer;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** AES-GCM IV length in bytes (96 bits, the WebCrypto-recommended nonce size). */
const IV_LENGTH = 12;

/**
 * Type guard: is `value` one of our stored encrypted envelopes? A stored slot
 * that is NOT an envelope is treated as plaintext (legacy row or insecure-context
 * fallback) and passed through unchanged by the read paths.
 */
export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return (
		v.__enc === 1 &&
		v.iv instanceof Uint8Array &&
		(v.ciphertext instanceof ArrayBuffer ||
			// Some structured-clone implementations rehydrate the buffer as a typed
			// array's backing store; accept an ArrayBuffer-like with byteLength.
			(typeof v.ciphertext === 'object' &&
				v.ciphertext !== null &&
				'byteLength' in (v.ciphertext as object)))
	);
}

/**
 * Encrypt a JSON-serializable value into an {@link EncryptedEnvelope} under a
 * per-session AES-GCM key. A fresh random IV is generated for every call.
 */
export async function encryptValue(key: CryptoKey, plaintext: unknown): Promise<EncryptedEnvelope> {
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const data = encoder.encode(JSON.stringify(plaintext ?? null));
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
	return { __enc: 1, iv, ciphertext };
}

/**
 * Decrypt an {@link EncryptedEnvelope} back to its original value. Throws
 * (AES-GCM authentication failure → `OperationError`) if the key is wrong or the
 * ciphertext/IV was tampered with — callers must NOT swallow that into plaintext.
 */
export async function decryptValue(key: CryptoKey, envelope: EncryptedEnvelope): Promise<unknown> {
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: envelope.iv },
		key,
		envelope.ciphertext
	);
	return JSON.parse(decoder.decode(plain));
}
