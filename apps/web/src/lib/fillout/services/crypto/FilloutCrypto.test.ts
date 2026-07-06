import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';

// The global test-setup replaces `crypto` with a stub that has ONLY randomUUID +
// getRandomValues (no `subtle`) — that is what makes the app degrade to the
// plaintext fallback in every OTHER test. Here we install Node's real WebCrypto
// so the actual AES-GCM key lifecycle runs end-to-end, then restore afterwards.
const originalCrypto = globalThis.crypto;

beforeAll(() => {
	Object.defineProperty(globalThis, 'crypto', {
		value: webcrypto,
		configurable: true,
		writable: true,
	});
});

afterAll(() => {
	Object.defineProperty(globalThis, 'crypto', {
		value: originalCrypto,
		configurable: true,
		writable: true,
	});
});

// Import AFTER the crypto swap so the module sees a real `crypto.subtle`.
const { FilloutCrypto } = await import('./FilloutCrypto');
const { encryptValue, decryptValue, isEncryptedEnvelope } = await import('./envelope');
const { db, DEVICE_ROOT_KEY_ID } = await import('$lib/services/db/indexeddb');

beforeEach(async () => {
	await db.filloutKeys.clear();
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
	await db.filloutSessions.clear();
	// Drop the tab-lifetime memo so each test starts from stored key material.
	FilloutCrypto.forgetSessionKey('s1');
	FilloutCrypto.forgetSessionKey('s2');
	// Reset the root-key memo by reaching through the instance (test-only).
	(FilloutCrypto as unknown as { rootKeyPromise: unknown }).rootKeyPromise = null;
	(FilloutCrypto as unknown as { sessionKeys: Map<string, unknown> }).sessionKeys.clear();
});

describe('FilloutCrypto — availability', () => {
	it('reports crypto.subtle available under real WebCrypto', () => {
		expect(FilloutCrypto.isAvailable()).toBe(true);
	});
});

describe('FilloutCrypto — device root key lifecycle', () => {
	it('generates a non-extractable root key once and persists it as a CryptoKey', async () => {
		const k1 = await FilloutCrypto.deriveOrLoadDeviceRootKey();
		expect(k1.extractable).toBe(false);
		expect(k1.usages.sort()).toEqual(['unwrapKey', 'wrapKey']);

		const row = await db.filloutKeys.get(DEVICE_ROOT_KEY_ID);
		expect(row?.rootKey).toBeTruthy();
		// The stored form is a CryptoKey object, not raw bytes.
		expect(row?.wrappedKey).toBeUndefined();

		// A second call returns the SAME persisted key (no regeneration).
		(FilloutCrypto as unknown as { rootKeyPromise: unknown }).rootKeyPromise = null;
		const k2 = await FilloutCrypto.deriveOrLoadDeviceRootKey();
		expect(k2.extractable).toBe(false);
		expect(await db.filloutKeys.count()).toBe(1);
	});
});

describe('FilloutCrypto — field round-trip', () => {
	it('encryptField stores an opaque envelope and decryptField recovers the original', async () => {
		const original = { choice: 'red', freeText: 'a secret answer', nested: [1, 2, 3] };
		const stored = await FilloutCrypto.encryptField('s1', original);

		// The stored slot is an envelope, NOT the readable object.
		expect(isEncryptedEnvelope(stored)).toBe(true);
		expect(JSON.stringify(stored)).not.toContain('secret answer');

		// A wrapped session key row now exists.
		const keyRow = await db.filloutKeys.get('s1');
		expect(keyRow?.wrappedKey).toBeTruthy();
		expect(keyRow?.iv).toBeTruthy();

		const back = await FilloutCrypto.decryptField('s1', stored);
		expect(back).toEqual(original);
	});

	it('undefined passes through unencrypted (absent slot stays absent)', async () => {
		expect(await FilloutCrypto.encryptField('s1', undefined)).toBeUndefined();
	});

	it('plaintext (non-envelope) values decrypt to themselves (legacy / fallback rows)', async () => {
		expect(await FilloutCrypto.decryptField('s1', { plain: true })).toEqual({ plain: true });
		expect(await FilloutCrypto.decryptField('s1', 42)).toBe(42);
	});

	it('survives a simulated reload: unwraps the stored key and decrypts', async () => {
		const original = { v: 'persist-me' };
		const stored = await FilloutCrypto.encryptField('s1', original);

		// Simulate a fresh tab: drop all in-memory key material; only IndexedDB survives.
		(FilloutCrypto as unknown as { rootKeyPromise: unknown }).rootKeyPromise = null;
		(FilloutCrypto as unknown as { sessionKeys: Map<string, unknown> }).sessionKeys.clear();

		const back = await FilloutCrypto.decryptField('s1', stored);
		expect(back).toEqual(original);
	});

	it('different sessions get independent keys — one cannot read the other', async () => {
		const stored = await FilloutCrypto.encryptField('s1', { x: 1 });
		// Decrypting s1's envelope under s2's key must fail (AES-GCM auth error).
		await expect(FilloutCrypto.decryptField('s2', stored)).rejects.toBeTruthy();
	});
});

describe('envelope — wrong key throws', () => {
	it('decryptValue with the wrong key rejects (AES-GCM auth failure)', async () => {
		const keyA = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
			'encrypt',
			'decrypt',
		]);
		const keyB = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
			'encrypt',
			'decrypt',
		]);
		const env = await encryptValue(keyA, { secret: true });
		expect(await decryptValue(keyA, env)).toEqual({ secret: true });
		await expect(decryptValue(keyB, env)).rejects.toBeTruthy();
	});
});

describe('FilloutCrypto — purge destroys the session key', () => {
	it('purgeSyncedSessionData removes the filloutKeys row once the session is fully drained', async () => {
		// A completed, fully-synced session with one synced response + its key.
		await db.filloutSessions.put({
			id: 's1',
			questionnaireId: 'q',
			status: 'completed',
			versionMajor: 1,
			versionMinor: 0,
			versionPatch: 0,
			createdAt: 1,
			synced: 1,
		});
		const env = await FilloutCrypto.encryptField('s1', { a: 1 });
		await db.filloutResponses.add({
			sessionId: 's1',
			clientId: 'c1',
			questionId: 'q1',
			value: env,
			synced: 1,
		});
		expect(await db.filloutKeys.get('s1')).toBeTruthy();

		await db.purgeSyncedSessionData('s1');

		expect(await db.filloutResponses.where('sessionId').equals('s1').count()).toBe(0);
		expect(await db.filloutSessions.get('s1')).toBeUndefined();
		// Key destroyed — any residual ciphertext for s1 is now permanently unreadable.
		expect(await db.filloutKeys.get('s1')).toBeUndefined();
	});

	it('keeps the session key while unsynced ciphertext for that session survives', async () => {
		await db.filloutSessions.put({
			id: 's1',
			questionnaireId: 'q',
			status: 'completed',
			versionMajor: 1,
			versionMinor: 0,
			versionPatch: 0,
			createdAt: 1,
			synced: 1,
		});
		await FilloutCrypto.encryptField('s1', { a: 1 });
		// One synced + one still-unsynced response.
		await db.filloutResponses.add({ sessionId: 's1', clientId: 'c-s', questionId: 'q1', value: 1, synced: 1 });
		await db.filloutResponses.add({ sessionId: 's1', clientId: 'c-u', questionId: 'q2', value: 2, synced: 0 });

		await db.purgeSyncedSessionData('s1');

		// Unsynced row survives → key must NOT be destroyed.
		expect(await db.filloutResponses.where('sessionId').equals('s1').count()).toBe(1);
		expect(await db.filloutKeys.get('s1')).toBeTruthy();
	});
});
