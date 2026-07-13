import { apiClient } from '$lib/api/runtime';
import { callSdk } from './http';

/**
 * Project-scoped invitations (ADR 0033) — the structural replacement for the
 * removed resource-share invite-by-email. Accepting one lands a
 * `project_members` row with the invited [ProjectRole], admitted cross-org.
 *
 * These endpoints post-date the committed OpenAPI snapshot, so — like
 * `roles.ts` / the old `shares.ts` — this module drives the generated hey-api
 * client directly (raw `url` + `path`) rather than a generated SDK method, so
 * no contracts regen is required. The client is globally configured
 * (runtime.ts) with `responseStyle: 'data'` + `throwOnError: true`; `callSdk`
 * unwraps + surfaces API errors.
 */

export type ProjectRole = 'viewer' | 'editor' | 'admin' | 'owner';

/** One project invitation as returned by list/create (management view). */
export interface ProjectInvitation {
  id: string;
  project_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  invited_by: string | null;
  created_at: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  custom_message: string | null;
}

/** Token-keyed detail for the public accept page (`getByToken`). */
export interface ProjectInvitationDetail {
  id: string;
  project_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  invited_by: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  created_at: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  custom_message: string | null;
  project: {
    id: string;
    name: string;
    code: string;
  };
}

export interface CreateProjectInvitationBody {
  email: string;
  role: ProjectRole;
  customMessage?: string;
}

export const projectInvitations = {
  /** List the pending invitations on a project. */
  list: (projectId: string): Promise<ProjectInvitation[]> =>
    callSdk(
      () =>
        apiClient.get({
          security: [{ scheme: 'bearer', type: 'http' }],
          url: '/api/projects/{id}/invitations',
          path: { id: projectId },
        }) as unknown as Promise<ProjectInvitation[]>
    ),

  /** Invite an email to collaborate on a project with the given role. */
  create: (
    projectId: string,
    body: CreateProjectInvitationBody
  ): Promise<ProjectInvitation> =>
    callSdk(
      () =>
        apiClient.post({
          security: [{ scheme: 'bearer', type: 'http' }],
          url: '/api/projects/{id}/invitations',
          path: { id: projectId },
          body: {
            email: body.email,
            role: body.role,
            custom_message: body.customMessage,
          },
        }) as unknown as Promise<ProjectInvitation>
    ),

  /** Revoke a pending invitation by id. */
  revoke: (projectId: string, invitationId: string): Promise<{ message: string }> =>
    callSdk(
      () =>
        apiClient.delete({
          security: [{ scheme: 'bearer', type: 'http' }],
          url: '/api/projects/{id}/invitations/{inv_id}',
          path: { id: projectId, inv_id: invitationId },
        }) as unknown as Promise<{ message: string }>
    ),

  /** Public accept-page lookup keyed on the invitation token. */
  getByToken: (token: string): Promise<ProjectInvitationDetail> =>
    callSdk(
      () =>
        apiClient.get({
          url: '/api/project-invitations/{token}',
          path: { token },
        }) as unknown as Promise<ProjectInvitationDetail>
    ),

  /** Accept an invitation addressed to the authenticated user's email. */
  accept: (token: string): Promise<{ message: string }> =>
    callSdk(
      () =>
        apiClient.post({
          security: [{ scheme: 'bearer', type: 'http' }],
          url: '/api/project-invitations/{token}/accept',
          path: { token },
        }) as unknown as Promise<{ message: string }>
    ),

  /** Decline an invitation addressed to the authenticated user's email. */
  decline: (token: string): Promise<{ message: string }> =>
    callSdk(
      () =>
        apiClient.post({
          security: [{ scheme: 'bearer', type: 'http' }],
          url: '/api/project-invitations/{token}/decline',
          path: { token },
        }) as unknown as Promise<{ message: string }>
    ),
};
