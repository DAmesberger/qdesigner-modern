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

generatedClient.interceptors.request.use(async (request, options) => {
  const method = (options.method ?? request.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = auth.getCsrfToken() ?? (await auth.getSession())?.csrfToken;
    if (csrf) {
      request.headers.set('X-CSRF-Token', csrf);
    }
  }
  return request;
});

export const apiClient = generatedClient;
