import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';

// Mock the api module before importing the engine so its captured reference
// points at our mock (vitest hoists vi.mock above the dynamic imports).
vi.mock('$lib/services/api', () => ({
	api: {
		sessions: {
			get: vi.fn(),
			create: vi.fn(),
			sync: vi.fn(),
			uploadMedia: vi.fn(),
		},
	},
}));

const { FilloutUploadSync } = await import('./FilloutUploadSync');
const { OfflineSessionService } = await import('./OfflineSessionService');
const { OfflineResponsePersistence } = await import('./OfflineResponsePersistence');
const { OfflineBinaryPersistence } = await import('./OfflineBinaryPersistence');
const { api } = await import('$lib/services/api');

const apiMock = api as unknown as {
	sessions: {
		get: ReturnType<typeof vi.fn>;
		create: ReturnType<typeof vi.fn>;
		sync: ReturnType<typeof vi.fn>;
		uploadMedia: ReturnType<typeof vi.fn>;
	};
};

beforeEach(async () => {
	await db.filloutSessions.clear();
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
	await db.filloutTrials.clear();
	await db.filloutBinaries.clear();
	await db.filloutSyncLedger.clear();
	apiMock.sessions.get.mockReset();
	apiMock.sessions.create.mockReset();
	apiMock.sessions.sync.mockReset();
	apiMock.sessions.uploadMedia.mockReset();
	vi.stubGlobal('navigator', { ...navigator, onLine: true });
});

describe('FilloutUploadSync binary answers (issue #34)', () => {
	it('uploads the pending blob, patches the response to its mediaUrl, and deletes the blob', async () => {
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);

		// Capture a binary answer offline-first, then persist the response holding
		// only the structured reference (the module's capture path).
		const file = new File([new Uint8Array(2048)], 'clip.webm', { type: 'video/webm' });
		const ref = await OfflineBinaryPersistence.capture(session.id, 'q-media', file, 'clip.webm');
		await OfflineResponsePersistence.saveResponse(session.id, {
			questionId: 'q-media',
			value: { ...ref, duration: 3, fileSize: ref.size, recordedAt: 1 },
		});

		apiMock.sessions.get.mockResolvedValue({ id: session.id });
		apiMock.sessions.uploadMedia.mockResolvedValue({
			url: '/api/media/deadbeef/content',
			filename: 'clip.webm',
			size: 2048,
			mimeType: 'video/webm',
		});
		// Server acks whatever client_ids it was sent.
		apiMock.sessions.sync.mockImplementation(async (_id: string, payload: any) => ({
			responses_synced: payload.responses.length,
			events_synced: 0,
			variables_synced: 0,
			accepted_client_ids: payload.responses.map((r: { client_id: string }) => r.client_id),
		}));

		const engine = new FilloutUploadSync();
		const result = await engine.syncNow();

		// The blob was uploaded exactly once.
		expect(apiMock.sessions.uploadMedia).toHaveBeenCalledTimes(1);
		expect(apiMock.sessions.uploadMedia.mock.calls[0]?.[0]).toBe(session.id);

		// The local blob is gone (server durably holds it → unpinned).
		expect(await db.filloutBinaries.get(ref.clientId)).toBeUndefined();

		// The response the server received carried the patched value.
		const lastSync = apiMock.sessions.sync.mock.calls.at(-1)?.[1] as {
			responses: { value: unknown }[];
		};
		const sentValue = lastSync.responses.at(-1)?.value as {
			status: string;
			mediaUrl: string;
		};
		expect(sentValue.status).toBe('uploaded');
		expect(sentValue.mediaUrl).toBe('/api/media/deadbeef/content');

		expect(result.errors).toEqual([]);
	});

	it('keeps the blob pinned and schedules a retry when the upload fails', async () => {
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);
		const file = new File([new Uint8Array(512)], 'a.png', { type: 'image/png' });
		const ref = await OfflineBinaryPersistence.capture(session.id, 'q-file', file, 'a.png');
		await OfflineResponsePersistence.saveResponse(session.id, {
			questionId: 'q-file',
			value: ref,
		});

		apiMock.sessions.get.mockResolvedValue({ id: session.id });
		apiMock.sessions.uploadMedia.mockRejectedValue(new Error('network down'));
		apiMock.sessions.sync.mockImplementation(async (_id: string, payload: any) => ({
			responses_synced: payload.responses.length,
			events_synced: 0,
			variables_synced: 0,
			accepted_client_ids: payload.responses.map((r: { client_id: string }) => r.client_id),
		}));

		const engine = new FilloutUploadSync();
		const result = await engine.syncNow();

		// Blob survives (pinned) for the next pass, and a retry is flagged.
		const stored = await db.filloutBinaries.get(ref.clientId);
		expect(stored).toBeDefined();
		expect(stored?.status).toBe('pending');
		expect(stored?.lastError).toContain('network down');
		expect(result.retriable).toBe(true);

		engine.stop();
	});

	it('backs off a failing upload: an immediate re-sync does not re-hit it, an elapsed one does', async () => {
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);
		const file = new File([new Uint8Array(512)], 'a.png', { type: 'image/png' });
		const ref = await OfflineBinaryPersistence.capture(session.id, 'q-file', file, 'a.png');
		await OfflineResponsePersistence.saveResponse(session.id, {
			questionId: 'q-file',
			value: ref,
		});

		apiMock.sessions.get.mockResolvedValue({ id: session.id });
		apiMock.sessions.uploadMedia.mockRejectedValue(new Error('network down'));
		apiMock.sessions.sync.mockImplementation(async (_id: string, payload: any) => ({
			responses_synced: payload.responses.length,
			events_synced: 0,
			variables_synced: 0,
			accepted_client_ids: payload.responses.map((r: { client_id: string }) => r.client_id),
		}));

		const engine = new FilloutUploadSync();

		// First pass fails → one upload attempt, backoff window opens.
		await engine.syncNow();
		expect(apiMock.sessions.uploadMedia).toHaveBeenCalledTimes(1);

		// A second sync fired immediately (e.g. an `online` flap or manual sync) must
		// NOT re-hit the still-backing-off upload — this is the hot-loop guard.
		await engine.syncNow();
		expect(apiMock.sessions.uploadMedia).toHaveBeenCalledTimes(1);

		// The blob is still pinned and pending the whole time.
		const stillPending = await db.filloutBinaries.get(ref.clientId);
		expect(stillPending?.status).toBe('pending');

		// Age the last attempt past the (1 attempt → 1s) backoff window; now it's due.
		await db.filloutBinaries.update(ref.clientId, { lastAttemptAt: Date.now() - 5000 });
		await engine.syncNow();
		expect(apiMock.sessions.uploadMedia).toHaveBeenCalledTimes(2);

		engine.stop();
	});
});
