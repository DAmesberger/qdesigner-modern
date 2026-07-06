import { apiClient } from '$lib/api/runtime';
import { callSdk } from './http';

/**
 * SSO federation (OIDC/SAML) with JIT org membership (E-RBAC-6).
 *
 * Drives the generated hey-api client directly (raw `url` + `path`) in the same
 * style as `roles.ts`. The admin CRUD is owner-gated server-side; `resolve` is
 * an anonymous domain probe used by the login page to offer a "Sign in with
 * SSO" affordance. `client_secret` is write-only — responses only ever carry
 * `has_client_secret`.
 */

export interface IdentityProvider {
  id: string;
  organization_id: string;
  protocol: string;
  display_name: string | null;
  issuer: string | null;
  metadata_url: string | null;
  client_id: string | null;
  has_client_secret: boolean;
  default_role: string;
  group_claim: string;
  group_role_map: Record<string, string>;
  enforce_role_mapping: boolean;
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateIdpBody {
  protocol: string;
  display_name?: string | null;
  issuer?: string | null;
  metadata_url?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  default_role?: string;
  group_claim?: string | null;
  group_role_map?: Record<string, string>;
  enforce_role_mapping?: boolean;
  enabled?: boolean;
}

export type UpdateIdpBody = Partial<CreateIdpBody> & {
  /** Empty string clears the stored secret; omit to leave it unchanged. */
  client_secret?: string | null;
};

export interface SsoResolveResult {
  sso_available: boolean;
  org_slug: string | null;
  provider_name: string | null;
  protocol: string | null;
}

export const sso = {
  /** List an org's configured identity providers (owner-gated). */
  list: (orgId: string): Promise<IdentityProvider[]> =>
    callSdk(
      () =>
        apiClient.get({
          url: '/api/organizations/{id}/sso',
          path: { id: orgId },
        }) as unknown as Promise<IdentityProvider[]>
    ),

  create: (orgId: string, body: CreateIdpBody): Promise<IdentityProvider> =>
    callSdk(
      () =>
        apiClient.post({
          url: '/api/organizations/{id}/sso',
          path: { id: orgId },
          body,
        }) as unknown as Promise<IdentityProvider>
    ),

  update: (orgId: string, idpId: string, body: UpdateIdpBody): Promise<IdentityProvider> =>
    callSdk(
      () =>
        apiClient.patch({
          url: '/api/organizations/{id}/sso/{idp_id}',
          path: { id: orgId, idp_id: idpId },
          body,
        }) as unknown as Promise<IdentityProvider>
    ),

  remove: (orgId: string, idpId: string): Promise<{ message: string }> =>
    callSdk(
      () =>
        apiClient.delete({
          url: '/api/organizations/{id}/sso/{idp_id}',
          path: { id: orgId, idp_id: idpId },
        }) as unknown as Promise<{ message: string }>
    ),

  /**
   * Anonymous: does the email's verified domain belong to an org with an
   * enabled IdP? Used by the login page to reveal "Sign in with SSO".
   */
  resolve: (email: string): Promise<SsoResolveResult> =>
    callSdk(
      () =>
        apiClient.get({
          url: '/api/sso/resolve',
          query: { email },
        }) as unknown as Promise<SsoResolveResult>
    ),

  /**
   * Top-level navigation to the backend `start` endpoint (NOT a fetch — the
   * IdP redirect flow must own the browser). Resolves the API origin the same
   * way the generated client does.
   */
  startUrl: (orgSlug: string): string => {
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    return `${base}/api/sso/${encodeURIComponent(orgSlug)}/start`;
  },
};
