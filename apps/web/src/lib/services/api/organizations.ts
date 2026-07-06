import { apiClient } from '$lib/api/runtime';
import * as sdk from '$lib/api/generated/sdk.gen';
import { callSdk } from './http';
import {
  mapOrganization,
  mapOrganizationMember,
  mapInvitation,
  mapDomainConfig,
  mapCrossProjectAnalytics,
} from './mappers';
import type {
  Organization,
  DomainConfig,
  DomainAutoJoinCheck,
  CrossProjectAnalyticsData,
} from '$lib/shared/types/api';

/** One row of the organization audit timeline (E-RBAC-2). */
export interface AuditEventRecord {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_full_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  created_at: string | null;
}

export interface AuditListResponse {
  events: AuditEventRecord[];
  next_cursor: string | null;
}

export interface AuditListParams {
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export const organizations = {
  list: async () =>
    (await callSdk(() =>
      sdk.listOrganizations<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
      })
    )).map(mapOrganization),
  get: async (id: string) =>
    mapOrganization(
      await callSdk(() =>
        sdk.getOrganization<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id },
        })
      )
    ),
  create: async (data: { name: string; slug?: string; domain?: string; logoUrl?: string }) =>
    mapOrganization(
      await callSdk(() =>
        sdk.createOrganization<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body: {
            name: data.name,
            slug: data.slug,
            domain: data.domain,
            logo_url: data.logoUrl,
          },
        })
      )
    ),
  update: async (id: string, data: Partial<Organization>) =>
    mapOrganization(
      await callSdk(() =>
        sdk.updateOrganization<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id },
          body: {
            name: data.name,
            domain: data.domain,
            logo_url: data.logoUrl,
            settings: data.settings,
          },
        })
      )
    ),
  delete: (id: string) =>
    callSdk(() =>
      sdk.deleteOrganization<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id },
      })
    ).then(() => undefined),

  // Members
  members: {
    list: async (orgId: string) =>
      (
        await callSdk(() =>
          sdk.listMembers<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId },
          })
        )
      ).map((member) => mapOrganizationMember(member, orgId)),
    add: (orgId: string, data: { email: string; role: string }) =>
      callSdk(() =>
        sdk.addMember<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: orgId },
          body: data,
        })
      ) as Promise<{ message: string }>,
    remove: (orgId: string, userId: string) =>
      callSdk(() =>
        sdk.removeMember<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: orgId, user_id: userId },
        })
      ).then(() => undefined),
    // No generated SDK helper yet (contracts regenerate from the openapi that
    // now registers this route); call the underlying client directly, matching
    // the SDK's own `(client).put({ url, path, body })` shape.
    changeRole: (orgId: string, userId: string, role: string) =>
      callSdk(() =>
        apiClient.put<{ 200: { message: string } }, unknown, true, 'data'>({
          security: [{ scheme: 'bearer', type: 'http' }],
          url: '/api/organizations/{id}/members/{user_id}/role',
          responseStyle: 'data',
          throwOnError: true,
          path: { id: orgId, user_id: userId },
          body: { role },
          headers: { 'Content-Type': 'application/json' },
        })
      ) as Promise<{ message: string }>,
  },

  // Invitations
  invitations: {
    list: async (orgId: string) =>
      (
        await callSdk(() =>
          sdk.listInvitations<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId },
          })
        )
      ).map(mapInvitation),
    create: async (orgId: string, data: { email: string; role: string; customMessage?: string }) =>
      mapInvitation(
        await callSdk(() =>
          sdk.createInvitation<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId },
            body: {
              email: data.email,
              role: data.role,
              custom_message: data.customMessage,
            },
          })
        )
      ),
    getByToken: async (token: string) =>
      mapInvitation(
        await callSdk(() =>
          sdk.getInvitation<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: token },
          })
        )
      ),
    accept: (token: string) =>
      callSdk(() =>
        sdk.acceptInvitation<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: token },
        })
      ) as Promise<{ message: string }>,
    decline: (token: string) =>
      callSdk(() =>
        sdk.declineInvitation<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: token },
        })
      ) as Promise<{ message: string }>,
    revoke: (orgId: string, invitationId: string) =>
      callSdk(() =>
        sdk.revokeInvitation<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: orgId, inv_id: invitationId },
        })
      ).then(() => undefined),
    getPending: async (_email: string) =>
      (
        await callSdk(() =>
          sdk.listPendingInvitations<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
          })
        )
      ).map(mapInvitation),
  },

  // Domains
  domains: {
    list: async (orgId: string) =>
      (
        await callSdk(() =>
          sdk.listDomains<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId },
          })
        )
      ).map(mapDomainConfig),
    add: async (orgId: string, data: { domain: string }) =>
      mapDomainConfig(
        await callSdk(() =>
          sdk.createDomain<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId },
            body: data,
          })
        )
      ),
    verify: async (orgId: string, domainId: string) => {
      await callSdk(() =>
        sdk.verifyDomain<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: orgId, did: domainId },
        })
      );
      return { success: true, method: undefined as string | undefined };
    },
    update: async (orgId: string, domainId: string, config: Partial<DomainConfig>) =>
      mapDomainConfig(
        await callSdk(() =>
          sdk.updateDomain<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId, did: domainId },
            body: {
              auto_join_enabled: config.autoJoinEnabled,
              include_subdomains: config.includeSubdomains,
              default_role: config.defaultRole,
              welcome_message: config.welcomeMessage,
            },
          })
        )
      ),
    remove: (orgId: string, domainId: string) =>
      callSdk(() =>
        sdk.deleteDomain<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: orgId, did: domainId },
        })
      ).then(() => undefined),
    checkAutoJoin: async (email: string): Promise<DomainAutoJoinCheck> => {
      const raw = await callSdk(() =>
        sdk.checkAutoJoin<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          query: { email },
        })
      );

      return {
        canAutoJoin: Boolean(raw.can_auto_join),
        organizationId: raw.organization_id ?? undefined,
        organizationName: raw.organization_name ?? undefined,
        defaultRole: raw.default_role ?? undefined,
        welcomeMessage: raw.welcome_message ?? undefined,
      };
    },
  },

  // Analytics
  analytics: async (
    orgId: string,
    params: {
      questionnaireIds: string[];
      metrics?: string[];
      source?: 'variable' | 'response';
      key?: string;
    }
  ): Promise<CrossProjectAnalyticsData> => {
    const raw = await callSdk(() =>
      sdk.crossProjectAnalytics<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { org_id: orgId },
        query: {
          questionnaire_ids: params.questionnaireIds.join(','),
          metrics: params.metrics?.join(','),
          source: params.source,
          key: params.key,
        },
      })
    );
    return mapCrossProjectAnalytics(raw);
  },

  // Audit log (E-RBAC-2). No generated SDK helper yet (the openapi that
  // registers this route regenerates the contracts); call the client
  // directly, matching the SDK's `(client).get({ url, path, query })` shape.
  audit: {
    list: (orgId: string, params: AuditListParams = {}): Promise<AuditListResponse> =>
      callSdk(() =>
        apiClient.get<{ 200: AuditListResponse }, unknown, true, 'data'>({
          security: [{ scheme: 'bearer', type: 'http' }],
          url: '/api/organizations/{id}/audit',
          responseStyle: 'data',
          throwOnError: true,
          path: { id: orgId },
          query: {
            action: params.action,
            actor: params.actor,
            from: params.from,
            to: params.to,
            cursor: params.cursor,
            limit: params.limit,
          },
        })
      ) as Promise<AuditListResponse>,
  },
};
