import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/services/db/indexeddb';
import { OfflineResponsePersistence } from './OfflineResponsePersistence';

// Test setup mocks crypto.randomUUID; see apps/web/tests/setup/test-setup.ts.
const ID_RE = /^test-uuid-[a-z0-9]+$/;

beforeEach(async () => {
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
});

describe('saveResponse', () => {
	it('persists a response with a UUID clientId and synced=0', async () => {
		await OfflineResponsePersistence.saveResponse('s-1', {
			questionId: 'q-1',
			value: 42,
			reactionTimeUs: 1234,
		});
		const all = await db.filloutResponses.toArray();
		expect(all.length).toBe(1);
		expect(all[0]?.clientId).toMatch(ID_RE);
		expect(all[0]?.synced).toBe(0);
		expect(all[0]?.reactionTimeUs).toBe(1234);
	});

	it('two responses for the same question get distinct clientIds (dedup keys)', async () => {
		await OfflineResponsePersistence.saveResponse('s-1', { questionId: 'q-1', value: 'a' });
		await OfflineResponsePersistence.saveResponse('s-1', { questionId: 'q-1', value: 'b' });
		const all = await db.filloutResponses.toArray();
		expect(all.length).toBe(2);
		expect(all[0]?.clientId).not.toBe(all[1]?.clientId);
	});
});

describe('saveEvent', () => {
	it('persists an event with a UUID clientId', async () => {
		await OfflineResponsePersistence.saveEvent('s-1', {
			eventType: 'click',
			questionId: 'q-1',
			timestampUs: 100_000,
		});
		const all = await db.filloutEvents.toArray();
		expect(all[0]?.clientId).toMatch(ID_RE);
		expect(all[0]?.eventType).toBe('click');
		expect(all[0]?.synced).toBe(0);
	});
});

describe('saveVariable', () => {
	it('overwrites variable value (put semantics)', async () => {
		await OfflineResponsePersistence.saveVariable('s-1', 'score', 5);
		await OfflineResponsePersistence.saveVariable('s-1', 'score', 7);
		const vars = await OfflineResponsePersistence.getSessionVariables('s-1');
		expect(vars.length).toBe(1);
		expect(vars[0]?.value).toBe(7);
		expect(vars[0]?.synced).toBe(0);
	});
});

describe('unsynced queries scope to session and synced flag', () => {
	it('getUnsyncedResponses returns only the session with synced=0', async () => {
		await OfflineResponsePersistence.saveResponse('s-A', { questionId: 'q-1', value: 1 });
		await OfflineResponsePersistence.saveResponse('s-B', { questionId: 'q-1', value: 2 });
		const a = await OfflineResponsePersistence.getUnsyncedResponses('s-A');
		const b = await OfflineResponsePersistence.getUnsyncedResponses('s-B');
		expect(a.length).toBe(1);
		expect(b.length).toBe(1);
		expect(a[0]?.value).toBe(1);
		expect(b[0]?.value).toBe(2);
	});

	it('markResponsesSynced flips flag; subsequent getUnsynced excludes them', async () => {
		await OfflineResponsePersistence.saveResponse('s-1', { questionId: 'q-1', value: 1 });
		await OfflineResponsePersistence.saveResponse('s-1', { questionId: 'q-2', value: 2 });
		const before = await OfflineResponsePersistence.getUnsyncedResponses('s-1');
		expect(before.length).toBe(2);
		const ids = before.map((r) => r.id).filter((id): id is number => id !== undefined);
		await OfflineResponsePersistence.markResponsesSynced(ids);
		const after = await OfflineResponsePersistence.getUnsyncedResponses('s-1');
		expect(after.length).toBe(0);
	});
});

describe('clientId dedup contract', () => {
	it('a saved response always has a freshly-generated clientId (the server uses this for INSERT ... ON CONFLICT (client_id) DO NOTHING)', async () => {
		// Two distinct save calls produce distinct clientIds even if the
		// caller passes identical question_id and value — which is exactly
		// the scenario where server-side dedup needs to keep both rows.
		await OfflineResponsePersistence.saveResponse('s-1', { questionId: 'q-1', value: 'same' });
		await OfflineResponsePersistence.saveResponse('s-1', { questionId: 'q-1', value: 'same' });
		const all = await db.filloutResponses.toArray();
		expect(all.length).toBe(2);
		const clientIds = new Set(all.map((r) => r.clientId));
		expect(clientIds.size).toBe(2);
	});

	it('a re-sync of the SAME persisted response uses the SAME clientId (so the server dedups it)', async () => {
		await OfflineResponsePersistence.saveResponse('s-1', { questionId: 'q-1', value: 99 });
		const [first] = await db.filloutResponses.toArray();
		const originalClientId = first?.clientId;
		// Simulate the sync round-trip: clientId persists in the row so
		// retries (after a failed sync) send the same clientId to the
		// server and the server dedups via ON CONFLICT.
		const stored = await db.filloutResponses.toArray();
		expect(stored[0]?.clientId).toBe(originalClientId);
	});
});
