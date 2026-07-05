import { client as generatedClient } from '$lib/api/generated/client.gen';
import { auth } from '$lib/services/auth';

const API_BASE = import.meta.env.VITE_API_URL || '';

generatedClient.setConfig({
  baseUrl: API_BASE,
  responseStyle: 'data',
  throwOnError: true,
  // Send the httpOnly refresh_token cookie on cross-origin dev (5173 → 4100).
  // Requires the server's CORS layer to allow credentials + echo a specific
  // origin (see middleware/cors.rs), which it does.
  credentials: 'include',
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
  auth: async () => {
    const session = auth.getAccessToken() ? null : await auth.getSession();
    return auth.getAccessToken() ?? session?.accessToken ?? undefined;
  },
});

export const apiClient = generatedClient;
