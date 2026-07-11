import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Issue #47: the CSRF interceptor resolves the token via the auth service on
// every state-changing request. These tests pin the resilience contract:
// once loaded the token is cached (no per-request refetch), concurrent loads
// single-flight, and a transient 429/network failure backs off instead of being
// treated as "signed out" — which would strand an authenticated participant
// with the qd_session cookie but no CSRF token.

function futureIso(secondsAhead = 3600): string {
  return new Date(Date.now() + secondsAhead * 1000).toISOString();
}

function sessionView(token = 'tok-1') {
  return {
    authenticated: true,
    provider: 'local',
    user: { id: 'u1', email: 'user@example.com' },
    mfa_verified: false,
    roles: [],
    organizations: [],
    expires_at: futureIso(),
    csrf_token: token,
  };
}

function okResponse(token = 'tok-1'): Response {
  return new Response(JSON.stringify(sessionView(token)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function rateLimited(retryAfter?: string): Response {
  const headers: Record<string, string> = {};
  if (retryAfter) headers['Retry-After'] = retryAfter;
  return new Response('', { status: 429, headers });
}

function anonResponse(): Response {
  return new Response(
    JSON.stringify({
      authenticated: false,
      provider: null,
      user: null,
      mfa_verified: false,
      roles: [],
      organizations: [],
      expires_at: null,
      csrf_token: null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

// Reset the module graph so each test gets a pristine AuthService singleton with
// no carried-over session/backoff state.
async function freshAuth() {
  vi.resetModules();
  const mod = await import('./auth');
  return mod.auth;
}

describe('AuthService CSRF resilience (#47)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches the CSRF token after one load — no refetch per request', async () => {
    fetchMock.mockResolvedValue(okResponse('tok-1'));
    const auth = await freshAuth();

    await auth.init();
    expect(auth.getCsrfToken()).toBe('tok-1');

    // Repeated interceptor-style lookups must hit memory, never the network.
    expect(await auth.ensureCsrfToken()).toBe('tok-1');
    expect(await auth.ensureCsrfToken()).toBe('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent session loads onto one fetch', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((res) => (resolve = res)));
    const auth = await freshAuth();

    const pending = Promise.all([
      auth.ensureCsrfToken(),
      auth.ensureCsrfToken(),
      auth.ensureCsrfToken(),
    ]);
    resolve(okResponse('tok-2'));
    const results = await pending;

    expect(results).toEqual(['tok-2', 'tok-2', 'tok-2']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a 429 as transient and backs off before retrying', async () => {
    fetchMock.mockResolvedValueOnce(rateLimited('5'));
    const auth = await freshAuth();

    expect(await auth.ensureCsrfToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Within the backoff window a second lookup must NOT hit the limiter again.
    expect(await auth.ensureCsrfToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recovers via a forced refresh after a 429 (backoff bypassed)', async () => {
    fetchMock.mockResolvedValueOnce(rateLimited('1')).mockResolvedValueOnce(okResponse('tok-3'));
    const auth = await freshAuth();

    expect(await auth.ensureCsrfToken()).toBeNull();
    // The 403-recovery path forces a load, bypassing backoff.
    expect(await auth.refreshCsrfToken()).toBe('tok-3');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the existing token when a later refresh is rate-limited', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('tok-1')).mockResolvedValueOnce(rateLimited());
    const auth = await freshAuth();

    await auth.init();
    expect(auth.getCsrfToken()).toBe('tok-1');

    // A forced refresh that 429s must not clear the session.
    expect(await auth.refreshCsrfToken()).toBe('tok-1');
    expect(auth.getCsrfToken()).toBe('tok-1');
  });

  it('does not refetch per request for a definitively anonymous client', async () => {
    fetchMock.mockResolvedValue(anonResponse());
    const auth = await freshAuth();

    expect(await auth.ensureCsrfToken()).toBeNull();
    expect(await auth.ensureCsrfToken()).toBeNull();
    // initialized + null session ⇒ no further network for anonymous participants.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
