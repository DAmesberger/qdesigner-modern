import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';

/**
 * Pin-until-ack (ADR 0029 Half 2), the participant-data-loss guard.
 *
 * The service worker's offline queue used to answer a failed `POST /api/sessions/{id}/media`
 * with a synthetic `202 {queued:true}` — a 2xx the HTTP client resolves happily, carrying
 * no media `url`. The sync engine read `result.url` (undefined), patched the response to
 * `status:'uploaded', mediaUrl: undefined`, and DELETED the pinned blob: the participant's
 * photo/audio/video answer destroyed, having never reached the server. Unrecoverable.
 *
 * `static/sw.js` no longer queues that route, but THIS is the load-bearing guard: whatever
 * fabricates a 2xx without a media url (a future SW change, a proxy, a captive portal), the
 * blob must stay PINNED and the binary must stay PENDING.
 */

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

/** Capture a binary answer offline-first + the response that references it. */
async function captureBinaryAnswer(sessionId: string) {
	const file = new File([new Uint8Array(4096)], 'answer.webm', { type: 'video/webm' });
	const ref = await OfflineBinaryPersistence.capture(sessionId, 'q-media', file, 'answer.webm');
	await OfflineResponsePersistence.saveResponse(sessionId, {
		questionId: 'q-media',
		value: ref,
	});
	return ref;
}

function ackAllSyncedIds() {
	apiMock.sessions.sync.mockImplementation(
		async (_id: string, payload: { responses: { client_id: string }[] }) => ({
			responses_synced: payload.responses.length,
			events_synced: 0,
			variables_synced: 0,
			accepted_client_ids: payload.responses.map((r) => r.client_id),
		})
	);
}

describe('FilloutUploadSync — a fake ack must never unpin a binary answer', () => {
	it('keeps the blob pinned when the upload resolves with a synthetic 202 {queued:true}', async () => {
		const session = await OfflineSessionService.createSession('q-1', 1, 0, 0);
		const ref = await captureBinaryAnswer(session.id);

		apiMock.sessions.get.mockResolvedValue({ id: session.id });
		// What the api wrapper hands back when the SW fabricates `202 {queued:true}`:
		// every field of the media-upload response is undefined — there is no `url`.
		apiMock.sessions.uploadMedia.mockResolvedValue({
			url: undefined,
			filename: undefined,
			size: undefined,
			mimeType: undefined,
		});
		ackAllSyncedIds();

		const engine = new FilloutUploadSync();
		const result = await engine.syncNow();

		// THE assertion: the participant's bytes are still on the device.
		const stored = await db.filloutBinaries.get(ref.clientId);
		expect(stored).toBeDefined();
		expect(stored?.data).toBeDefined();
		expect(stored?.status).toBe('pending');
		// Not falsely credited with a media URL, and the failure is recorded for backoff.
		expect(stored?.mediaUrl).toBeUndefined();
		expect(stored?.attempts).toBe(1);
		expect(stored?.lastError).toMatch(/not acknowledged/i);

		// The response still carries the PENDING reference — never `mediaUrl: undefined`.
		const responses = await db.filloutResponses.where('sessionId').equals(session.id).toArray();
		const value = responses[0]?.value as { status?: string; mediaUrl?: string };
		expect(value.status).toBe('pending');
		expect(value).not.toHaveProperty('mediaUrl');

		// The session is not considered drained, and another pass is scheduled.
		expect(result.retriable).toBe(true);
		expect((await OfflineSessionService.getSession(session.id))?.synced).toBe(0);

		engine.stop();
	});

	it('keeps the blob pinned for a bare {queued:true} body (no media fields at all)', async () => {
		const session = await OfflineSessionService.createSession('q-2', 1, 0, 0);
		const ref = await captureBinaryAnswer(session.id);

		apiMock.sessions.get.mockResolvedValue({ id: session.id });
		apiMock.sessions.uploadMedia.mockResolvedValue({
			queued: true,
			message: 'Request queued for offline sync',
		});
		ackAllSyncedIds();

		const engine = new FilloutUploadSync();
		await engine.syncNow();

		const stored = await db.filloutBinaries.get(ref.clientId);
		expect(stored).toBeDefined();
		expect(stored?.status).toBe('pending');

		engine.stop();
	});

	it('still unpins on a GENUINE ack (the guard does not break the happy path)', async () => {
		const session = await OfflineSessionService.createSession('q-3', 1, 0, 0);
		const ref = await captureBinaryAnswer(session.id);

		apiMock.sessions.get.mockResolvedValue({ id: session.id });
		apiMock.sessions.uploadMedia.mockResolvedValue({
			url: '/api/media/abc123/content',
			filename: 'answer.webm',
			size: 4096,
			mimeType: 'video/webm',
		});
		ackAllSyncedIds();

		const engine = new FilloutUploadSync();
		await engine.syncNow();

		expect(await db.filloutBinaries.get(ref.clientId)).toBeUndefined();
		const responses = await db.filloutResponses.where('sessionId').equals(session.id).toArray();
		const value = responses[0]?.value as { status: string; mediaUrl: string };
		expect(value.status).toBe('uploaded');
		expect(value.mediaUrl).toBe('/api/media/abc123/content');

		engine.stop();
	});
});
