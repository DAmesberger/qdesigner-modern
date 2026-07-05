import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './indexeddb';

// F005: purgeSyncedSessionData must remove ONLY synced rows of the target
// session and never touch unsynced rows or other sessions. Exercised against
// fake-indexeddb (auto-loaded in tests/setup/test-setup.ts).

beforeEach(async () => {
	await db.filloutSessions.clear();
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
});

async function seed() {
	// Target session A: completed, fully synced.
	await db.filloutSessions.put({
		id: 'A',
		questionnaireId: 'q-1',
		status: 'completed',
		versionMajor: 1,
		versionMinor: 0,
		versionPatch: 0,
		createdAt: 1,
		synced: 1,
	});
	// A: one synced response, one still-unsynced response.
	await db.filloutResponses.add({ sessionId: 'A', clientId: 'a-r-synced', questionId: 'q1', value: 1, synced: 1 });
	await db.filloutResponses.add({ sessionId: 'A', clientId: 'a-r-unsynced', questionId: 'q2', value: 2, synced: 0 });
	await db.filloutEvents.add({ sessionId: 'A', clientId: 'a-e-synced', eventType: 'x', timestampUs: 1, synced: 1 });
	await db.filloutEvents.add({ sessionId: 'A', clientId: 'a-e-unsynced', eventType: 'y', timestampUs: 2, synced: 0 });
	await db.filloutVariables.put({ sessionId: 'A', name: 'v-synced', value: 1, synced: 1 });
	await db.filloutVariables.put({ sessionId: 'A', name: 'v-unsynced', value: 2, synced: 0 });

	// Other session B: fully synced — must be untouched by a purge of A.
	await db.filloutSessions.put({
		id: 'B',
		questionnaireId: 'q-1',
		status: 'completed',
		versionMajor: 1,
		versionMinor: 0,
		versionPatch: 0,
		createdAt: 2,
		synced: 1,
	});
	await db.filloutResponses.add({ sessionId: 'B', clientId: 'b-r-synced', questionId: 'q1', value: 9, synced: 1 });
	await db.filloutEvents.add({ sessionId: 'B', clientId: 'b-e-synced', eventType: 'x', timestampUs: 1, synced: 1 });
	await db.filloutVariables.put({ sessionId: 'B', name: 'b-v-synced', value: 9, synced: 1 });
}

describe('purgeSyncedSessionData', () => {
	it('removes only synced rows of the target session; unsynced survive; other sessions untouched', async () => {
		await seed();
		await db.purgeSyncedSessionData('A');

		// Session A: synced rows gone, unsynced rows survive.
		const aResponses = await db.filloutResponses.where('sessionId').equals('A').toArray();
		expect(aResponses.map((r) => r.clientId)).toEqual(['a-r-unsynced']);

		const aEvents = await db.filloutEvents.where('sessionId').equals('A').toArray();
		expect(aEvents.map((e) => e.clientId)).toEqual(['a-e-unsynced']);

		const aVars = await db.filloutVariables.where('sessionId').equals('A').toArray();
		expect(aVars.map((v) => v.name)).toEqual(['v-unsynced']);

		// Other session B: entirely untouched.
		expect(await db.filloutResponses.where('sessionId').equals('B').count()).toBe(1);
		expect(await db.filloutEvents.where('sessionId').equals('B').count()).toBe(1);
		expect(await db.filloutVariables.where('sessionId').equals('B').count()).toBe(1);
		expect(await db.filloutSessions.get('B')).toBeTruthy();
	});

	it('keeps the session row when it still has unsynced child data (synced===0 stragglers block full cleanup)', async () => {
		await seed();
		// Session A row is synced:1, but a-r-unsynced etc. remain. Re-arm the
		// session row to synced:0 to model "not fully drained yet".
		await db.filloutSessions.update('A', { synced: 0 });
		await db.purgeSyncedSessionData('A');
		// Session row survives because its own synced flag is 0.
		expect(await db.filloutSessions.get('A')).toBeTruthy();
	});

	it('deletes the session row only when its own synced flag is 1', async () => {
		await seed();
		// Mark A's remaining children synced so nothing unsynced blocks it.
		await db.filloutResponses.where('sessionId').equals('A').modify({ synced: 1 });
		await db.filloutEvents.where('sessionId').equals('A').modify({ synced: 1 });
		await db.filloutVariables.where('sessionId').equals('A').modify({ synced: 1 });
		await db.purgeSyncedSessionData('A');
		expect(await db.filloutSessions.get('A')).toBeUndefined();
		expect(await db.filloutResponses.where('sessionId').equals('A').count()).toBe(0);
	});
});

describe('clearAllFilloutData', () => {
	it('wipes all fillout participant tables regardless of synced flag', async () => {
		await seed();
		await db.clearAllFilloutData();
		expect(await db.filloutSessions.count()).toBe(0);
		expect(await db.filloutResponses.count()).toBe(0);
		expect(await db.filloutEvents.count()).toBe(0);
		expect(await db.filloutVariables.count()).toBe(0);
	});
});
