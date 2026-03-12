import { apiClient } from '$lib/api/runtime';
import {
  aggregateSessions as aggregateSessionsRequest,
  bumpVersion as bumpVersionRequest,
  compareSessions as compareSessionsRequest,
  createQuestionnaire as createQuestionnaireRequest,
  createSession as createSessionRequest,
  dashboardSummary as dashboardSummaryRequest,
  deleteQuestionnaire as deleteQuestionnaireRequest,
  exportResponses as exportResponsesRequest,
  filterSessions as filterSessionsRequest,
  getEvents as getEventsRequest,
  getProfile as getProfileRequest,
  getQuestionnaire as getQuestionnaireRequest,
  getQuestionnaireByCode as getQuestionnaireByCodeRequest,
  getResponses as getResponsesRequest,
  getSession as getSessionRequest,
  getVariables as getVariablesRequest,
  listQuestionnaires as listQuestionnairesRequest,
  listSessions as listSessionsRequest,
  listVersions as listVersionsRequest,
  publishQuestionnaire as publishQuestionnaireRequest,
  submitEvents as submitEventsRequest,
  submitResponse as submitResponseRequest,
  syncSession as syncSessionRequest,
  timeseries as timeseriesRequest,
  updateProfile as updateProfileRequest,
  updateQuestionnaire as updateQuestionnaireRequest,
  updateSession as updateSessionRequest,
  upsertVariable as upsertVariableRequest,
} from '$lib/api/generated/sdk.gen';
import type {
  InteractionEventRequest as GeneratedInteractionEventRequest,
  QuestionnaireByCode as GeneratedQuestionnaireByCode,
  QuestionnaireVersion as GeneratedQuestionnaireVersion,
  SyncPayload as GeneratedSyncPayload,
  UserProfile as GeneratedUserProfile,
} from '$lib/api/generated/types.gen';
import * as sdk from '$lib/api/generated/sdk.gen';
import { auth } from './auth';
import type {
  Organization,
  OrganizationMember,
  Invitation,
  Project,
  QuestionnaireDefinition,
  QuestionTemplate,
  SessionData,
  SessionAggregateData,
  SessionCompareData,
  SessionStatsSummary,
  ResponseSubmission,
  SessionResponseRecord,
  InteractionEventRecord,
  SessionVariableRecord,
  DashboardSummary,
  ExportRow,
  MediaAsset,
  MediaUploadResponse,
  SessionMediaUploadResponse,
  ConditionGroupCounts,
  DomainConfig,
  DomainAutoJoinCheck,
  VerificationResult,
  CrossProjectAnalyticsData,
  TimeSeriesBucket,
  FilterResponse,
} from '$lib/types/api';

type ApiErrorPayload = {
  error?: string | { message?: string; status?: number };
  message?: string;
  details?: unknown;
};

type SdkFieldResponse<T> = {
  data: T;
  request: Request;
  response: Response;
};

function getApiErrorStatus(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const typed = payload as ApiErrorPayload;
  if (typed.error && typeof typed.error === 'object' && typeof typed.error.status === 'number') {
    return typed.error.status;
  }

  return null;
}

function parseApiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    const normalized = payload.trim();
    if (normalized.length > 0 && normalized !== '[object Object]') {
      return normalized;
    }
  }

  if (payload && typeof payload === 'object') {
    const typed = payload as ApiErrorPayload;

    if (typeof typed.error === 'string' && typed.error.trim().length > 0) {
      return typed.error;
    }

    if (typed.error && typeof typed.error === 'object') {
      const nestedMessage = typed.error.message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
        return nestedMessage;
      }
    }

    if (typeof typed.message === 'string' && typed.message.trim().length > 0) {
      return typed.message;
    }

    if (typed.details && typeof typed.details === 'object') {
      const detailEntries = Object.values(typed.details as Record<string, unknown>)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

      if (detailEntries.length > 0) {
        return detailEntries.join(', ');
      }
    }
  }

  return fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response with snake_case/camelCase fields
function mapStatsSummary(raw: any): SessionStatsSummary {
  const stats = raw || {};
  return {
    sampleCount: Number(stats.sample_count ?? stats.sampleCount ?? 0),
    mean: stats.mean ?? null,
    median: stats.median ?? null,
    stdDev: stats.std_dev ?? stats.stdDev ?? null,
    min: stats.min ?? null,
    max: stats.max ?? null,
    p10: stats.p10 ?? null,
    p25: stats.p25 ?? null,
    p50: stats.p50 ?? null,
    p75: stats.p75 ?? null,
    p90: stats.p90 ?? null,
    p95: stats.p95 ?? null,
    p99: stats.p99 ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response with snake_case/camelCase fields
function mapAggregateData(raw: any): SessionAggregateData {
  return {
    questionnaireId: String(raw.questionnaire_id ?? raw.questionnaireId ?? ''),
    source: (raw.source ?? 'variable') as 'variable' | 'response',
    key: String(raw.key ?? ''),
    participantCount: Number(raw.participant_count ?? raw.participantCount ?? 0),
    stats: mapStatsSummary(raw.stats),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response with snake_case/camelCase fields
function mapCompareData(raw: any): SessionCompareData {
  const left = raw.left || {};
  const right = raw.right || {};
  const delta = raw.delta || {};

  return {
    questionnaireId: String(raw.questionnaire_id ?? raw.questionnaireId ?? ''),
    source: (raw.source ?? 'variable') as 'variable' | 'response',
    key: String(raw.key ?? ''),
    left: {
      participantId: String(left.participant_id ?? left.participantId ?? ''),
      stats: mapStatsSummary(left.stats),
    },
    right: {
      participantId: String(right.participant_id ?? right.participantId ?? ''),
      stats: mapStatsSummary(right.stats),
    },
    delta: {
      meanDelta: delta.mean_delta ?? delta.meanDelta ?? null,
      medianDelta: delta.median_delta ?? delta.medianDelta ?? null,
      zScore: delta.z_score ?? delta.zScore ?? null,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response with snake_case/camelCase fields
function mapCrossProjectAnalytics(raw: any): CrossProjectAnalyticsData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response item
  const questionnaires = (raw.questionnaires || []).map((q: any) => ({
    questionnaireId: String(q.questionnaire_id ?? q.questionnaireId ?? ''),
    name: String(q.name ?? ''),
    responseCount: Number(q.response_count ?? q.responseCount ?? 0),
    completedSessions: Number(q.completed_sessions ?? q.completedSessions ?? 0),
    completionRate: Number(q.completion_rate ?? q.completionRate ?? 0),
    timingStats: q.timing_stats ? mapStatsSummary(q.timing_stats) : null,
    variableStats: q.variable_stats ? mapStatsSummary(q.variable_stats) : null,
  }));

  const agg = raw.aggregate || {};
  const aggregate = {
    totalResponses: Number(agg.total_responses ?? agg.totalResponses ?? 0),
    totalCompletedSessions: Number(agg.total_completed_sessions ?? agg.totalCompletedSessions ?? 0),
    overallCompletionRate: Number(agg.overall_completion_rate ?? agg.overallCompletionRate ?? 0),
    overallTimingStats: agg.overall_timing_stats ? mapStatsSummary(agg.overall_timing_stats) : null,
    overallVariableStats: agg.overall_variable_stats
      ? mapStatsSummary(agg.overall_variable_stats)
      : null,
  };

  const crossComparisons = raw.cross_comparisons
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response items
      (raw.cross_comparisons as any[]).map((c: any) => ({
        questionnaireA: String(c.questionnaire_a ?? c.questionnaireA ?? ''),
        questionnaireB: String(c.questionnaire_b ?? c.questionnaireB ?? ''),
        meanDelta: c.mean_delta ?? c.meanDelta ?? null,
        medianDelta: c.median_delta ?? c.medianDelta ?? null,
        correlation: c.correlation ?? null,
      }))
    : null;

  return { questionnaires, aggregate, crossComparisons };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated REST payloads use snake_case
function mapOrganization(raw: any): Organization {
  const createdAt = raw.created_at ?? raw.createdAt ?? new Date().toISOString();
  const updatedAt = raw.updated_at ?? raw.updatedAt ?? createdAt;

  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    slug: String(raw.slug ?? ''),
    domain: raw.domain ?? null,
    logoUrl: raw.logo_url ?? raw.logoUrl ?? null,
    settings: raw.settings ?? {},
    subscriptionTier: raw.subscription_tier ?? raw.subscriptionTier ?? 'free',
    subscriptionStatus: raw.subscription_status ?? raw.subscriptionStatus ?? 'active',
    createdBy: raw.created_by ?? raw.createdBy ?? null,
    createdAt,
    updatedAt,
    organization_id: raw.organization_id,
    created_at: raw.created_at ?? createdAt,
    updated_at: raw.updated_at ?? updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated REST payloads use snake_case
function mapOrganizationMember(raw: any, organizationId: string): OrganizationMember {
  return {
    organizationId,
    userId: String(raw.user_id ?? raw.userId ?? ''),
    role: raw.role ?? 'member',
    status: raw.status ?? 'active',
    joinedAt: raw.joined_at ?? raw.joinedAt ?? new Date().toISOString(),
    user: {
      id: String(raw.user_id ?? raw.userId ?? ''),
      email: String(raw.email ?? ''),
      fullName: raw.full_name ?? raw.fullName ?? null,
      full_name: raw.full_name ?? raw.fullName ?? null,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated REST payloads use snake_case
function mapInvitation(raw: any): Invitation {
  const inviterId = raw.invited_by?.id ?? raw.invited_by_id ?? raw.invitedBy?.id;
  const inviterEmail = raw.invited_by?.email ?? raw.invited_by_email ?? raw.invitedBy?.email;
  const inviterFullName =
    raw.invited_by?.full_name ?? raw.invited_by?.fullName ?? raw.invitedBy?.fullName ?? null;

  return {
    id: String(raw.id ?? ''),
    organizationId: String(raw.organization_id ?? raw.organizationId ?? raw.organization?.id ?? ''),
    email: String(raw.email ?? ''),
    role: String(raw.role ?? ''),
    token: String(raw.token ?? raw.id ?? ''),
    status: raw.status ?? 'pending',
    expiresAt: raw.expires_at ?? raw.expiresAt ?? new Date().toISOString(),
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    acceptedAt: raw.accepted_at ?? raw.acceptedAt ?? null,
    customMessage: raw.custom_message ?? raw.customMessage ?? null,
    organization: raw.organization
      ? {
          id: String(raw.organization.id ?? ''),
          name: String(raw.organization.name ?? ''),
          slug: String(raw.organization.slug ?? ''),
        }
      : undefined,
    invitedBy:
      inviterId || inviterEmail
        ? {
            id: String(inviterId ?? ''),
            email: String(inviterEmail ?? ''),
            fullName: inviterFullName,
            full_name: inviterFullName,
          }
        : undefined,
    created_at: raw.created_at,
    accepted_at: raw.accepted_at ?? null,
    expires_at: raw.expires_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated REST payloads use snake_case
function mapProject(raw: any): Project {
  const createdAt = raw.created_at ?? raw.createdAt ?? new Date().toISOString();
  const updatedAt = raw.updated_at ?? raw.updatedAt ?? createdAt;

  return {
    id: String(raw.id ?? ''),
    organizationId: String(raw.organization_id ?? raw.organizationId ?? ''),
    name: String(raw.name ?? ''),
    code: String(raw.code ?? ''),
    description: raw.description ?? null,
    isPublic: Boolean(raw.is_public ?? raw.isPublic ?? false),
    status: raw.status ?? 'active',
    maxParticipants: raw.max_participants ?? raw.maxParticipants ?? null,
    irbNumber: raw.irb_number ?? raw.irbNumber ?? null,
    startDate: raw.start_date ?? raw.startDate ?? null,
    endDate: raw.end_date ?? raw.endDate ?? null,
    settings: raw.settings ?? {},
    createdBy: raw.created_by ?? raw.createdBy ?? null,
    createdAt,
    updatedAt,
    questionnaireCount: raw.questionnaire_count ?? raw.questionnaireCount,
    organization_id: raw.organization_id,
    created_at: raw.created_at ?? createdAt,
    updated_at: raw.updated_at ?? updatedAt,
    questionnaire_count: raw.questionnaire_count,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated REST payloads use snake_case
function mapQuestionTemplate(raw: any): QuestionTemplate {
  const createdAt = raw.created_at ?? raw.createdAt ?? new Date().toISOString();
  const updatedAt = raw.updated_at ?? raw.updatedAt ?? createdAt;

  return {
    id: String(raw.id ?? ''),
    organizationId: String(raw.organization_id ?? raw.organizationId ?? ''),
    createdBy: String(raw.created_by ?? raw.createdBy ?? ''),
    name: String(raw.name ?? ''),
    description: raw.description ?? null,
    category: raw.category ?? null,
    tags: raw.tags ?? null,
    questionType: String(raw.question_type ?? raw.questionType ?? ''),
    questionConfig: raw.question_config ?? raw.questionConfig ?? {},
    isShared: Boolean(raw.is_shared ?? raw.isShared ?? false),
    usageCount: Number(raw.usage_count ?? raw.usageCount ?? 0),
    createdAt,
    updatedAt,
    organization_id: raw.organization_id,
    created_by: raw.created_by,
    question_type: raw.question_type,
    question_config: raw.question_config,
    is_shared: raw.is_shared,
    usage_count: raw.usage_count,
    created_at: raw.created_at ?? createdAt,
    updated_at: raw.updated_at ?? updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated REST payloads use snake_case
function mapMediaAsset(raw: any): MediaAsset {
  const createdAt = raw.created_at ?? raw.createdAt ?? new Date().toISOString();
  const updatedAt = raw.updated_at ?? raw.updatedAt ?? createdAt;
  const filename = raw.filename ?? raw.original_filename ?? raw.originalFilename ?? 'upload.bin';
  const mimeType = raw.mime_type ?? raw.mimeType ?? raw.content_type ?? 'application/octet-stream';
  const storagePath = raw.storage_path ?? raw.storagePath ?? raw.storage_key ?? '';

  return {
    id: String(raw.id ?? ''),
    organizationId: String(raw.organization_id ?? raw.organizationId ?? ''),
    uploadedBy: String(raw.uploaded_by ?? raw.uploadedBy ?? ''),
    filename,
    originalFilename: raw.original_filename ?? raw.originalFilename ?? filename,
    mimeType,
    sizeBytes: Number(raw.size_bytes ?? raw.sizeBytes ?? 0),
    storagePath,
    width: raw.width ?? null,
    height: raw.height ?? null,
    durationSeconds: raw.duration_seconds ?? raw.durationSeconds ?? null,
    thumbnailPath: raw.thumbnail_path ?? raw.thumbnailPath ?? null,
    metadata: raw.metadata ?? {},
    accessLevel: raw.access_level ?? raw.accessLevel ?? 'organization',
    createdAt,
    updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated REST payloads use snake_case
function mapDomainConfig(raw: any): DomainConfig {
  return {
    id: String(raw.id ?? ''),
    organizationId: String(raw.organization_id ?? raw.organizationId ?? ''),
    domain: String(raw.domain ?? ''),
    verificationToken: String(raw.verification_token ?? raw.verificationToken ?? ''),
    verificationMethod: raw.verification_method ?? raw.verificationMethod ?? null,
    verifiedAt: raw.verified_at ?? raw.verifiedAt ?? null,
    autoJoinEnabled: Boolean(raw.auto_join_enabled ?? raw.autoJoinEnabled ?? false),
    includeSubdomains: Boolean(raw.include_subdomains ?? raw.includeSubdomains ?? false),
    defaultRole: String(raw.default_role ?? raw.defaultRole ?? 'member'),
    emailWhitelist: raw.email_whitelist ?? raw.emailWhitelist ?? [],
    emailBlacklist: raw.email_blacklist ?? raw.emailBlacklist ?? [],
    welcomeMessage: raw.welcome_message ?? raw.welcomeMessage ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    created_at: raw.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated REST payloads use snake_case
function mapVerificationResult(raw: any): VerificationResult {
  return {
    success: Boolean(raw.success ?? false),
    message: raw.message ?? undefined,
    error: raw.error ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated REST payloads use snake_case
function mapConditionCounts(raw: any[]): ConditionGroupCounts {
  const counts: ConditionGroupCounts = {};

  for (const item of raw) {
    const conditionName = String(item.condition_name ?? item.conditionName ?? 'unassigned');
    counts[conditionName] = Number(item.count ?? 0);
  }

  return counts;
}

class ApiClient {
  private unwrapSdkResult<T>(result: T | SdkFieldResponse<T>): T {
    if (
      result &&
      typeof result === 'object' &&
      'data' in result &&
      'request' in result &&
      'response' in result
    ) {
      return result.data;
    }

    return result as T;
  }

  private async callSdk<T>(request: () => Promise<T | SdkFieldResponse<T>>): Promise<T> {
    try {
      return this.unwrapSdkResult(await request());
    } catch (error) {
      if (getApiErrorStatus(error) === 401) {
        const session = await auth.getSession();
        if (session) {
          return this.unwrapSdkResult(await request());
        }
        await auth.signOut();
      }

      throw new Error(parseApiErrorMessage(error, 'Request failed'));
    }
  }

  // === Organizations ===
  organizations = {
    list: async () =>
      (await this.callSdk(() =>
        sdk.listOrganizations<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
        })
      )).map(mapOrganization),
    get: async (id: string) =>
      mapOrganization(
        await this.callSdk(() =>
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
        await this.callSdk(() =>
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
        await this.callSdk(() =>
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
      this.callSdk(() =>
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
          await this.callSdk(() =>
            sdk.listMembers<true>({
              client: apiClient,
              responseStyle: 'data',
              throwOnError: true,
              path: { id: orgId },
            })
          )
        ).map((member) => mapOrganizationMember(member, orgId)),
      add: (orgId: string, data: { email: string; role: string }) =>
        this.callSdk(() =>
          sdk.addMember<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId },
            body: data,
          })
        ) as Promise<{ message: string }>,
      remove: (orgId: string, userId: string) =>
        this.callSdk(() =>
          sdk.removeMember<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId, user_id: userId },
          })
        ).then(() => undefined),
    },

    // Invitations
    invitations: {
      list: async (orgId: string) =>
        (
          await this.callSdk(() =>
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
          await this.callSdk(() =>
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
          await this.callSdk(() =>
            sdk.getInvitation<true>({
              client: apiClient,
              responseStyle: 'data',
              throwOnError: true,
              path: { id: token },
            })
          )
        ),
      accept: (token: string) =>
        this.callSdk(() =>
          sdk.acceptInvitation<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: token },
          })
        ) as Promise<{ message: string }>,
      decline: (token: string) =>
        this.callSdk(() =>
          sdk.declineInvitation<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: token },
          })
        ) as Promise<{ message: string }>,
      revoke: (orgId: string, invitationId: string) =>
        this.callSdk(() =>
          sdk.revokeInvitation<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId, inv_id: invitationId },
          })
        ).then(() => undefined),
      getPending: async (_email: string) =>
        (
          await this.callSdk(() =>
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
          await this.callSdk(() =>
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
          await this.callSdk(() =>
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
        await this.callSdk(() =>
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
          await this.callSdk(() =>
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
        this.callSdk(() =>
          sdk.deleteDomain<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId, did: domainId },
          })
        ).then(() => undefined),
      checkAutoJoin: async (email: string): Promise<DomainAutoJoinCheck> => {
        const raw = await this.callSdk(() =>
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
      const raw = await this.callSdk(() =>
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
  };

  // === Projects ===
  projects = {
    list: async (orgId?: string) =>
      (
        await this.callSdk(() =>
          sdk.listProjects<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            query: {
              organization_id: orgId,
            },
          })
        )
      ).map(mapProject),
    get: async (id: string) =>
      mapProject(
        await this.callSdk(() =>
          sdk.getProject<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id },
          })
        )
      ),
    create: async (data: {
      organizationId: string;
      name: string;
      code: string;
      description?: string;
      isPublic?: boolean;
      maxParticipants?: number;
      irbNumber?: string;
      startDate?: string;
      endDate?: string;
    }) =>
      mapProject(
        await this.callSdk(() =>
          sdk.createProject<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            body: {
              organization_id: data.organizationId,
              name: data.name,
              code: data.code,
              description: data.description,
              is_public: data.isPublic,
              max_participants: data.maxParticipants,
              irb_number: data.irbNumber,
              start_date: data.startDate,
              end_date: data.endDate,
            },
          })
        )
      ),
    update: async (id: string, data: Partial<Project>) =>
      mapProject(
        await this.callSdk(() =>
          sdk.updateProject<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id },
            body: {
              name: data.name,
              description: data.description,
              is_public: data.isPublic,
              status: data.status,
              max_participants: data.maxParticipants,
              irb_number: data.irbNumber,
              start_date: data.startDate,
              end_date: data.endDate,
              settings: data.settings,
            },
          })
        )
      ),
    delete: (id: string) =>
      this.callSdk(() =>
        sdk.deleteProject<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id },
        })
      ).then(() => undefined),
    members: {
      list: async (projectId: string) =>
        await this.callSdk(() =>
          sdk.listProjectMembers<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: projectId },
          })
        ),
      add: (projectId: string, data: { email: string; role: string }) =>
        this.callSdk(() =>
          sdk.addProjectMember<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: projectId },
            body: data,
          })
        ) as Promise<{ message: string }>,
      update: (projectId: string, userId: string, data: { role: string }) =>
        this.callSdk(() =>
          sdk.updateProjectMember<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: projectId, uid: userId },
            body: data,
          })
        ) as Promise<{ message: string }>,
      remove: (projectId: string, userId: string) =>
        this.callSdk(() =>
          sdk.removeProjectMember<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: projectId, uid: userId },
          })
        ).then(() => undefined),
    },
  };

  // === Questionnaires ===
  questionnaires = {
    getByCode: (code: string) =>
      this.callSdk(() =>
        getQuestionnaireByCodeRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { code },
        })
      ) as Promise<GeneratedQuestionnaireByCode>,
    list: (projectId: string) =>
      this.callSdk(() =>
        listQuestionnairesRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId },
        })
      ) as Promise<QuestionnaireDefinition[]>,
    get: (projectId: string, id: string) =>
      this.callSdk(() =>
        getQuestionnaireRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId, qid: id },
        })
      ) as Promise<QuestionnaireDefinition>,
    create: (
      projectId: string,
      data: {
        name: string;
        description?: string;
        content?: Record<string, unknown>;
        settings?: Record<string, unknown>;
      }
    ) =>
      this.callSdk(() =>
        createQuestionnaireRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId },
          body: data,
        })
      ) as Promise<QuestionnaireDefinition>,
    update: (projectId: string, id: string, data: Partial<QuestionnaireDefinition>) =>
      this.callSdk(() =>
        updateQuestionnaireRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId, qid: id },
          body: data,
        })
      ) as Promise<QuestionnaireDefinition>,
    delete: (projectId: string, id: string) =>
      this.callSdk(() =>
        deleteQuestionnaireRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId, qid: id },
        })
      ).then(
        () => undefined,
      ),
    publish: (projectId: string, id: string) =>
      this.callSdk(() =>
        publishQuestionnaireRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId, qid: id },
        })
      ) as Promise<QuestionnaireDefinition>,
    export: (projectId: string, id: string, format: 'json' | 'csv' = 'json') =>
      this.callSdk(() =>
        exportResponsesRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId, qid: id },
          query: { format },
        })
      ) as Promise<ExportRow[]>,
    conditionCounts: async (questionnaireId: string) =>
      mapConditionCounts(
        await this.callSdk(() =>
          sdk.conditionCounts<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: questionnaireId },
          })
        )
      ),
    bumpVersion: (projectId: string, id: string, bumpType: 'major' | 'minor' | 'patch') =>
      this.callSdk(() =>
        bumpVersionRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId, qid: id },
          body: { bump_type: bumpType },
        })
      ) as Promise<QuestionnaireDefinition>,
    listVersions: (questionnaireId: string, params?: { limit?: number; offset?: number }) =>
      this.callSdk(() =>
        listVersionsRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: questionnaireId },
          query: {
            limit: params?.limit,
            offset: params?.offset,
          },
        })
      ) as Promise<GeneratedQuestionnaireVersion[]>,
    quotaStatus: (questionnaireId: string) =>
      this.callSdk(() =>
        sdk.quotaStatus<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: questionnaireId },
        })
      ) as Promise<{
        quotas: Array<{
          quota_id: string;
          name: string;
          target: number;
          current: number;
          is_full: boolean;
        }>;
        total_completed: number;
      }>,
  };

  // === Sessions ===
  sessions = {
    list: (params?: {
      questionnaireId?: string;
      participantId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.questionnaireId) query.set('questionnaire_id', params.questionnaireId);
      if (params?.participantId) query.set('participant_id', params.participantId);
      if (params?.status) query.set('status', params.status);
      if (params?.limit !== undefined) query.set('limit', String(params.limit));
      if (params?.offset !== undefined) query.set('offset', String(params.offset));
      return this.callSdk(() =>
        listSessionsRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          query: Object.fromEntries(query.entries()),
        })
      ) as unknown as Promise<SessionData[]>;
    },
    create: (data: {
      questionnaireId: string;
      participantId?: string;
      metadata?: Record<string, unknown>;
      browserInfo?: Record<string, unknown>;
      versionMajor?: number;
      versionMinor?: number;
      versionPatch?: number;
    }) =>
      this.callSdk(() =>
        createSessionRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body: {
            questionnaire_id: data.questionnaireId,
            participant_id: data.participantId,
            metadata: data.metadata,
            browser_info: data.browserInfo,
            version_major: data.versionMajor,
            version_minor: data.versionMinor,
            version_patch: data.versionPatch,
          },
        })
      ) as unknown as Promise<SessionData>,
    checkDuplicate: (questionnaireId: string, fingerprint: string) =>
      this.callSdk(() =>
        sdk.checkDuplicate<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body: {
            questionnaire_id: questionnaireId,
            fingerprint,
          },
        })
      ) as Promise<{ is_duplicate: boolean; previous_completions: number }>,
    get: (id: string) =>
      this.callSdk(() =>
        getSessionRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id },
        })
      ) as unknown as Promise<SessionData>,
    update: (id: string, data: Partial<SessionData>) =>
      this.callSdk(() =>
        updateSessionRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id },
          body: data,
        })
      ) as unknown as Promise<SessionData>,
    submitResponses: (sessionId: string, responses: ResponseSubmission[]) =>
      this.callSdk(() =>
        submitResponseRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: sessionId },
          body: {
            responses: responses.map((response) => ({
              question_id: response.questionId,
              value: response.value,
              reaction_time_us: response.reactionTimeUs,
              presented_at: response.presentedAt,
              answered_at: response.answeredAt,
            })),
          },
        })
      ) as Promise<{ count: number }>,
    submitEvents: (sessionId: string, events: unknown[]) =>
      this.callSdk(() =>
        submitEventsRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: sessionId },
          body: events as GeneratedInteractionEventRequest[],
        })
      ) as Promise<{ count: number }>,
    upsertVariable: (
      sessionId: string,
      data: { name: string; value: unknown; valueType?: string; source?: string }
    ) =>
      this.callSdk(() =>
        upsertVariableRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: sessionId },
          body: {
            name: data.name,
            value: data.value,
            value_type: data.valueType,
            source: data.source,
          },
        })
      ) as Promise<{ success: boolean }>,
    getResponses: (
      sessionId: string,
      params?: { questionId?: string; limit?: number; offset?: number }
    ) => {
      const query = new URLSearchParams();
      if (params?.questionId) query.set('question_id', params.questionId);
      if (params?.limit !== undefined) query.set('limit', String(params.limit));
      if (params?.offset !== undefined) query.set('offset', String(params.offset));
      return this.callSdk(() =>
        getResponsesRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: sessionId },
          query: Object.fromEntries(query.entries()),
        })
      ) as Promise<SessionResponseRecord[]>;
    },
    getEvents: (sessionId: string) =>
      this.callSdk(() =>
        getEventsRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: sessionId },
        })
      ) as Promise<InteractionEventRecord[]>,
    getVariables: (sessionId: string) =>
      this.callSdk(() =>
        getVariablesRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: sessionId },
        })
      ) as Promise<SessionVariableRecord[]>,
    dashboard: (organizationId: string) =>
      this.callSdk(() =>
        dashboardSummaryRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          query: { organization_id: organizationId },
        })
      ) as Promise<DashboardSummary>,
    aggregate: async (params: {
      questionnaireId: string;
      source?: 'variable' | 'response';
      key: string;
      participantId?: string;
    }): Promise<SessionAggregateData> => {
      const raw = await this.callSdk(() =>
        aggregateSessionsRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          query: {
            questionnaire_id: params.questionnaireId,
            source: params.source || 'variable',
            key: params.key,
            participant_id: params.participantId,
          },
        })
      );
      return mapAggregateData(raw);
    },
    compare: async (params: {
      questionnaireId: string;
      source?: 'variable' | 'response';
      key: string;
      leftParticipantId: string;
      rightParticipantId: string;
    }): Promise<SessionCompareData> => {
      const raw = await this.callSdk(() =>
        compareSessionsRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          query: {
            questionnaire_id: params.questionnaireId,
            source: params.source || 'variable',
            key: params.key,
            left_participant_id: params.leftParticipantId,
            right_participant_id: params.rightParticipantId,
          },
        })
      );
      return mapCompareData(raw);
    },
    timeseries: async (params: {
      questionnaireId: string;
      interval?: 'hour' | 'day' | 'week';
    }): Promise<TimeSeriesBucket[]> => {
      return this.callSdk(() =>
        timeseriesRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          query: {
            questionnaire_id: params.questionnaireId,
            interval: params.interval,
          },
        })
      ) as Promise<TimeSeriesBucket[]>;
    },
    filter: (body: {
      questionnaire_id: string;
      groups: {
        logic: string;
        rules: { field: string; operator: string; value: unknown; value2?: unknown }[];
      }[];
      logic?: string;
      source?: string;
      key?: string;
      limit?: number;
      offset?: number;
    }): Promise<FilterResponse> =>
      this.callSdk(() =>
        filterSessionsRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body,
        })
      ) as Promise<FilterResponse>,
    sync: (sessionId: string, body: Record<string, unknown>) =>
      this.callSdk(() =>
        syncSessionRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: sessionId },
          body: body as GeneratedSyncPayload,
        })
      ) as Promise<{ responses_synced: number; events_synced: number; variables_synced: number }>,
    uploadMedia: (
      sessionId: string,
      file: File | Blob,
      filename: string
    ): Promise<SessionMediaUploadResponse> =>
      this.callSdk(() =>
        sdk.uploadSessionMedia<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: sessionId },
          body: { file: file instanceof File ? file : new File([file], filename) },
        })
      ).then((raw) => ({
        url: raw.url,
        filename: raw.filename,
        size: raw.size_bytes,
        mimeType: raw.content_type,
      })),
  };

  // === Media ===
  media = {
    list: async (params?: { organizationId?: string; type?: string; search?: string }) => {
      const organizationId = params?.organizationId;
      if (!organizationId) {
        throw new Error('organizationId is required to list media');
      }

      const assets = await this.callSdk(() =>
        sdk.listMedia<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          query: {
            organization_id: organizationId,
          },
        })
      );

      const filteredAssets = assets.filter((asset) => {
        const matchesType = params?.type
          ? String(asset.content_type ?? '').startsWith(`${params.type}/`)
          : true;
        const matchesSearch = params?.search
          ? String(asset.filename ?? '')
              .toLowerCase()
              .includes(params.search.toLowerCase())
          : true;
        return matchesType && matchesSearch;
      });

      return filteredAssets.map(mapMediaAsset);
    },
    upload: async (
      file: File,
      options: {
        organizationId: string;
        accessLevel?: string;
        collectionId?: string;
      }
    ): Promise<MediaUploadResponse> => {
      const raw = await this.callSdk(() =>
        sdk.uploadMedia<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body: {
            organization_id: options.organizationId,
            file,
          },
        })
      );

      return {
        asset: mapMediaAsset(raw),
        url: raw.url,
      };
    },
    getUrl: async (id: string) => {
      const raw = await this.callSdk(() =>
        sdk.getMedia<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id },
        })
      );
      return { url: raw.url };
    },
    delete: (id: string) =>
      this.callSdk(() =>
        sdk.deleteMedia<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id },
        })
      ).then(() => undefined),
  };

  // === Question Templates ===
  templates = {
    list: async (
      orgId: string,
      params?: {
        category?: string;
        search?: string;
        type?: string;
        limit?: number;
        offset?: number;
      }
    ) =>
      (
        await this.callSdk(() =>
          sdk.listTemplates<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId },
            query: {
              category: params?.category,
              search: params?.search,
              type: params?.type,
              limit: params?.limit,
              offset: params?.offset,
            },
          })
        )
      ).map(mapQuestionTemplate),
    get: async (orgId: string, templateId: string) =>
      mapQuestionTemplate(
        await this.callSdk(() =>
          sdk.getTemplate<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId, tid: templateId },
          })
        )
      ),
    create: async (
      orgId: string,
      data: {
        name: string;
        description?: string;
        category?: string;
        tags?: string[];
        question_type: string;
        question_config: Record<string, unknown>;
        is_shared?: boolean;
      }
    ) =>
      mapQuestionTemplate(
        await this.callSdk(() =>
          sdk.createTemplate<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId },
            body: data,
          })
        )
      ),
    update: async (
      orgId: string,
      templateId: string,
      data: {
        name?: string;
        description?: string;
        category?: string;
        tags?: string[];
        question_config?: Record<string, unknown>;
        is_shared?: boolean;
      }
    ) =>
      mapQuestionTemplate(
        await this.callSdk(() =>
          sdk.updateTemplate<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            path: { id: orgId, tid: templateId },
            body: data,
          })
        )
      ),
    delete: (orgId: string, templateId: string) =>
      this.callSdk(() =>
        sdk.deleteTemplate<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: orgId, tid: templateId },
        })
      ).then(() => undefined),
  };

  // === Comments ===
  comments = {
    list: (questionnaireId: string, params?: { anchorType?: string; anchorId?: string; resolved?: boolean }) =>
      this.callSdk(() =>
        sdk.listComments<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: questionnaireId },
          query: {
            anchor_type: params?.anchorType,
            anchor_id: params?.anchorId,
            resolved: params?.resolved,
          },
        })
      ),
    create: (questionnaireId: string, body: {
      parent_id?: string | null;
      anchor_type: string;
      anchor_id?: string | null;
      body: string;
    }) =>
      this.callSdk(() =>
        sdk.createComment<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: questionnaireId },
          body,
        })
      ),
    update: (questionnaireId: string, commentId: string, body: { body?: string; resolved?: boolean }) =>
      this.callSdk(() =>
        sdk.updateComment<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: questionnaireId, cid: commentId },
          body,
        })
      ),
    delete: (questionnaireId: string, commentId: string) =>
      this.callSdk(() =>
        sdk.deleteComment<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: questionnaireId, cid: commentId },
        })
      ).then(() => undefined),
  };

  // === Users ===
  users = {
    getProfile: () =>
      this.callSdk(() =>
        getProfileRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
        })
      ) as Promise<GeneratedUserProfile>,
    updateProfile: (data: {
      full_name?: string;
      avatar_url?: string;
      timezone?: string;
      locale?: string;
    }) =>
      this.callSdk(() =>
        updateProfileRequest<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body: data,
        })
      ) as Promise<GeneratedUserProfile>,
  };

  // === Email Verification ===
  emailVerification = {
    send: async (email: string) =>
      mapVerificationResult(
        await this.callSdk(() =>
          sdk.sendVerificationCode<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            body: { email },
          })
        )
      ),
    verify: async (email: string, code: string) =>
      mapVerificationResult(
        await this.callSdk(() =>
          sdk.verifyCode<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            body: { email, code },
          })
        )
      ),
    resend: async (email: string) =>
      mapVerificationResult(
        await this.callSdk(() =>
          sdk.resendVerificationCode<true>({
            client: apiClient,
            responseStyle: 'data',
            throwOnError: true,
            body: { email },
          })
        )
      ),
  };

  // === Password Reset ===
  passwordReset = {
    request: (email: string) =>
      this.callSdk(() =>
        sdk.passwordReset<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body: { email },
        })
      ) as Promise<{ message: string }>,
    confirm: (token: string, newPassword: string) =>
      this.callSdk(() =>
        sdk.confirmPasswordReset<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body: {
            token,
            new_password: newPassword,
          },
        })
      ) as Promise<{ message: string }>,
  };
}

export const api = new ApiClient();
