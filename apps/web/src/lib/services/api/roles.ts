import { apiClient } from '$lib/api/runtime';
import { callSdk } from './http';

/**
 * Custom roles + granular permissions (E-RBAC-3).
 *
 * These endpoints post-date the committed OpenAPI snapshot, so this module
 * drives the generated hey-api client directly (raw `url` + `path`) instead
 * of a generated SDK method — no contracts regen required. The client is
 * globally configured (runtime.ts) with `responseStyle: 'data'` +
 * `throwOnError: true`, so each call resolves to the response body; we cast
 * the untyped result and let `callSdk` unwrap + surface API errors.
 */

/** One role definition (a seeded system preset or a custom role). */
export interface OrgRole {
  id: string;
  organization_id: string;
  name: string;
  permissions: string[];
  is_system: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface RolesListResponse {
  roles: OrgRole[];
  available_permissions: string[];
}

export const roles = {
  /** List the system presets + custom roles, plus the full permission catalogue. */
  list: (orgId: string): Promise<RolesListResponse> =>
    callSdk(
      () =>
        apiClient.get({
          url: '/api/organizations/{id}/roles',
          path: { id: orgId },
        }) as unknown as Promise<RolesListResponse>
    ),

  create: (orgId: string, body: { name: string; permissions: string[] }): Promise<OrgRole> =>
    callSdk(
      () =>
        apiClient.post({
          url: '/api/organizations/{id}/roles',
          path: { id: orgId },
          body,
        }) as unknown as Promise<OrgRole>
    ),

  update: (
    orgId: string,
    roleId: string,
    body: { name?: string; permissions?: string[] }
  ): Promise<OrgRole> =>
    callSdk(
      () =>
        apiClient.patch({
          url: '/api/organizations/{id}/roles/{role_id}',
          path: { id: orgId, role_id: roleId },
          body,
        }) as unknown as Promise<OrgRole>
    ),

  remove: (orgId: string, roleId: string): Promise<{ deleted: boolean }> =>
    callSdk(
      () =>
        apiClient.delete({
          url: '/api/organizations/{id}/roles/{role_id}',
          path: { id: orgId, role_id: roleId },
        }) as unknown as Promise<{ deleted: boolean }>
    ),

  /** Assign a custom role to a member, or clear it with `customRoleId: null`. */
  assign: (
    orgId: string,
    userId: string,
    customRoleId: string | null
  ): Promise<{ message: string }> =>
    callSdk(
      () =>
        apiClient.put({
          url: '/api/organizations/{id}/members/{user_id}/custom-role',
          path: { id: orgId, user_id: userId },
          body: { custom_role_id: customRoleId },
        }) as unknown as Promise<{ message: string }>
    ),
};
