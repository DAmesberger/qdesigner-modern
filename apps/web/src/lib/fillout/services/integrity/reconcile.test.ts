import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';
import { OfflineResponsePersistence } from '../OfflineResponsePersistence';
import { computeChecksum, verifyChecksum, canonicalize } from './checksum';
import {
	SyncLedger,
	DEAD_LETTER_ATTEMPTS,
	onIntegrityAlert,
	type IntegrityAlert,
} from './SyncLedger';

beforeEach(async () => {
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
	await db.filloutSyncLedger.clear();
});

describe('checksum', () => {
	it('canonicalizes with sorted keys so field order does not change the digest', async () => {
		const a = await computeChecksum({ b: 1, a: 2 });
		const b = await computeChecksum({ a: 2, b: 1 });
		expect(a).toBe(b);
		expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
	});

	it('verifies a matching payload and rejects a tampered one', async () => {
		const sum = await computeChecksum({ value: 'intact' });
		expect(await verifyChecksum({ value: 'intact' }, sum)).toBe(true);
		expect(await verifyChecksum({ value: 'tampered' }, sum)).toBe(false);
	});

	it('abstains (returns true) when no checksum is stored — legacy rows are not falsely escalated', async () => {
		expect(await verifyChecksum({ anything: 1 }, undefined)).toBe(true);
	});
});

describe('checksum verify-on-read escalation (E-OFF-5 step 1)', () => {
	it('a tampered stored response fails verification, is escalated, and is dropped from the sync stream', async () => {
		const alerts: IntegrityAlert[] = [];
		const off = onIntegrityAlert((a) => alerts.push(a));

		await OfflineResponsePersistence.saveResponse('s-tamper', { questionId: 'q1', value: 1 });
		const row = await db.filloutResponses.where('sessionId').equals('s-tamper').first();
		expect(row?.checksum).toBeTruthy();

		// Tamper the stored value WITHOUT recomputing the checksum — simulates a
		// partial write / corruption / on-disk mutation.
		await db.filloutResponses.update(row!.id!, { value: 999 });

		const unsynced = await OfflineResponsePersistence.getUnsyncedResponses('s-tamper');
		// Corrupt row is excluded from what would be synced…
		expect(unsynced).toHaveLength(0);
		// …but NOT deleted — it survives on disk for recovery/export.
		expect(await db.filloutResponses.where('sessionId').equals('s-tamper').count()).toBe(1);
		// …and it is escalated to dead-letter with a visible alert.
		const ledger = await db.filloutSyncLedger.get(row!.clientId);
		expect(ledger?.state).toBe('deadletter');
		expect(alerts.some((a) => a.type === 'checksum-mismatch' && a.clientId === row!.clientId)).toBe(true);

		off();
	});
});

describe('dead-letter after K failed attempts (E-OFF-5 step 3)', () => {
	it('a record that fails to sync K times moves to dead-letter and raises a visible alert — never a silent delete', async () => {
		const alerts: IntegrityAlert[] = [];
		const off = onIntegrityAlert((a) => alerts.push(a));

		await SyncLedger.enqueue('response', 'cid-dead', 's-dl');

		// One shy of the threshold stays pending (still retriable).
		for (let i = 0; i < DEAD_LETTER_ATTEMPTS - 1; i++) {
			await SyncLedger.markAttempt(['cid-dead'], 'HTTP 500');
		}
		expect((await db.filloutSyncLedger.get('cid-dead'))?.state).toBe('pending');
		expect(alerts).toHaveLength(0);

		// The K-th attempt crosses the threshold.
		const newlyDead = await SyncLedger.markAttempt(['cid-dead'], 'HTTP 500');
		expect(newlyDead).toEqual(['cid-dead']);

		const entry = await db.filloutSyncLedger.get('cid-dead');
		expect(entry?.state).toBe('deadletter'); // escalated, not deleted
		expect(entry?.attempts).toBe(DEAD_LETTER_ATTEMPTS);
		expect(alerts.some((a) => a.type === 'deadletter' && a.clientId === 'cid-dead')).toBe(true);

		// Further attempts are inert (already dead-lettered).
		await SyncLedger.markAttempt(['cid-dead'], 'HTTP 500');
		expect((await db.filloutSyncLedger.get('cid-dead'))?.attempts).toBe(DEAD_LETTER_ATTEMPTS);

		off();
	});

	it('stats reflect the pending/acked/deadletter breakdown', async () => {
		await SyncLedger.enqueue('response', 'a', 's');
		await SyncLedger.enqueue('event', 'b', 's');
		await SyncLedger.markAcked(['b']);
		for (let i = 0; i < DEAD_LETTER_ATTEMPTS; i++) await SyncLedger.markAttempt(['a'], 'x');

		const stats = await SyncLedger.stats();
		expect(stats).toEqual({ pending: 0, acked: 1, deadletter: 1, total: 2 });
	});
});

describe('reconcile (E-OFF-5 step 5)', () => {
	it('re-queues a locally-acked row the server does NOT actually hold', async () => {
		// A response the client believes is synced (ledger acked, record synced=1).
		await OfflineResponsePersistence.saveResponse('s-rec', { questionId: 'q1', value: 5 });
		const row = await db.filloutResponses.where('sessionId').equals('s-rec').first();
		await db.filloutResponses.update(row!.id!, { synced: 1 });
		await SyncLedger.markAcked([row!.clientId]);
		expect((await db.filloutSyncLedger.get(row!.clientId))?.state).toBe('acked');

		// Server reports it does NOT have this client_id (simulate a lost insert).
		const requeued = await SyncLedger.reconcile('s-rec', async () => []);

		expect(requeued).toEqual([row!.clientId]);
		// Ledger row is back to pending and the underlying record re-enters the queue.
		expect((await db.filloutSyncLedger.get(row!.clientId))?.state).toBe('pending');
		expect((await db.filloutResponses.get(row!.id!))?.synced).toBe(0);
	});

	it('leaves an acked row alone when the server confirms it holds the record', async () => {
		await OfflineResponsePersistence.saveResponse('s-ok', { questionId: 'q1', value: 5 });
		const row = await db.filloutResponses.where('sessionId').equals('s-ok').first();
		await db.filloutResponses.update(row!.id!, { synced: 1 });
		await SyncLedger.markAcked([row!.clientId]);

		const requeued = await SyncLedger.reconcile('s-ok', async () => [row!.clientId]);

		expect(requeued).toEqual([]);
		expect((await db.filloutSyncLedger.get(row!.clientId))?.state).toBe('acked');
		expect((await db.filloutResponses.get(row!.id!))?.synced).toBe(1);
	});

	it('short-circuits without a server call when nothing is locally acked', async () => {
		const fetcher = vi.fn(async () => ['whatever']);
		const requeued = await SyncLedger.reconcile('s-empty', fetcher);
		expect(requeued).toEqual([]);
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe('write-verify + enqueue (E-OFF-5 steps 2, 3)', () => {
	it('saving a response persists a checksum and a pending ledger row', async () => {
		await OfflineResponsePersistence.saveResponse('s-w', { questionId: 'q1', value: 7 });
		const row = await db.filloutResponses.where('sessionId').equals('s-w').first();
		expect(row?.checksum).toMatch(/^(sha256|fnv1a):/);
		expect(row?.attempts).toBe(0);
		const ledger = await db.filloutSyncLedger.get(row!.clientId);
		expect(ledger).toMatchObject({ kind: 'response', state: 'pending', sessionId: 's-w' });
	});

	it('exportUnsyncedData returns the pending rows for off-device recovery', async () => {
		await OfflineResponsePersistence.saveResponse('s-x', { questionId: 'q1', value: 1 });
		await OfflineResponsePersistence.saveVariable('s-x', 'score', 42);
		const dump = await OfflineResponsePersistence.exportUnsyncedData();
		expect(dump.responses).toHaveLength(1);
		expect(dump.variables).toHaveLength(1);
		expect(dump.responses[0]?.value).toBe(1);
		expect(dump.variables[0]?.value).toBe(42);
		expect(typeof dump.exportedAt).toBe('string');
	});
});
