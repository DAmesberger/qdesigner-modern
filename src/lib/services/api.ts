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
  ApiError,
} from '$lib/types/api';

const API_BASE = import.meta.env.VITE_API_URL || '';

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
    overallTimingStats: agg.overall_timing_stats
      ? mapStatsSummary(agg.overall_timing_stats)
      : null,
    overallVariableStats: agg.overall_variable_stats
      ? mapStatsSummary(agg.overall_variable_stats)
      : null,
  };

  const crossComparisons = raw.cross_comparisons
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response items
    ? (raw.cross_comparisons as any[]).map((c: any) => ({
        questionnaireA: String(c.questionnaire_a ?? c.questionnaireA ?? ''),
        questionnaireB: String(c.questionnaire_b ?? c.questionnaireB ?? ''),
        meanDelta: c.mean_delta ?? c.meanDelta ?? null,
        medianDelta: c.median_delta ?? c.medianDelta ?? null,
        correlation: c.correlation ?? null,
      }))
    : null;

  return { questionnaires, aggregate, crossComparisons };
}

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = auth.getAccessToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Don't set Content-Type for FormData (browser sets it with boundary)
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      if (res.status === 401) {
        // Try to refresh token
        const session = await auth.getSession();
        if (session) {
          // Retry with new token
          headers['Authorization'] = `Bearer ${session.accessToken}`;
          const retry = await fetch(`${API_BASE}${path}`, { ...options, headers });
          if (retry.ok) {
            return retry.status === 204 ? (undefined as T) : retry.json();
          }
        }
        // Still unauthorized - sign out
        await auth.signOut();
      }

      const error: ApiError = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete(path: string): Promise<void> {
    await this.request<void>(path, { method: 'DELETE' });
  }

  // === Organizations ===
  organizations = {
    list: () => this.get<Organization[]>('/api/organizations'),
    get: (id: string) => this.get<Organization>(`/api/organizations/${id}`),
    create: (data: { name: string; slug?: string }) =>
      this.post<Organization>('/api/organizations', data),
    update: (id: string, data: Partial<Organization>) =>
      this.patch<Organization>(`/api/organizations/${id}`, data),
    delete: (id: string) => this.delete(`/api/organizations/${id}`),

    // Members
    members: {
      list: (orgId: string) =>
        this.get<OrganizationMember[]>(`/api/organizations/${orgId}/members`),
      add: (orgId: string, data: { userId: string; role: string }) =>
        this.post<OrganizationMember>(`/api/organizations/${orgId}/members`, data),
      remove: (orgId: string, userId: string) =>
        this.delete(`/api/organizations/${orgId}/members/${userId}`),
    },

    // Invitations
    invitations: {
      list: (orgId: string) => this.get<Invitation[]>(`/api/organizations/${orgId}/invitations`),
      create: (orgId: string, data: { email: string; role: string; customMessage?: string }) =>
        this.post<Invitation>(`/api/organizations/${orgId}/invitations`, data),
      getByToken: (token: string) => this.get<Invitation>(`/api/invitations/${token}`),
      accept: (token: string) =>
        this.post<{ success: boolean }>(`/api/invitations/${token}/accept`),
      decline: (token: string) =>
        this.post<{ success: boolean }>(`/api/invitations/${token}/decline`),
      revoke: (orgId: string, invitationId: string) =>
        this.delete(`/api/organizations/${orgId}/invitations/${invitationId}`),
      getPending: (email: string) =>
        this.get<Invitation[]>(`/api/invitations/pending?email=${encodeURIComponent(email)}`),
    },

    // Domains
    domains: {
      list: (orgId: string) => this.get<DomainConfig[]>(`/api/organizations/${orgId}/domains`),
      add: (orgId: string, data: { domain: string }) =>
        this.post<DomainConfig>(`/api/organizations/${orgId}/domains`, data),
      verify: (orgId: string, domainId: string) =>
        this.post<{ success: boolean; method?: string }>(
          `/api/organizations/${orgId}/domains/${domainId}/verify`
        ),
      update: (orgId: string, domainId: string, config: Partial<DomainConfig>) =>
        this.patch<DomainConfig>(`/api/organizations/${orgId}/domains/${domainId}`, config),
      remove: (orgId: string, domainId: string) =>
        this.delete(`/api/organizations/${orgId}/domains/${domainId}`),
      checkAutoJoin: (email: string) =>
        this.get<DomainAutoJoinCheck>(`/api/domains/auto-join?email=${encodeURIComponent(email)}`),
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
      const query = new URLSearchParams();
      query.set('questionnaire_ids', params.questionnaireIds.join(','));
      if (params.metrics?.length) query.set('metrics', params.metrics.join(','));
      if (params.source) query.set('source', params.source);
      if (params.key) query.set('key', params.key);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response mapped to typed object
      const raw = await this.get<any>(`/api/organizations/${orgId}/analytics?${query.toString()}`);
      return mapCrossProjectAnalytics(raw);
    },
  };

  // === Projects ===
  projects = {
    list: (orgId?: string) => {
      const params = orgId ? `?organization_id=${orgId}` : '';
      return this.get<Project[]>(`/api/projects${params}`);
    },
    get: (id: string) => this.get<Project>(`/api/projects/${id}`),
    create: (data: {
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
      this.post<Project>('/api/projects', {
        organization_id: data.organizationId,
        name: data.name,
        code: data.code,
        description: data.description,
        is_public: data.isPublic,
        max_participants: data.maxParticipants,
        irb_number: data.irbNumber,
        start_date: data.startDate,
        end_date: data.endDate,
      }),
    update: (id: string, data: Partial<Project>) =>
      this.patch<Project>(`/api/projects/${id}`, data),
    delete: (id: string) => this.delete(`/api/projects/${id}`),
  };

  // === Questionnaires ===
  questionnaires = {
    list: (projectId: string) =>
      this.get<QuestionnaireDefinition[]>(`/api/projects/${projectId}/questionnaires`),
    get: (projectId: string, id: string) =>
      this.get<QuestionnaireDefinition>(`/api/projects/${projectId}/questionnaires/${id}`),
    create: (
      projectId: string,
      data: {
        name: string;
        description?: string;
        content?: Record<string, unknown>;
        settings?: Record<string, unknown>;
      }
    ) => this.post<QuestionnaireDefinition>(`/api/projects/${projectId}/questionnaires`, data),
    update: (projectId: string, id: string, data: Partial<QuestionnaireDefinition>) =>
      this.patch<QuestionnaireDefinition>(`/api/projects/${projectId}/questionnaires/${id}`, data),
    delete: (projectId: string, id: string) =>
      this.delete(`/api/projects/${projectId}/questionnaires/${id}`),
    publish: (projectId: string, id: string) =>
      this.post<QuestionnaireDefinition>(`/api/projects/${projectId}/questionnaires/${id}/publish`),
    export: (projectId: string, id: string, format: 'json' | 'csv' = 'json') =>
      this.get<ExportRow[]>(
        `/api/projects/${projectId}/questionnaires/${id}/export?format=${format}`
      ),
    conditionCounts: (questionnaireId: string) =>
      this.get<ConditionGroupCounts>(
        `/api/questionnaires/${questionnaireId}/condition-counts`
      ),
    bumpVersion: (projectId: string, id: string, bumpType: 'major' | 'minor' | 'patch') =>
      this.post<QuestionnaireDefinition>(
        `/api/projects/${projectId}/questionnaires/${id}/bump-version`,
        { bump_type: bumpType }
      ),
    quotaStatus: (questionnaireId: string) =>
      this.get<{
        quotas: Array<{ quota_id: string; name: string; target: number; current: number; is_full: boolean }>;
        total_completed: number;
      }>(`/api/questionnaires/${questionnaireId}/quota-status`),
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
      const qs = query.toString();
      return this.get<SessionData[]>(`/api/sessions${qs ? `?${qs}` : ''}`);
    },
    create: (data: {
      questionnaireId: string;
      participantId?: string;
      metadata?: Record<string, unknown>;
    }) =>
      this.post<SessionData>('/api/sessions', {
        questionnaire_id: data.questionnaireId,
        participant_id: data.participantId,
        metadata: data.metadata,
      }),
    get: (id: string) => this.get<SessionData>(`/api/sessions/${id}`),
    update: (id: string, data: Partial<SessionData>) =>
      this.patch<SessionData>(`/api/sessions/${id}`, data),
    submitResponses: (sessionId: string, responses: ResponseSubmission[]) =>
      this.post<{ count: number }>(`/api/sessions/${sessionId}/responses`, {
        responses,
      }),
    submitEvents: (sessionId: string, events: unknown[]) =>
      this.post<{ count: number }>(`/api/sessions/${sessionId}/events`, events),
    upsertVariable: (sessionId: string, data: { name: string; value: unknown }) =>
      this.post<{ success: boolean }>(`/api/sessions/${sessionId}/variables`, data),
    getResponses: (
      sessionId: string,
      params?: { questionId?: string; limit?: number; offset?: number }
    ) => {
      const query = new URLSearchParams();
      if (params?.questionId) query.set('question_id', params.questionId);
      if (params?.limit !== undefined) query.set('limit', String(params.limit));
      if (params?.offset !== undefined) query.set('offset', String(params.offset));
      const qs = query.toString();
      return this.get<SessionResponseRecord[]>(
        `/api/sessions/${sessionId}/responses${qs ? `?${qs}` : ''}`
      );
    },
    getEvents: (sessionId: string) =>
      this.get<InteractionEventRecord[]>(`/api/sessions/${sessionId}/events`),
    getVariables: (sessionId: string) =>
      this.get<SessionVariableRecord[]>(`/api/sessions/${sessionId}/variables`),
    dashboard: (organizationId: string) =>
      this.get<DashboardSummary>(
        `/api/sessions/dashboard?organization_id=${organizationId}`
      ),
    aggregate: async (params: {
      questionnaireId: string;
      source?: 'variable' | 'response';
      key: string;
      participantId?: string;
    }): Promise<SessionAggregateData> => {
      const query = new URLSearchParams();
      query.set('questionnaire_id', params.questionnaireId);
      query.set('source', params.source || 'variable');
      query.set('key', params.key);
      if (params.participantId) query.set('participant_id', params.participantId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response mapped to typed object
      const raw = await this.get<any>(`/api/sessions/aggregate?${query.toString()}`);
      return mapAggregateData(raw);
    },
    compare: async (params: {
      questionnaireId: string;
      source?: 'variable' | 'response';
      key: string;
      leftParticipantId: string;
      rightParticipantId: string;
    }): Promise<SessionCompareData> => {
      const query = new URLSearchParams();
      query.set('questionnaire_id', params.questionnaireId);
      query.set('source', params.source || 'variable');
      query.set('key', params.key);
      query.set('left_participant_id', params.leftParticipantId);
      query.set('right_participant_id', params.rightParticipantId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API response mapped to typed object
      const raw = await this.get<any>(`/api/sessions/compare?${query.toString()}`);
      return mapCompareData(raw);
    },
    timeseries: async (params: {
      questionnaireId: string;
      interval?: 'hour' | 'day' | 'week';
    }): Promise<TimeSeriesBucket[]> => {
      const query = new URLSearchParams();
      query.set('questionnaire_id', params.questionnaireId);
      if (params.interval) query.set('interval', params.interval);
      return this.get<TimeSeriesBucket[]>(`/api/sessions/timeseries?${query.toString()}`);
    },
    filter: (body: {
      questionnaire_id: string;
      groups: { logic: string; rules: { field: string; operator: string; value: unknown; value2?: unknown }[] }[];
      logic?: string;
      source?: string;
      key?: string;
      limit?: number;
      offset?: number;
    }): Promise<FilterResponse> => {
      return this.post<FilterResponse>('/api/sessions/filter', body);
    },
    uploadMedia: (
      sessionId: string,
      file: File | Blob,
      filename: string
    ): Promise<SessionMediaUploadResponse> => {
      const formData = new FormData();
      formData.append('file', file, filename);
      return this.post<SessionMediaUploadResponse>(
        `/api/sessions/${sessionId}/media`,
        formData
      );
    },
  };

  // === Media ===
  media = {
    list: (params?: { type?: string; search?: string }) => {
      const query = new URLSearchParams();
      if (params?.type) query.set('type', params.type);
      if (params?.search) query.set('search', params.search);
      const qs = query.toString();
      return this.get<MediaAsset[]>(`/api/media${qs ? `?${qs}` : ''}`);
    },
    upload: (
      file: File,
      options: {
        organizationId: string;
        accessLevel?: string;
        collectionId?: string;
      }
    ): Promise<MediaUploadResponse> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', options.organizationId);
      if (options.accessLevel) formData.append('access_level', options.accessLevel);
      if (options.collectionId) formData.append('collection_id', options.collectionId);
      return this.post<MediaUploadResponse>('/api/media', formData);
    },
    getUrl: (id: string) => this.get<{ url: string }>(`/api/media/${id}`),
    delete: (id: string) => this.delete(`/api/media/${id}`),
  };

  // === Question Templates ===
  templates = {
    list: (orgId: string, params?: { category?: string; search?: string; type?: string; limit?: number; offset?: number }) => {
      const query = new URLSearchParams();
      if (params?.category) query.set('category', params.category);
      if (params?.search) query.set('search', params.search);
      if (params?.type) query.set('type', params.type);
      if (params?.limit !== undefined) query.set('limit', String(params.limit));
      if (params?.offset !== undefined) query.set('offset', String(params.offset));
      const qs = query.toString();
      return this.get<QuestionTemplate[]>(`/api/organizations/${orgId}/templates${qs ? `?${qs}` : ''}`);
    },
    get: (orgId: string, templateId: string) =>
      this.get<QuestionTemplate>(`/api/organizations/${orgId}/templates/${templateId}`),
    create: (orgId: string, data: {
      name: string;
      description?: string;
      category?: string;
      tags?: string[];
      question_type: string;
      question_config: Record<string, unknown>;
      is_shared?: boolean;
    }) => this.post<QuestionTemplate>(`/api/organizations/${orgId}/templates`, data),
    update: (orgId: string, templateId: string, data: {
      name?: string;
      description?: string;
      category?: string;
      tags?: string[];
      question_config?: Record<string, unknown>;
      is_shared?: boolean;
    }) => this.patch<QuestionTemplate>(`/api/organizations/${orgId}/templates/${templateId}`, data),
    delete: (orgId: string, templateId: string) =>
      this.delete(`/api/organizations/${orgId}/templates/${templateId}`),
  };

  // === Users ===
  users = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user profile shape varies by backend
    getProfile: () => this.get<any>('/api/users/me'),
    updateProfile: (data: { full_name?: string; avatar_url?: string; timezone?: string; locale?: string }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user profile shape varies by backend
      this.patch<any>('/api/users/me', data),
  };

  // === Email Verification ===
  emailVerification = {
    send: (email: string) =>
      this.post<VerificationResult>('/api/auth/verify-email/send', { email }),
    verify: (email: string, code: string) =>
      this.post<VerificationResult>('/api/auth/verify-email/verify', {
        email,
        code,
      }),
    resend: (email: string) =>
      this.post<VerificationResult>('/api/auth/verify-email/resend', { email }),
  };

  // === Password Reset ===
  passwordReset = {
    request: (email: string) =>
      this.post<{ message: string }>('/api/auth/password-reset', { email }),
    confirm: (token: string, newPassword: string) =>
      this.post<{ message: string }>('/api/auth/password-reset/confirm', {
        token,
        new_password: newPassword,
      }),
  };
}

export const api = new ApiClient();
