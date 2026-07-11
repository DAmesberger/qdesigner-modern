import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { db } from '$lib/services/db/indexeddb';
import FileUpload from './FileUpload.svelte';
import { isBinaryAnswerReference } from '$lib/fillout/services/OfflineBinaryPersistence';

/**
 * ADR 0029 Half 2 / issue #34: the `base64`/`url`/`reference` storage modes are
 * deleted — a legacy definition still carrying `storage: 'base64'` is ignored,
 * and capture always writes the Blob offline-first + emits a structured
 * reference (never inline base64, never a blob: URL).
 */

// jsdom's sessionStorage is a no-op in this vitest config, so stub a working
// in-memory one the module can read the active session id from.
beforeEach(async () => {
	await db.filloutBinaries.clear();
	const store = new Map<string, string>([['qd_api_session_id', 's-comp']]);
	vi.stubGlobal('sessionStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k),
		clear: () => store.clear(),
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function selectFile(input: HTMLInputElement, file: File) {
	Object.defineProperty(input, 'files', { value: [file], configurable: true });
	return fireEvent.change(input);
}

describe('FileUpload capture (ADR 0029 Half 2)', () => {
	it('ignores a legacy storage:base64 config and emits a structured reference', async () => {
		const onResponse = vi.fn();
		render(FileUpload, {
			props: {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture question shape
				question: {
					id: 'q_file',
					type: 'file-upload',
					required: false,
					// Legacy mode selector value — must have no effect.
					config: { storage: 'base64', maxSize: 5 * 1024 * 1024, maxFiles: 1 },
				} as any,
				mode: 'runtime',
				onResponse,
			},
		});

		const input = document.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File([new Uint8Array(1234)], 'doc.pdf', { type: 'application/pdf' });
		await selectFile(input, file);

		await vi.waitFor(() => expect(onResponse).toHaveBeenCalled());

		const value = onResponse.mock.calls.at(-1)?.[0];
		// A single structured reference — not a base64 string, not a blob: URL.
		expect(typeof value).toBe('object');
		expect(isBinaryAnswerReference(value)).toBe(true);
		expect(value).toMatchObject({
			name: 'doc.pdf',
			size: 1234,
			mimeType: 'application/pdf',
			status: 'pending',
		});
		expect(JSON.stringify(value)).not.toContain('blob:');
		expect(JSON.stringify(value)).not.toContain('base64');

		// The bytes were persisted offline-first under the reference clientId.
		const stored = await db.filloutBinaries.get((value as { clientId: string }).clientId);
		expect(stored?.data.byteLength).toBe(1234);
		expect(stored?.sessionId).toBe('s-comp');
	});

	it('blocks an oversize file via onValidation and records nothing', async () => {
		const onValidation = vi.fn();
		const onResponse = vi.fn();
		render(FileUpload, {
			props: {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture question shape
				question: {
					id: 'q_file',
					type: 'file-upload',
					required: false,
					config: { maxSize: 1024, maxFiles: 1 },
				} as any,
				mode: 'runtime',
				onValidation,
				onResponse,
			},
		});

		const input = document.querySelector('input[type="file"]') as HTMLInputElement;
		const big = new File([new Uint8Array(4096)], 'big.bin', { type: 'application/octet-stream' });
		await selectFile(input, big);

		await vi.waitFor(() => {
			const last = onValidation.mock.calls.at(-1)?.[0] as { valid: boolean };
			expect(last?.valid).toBe(false);
		});

		// No blob persisted, no response value emitted for the rejected file.
		expect(await db.filloutBinaries.count()).toBe(0);
		const lastResponse = onResponse.mock.calls.at(-1)?.[0];
		expect(lastResponse == null || lastResponse === null).toBe(true);
	});
});
