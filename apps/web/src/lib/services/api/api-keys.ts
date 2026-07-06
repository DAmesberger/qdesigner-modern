import { apiClient } from '$lib/api/runtime';
import { callSdk } from './http';

/**
 * API keys / service accounts (E-RBAC-7).
 *
 * Machine identities for programmatic access to the read/export surface
 * (`/api/v1/*`) without a human JWT. Drives the generated hey-api client
 * directly (raw `url` + `path`), matching `roles.ts` / `sso.ts`. The plaintext
 * `key` is returned exactly ONCE on creation — everywhere else only the redacted
 * record (with `prefix`) is available.
 */

export interface ApiKeyRecord {
  id: string;
  organization_id: string;
  name: string;
  /** Public lookup handle embedded in the plaintext token (`sk_<prefix>_…`). */
  prefix: string;
  scopes: string[];
  created_by: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string | null;
}

export interface CreateApiKeyBody {
  name: string;
  scopes: string[];
  expires_at?: string | null;
}

export interface CreateApiKeyResponse {
  /** The full plaintext token `sk_<prefix>_<secret>`. Shown ONCE. */
  key: string;
  api_key: ApiKeyRecord;
}

export const apiKeys = {
  /** List an org's API keys (secrets redacted; owner/admin-gated). */
  list: (orgId: string): Promise<ApiKeyRecord[]> =>
    callSdk(
      () =>
        apiClient.get({
          url: '/api/organizations/{id}/api-keys',
          path: { id: orgId },
        }) as unknown as Promise<ApiKeyRecord[]>
    ),

  /** Mint a key — the response's `key` is the only time the plaintext exists. */
  create: (orgId: string, body: CreateApiKeyBody): Promise<CreateApiKeyResponse> =>
    callSdk(
      () =>
        apiClient.post({
          url: '/api/organizations/{id}/api-keys',
          path: { id: orgId },
          body,
        }) as unknown as Promise<CreateApiKeyResponse>
    ),

  /** Soft-revoke a key; it 401s on the machine surface immediately after. */
  revoke: (orgId: string, keyId: string): Promise<{ message: string }> =>
    callSdk(
      () =>
        apiClient.delete({
          url: '/api/organizations/{id}/api-keys/{key_id}',
          path: { id: orgId, key_id: keyId },
        }) as unknown as Promise<{ message: string }>
    ),
};
