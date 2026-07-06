import { apiClient } from '$lib/api/runtime';
import {
  bumpVersion as bumpVersionRequest,
  createQuestionnaire as createQuestionnaireRequest,
  deleteQuestionnaire as deleteQuestionnaireRequest,
  exportResponses as exportResponsesRequest,
  getQuestionnaire as getQuestionnaireRequest,
  getQuestionnaireByCode as getQuestionnaireByCodeRequest,
  listQuestionnaires as listQuestionnairesRequest,
  listVersions as listVersionsRequest,
  publishQuestionnaire as publishQuestionnaireRequest,
  updateQuestionnaire as updateQuestionnaireRequest,
} from '$lib/api/generated/sdk.gen';
import * as sdk from '$lib/api/generated/sdk.gen';
import type {
  QuestionnaireByCode as GeneratedQuestionnaireByCode,
  QuestionnaireVersion as GeneratedQuestionnaireVersion,
} from '$lib/api/generated/types.gen';
import { callSdk } from './http';
import { mapConditionCounts } from './mappers';
import type { QuestionnaireDefinition, ExportRow } from '$lib/shared/types/api';

export const questionnaires = {
  getByCode: (code: string) =>
    callSdk(() =>
      getQuestionnaireByCodeRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { code },
      })
    ) as Promise<GeneratedQuestionnaireByCode>,
  list: (projectId: string) =>
    callSdk(() =>
      listQuestionnairesRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: projectId },
      })
    ) as Promise<QuestionnaireDefinition[]>,
  get: (projectId: string, id: string) =>
    callSdk(() =>
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
    callSdk(() =>
      createQuestionnaireRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: projectId },
        body: data,
      })
    ) as Promise<QuestionnaireDefinition>,
  update: (projectId: string, id: string, data: Partial<QuestionnaireDefinition>) =>
    callSdk(() =>
      updateQuestionnaireRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: projectId, qid: id },
        body: data,
      })
    ) as Promise<QuestionnaireDefinition>,
  delete: (projectId: string, id: string) =>
    callSdk(() =>
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
    callSdk(() =>
      publishQuestionnaireRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: projectId, qid: id },
      })
    ) as Promise<QuestionnaireDefinition>,
  export: (projectId: string, id: string, format: 'json' | 'csv' = 'json') =>
    callSdk(() =>
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
      await callSdk(() =>
        sdk.conditionCounts<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: questionnaireId },
        })
      )
    ),
  /**
   * Live per-arm allocation counts from the authoritative `arm_counts` ledger
   * (E-FLOW-6). Distinct from {@link conditionCounts}, which derives from
   * session rows; this is the atomic assignment tally the server maintains at
   * create time. Shaped as `{ conditionName: assignedCount }`.
   */
  armCounts: async (questionnaireId: string): Promise<Record<string, number>> => {
    const rows = await callSdk(() =>
      sdk.armCounts<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: questionnaireId },
      })
    );
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[String(row.condition_name)] = Number(row.assigned_count ?? 0);
    }
    return counts;
  },
  bumpVersion: (projectId: string, id: string, bumpType: 'major' | 'minor' | 'patch') =>
    callSdk(() =>
      bumpVersionRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: projectId, qid: id },
        body: { bump_type: bumpType },
      })
    ) as Promise<QuestionnaireDefinition>,
  listVersions: (questionnaireId: string, params?: { limit?: number; offset?: number }) =>
    callSdk(() =>
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
    callSdk(() =>
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
