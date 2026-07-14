import { describe, it, expect, vi, afterEach } from 'vitest';

// callSdk used to collapse every failure into `new Error(message)`, throwing the
// HTTP status away. That is why a failed save could only ever be reported to the
// author as a generic "something went wrong" — by the time the designer store saw
// the error, the difference between "you are offline", "your session expired" and
// "the name is taken" no longer existed. These pin the status to the error on the
// way out, and pin the classification that the store's messages are chosen from.

vi.mock('../auth', () => ({
  auth: { getSession: vi.fn().mockResolvedValue(null), signOut: vi.fn() },
}));

import { callSdk } from './http';
import { auth } from '../auth';
import { ApiError, describeApiError } from './errors';

const getSessionMock = auth.getSession as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.unstubAllGlobals();
  getSessionMock.mockResolvedValue(null);
});

/** The shape the generated SDK rejects with. */
function sdkError(status: number, message: string) {
  return { error: { status, message } };
}

describe('callSdk keeps the HTTP status on the error', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [409, 'conflict'],
    [500, 'server'],
    [503, 'server'],
  ] as const)('a %i reaches the caller as a %s failure', async (status, kind) => {
    const err = await callSdk(() => Promise.reject(sdkError(status, 'nope'))).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(status);
    expect(describeApiError(err).kind).toBe(kind);
  });

  // Caught by live QA, not by the mocks: on a 401, callSdk refreshes the session
  // and retries. The retry lives INSIDE the catch, so its rejection used to escape
  // unwrapped — as the SDK's raw payload object, not even an Error — and the author
  // saw "Unknown error occurred" instead of "your session expired". This is the
  // real signed-in-with-a-stale-token path, i.e. the 401 that actually happens.
  it('a 401 whose post-refresh retry also fails still reaches the caller as an auth failure', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'u1' } });
    const alwaysUnauthorized = () => Promise.reject(sdkError(401, 'token expired'));

    const err = await callSdk(alwaysUnauthorized).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(describeApiError(err).kind).toBe('auth');
  });

  it('still behaves like a normal Error for the catch sites that only read .message', async () => {
    const err = await callSdk(() => Promise.reject(sdkError(500, 'the server said no'))).catch(
      (e) => e
    );

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('the server said no');
  });
});

describe('describeApiError', () => {
  it('classifies a browser that knows it is offline, whatever the error says', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(describeApiError(new ApiError('Request failed', null)).kind).toBe('offline');
  });

  it('classifies a fetch that never reached the server', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(describeApiError(new TypeError('Failed to fetch')).kind).toBe('offline');
  });

  it('does not invent a class for a status it has no advice for', () => {
    vi.stubGlobal('navigator', { onLine: true });
    const info = describeApiError(new ApiError('content exceeds 1 MB limit', 413));

    expect(info.kind).toBe('unknown');
    // The server's own words survive, so the caller can show them rather than
    // guess at a reason the author would then act on wrongly.
    expect(info.message).toBe('content exceeds 1 MB limit');
  });
});
