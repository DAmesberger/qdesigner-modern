import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { db } from '$lib/services/db/indexeddb';
import { OfflineTrialPersistence } from './OfflineTrialPersistence';
import { OfflineResponsePersistence } from './OfflineResponsePersistence';
import { FilloutCrypto } from './crypto/FilloutCrypto';
import { SyncLedger, DEAD_LETTER_ATTEMPTS } from './integrity/SyncLedger';
import type { RuntimeTrialEvent } from '$lib/runtime/core/question-runtime';

// Like every other persistence test, the suite runs under the global crypto STUB
// (randomUUID + getRandomValues, no `subtle`), so at-rest encryption degrades to
// plaintext and the getter round-trips are exercised in plaintext. The AES-GCM
// at-rest property is asserted in its own describe that installs Node's real
// WebCrypto — the decrypt-through-IndexedDB round-trip itself is covered by
// FilloutCrypto.test (fake-indexeddb rehydrates a nested typed array in a foreign
// realm, so `iv instanceof Uint8Array` can't hold here; real browsers preserve it).

function makeEvent(overrides: Partial<RuntimeTrialEvent> = {}): RuntimeTrialEvent {
	return {
		questionId: 'q-1',
		trialIndex: 1,
		paradigm: 'stroop',
		optionId: 'congruent',
		source: 'keyboard',
		rtUs: 421_000,
		correct: true,
		sampledTimings: { phases: [{ name: 'stimulus', durationMs: 500, durationFrames: null }] },
		provenance: { onsetMethod: 'raf', responseMethod: 'event.timeStamp' },
		invalidated: null,
		...overrides,
	};
}

beforeEach(async () => {
	await db.filloutTrials.clear();
	await db.filloutSyncLedger.clear();
	await db.filloutKeys.clear();
	(FilloutCrypto as unknown as { rootKeyPromise: unknown }).rootKeyPromise = null;
	(FilloutCrypto as unknown as { sessionKeys: Map<string, unknown> }).sessionKeys.clear();
});

describe('OfflineTrialPersistence.persistTrialEvent', () => {
	it('writes one row per completed trial with a UUID clientId and synced=0', async () => {
		await OfflineTrialPersistence.persistTrialEvent('s-1', makeEvent({ trialIndex: 1 }));
		await OfflineTrialPersistence.persistTrialEvent('s-1', makeEvent({ trialIndex: 2 }));

		const rows = await db.filloutTrials.toArray();
		expect(rows).toHaveLength(2);
		expect(rows[0]!.clientId).not.toBe(rows[1]!.clientId);
		expect(rows.every((r) => r.synced === 0)).toBe(true);
		// Timing columns stay cleartext (like a response's reactionTimeUs).
		expect(rows.map((r) => r.trialIndex).sort()).toEqual([1, 2]);
		expect(rows[0]!.rtUs).toBe(421_000);
	});

	it('enqueues a pending ledger row per trial (kind=trial)', async () => {
		await OfflineTrialPersistence.persistTrialEvent('s-1', makeEvent());
		const stats = await SyncLedger.stats();
		expect(stats).toMatchObject({ pending: 1, acked: 0, deadletter: 0 });
		const [row] = await db.filloutSyncLedger.toArray();
		expect(row!.kind).toBe('trial');
	});

	it('round-trips the answer (optionId) through the getter', async () => {
		await OfflineTrialPersistence.persistTrialEvent('s-enc', makeEvent({ optionId: 'target' }));
		const unsynced = await OfflineTrialPersistence.getUnsyncedTrials('s-enc');
		expect(unsynced).toHaveLength(1);
		expect(unsynced[0]!.optionId).toBe('target');
	});
});

describe('OfflineTrialPersistence — at-rest encryption (E-OFF-2, real WebCrypto)', () => {
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

	it('stores the answer (optionId) as an AES-GCM envelope, never plaintext', async () => {
		await OfflineTrialPersistence.persistTrialEvent('s-crypto', makeEvent({ optionId: 'target' }));
		const [stored] = await db.filloutTrials.toArray();
		// The stored answer slot is an envelope ({ __enc: 1, iv, ciphertext }) — not
		// the plaintext string that was handed in.
		expect(stored!.optionId).not.toBe('target');
		expect((stored!.optionId as { __enc?: number }).__enc).toBe(1);
		// Timing columns are deliberately left cleartext for offline analytics.
		expect(stored!.rtUs).toBe(421_000);
	});
});

describe('OfflineTrialPersistence — unsynced queries + marking', () => {
	it('getUnsyncedTrials scopes to session and synced flag', async () => {
		await OfflineTrialPersistence.persistTrialEvent('s-A', makeEvent());
		await OfflineTrialPersistence.persistTrialEvent('s-B', makeEvent());
		const a = await OfflineTrialPersistence.getUnsyncedTrials('s-A');
		const b = await OfflineTrialPersistence.getUnsyncedTrials('s-B');
		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
	});

	it('markTrialsSynced flips only the named clientIds', async () => {
		await OfflineTrialPersistence.persistTrialEvent('s-1', makeEvent({ trialIndex: 1 }));
		await OfflineTrialPersistence.persistTrialEvent('s-1', makeEvent({ trialIndex: 2 }));
		const [a, b] = await db.filloutTrials.toArray();

		await OfflineTrialPersistence.markTrialsSynced([a!.clientId]);
		const remaining = await OfflineTrialPersistence.getUnsyncedTrials('s-1');
		expect(remaining.map((t) => t.clientId)).toEqual([b!.clientId]);
	});

	it('getSessionIdsWithUnsyncedTrials excludes dead-lettered rows', async () => {
		await OfflineTrialPersistence.persistTrialEvent('s-dead', makeEvent());
		const [row] = await db.filloutTrials.toArray();
		for (let i = 0; i < DEAD_LETTER_ATTEMPTS; i++) {
			await SyncLedger.markAttempt([row!.clientId], 'boom');
		}
		expect((await SyncLedger.stats()).deadletter).toBe(1);
		expect(await OfflineTrialPersistence.getSessionIdsWithUnsyncedTrials()).toEqual([]);
	});
});

describe('OfflineTrialPersistence — export + purge', () => {
	it('export includes unsynced trials via OfflineResponsePersistence', async () => {
		await OfflineTrialPersistence.persistTrialEvent('s-x', makeEvent({ optionId: 'left' }));
		const snapshot = await OfflineResponsePersistence.exportUnsyncedData();
		expect(snapshot.trials).toHaveLength(1);
		expect(snapshot.trials[0]!.optionId).toBe('left');
	});

	it('purgeSyncedSessionData removes only synced trials', async () => {
		await OfflineTrialPersistence.persistTrialEvent('s-p', makeEvent({ trialIndex: 1 }));
		await OfflineTrialPersistence.persistTrialEvent('s-p', makeEvent({ trialIndex: 2 }));
		const [a] = await db.filloutTrials.toArray();
		await OfflineTrialPersistence.markTrialsSynced([a!.clientId]);

		await db.purgeSyncedSessionData('s-p');

		const left = await db.filloutTrials.where('sessionId').equals('s-p').toArray();
		expect(left).toHaveLength(1);
		expect(left[0]!.synced).toBe(0);
	});
});
