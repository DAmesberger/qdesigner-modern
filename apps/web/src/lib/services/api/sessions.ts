import { apiClient } from '$lib/api/runtime';
import {
  aggregateSessions as aggregateSessionsRequest,
  compareSessions as compareSessionsRequest,
  createSession as createSessionRequest,
  dashboardSummary as dashboardSummaryRequest,
  getEvents as getEventsRequest,
  getResponses as getResponsesRequest,
  getSession as getSessionRequest,
  getVariables as getVariablesRequest,
  listSessions as listSessionsRequest,
  submitEvents as submitEventsRequest,
  syncSession as syncSessionRequest,
  timeseries as timeseriesRequest,
  updateSession as updateSessionRequest,
} from '$lib/api/generated/sdk.gen';
import * as sdk from '$lib/api/generated/sdk.gen';
import type {
  InteractionEventRequest as GeneratedInteractionEventRequest,
  SyncPayload as GeneratedSyncPayload,
} from '$lib/api/generated/types.gen';
import { callSdk } from './http';
import { mapSession, mapAggregateData, mapCompareData } from './mappers';
import type {
  SessionAggregateData,
  SessionCompareData,
  SessionResponseRecord,
  InteractionEventRecord,
  SessionVariableRecord,
  DashboardSummary,
  SessionMediaUploadResponse,
  TimeSeriesBucket,
} from '$lib/shared/types/api';

export const sessions = {
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
    return callSdk(() =>
      listSessionsRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        query: Object.fromEntries(query.entries()),
      })
    ).then((rows) => rows.map(mapSession));
  },
  create: (data: {
    questionnaireId: string;
    participantId?: string;
    metadata?: Record<string, unknown>;
    browserInfo?: Record<string, unknown>;
    versionMajor?: number;
    versionMinor?: number;
    versionPatch?: number;
    /** E-FLOW-2: bind a longitudinal/EMA wave session to its series enrollment. */
    resumeToken?: string;
  }) =>
    callSdk(() =>
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
          resume_token: data.resumeToken,
        },
      })
    ).then((raw) => ({
      ...mapSession(raw),
      duplicate: Boolean(raw.duplicate),
      // E-FLOW-6: server-atomic between-subjects assignment + monotonic
      // participant index, allocated at create time. The runtime seeds
      // counterbalancing from participantNumber and prefers the server arm.
      participantNumber: typeof raw.participant_number === 'number' ? raw.participant_number : 0,
      assignedCondition: raw.assigned_condition ?? null,
      assignedConditionIndex:
        typeof raw.assigned_condition_index === 'number' ? raw.assigned_condition_index : null,
    })),
  get: (id: string) =>
    callSdk(() =>
      getSessionRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id },
      })
    ).then(mapSession),
  update: (id: string, data: { status?: string; metadata?: Record<string, unknown> }) =>
    callSdk(() =>
      updateSessionRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id },
        body: data,
      })
    ).then(mapSession),
  submitEvents: (sessionId: string, events: unknown[]) =>
    callSdk(() =>
      submitEventsRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: sessionId },
        body: events as GeneratedInteractionEventRequest[],
      })
    ) as Promise<{ count: number }>,
  getResponses: (
    sessionId: string,
    params?: { questionId?: string; limit?: number; offset?: number }
  ) => {
    const query = new URLSearchParams();
    if (params?.questionId) query.set('question_id', params.questionId);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    return callSdk(() =>
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
    callSdk(() =>
      getEventsRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: sessionId },
      })
    ) as Promise<InteractionEventRecord[]>,
  getVariables: (sessionId: string) =>
    callSdk(() =>
      getVariablesRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: sessionId },
      })
    ) as Promise<SessionVariableRecord[]>,
  dashboard: (organizationId: string) =>
    callSdk(() =>
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
    const raw = await callSdk(() =>
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
    const raw = await callSdk(() =>
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
    return callSdk(() =>
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
  sync: (sessionId: string, body: GeneratedSyncPayload) =>
    callSdk(() =>
      syncSessionRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: sessionId },
        body,
      })
    ) as Promise<{
      responses_synced: number;
      events_synced: number;
      variables_synced: number;
      // Ack-driven marking (E-OFF-4). Optional: an older server omits these and
      // the client falls back to marking every sent record synced.
      accepted_client_ids?: string[];
      accepted_variable_names?: string[];
    }>,
  uploadMedia: (
    sessionId: string,
    file: File | Blob,
    filename: string
  ): Promise<SessionMediaUploadResponse> =>
    callSdk(() =>
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
