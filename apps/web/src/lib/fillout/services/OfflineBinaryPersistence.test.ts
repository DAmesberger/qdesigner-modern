import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';
import {
	OfflineBinaryPersistence,
	BinaryCaptureError,
	DEFAULT_BINARY_MAX_BYTES,
	isBinaryAnswerReference,
	binaryRetryDelayMs,
	isBinaryDueForRetry,
	type BinaryAnswerReference,
} from './OfflineBinaryPersistence';
import type { FilloutBinary } from '$lib/services/db/indexeddb';
import { OfflineResponsePersistence } from './OfflineResponsePersistence';

// crypto.randomUUID is mocked to `test-uuid-...` in apps/web/tests/setup.

beforeEach(async () => {
	await db.filloutBinaries.clear();
	await db.filloutResponses.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('OfflineBinaryPersistence.capture (ADR 0029 Half 2)', () => {
	it('writes the Blob to IndexedDB and returns a pending reference (never a blob: URL)', async () => {
		const file = new File([new Uint8Array(1024)], 'photo.png', { type: 'image/png' });

		const ref = await OfflineBinaryPersistence.capture('s-1', 'q-file', file, 'photo.png');

		// Reference is structured — no blob: URL, no inline bytes.
		expect(isBinaryAnswerReference(ref)).toBe(true);
		expect(ref).toMatchObject({
			name: 'photo.png',
			size: 1024,
			mimeType: 'image/png',
			status: 'pending',
		});
		expect(ref.mediaUrl).toBeUndefined();
		expect(String(JSON.stringify(ref))).not.toContain('blob:');

		// Bytes are pinned in the dedicated table keyed by the reference clientId.
		const stored = await db.filloutBinaries.get(ref.clientId);
		expect(stored).toBeDefined();
		expect(stored?.data.byteLength).toBe(1024);
		expect(stored?.status).toBe('pending');
		expect(stored?.sessionId).toBe('s-1');
		// A real, uploadable Blob is reconstructable from the stored bytes.
		expect(OfflineBinaryPersistence.toBlob(stored!)).toBeInstanceOf(Blob);
		expect(OfflineBinaryPersistence.toBlob(stored!).size).toBe(1024);
	});

	it('blocks oversize files loudly with no partial record', async () => {
		const big = new File([new Uint8Array(2048)], 'big.bin', { type: 'application/octet-stream' });

		await expect(
			OfflineBinaryPersistence.capture('s-1', 'q-file', big, 'big.bin', 1024)
		).rejects.toMatchObject({ name: 'BinaryCaptureError', reason: 'oversize' });

		// No blob written — capture failed cleanly.
		expect(await db.filloutBinaries.count()).toBe(0);
	});

	it('defaults the cap to 25 MB when maxSize is unset', async () => {
		expect(DEFAULT_BINARY_MAX_BYTES).toBe(25 * 1024 * 1024);
		const file = new File([new Uint8Array(10)], 'ok.txt', { type: 'text/plain' });
		// No cap passed → default applies and a 10-byte file is accepted.
		const ref = await OfflineBinaryPersistence.capture('s-1', 'q', file, 'ok.txt');
		expect(ref.status).toBe('pending');
	});

	it('surfaces a quota-exceeded durable-write failure as a blocking capture error', async () => {
		const quota = new DOMException('quota', 'QuotaExceededError');
		vi.spyOn(db.filloutBinaries, 'add').mockRejectedValueOnce(quota);
		const file = new File([new Uint8Array(16)], 'x.bin', { type: 'application/octet-stream' });

		await expect(
			OfflineBinaryPersistence.capture('s-1', 'q', file, 'x.bin')
		).rejects.toMatchObject({ name: 'BinaryCaptureError', reason: 'quota' });
		// The mock threw, so nothing durable landed.
		expect(await db.filloutBinaries.count()).toBe(0);
	});
});

describe('OfflineResponsePersistence.patchBinaryResponse', () => {
	it('rewrites a single-file response value from pending to uploaded and re-arms it', async () => {
		const ref: BinaryAnswerReference = {
			clientId: 'bin-1',
			name: 'a.png',
			size: 10,
			mimeType: 'image/png',
			status: 'pending',
		};
		await OfflineResponsePersistence.saveResponse('s-1', { questionId: 'q-file', value: ref });
		// Simulate a prior sync marking it synced (the patch must re-arm it).
		await db.filloutResponses.where('sessionId').equals('s-1').modify({ synced: 1 });

		const patched = await OfflineResponsePersistence.patchBinaryResponse(
			's-1',
			'bin-1',
			'/api/media/abc/content'
		);
		expect(patched).toBe(true);

		const [row] = await OfflineResponsePersistence.getSessionResponses('s-1');
		expect(row?.value).toMatchObject({
			clientId: 'bin-1',
			status: 'uploaded',
			mediaUrl: '/api/media/abc/content',
		});
		const stored = await db.filloutResponses.where('sessionId').equals('s-1').first();
		expect(stored?.synced).toBe(0);
	});

	it('patches only the matching element of a multi-file array answer', async () => {
		const value: BinaryAnswerReference[] = [
			{ clientId: 'bin-a', name: 'a', size: 1, mimeType: 'image/png', status: 'pending' },
			{ clientId: 'bin-b', name: 'b', size: 2, mimeType: 'image/png', status: 'pending' },
		];
		await OfflineResponsePersistence.saveResponse('s-1', { questionId: 'q-file', value });

		await OfflineResponsePersistence.patchBinaryResponse('s-1', 'bin-b', '/url-b');

		const [row] = await OfflineResponsePersistence.getSessionResponses('s-1');
		const arr = row?.value as BinaryAnswerReference[];
		expect(arr[0]).toMatchObject({ clientId: 'bin-a', status: 'pending' });
		expect(arr[1]).toMatchObject({ clientId: 'bin-b', status: 'uploaded', mediaUrl: '/url-b' });
	});

	it('returns false when no response references the binary', async () => {
		const patched = await OfflineResponsePersistence.patchBinaryResponse('s-1', 'nope', '/u');
		expect(patched).toBe(false);
	});
});

describe('binary upload retry backoff (issue #34 QA)', () => {
	function row(overrides: Partial<FilloutBinary>): FilloutBinary {
		return {
			clientId: 'bin-1',
			sessionId: 's-1',
			questionId: 'q-file',
			name: 'a.png',
			size: 1,
			mimeType: 'image/png',
			data: new ArrayBuffer(1),
			status: 'pending',
			createdAt: 0,
			...overrides,
		};
	}

	it('grows the backoff window exponentially and caps it at 60s', () => {
		expect(binaryRetryDelayMs(0)).toBe(0); // never tried → due immediately
		expect(binaryRetryDelayMs(1)).toBe(1000);
		expect(binaryRetryDelayMs(2)).toBe(2000);
		expect(binaryRetryDelayMs(3)).toBe(4000);
		expect(binaryRetryDelayMs(7)).toBe(60000); // 64s clamped to the 60s ceiling
		expect(binaryRetryDelayMs(20)).toBe(60000);
	});

	it('treats a never-attempted binary as due', () => {
		expect(isBinaryDueForRetry(row({ attempts: 0 }), 10_000)).toBe(true);
		expect(isBinaryDueForRetry(row({ attempts: 1, lastAttemptAt: undefined }), 10_000)).toBe(true);
	});

	it('holds a recently-failed binary until its window elapses, then releases it', () => {
		const failed = row({ attempts: 1, lastAttemptAt: 10_000 }); // 1s window
		expect(isBinaryDueForRetry(failed, 10_500)).toBe(false); // 0.5s later — still backing off
		expect(isBinaryDueForRetry(failed, 11_000)).toBe(true); // exactly 1s later — due
	});

	it('recordFailure increments attempts and stamps lastAttemptAt', async () => {
		await db.filloutBinaries.add(row({ clientId: 'bin-fail', attempts: 0 }));
		const before = Date.now();
		await OfflineBinaryPersistence.recordFailure('bin-fail', 'network down');
		const stored = await db.filloutBinaries.get('bin-fail');
		expect(stored?.attempts).toBe(1);
		expect(stored?.lastError).toBe('network down');
		expect(stored?.lastAttemptAt).toBeGreaterThanOrEqual(before);
	});

	it('getRetryablePending excludes a still-backing-off binary but keeps a due one', async () => {
		const now = 100_000;
		await db.filloutBinaries.add(
			row({ clientId: 'due', createdAt: 1, attempts: 1, lastAttemptAt: now - 5000 })
		);
		await db.filloutBinaries.add(
			row({ clientId: 'backing-off', createdAt: 2, attempts: 3, lastAttemptAt: now - 100 })
		);
		const retryable = await OfflineBinaryPersistence.getRetryablePending('s-1', now);
		expect(retryable.map((r) => r.clientId)).toEqual(['due']);
		// Both are still counted as pending — nothing is dropped.
		expect(await OfflineBinaryPersistence.countPending('s-1')).toBe(2);
	});
});
