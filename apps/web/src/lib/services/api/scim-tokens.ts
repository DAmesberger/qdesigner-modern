import { apiClient } from '$lib/api/runtime';
import { callSdk } from './http';

/**
 * SCIM 2.0 provisioning tokens (E-RBAC-7).
 *
 * A per-org bearer token an enterprise IdP points its SCIM connector at
 * (`/scim/v2/*`) to automate de/provisioning. Owner/admin-gated CRUD; the
 * plaintext `token` is returned exactly ONCE on creation.
 */

export interface ScimTokenRecord {
  id: string;
  organization_id: string;
  name: string;
  prefix: string;
  enabled: boolean;
  created_by: string | null;
  last_used_at: string | null;
  created_at: string | null;
}

export interface CreateScimTokenResponse {
  /** The full plaintext SCIM bearer token. Shown ONCE. */
  token: string;
  scim_token: ScimTokenRecord;
}

export const scimTokens = {
  list: (orgId: string): Promise<ScimTokenRecord[]> =>
    callSdk(
      () =>
        apiClient.get({
          url: '/api/organizations/{id}/scim-tokens',
          path: { id: orgId },
        }) as unknown as Promise<ScimTokenRecord[]>
    ),

  create: (orgId: string, name?: string): Promise<CreateScimTokenResponse> =>
    callSdk(
      () =>
        apiClient.post({
          url: '/api/organizations/{id}/scim-tokens',
          path: { id: orgId },
          body: { name: name ?? null },
        }) as unknown as Promise<CreateScimTokenResponse>
    ),

  revoke: (orgId: string, tokenId: string): Promise<{ message: string }> =>
    callSdk(
      () =>
        apiClient.delete({
          url: '/api/organizations/{id}/scim-tokens/{token_id}',
          path: { id: orgId, token_id: tokenId },
        }) as unknown as Promise<{ message: string }>
    ),
};
