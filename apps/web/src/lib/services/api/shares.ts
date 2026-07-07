import { apiClient } from '$lib/api/runtime';
import { callSdk } from './http';

/**
 * Cross-project & external-guest sharing (E-RBAC-10).
 *
 * These endpoints post-date the committed OpenAPI snapshot, so — like
 * `roles.ts` — this module drives the generated hey-api client directly (raw
 * `url` + `path`) rather than a generated SDK method, so no contracts regen is
 * required. The client is globally configured (runtime.ts) with
 * `responseStyle: 'data'` + `throwOnError: true`; `callSdk` unwraps + surfaces
 * API errors.
 */

export type ShareRole = 'viewer' | 'editor';
export type ShareResourceKind = 'project' | 'questionnaire';

/** One share as seen by the resource's managers (list/create response). */
export interface ShareRecord {
  id: string;
  resource_type: ShareResourceKind;
  resource_id: string;
  organization_id: string;
  grantee_user_id: string | null;
  grantee_email: string;
  grantee_name: string | null;
  role: ShareRole;
  created_by: string | null;
  created_at: string | null;
  expires_at: string | null;
  /** `pending` (email has no account yet), `active`, or `expired`. */
  status: 'pending' | 'active' | 'expired';
}

/** One resource shared *with* the current user (dashboard "Shared with me"). */
export interface SharedResource {
  id: string;
  resource_type: ShareResourceKind;
  resource_id: string;
  organization_id: string;
  role: ShareRole;
  resource_name: string | null;
  shared_by_email: string | null;
  created_at: string | null;
  expires_at: string | null;
}

export interface CreateShareBody {
  email: string;
  role: ShareRole;
  /** RFC3339 timestamp; must be in the future. Omit for a non-expiring grant. */
  expires_at?: string | null;
}

/** Base path segment for the resource nest. */
function base(kind: ShareResourceKind): string {
  return kind === 'project' ? 'projects' : 'questionnaires';
}

export const shares = {
  /** List the shares configured on a project or questionnaire. */
  list: (kind: ShareResourceKind, resourceId: string): Promise<ShareRecord[]> =>
    callSdk(
      () =>
        apiClient.get({
          url: `/api/${base(kind)}/{id}/shares`,
          path: { id: resourceId },
        }) as unknown as Promise<ShareRecord[]>
    ),

  /** Grant (or re-grant) a scoped share to an email. */
  create: (
    kind: ShareResourceKind,
    resourceId: string,
    body: CreateShareBody
  ): Promise<ShareRecord> =>
    callSdk(
      () =>
        apiClient.post({
          url: `/api/${base(kind)}/{id}/shares`,
          path: { id: resourceId },
          body,
        }) as unknown as Promise<ShareRecord>
    ),

  /** Revoke a share by id. */
  revoke: (
    kind: ShareResourceKind,
    resourceId: string,
    shareId: string
  ): Promise<{ message: string }> =>
    callSdk(
      () =>
        apiClient.delete({
          url: `/api/${base(kind)}/{id}/shares/{share_id}`,
          path: { id: resourceId, share_id: shareId },
        }) as unknown as Promise<{ message: string }>
    ),

  /** Every resource shared *with* the current user (non-expired). */
  sharedWithMe: (): Promise<SharedResource[]> =>
    callSdk(
      () =>
        apiClient.get({
          url: '/api/shares/shared-with-me',
        }) as unknown as Promise<SharedResource[]>
    ),
};
