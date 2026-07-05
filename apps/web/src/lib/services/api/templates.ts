import { apiClient } from '$lib/api/runtime';
import * as sdk from '$lib/api/generated/sdk.gen';
import { callSdk } from './http';
import { mapQuestionTemplate } from './mappers';

export const templates = {
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
      await callSdk(() =>
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
      await callSdk(() =>
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
      await callSdk(() =>
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
      await callSdk(() =>
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
    callSdk(() =>
      sdk.deleteTemplate<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: orgId, tid: templateId },
      })
    ).then(() => undefined),
};
