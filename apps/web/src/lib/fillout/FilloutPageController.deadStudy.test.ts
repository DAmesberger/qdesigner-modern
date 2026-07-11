import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilloutPageController, type FilloutPageData } from './FilloutPageController.svelte';
import type { FilloutDefinition } from '$lib/fillout/types';
import { db } from '$lib/services/db/indexeddb';
import { SyncLedger } from '$lib/fillout/services/integrity/SyncLedger';

/**
 * F-53 — the connectivity banner counts are scoped to the CURRENT questionnaire's sessions,
 * and a dead-letter session for a different/deleted study is surfaced as a one-time
 * "previous study" affordance (export + discard) instead of an eternal browser-wide count.
 */

function makeData(questionnaireId: string): FilloutPageData {
	return {
		questionnaire: {
			id: questionnaireId,
			name: 'Study A',
			definition: { questions: [], variables: [] } as unknown as FilloutDefinition,
			variables: {},
			globalScripts: {},
			versionMajor: 1,
			versionMinor: 0,
			versionPatch: 0,
		},
		existingSession: null,
		code: 'ABC123',
		participantId: null,
		urlParams: {},
		preview: false,
		isOffline: true,
		pinnedFallback: false,
		resumeSnapshot: null,
		resumeCompleted: false,
		resumeFromDevice: false,
		resumeState: undefined,
		resumeStateSessionId: null,
		resumeSessionId: null,
	};
}

async function seedSession(id: string, questionnaireId: string) {
	await db.filloutSessions.put({
		id,
		questionnaireId,
		status: 'active',
		versionMajor: 1,
		versionMinor: 0,
		versionPatch: 0,
		createdAt: Date.now(),
		synced: 0,
	});
}

async function seedLedger(
	clientId: string,
	sessionId: string,
	state: 'pending' | 'acked' | 'deadletter'
) {
	await db.filloutSyncLedger.put({
		clientId,
		sessionId,
		kind: 'response',
		state,
		attempts: state === 'deadletter' ? 5 : 0,
		updatedAt: Date.now(),
	});
}

beforeEach(async () => {
	await db.filloutSessions.clear();
	await db.filloutSyncLedger.clear();
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
	await db.filloutTrials.clear();
});
afterEach(async () => {
	await db.filloutSessions.clear();
	await db.filloutSyncLedger.clear();
});

describe('SyncLedger scoping primitives (F-53)', () => {
	it('statsForSessions counts only the given sessions', async () => {
		await seedLedger('c1', 's-a', 'deadletter');
		await seedLedger('c2', 's-a', 'pending');
		await seedLedger('c3', 's-b', 'deadletter');

		const scoped = await SyncLedger.statsForSessions(new Set(['s-a']));
		expect(scoped.deadletter).toBe(1);
		expect(scoped.pending).toBe(1);

		const global = await SyncLedger.stats();
		expect(global.deadletter).toBe(2); // unscoped still counts both

		expect((await SyncLedger.deadletterSessionIds()).size).toBe(2);
	});
});

describe('db.purgeSessionCompletely (F-53)', () => {
	it('force-deletes all records, the session, its key, and its ledger rows', async () => {
		await seedSession('s-dead', 'q-deleted');
		await db.filloutResponses.put({
			sessionId: 's-dead',
			clientId: 'r1',
			questionId: 'q',
			value: 'x',
			synced: 0,
		});
		await db.filloutKeys.put({ sessionId: 's-dead', createdAt: Date.now() });
		await seedLedger('r1', 's-dead', 'deadletter');

		await db.purgeSessionCompletely('s-dead');

		expect(await db.filloutResponses.where('sessionId').equals('s-dead').count()).toBe(0);
		expect(await db.filloutSessions.get('s-dead')).toBeUndefined();
		expect(await db.filloutKeys.get('s-dead')).toBeUndefined();
		expect(await db.filloutSyncLedger.where('sessionId').equals('s-dead').count()).toBe(0);
	});
});

describe('FilloutPageController dead-study affordance (F-53)', () => {
	it('scopes the banner to the current questionnaire and surfaces the orphan as an affordance', async () => {
		// Current study q1 has one dead-letter + one pending; a DIFFERENT (deleted) study
		// q-deleted has two dead-letter records still stuck on this device.
		await seedSession('s-current', 'q1');
		await seedSession('s-dead', 'q-deleted');
		await seedLedger('cur-dead', 's-current', 'deadletter');
		await seedLedger('cur-pending', 's-current', 'pending');
		await seedLedger('dead-1', 's-dead', 'deadletter');
		await seedLedger('dead-2', 's-dead', 'deadletter');
		await db.filloutResponses.put({
			sessionId: 's-dead',
			clientId: 'dead-1',
			questionId: 'q',
			value: 'y',
			synced: 0,
		});

		const controller = new FilloutPageController(makeData('q1'));
		await controller.refreshSyncStats();

		// Banner shows ONLY the current study's counts, not the deleted study's dead-letters.
		expect(controller.deadletterCount).toBe(1);
		expect(controller.pendingCount).toBe(1);
		// The orphaned (deleted-study) session is surfaced as the one-time affordance instead.
		expect(controller.deadStudyCount).toBe(1);

		// Discarding crypto-erases just the orphaned session's data; the current study is untouched.
		await controller.discardDeadStudies();
		expect(controller.deadStudyCount).toBe(0);
		expect(await db.filloutResponses.where('sessionId').equals('s-dead').count()).toBe(0);
		expect(await db.filloutSyncLedger.where('sessionId').equals('s-dead').count()).toBe(0);
		// Current study's dead-letter is still counted (never discarded).
		await controller.refreshSyncStats();
		expect(controller.deadletterCount).toBe(1);
	});
});
