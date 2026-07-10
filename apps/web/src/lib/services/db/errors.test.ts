import { describe, expect, it } from 'vitest';
import { describeDexieError, formatDexieError } from './errors';

describe('describeDexieError', () => {
	it('surfaces the semantic .name over the (minified) constructor name', () => {
		// A Dexie error bundles as `DexieError2`; the useful signal is `.name`.
		const err = Object.assign(new Error('Database has been closed'), {
			name: 'DatabaseClosedError',
		});
		const info = describeDexieError(err);
		expect(info.name).toBe('DatabaseClosedError');
		expect(info.isDatabaseClosed).toBe(true);
		expect(info.isQuotaExceeded).toBe(false);
	});

	it('detects a quota-exceeded failure from the wrapped inner DOMException', () => {
		const err = {
			name: 'AbortError',
			message: 'Transaction aborted',
			inner: { name: 'QuotaExceededError', message: 'The quota has been exceeded.' },
		};
		const info = describeDexieError(err);
		expect(info.isQuotaExceeded).toBe(true);
		expect(info.innerName).toBe('QuotaExceededError');
	});

	it('formats name, message and inner into one honest line', () => {
		const err = {
			name: 'ConstraintError',
			message: 'Key already exists',
			inner: { name: 'ConstraintError', message: 'unique index violated' },
		};
		expect(formatDexieError(err)).toBe(
			'ConstraintError: Key already exists (inner ConstraintError: unique index violated)'
		);
	});

	it('never throws on a non-error value', () => {
		expect(() => describeDexieError(undefined)).not.toThrow();
		expect(describeDexieError('nope').message).toBe('nope');
	});
});
