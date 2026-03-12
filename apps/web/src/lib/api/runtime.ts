import { client as generatedClient } from '$lib/api/generated/client.gen';
import { auth } from '$lib/services/auth';

const API_BASE = import.meta.env.VITE_API_URL || '';

generatedClient.setConfig({
  baseUrl: API_BASE,
  responseStyle: 'data',
  throwOnError: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
  auth: async () => {
    const session = auth.getAccessToken() ? null : await auth.getSession();
    return auth.getAccessToken() ?? session?.accessToken ?? undefined;
  },
});

export const apiClient = generatedClient;
