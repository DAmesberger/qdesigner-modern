import { client as generatedClient } from '$lib/api/generated/client.gen';
import { auth } from '$lib/services/auth';

const API_BASE = import.meta.env.VITE_API_URL || '';

generatedClient.setConfig({
  baseUrl: API_BASE,
  responseStyle: 'data',
  throwOnError: true,
  // Send the httpOnly qd_session cookie on cross-origin dev (5173 → 4100).
  // Requires the server's CORS layer to allow credentials + echo a specific
  // origin (see middleware/cors.rs), which it does.
  credentials: 'include',
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
// Marks the single 403-recovery retry so it can never itself be retried.
const CSRF_RETRY_MARKER = 'X-CSRF-Retry';

function isFormDataBody(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

generatedClient.interceptors.request.use(async (request, options) => {
  const method = (options.method ?? request.method ?? 'GET').toUpperCase();
  if (!SAFE_METHODS.includes(method)) {
    // Cached token is read synchronously (no network); ensureCsrfToken only
    // touches the network on a cache miss and single-flights + backs off there.
    const csrf = auth.getCsrfToken() ?? (await auth.ensureCsrfToken());
    if (csrf) {
      request.headers.set('X-CSRF-Token', csrf);
    }
  }
  return request;
});

// One-shot recovery: if a state-changing request is rejected because its CSRF
// token was missing/invalid (e.g. the token wasn't cached yet when it went out,
// or the session rotated), force one fresh session load and replay the request
// exactly once with the new token. The replay bypasses the interceptor chain, so
// it cannot loop.
generatedClient.interceptors.response.use(async (response, request, options) => {
  if (response.status !== 403) return response;

  const method = request.method.toUpperCase();
  if (SAFE_METHODS.includes(method)) return response;
  if (request.headers.has(CSRF_RETRY_MARKER)) return response;

  let body = '';
  try {
    body = await response.clone().text();
  } catch {
    return response;
  }
  if (!/csrf token/i.test(body)) return response;

  const freshToken = await auth.refreshCsrfToken();
  if (!freshToken) return response;

  const retried = await reissueWithCsrf(request, options, freshToken);
  return retried ?? response;
});

async function reissueWithCsrf(
  request: Request,
  options: { serializedBody?: unknown; body?: unknown; fetch?: typeof globalThis.fetch },
  token: string
): Promise<Response | null> {
  const method = request.method.toUpperCase();
  const needsBody = method !== 'GET' && method !== 'HEAD';

  const headers = new Headers(request.headers);
  headers.set('X-CSRF-Token', token);
  headers.set(CSRF_RETRY_MARKER, '1');

  const init: RequestInit = {
    method: request.method,
    headers,
    credentials: 'include',
    redirect: 'follow',
  };

  if (needsBody) {
    const serialized: unknown = options.serializedBody;
    if (isFormDataBody(serialized)) {
      // Let the browser regenerate the multipart boundary for the replay.
      headers.delete('Content-Type');
      init.body = serialized;
    } else if (typeof serialized === 'string') {
      init.body = serialized;
    } else if (options.body !== undefined) {
      // Had a body we cannot faithfully replay; surface the original 403 and let
      // the caller's own retry/backoff (e.g. FilloutUploadSync) handle it later.
      return null;
    }
  }

  try {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    return await fetchImpl(new Request(request.url, init));
  } catch {
    return null;
  }
}

export const apiClient = generatedClient;
