import { beforeEach, describe, expect, it, vi } from 'vitest';

// Issue #47: the request interceptor must use the cached CSRF token (no
// per-request session fetch) and only fall back to ensureCsrfToken on a miss;
// the response interceptor must recover from a 403 "Missing/Invalid CSRF token"
// by forcing one token reload and replaying the request exactly once.

vi.mock('$lib/services/auth', () => ({
  auth: {
    getCsrfToken: vi.fn(),
    ensureCsrfToken: vi.fn(),
    refreshCsrfToken: vi.fn(),
    getSession: vi.fn(),
  },
}));

const { apiClient } = await import('./runtime');
const { auth } = await import('$lib/services/auth');

const authMock = auth as unknown as {
  getCsrfToken: ReturnType<typeof vi.fn>;
  ensureCsrfToken: ReturnType<typeof vi.fn>;
  refreshCsrfToken: ReturnType<typeof vi.fn>;
};

type ReqFn = (req: Request, opts: Record<string, unknown>) => Promise<Request>;
type ResFn = (res: Response, req: Request, opts: Record<string, unknown>) => Promise<Response>;

const requestInterceptor = apiClient.interceptors.request.fns.filter(Boolean)[0] as unknown as ReqFn;
const responseInterceptor = apiClient.interceptors.response.fns.filter(Boolean)[0] as unknown as ResFn;

function forbidden(message: string): Response {
  return new Response(JSON.stringify({ error: { status: 403, message } }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  authMock.getCsrfToken.mockReset();
  authMock.ensureCsrfToken.mockReset();
  authMock.refreshCsrfToken.mockReset();
});

describe('CSRF request interceptor', () => {
  it('uses the cached token synchronously without touching ensureCsrfToken', async () => {
    authMock.getCsrfToken.mockReturnValue('cached-tok');
    const out = await requestInterceptor(new Request('http://api.test/api/sessions', { method: 'POST' }), {
      method: 'POST',
    });
    expect(out.headers.get('X-CSRF-Token')).toBe('cached-tok');
    expect(authMock.ensureCsrfToken).not.toHaveBeenCalled();
  });

  it('falls back to ensureCsrfToken only on a cache miss', async () => {
    authMock.getCsrfToken.mockReturnValue(null);
    authMock.ensureCsrfToken.mockResolvedValue('fetched-tok');
    const out = await requestInterceptor(new Request('http://api.test/api/sessions', { method: 'POST' }), {
      method: 'POST',
    });
    expect(out.headers.get('X-CSRF-Token')).toBe('fetched-tok');
    expect(authMock.ensureCsrfToken).toHaveBeenCalledTimes(1);
  });

  it('does not attach a token to safe methods', async () => {
    authMock.getCsrfToken.mockReturnValue('cached-tok');
    const out = await requestInterceptor(new Request('http://api.test/api/sessions', { method: 'GET' }), {
      method: 'GET',
    });
    expect(out.headers.get('X-CSRF-Token')).toBeNull();
    expect(authMock.getCsrfToken).not.toHaveBeenCalled();
  });
});

describe('CSRF 403 one-shot recovery', () => {
  it('reloads the token and replays the request once with the fresh token', async () => {
    authMock.refreshCsrfToken.mockResolvedValue('fresh-tok');
    const replayFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const req = new Request('http://api.test/api/sessions', { method: 'POST' });
    const opts = { serializedBody: '{"code":"abc"}', body: { code: 'abc' }, fetch: replayFetch };

    const out = await responseInterceptor(forbidden('Missing CSRF token'), req, opts);

    expect(out.status).toBe(200);
    expect(authMock.refreshCsrfToken).toHaveBeenCalledTimes(1);
    expect(replayFetch).toHaveBeenCalledTimes(1);
    const replayed = replayFetch.mock.calls[0]![0] as Request;
    expect(replayed.headers.get('X-CSRF-Token')).toBe('fresh-tok');
    expect(replayed.headers.get('X-CSRF-Retry')).toBe('1');
  });

  it('ignores 403s whose body is not about CSRF', async () => {
    const replayFetch = vi.fn();
    const out = await responseInterceptor(
      forbidden('Forbidden'),
      new Request('http://api.test/api/x', { method: 'POST' }),
      { fetch: replayFetch }
    );
    expect(out.status).toBe(403);
    expect(authMock.refreshCsrfToken).not.toHaveBeenCalled();
    expect(replayFetch).not.toHaveBeenCalled();
  });

  it('does not retry a request that already carries the retry marker', async () => {
    const replayFetch = vi.fn();
    const req = new Request('http://api.test/api/sessions', {
      method: 'POST',
      headers: { 'X-CSRF-Retry': '1' },
    });
    const out = await responseInterceptor(forbidden('Missing CSRF token'), req, { fetch: replayFetch });
    expect(out.status).toBe(403);
    expect(authMock.refreshCsrfToken).not.toHaveBeenCalled();
    expect(replayFetch).not.toHaveBeenCalled();
  });

  it('surfaces the original 403 when no fresh token can be obtained', async () => {
    authMock.refreshCsrfToken.mockResolvedValue(null);
    const replayFetch = vi.fn();
    const out = await responseInterceptor(
      forbidden('Invalid CSRF token'),
      new Request('http://api.test/api/sessions', { method: 'POST' }),
      { serializedBody: '{}', fetch: replayFetch }
    );
    expect(out.status).toBe(403);
    expect(replayFetch).not.toHaveBeenCalled();
  });

  it('leaves non-403 responses untouched', async () => {
    const replayFetch = vi.fn();
    const ok = new Response('{}', { status: 200 });
    const out = await responseInterceptor(ok, new Request('http://api.test/api/sessions', { method: 'POST' }), {
      fetch: replayFetch,
    });
    expect(out).toBe(ok);
    expect(authMock.refreshCsrfToken).not.toHaveBeenCalled();
  });
});
