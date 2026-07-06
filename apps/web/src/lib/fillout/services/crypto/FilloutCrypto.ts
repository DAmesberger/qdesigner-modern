import { db, DEVICE_ROOT_KEY_ID } from '$lib/services/db/indexeddb';
import {
	decryptValue,
	encryptValue,
	isEncryptedEnvelope,
	type EncryptedEnvelope
} from './envelope';

/**
 * Encryption-at-rest for offline fillout data (E-OFF-2).
 *
 * The offline store holds psychological-research PII on potentially shared/kiosk
 * devices. This module encrypts every sensitive slot (response value/metadata,
 * variable value, session metadata) with a per-session AES-GCM key BEFORE it is
 * written to IndexedDB, and decrypts on read.
 *
 * Key lifecycle:
 *  - A single non-extractable AES-GCM **device root key** is generated once and
 *    persisted as a `CryptoKey` object (structured-clone) under
 *    {@link DEVICE_ROOT_KEY_ID}. Because it is non-extractable, its raw bytes are
 *    never exposed to JS or written to disk.
 *  - Each session gets its own AES-GCM **data key**, generated on first use,
 *    wrapped by the device root key, and stored (wrapped) in `filloutKeys`.
 *  - Destroying a session's key row (purge-after-sync / clear-this-device) makes
 *    that session's residual ciphertext permanently unreadable.
 *
 * Insecure-context fallback: on a context without `crypto.subtle` (non-secure
 * origin) the store degrades to PLAINTEXT with a logged warning rather than
 * hard-failing participation. Read paths detect the envelope tag, so a device can
 * hold a mix of encrypted and plaintext rows without corruption.
 */
class FilloutCryptoImpl {
	private rootKeyPromise: Promise<CryptoKey> | null = null;
	private readonly sessionKeys = new Map<string, Promise<CryptoKey>>();
	private warnedUnavailable = false;

	/** Is a usable WebCrypto (subtle) present? False on insecure contexts. */
	isAvailable(): boolean {
		return (
			typeof crypto !== 'undefined' &&
			typeof crypto.subtle !== 'undefined' &&
			typeof crypto.subtle.generateKey === 'function'
		);
	}

	private warnOnce(): void {
		if (this.warnedUnavailable) return;
		this.warnedUnavailable = true;
		console.warn(
			'[FilloutCrypto] crypto.subtle unavailable (insecure context) — offline fillout data is stored UNENCRYPTED on this device.'
		);
	}

	/**
	 * Load the persisted device root key, generating and storing it on first run.
	 * Memoized for the lifetime of the tab so concurrent writers share one key.
	 */
	async deriveOrLoadDeviceRootKey(): Promise<CryptoKey> {
		if (this.rootKeyPromise) return this.rootKeyPromise;
		this.rootKeyPromise = (async () => {
			const existing = await db.filloutKeys.get(DEVICE_ROOT_KEY_ID);
			if (existing?.rootKey) return existing.rootKey;

			const rootKey = await crypto.subtle.generateKey(
				{ name: 'AES-GCM', length: 256 },
				// Non-extractable: raw bytes never leave WebCrypto. It only wraps/unwraps.
				false,
				['wrapKey', 'unwrapKey']
			);
			await db.filloutKeys.put({
				sessionId: DEVICE_ROOT_KEY_ID,
				rootKey,
				createdAt: Date.now()
			});
			return rootKey;
		})();
		// Reset the memo if generation failed so a later call can retry cleanly.
		this.rootKeyPromise.catch(() => {
			this.rootKeyPromise = null;
		});
		return this.rootKeyPromise;
	}

	/**
	 * Load (or lazily create) the per-session AES-GCM data key. Memoized per
	 * session id so concurrent writes within a tab never race a second key into
	 * existence for the same session.
	 */
	private async getSessionKey(sessionId: string): Promise<CryptoKey> {
		const cached = this.sessionKeys.get(sessionId);
		if (cached) return cached;

		const promise = (async () => {
			const root = await this.deriveOrLoadDeviceRootKey();
			const existing = await db.filloutKeys.get(sessionId);
			if (existing?.wrappedKey && existing.iv) {
				return crypto.subtle.unwrapKey(
					'raw',
					existing.wrappedKey,
					root,
					{ name: 'AES-GCM', iv: existing.iv },
					{ name: 'AES-GCM', length: 256 },
					// The unwrapped data key stays non-extractable — encrypt/decrypt only.
					false,
					['encrypt', 'decrypt']
				);
			}

			// Generate a fresh session key. It must be extractable *at generation*
			// so it can be wrapped for storage; the copy we store is wrapped, and the
			// in-memory copy is what we encrypt/decrypt with this tab.
			const sessionKey = await crypto.subtle.generateKey(
				{ name: 'AES-GCM', length: 256 },
				true,
				['encrypt', 'decrypt']
			);
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const wrappedKey = await crypto.subtle.wrapKey('raw', sessionKey, root, {
				name: 'AES-GCM',
				iv
			});
			await db.filloutKeys.put({ sessionId, wrappedKey, iv, createdAt: Date.now() });
			return sessionKey;
		})();

		this.sessionKeys.set(sessionId, promise);
		promise.catch(() => this.sessionKeys.delete(sessionId));
		return promise;
	}

	/**
	 * Encrypt a value for storage in `sessionId`'s scope. `undefined` passes
	 * through untouched (an absent slot stays absent, not `null`). On an insecure
	 * context, or if encryption throws, the plaintext is returned so participation
	 * never hard-fails — read paths handle the mixed store transparently.
	 */
	async encryptField(sessionId: string, value: unknown): Promise<unknown> {
		if (value === undefined) return undefined;
		if (!this.isAvailable()) {
			this.warnOnce();
			return value;
		}
		try {
			const key = await this.getSessionKey(sessionId);
			return await encryptValue(key, value);
		} catch (err) {
			console.warn('[FilloutCrypto] encryptField failed — storing plaintext:', err);
			return value;
		}
	}

	/**
	 * Decrypt a stored slot. A non-envelope value (legacy plaintext row or
	 * insecure-context fallback) is returned as-is. A wrong key / tampered
	 * ciphertext throws from AES-GCM — that is NOT swallowed (surfacing corruption
	 * beats silently returning garbage), except when subtle is entirely
	 * unavailable, where the still-encrypted envelope is returned unchanged.
	 */
	async decryptField(sessionId: string, value: unknown): Promise<unknown> {
		if (!isEncryptedEnvelope(value)) return value;
		if (!this.isAvailable()) {
			this.warnOnce();
			return value;
		}
		const key = await this.getSessionKey(sessionId);
		return decryptValue(key, value as EncryptedEnvelope);
	}

	/**
	 * Drop cached key material for a session from the in-memory map (used after a
	 * purge so a re-created session id starts from stored key material).
	 */
	forgetSessionKey(sessionId: string): void {
		this.sessionKeys.delete(sessionId);
	}
}

export const FilloutCrypto = new FilloutCryptoImpl();
