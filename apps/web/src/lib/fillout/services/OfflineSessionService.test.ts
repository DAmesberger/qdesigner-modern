import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/services/db/indexeddb';
import { OfflineSessionService } from './OfflineSessionService';

// Test setup mocks crypto.randomUUID to return `test-uuid-<random9>` strings;
// see apps/web/tests/setup/test-setup.ts. We assert the id is a string of
// the expected shape rather than a real UUID.
const ID_RE = /^test-uuid-[a-z0-9]+$/;

beforeEach(async () => {
	await db.filloutSessions.clear();
});

describe('OfflineSessionService.createSession', () => {
	it('generates a UUID id and marks synced=0', async () => {
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);
		expect(session.id).toMatch(ID_RE);
		expect(session.questionnaireId).toBe('q-1');
		expect(session.status).toBe('active');
		expect(session.synced).toBe(0);
		expect(session.versionMajor).toBe(1);
	});

	it('persists the session to IndexedDB', async () => {
		const session = await OfflineSessionService.createSession('q-2', 2, 1, 0, 'p-99');
		const stored = await db.filloutSessions.get(session.id);
		expect(stored).toBeDefined();
		expect(stored?.participantId).toBe('p-99');
	});

	it('two sessions for the same questionnaire have distinct ids', async () => {
		const a = await OfflineSessionService.createSession('q-3', 1, 0, 0);
		const b = await OfflineSessionService.createSession('q-3', 1, 0, 0);
		expect(a.id).not.toBe(b.id);
	});
});

describe('OfflineSessionService.resumeSession', () => {
	it('returns null for a non-existent id', async () => {
		const result = await OfflineSessionService.resumeSession('does-not-exist');
		expect(result).toBeNull();
	});

	it('returns null for a completed session', async () => {
		const session = await OfflineSessionService.createSession('q-r', 1, 0, 0);
		await OfflineSessionService.completeSession(session.id);
		const result = await OfflineSessionService.resumeSession(session.id);
		expect(result).toBeNull();
	});

	it('returns the session for an active id', async () => {
		const session = await OfflineSessionService.createSession('q-r2', 1, 0, 0);
		const result = await OfflineSessionService.resumeSession(session.id);
		expect(result?.id).toBe(session.id);
	});
});

describe('OfflineSessionService.findActiveSession', () => {
	it('returns null when no active session exists for the questionnaire', async () => {
		const result = await OfflineSessionService.findActiveSession('q-none');
		expect(result).toBeNull();
	});

	it('finds the active session by [questionnaireId+status]', async () => {
		const session = await OfflineSessionService.createSession('q-a', 1, 0, 0);
		const result = await OfflineSessionService.findActiveSession('q-a');
		expect(result?.id).toBe(session.id);
	});

	it('does not return a completed session', async () => {
		const session = await OfflineSessionService.createSession('q-b', 1, 0, 0);
		await OfflineSessionService.completeSession(session.id);
		const result = await OfflineSessionService.findActiveSession('q-b');
		expect(result).toBeNull();
	});
});

describe('OfflineSessionService.completeSession', () => {
	it('sets status=completed and completedAt', async () => {
		const session = await OfflineSessionService.createSession('q-c', 1, 0, 0);
		await OfflineSessionService.completeSession(session.id);
		const stored = await db.filloutSessions.get(session.id);
		expect(stored?.status).toBe('completed');
		expect(stored?.completedAt).toBeGreaterThan(0);
		expect(stored?.synced).toBe(0);
	});
});

describe('OfflineSessionService sync tracking', () => {
	it('getUnsyncedSessions returns sessions with synced=0', async () => {
		await OfflineSessionService.createSession('q-u1', 1, 0, 0);
		await OfflineSessionService.createSession('q-u2', 1, 0, 0);
		const unsynced = await OfflineSessionService.getUnsyncedSessions();
		expect(unsynced.length).toBe(2);
	});

	it('markSynced flips synced to 1, removing the session from unsynced list', async () => {
		const session = await OfflineSessionService.createSession('q-u3', 1, 0, 0);
		await OfflineSessionService.markSynced(session.id);
		const unsynced = await OfflineSessionService.getUnsyncedSessions();
		expect(unsynced.find((s) => s.id === session.id)).toBeUndefined();
	});

	it('updateProgress resets synced back to 0 (subsequent edit needs re-sync)', async () => {
		const session = await OfflineSessionService.createSession('q-u4', 1, 0, 0);
		await OfflineSessionService.markSynced(session.id);
		await OfflineSessionService.updateProgress(session.id, { page: 5 });
		const stored = await db.filloutSessions.get(session.id);
		expect(stored?.synced).toBe(0);
		expect((stored?.metadata as { progress?: { page: number } })?.progress?.page).toBe(5);
	});
});
