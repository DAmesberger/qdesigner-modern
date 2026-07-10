import type {
  NumericStatsSummary,
  SessionAggregateResponse,
  SessionCompareResponse,
  CrossProjectAnalyticsResponse,
  Organization as GeneratedOrganization,
  OrgMember,
  Invitation as GeneratedInvitation,
  InvitationDetail,
  PendingInvitation,
  Project as GeneratedProject,
  QuestionTemplate as GeneratedQuestionTemplate,
  MediaAsset as GeneratedMediaAsset,
  MediaAssetWithUrl,
  DomainRecord,
  VerificationResult as GeneratedVerificationResult,
  ConditionCount,
  Session as GeneratedSession,
} from '$lib/api/generated/types.gen';
import type {
  Organization,
  OrganizationMember,
  Invitation,
  Project,
  QuestionTemplate,
  SessionData,
  SessionAggregateData,
  SessionCompareData,
  SessionStatsSummary,
  MediaAsset,
  ConditionGroupCounts,
  DomainConfig,
  VerificationResult,
  CrossProjectAnalyticsData,
} from '$lib/shared/types/api';

export function mapStatsSummary(raw: NumericStatsSummary): SessionStatsSummary {
  return {
    sampleCount: Number(raw.sample_count ?? 0),
    mean: raw.mean ?? null,
    median: raw.median ?? null,
    stdDev: raw.std_dev ?? null,
    min: raw.min ?? null,
    max: raw.max ?? null,
    p10: raw.p10 ?? null,
    p25: raw.p25 ?? null,
    p50: raw.p50 ?? null,
    p75: raw.p75 ?? null,
    p90: raw.p90 ?? null,
    p95: raw.p95 ?? null,
    p99: raw.p99 ?? null,
  };
}

export function mapAggregateData(raw: SessionAggregateResponse): SessionAggregateData {
  return {
    questionnaireId: String(raw.questionnaire_id ?? ''),
    source: (raw.source ?? 'variable') as 'variable' | 'response',
    key: String(raw.key ?? ''),
    participantCount: Number(raw.participant_count ?? 0),
    stats: mapStatsSummary(raw.stats),
  };
}

export function mapCompareData(raw: SessionCompareResponse): SessionCompareData {
  const { left, right, delta } = raw;

  return {
    questionnaireId: String(raw.questionnaire_id ?? ''),
    source: (raw.source ?? 'variable') as 'variable' | 'response',
    key: String(raw.key ?? ''),
    left: {
      participantId: String(left.participant_id ?? ''),
      stats: mapStatsSummary(left.stats),
    },
    right: {
      participantId: String(right.participant_id ?? ''),
      stats: mapStatsSummary(right.stats),
    },
    delta: {
      meanDelta: delta.mean_delta ?? null,
      medianDelta: delta.median_delta ?? null,
      zScore: delta.z_score ?? null,
    },
  };
}

export function mapCrossProjectAnalytics(raw: CrossProjectAnalyticsResponse): CrossProjectAnalyticsData {
  const questionnaires = (raw.questionnaires ?? []).map((q) => ({
    questionnaireId: String(q.questionnaire_id ?? ''),
    name: String(q.name ?? ''),
    responseCount: Number(q.response_count ?? 0),
    completedSessions: Number(q.completed_sessions ?? 0),
    completionRate: Number(q.completion_rate ?? 0),
    timingStats: q.timing_stats ? mapStatsSummary(q.timing_stats) : null,
    variableStats: q.variable_stats ? mapStatsSummary(q.variable_stats) : null,
  }));

  const agg = raw.aggregate;
  const aggregate = {
    totalResponses: Number(agg.total_responses ?? 0),
    totalCompletedSessions: Number(agg.total_completed_sessions ?? 0),
    overallCompletionRate: Number(agg.overall_completion_rate ?? 0),
    overallTimingStats: agg.overall_timing_stats ? mapStatsSummary(agg.overall_timing_stats) : null,
    overallVariableStats: agg.overall_variable_stats
      ? mapStatsSummary(agg.overall_variable_stats)
      : null,
  };

  const crossComparisons = raw.cross_comparisons
    ? raw.cross_comparisons.map((c) => ({
        questionnaireA: String(c.questionnaire_a ?? ''),
        questionnaireB: String(c.questionnaire_b ?? ''),
        meanDelta: c.mean_delta ?? null,
        medianDelta: c.median_delta ?? null,
        correlation: c.correlation ?? null,
      }))
    : null;

  return { questionnaires, aggregate, crossComparisons };
}

export function mapOrganization(raw: GeneratedOrganization): Organization {
  const createdAt = raw.created_at ?? new Date().toISOString();
  const updatedAt = raw.updated_at ?? createdAt;

  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    slug: String(raw.slug ?? ''),
    domain: raw.domain ?? null,
    logoUrl: raw.logo_url ?? null,
    settings: (raw.settings as Record<string, unknown>) ?? {},
    dataRegion: (raw as { data_region?: string }).data_region ?? 'eu',
    legalHold: (raw as { legal_hold?: boolean }).legal_hold ?? false,
    subscriptionTier: 'free',
    subscriptionStatus: 'active',
    createdBy: null,
    createdAt,
    updatedAt,
  };
}

export function mapOrganizationMember(raw: OrgMember, organizationId: string): OrganizationMember {
  // custom_role_* were added to the server OrgMember (E-RBAC-3) after the
  // committed OpenAPI snapshot; read them off the runtime payload without a
  // full SDK regen.
  const withCustom = raw as OrgMember & {
    custom_role_id?: string | null;
    custom_role_name?: string | null;
  };
  return {
    organizationId,
    userId: String(raw.user_id ?? ''),
    role: (raw.role ?? 'member') as OrganizationMember['role'],
    status: (raw.status ?? 'active') as OrganizationMember['status'],
    joinedAt: raw.joined_at ?? new Date().toISOString(),
    customRoleId: withCustom.custom_role_id ?? null,
    customRoleName: withCustom.custom_role_name ?? null,
    user: {
      id: String(raw.user_id ?? ''),
      email: String(raw.email ?? ''),
      fullName: raw.full_name ?? null,
      full_name: raw.full_name ?? null,
    },
  };
}

export function mapInvitation(
  raw: GeneratedInvitation | InvitationDetail | PendingInvitation
): Invitation {
  const invitedByRaw = raw.invited_by ?? null;
  const inviterSummary = invitedByRaw && typeof invitedByRaw === 'object' ? invitedByRaw : null;
  const inviterId =
    inviterSummary?.id ?? (typeof invitedByRaw === 'string' ? invitedByRaw : undefined);
  const inviterEmail = inviterSummary?.email;
  const inviterFullName = inviterSummary?.full_name ?? null;

  const organization = 'organization' in raw ? raw.organization : undefined;
  const acceptedAt = 'accepted_at' in raw ? (raw.accepted_at ?? null) : null;

  return {
    id: String(raw.id ?? ''),
    organizationId: String(raw.organization_id ?? organization?.id ?? ''),
    email: String(raw.email ?? ''),
    role: String(raw.role ?? ''),
    token: String(raw.token ?? raw.id ?? ''),
    status: (raw.status ?? 'pending') as Invitation['status'],
    expiresAt: raw.expires_at ?? new Date().toISOString(),
    createdAt: raw.created_at ?? new Date().toISOString(),
    acceptedAt,
    customMessage: raw.custom_message ?? null,
    organization: organization
      ? {
          id: String(organization.id ?? ''),
          name: String(organization.name ?? ''),
          slug: String(organization.slug ?? ''),
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
    created_at: raw.created_at ?? undefined,
    accepted_at: acceptedAt,
    expires_at: raw.expires_at ?? undefined,
  };
}

export function mapProject(raw: GeneratedProject): Project {
  const createdAt = raw.created_at ?? new Date().toISOString();
  const updatedAt = raw.updated_at ?? createdAt;

  return {
    id: String(raw.id ?? ''),
    organizationId: String(raw.organization_id ?? ''),
    name: String(raw.name ?? ''),
    code: String(raw.code ?? ''),
    description: raw.description ?? null,
    isPublic: Boolean(raw.is_public ?? false),
    status: (raw.status ?? 'active') as Project['status'],
    maxParticipants: raw.max_participants ?? null,
    irbNumber: raw.irb_number ?? null,
    startDate: raw.start_date ?? null,
    endDate: raw.end_date ?? null,
    settings: (raw.settings as Record<string, unknown>) ?? {},
    createdBy: null,
    createdAt,
    updatedAt,
  };
}

export function mapQuestionTemplate(raw: GeneratedQuestionTemplate): QuestionTemplate {
  const createdAt = raw.created_at ?? new Date().toISOString();
  const updatedAt = raw.updated_at ?? createdAt;
  const questionConfig = (raw.question_config as Record<string, unknown>) ?? {};

  return {
    id: String(raw.id ?? ''),
    organizationId: String(raw.organization_id ?? ''),
    createdBy: String(raw.created_by ?? ''),
    name: String(raw.name ?? ''),
    description: raw.description ?? null,
    category: raw.category ?? null,
    tags: raw.tags ?? null,
    questionType: String(raw.question_type ?? ''),
    questionConfig,
    isShared: Boolean(raw.is_shared ?? false),
    usageCount: Number(raw.usage_count ?? 0),
    createdAt,
    updatedAt,
  };
}

export function mapMediaAsset(raw: GeneratedMediaAsset | MediaAssetWithUrl): MediaAsset {
  const createdAt = raw.created_at ?? new Date().toISOString();
  const filename = raw.filename ?? 'upload.bin';
  const mimeType = raw.content_type ?? 'application/octet-stream';
  const storagePath = raw.storage_key ?? '';

  return {
    id: String(raw.id ?? ''),
    organizationId: String(raw.organization_id ?? ''),
    uploadedBy: String(raw.uploaded_by ?? ''),
    filename,
    originalFilename: filename,
    mimeType,
    sizeBytes: Number(raw.size_bytes ?? 0),
    storagePath,
    width: null,
    height: null,
    durationSeconds: null,
    thumbnailPath: null,
    metadata: {},
    accessLevel: 'organization',
    createdAt,
    updatedAt: createdAt,
  };
}

export function mapDomainConfig(raw: DomainRecord): DomainConfig {
  return {
    id: String(raw.id ?? ''),
    organizationId: String(raw.organization_id ?? ''),
    domain: String(raw.domain ?? ''),
    verificationToken: String(raw.verification_token ?? ''),
    verificationMethod: raw.verification_method ?? null,
    verifiedAt: raw.verified_at ?? null,
    autoJoinEnabled: Boolean(raw.auto_join_enabled ?? false),
    includeSubdomains: Boolean(raw.include_subdomains ?? false),
    defaultRole: String(raw.default_role ?? 'member'),
    emailWhitelist: raw.email_whitelist ?? [],
    emailBlacklist: raw.email_blacklist ?? [],
    welcomeMessage: raw.welcome_message ?? null,
    createdAt: raw.created_at ?? new Date().toISOString(),
    created_at: raw.created_at ?? undefined,
  };
}

export function mapVerificationResult(raw: GeneratedVerificationResult): VerificationResult {
  return {
    success: Boolean(raw.success ?? false),
    message: raw.message ?? undefined,
    error: raw.error ?? undefined,
  };
}

export function mapConditionCounts(raw: ConditionCount[]): ConditionGroupCounts {
  const counts: ConditionGroupCounts = {};

  for (const item of raw) {
    const conditionName = String(item.condition_name ?? 'unassigned');
    counts[conditionName] = Number(item.count ?? 0);
  }

  return counts;
}

export function mapSession(raw: GeneratedSession): SessionData {
  const status: SessionData['status'] =
    raw.status === 'completed' || raw.status === 'abandoned' ? raw.status : 'active';

  return {
    id: String(raw.id ?? ''),
    questionnaireId: String(raw.questionnaire_id ?? ''),
    participantId: raw.participant_id ?? null,
    status,
    startedAt: raw.started_at ?? new Date().toISOString(),
    completedAt: raw.completed_at ?? null,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    lastActivityAt: raw.last_activity_at ?? null,
    questionnaireVersionMajor: raw.questionnaire_version_major ?? null,
    questionnaireVersionMinor: raw.questionnaire_version_minor ?? null,
    questionnaireVersionPatch: raw.questionnaire_version_patch ?? null,
  };
}
