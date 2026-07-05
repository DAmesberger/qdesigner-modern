import { apiClient } from '$lib/api/runtime';
import * as sdk from '$lib/api/generated/sdk.gen';
import { callSdk } from './http';

export const comments = {
  list: (questionnaireId: string, params?: { anchorType?: string; anchorId?: string; resolved?: boolean }) =>
    callSdk(() =>
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
    callSdk(() =>
      sdk.createComment<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: questionnaireId },
        body,
      })
    ),
  update: (questionnaireId: string, commentId: string, body: { body?: string; resolved?: boolean }) =>
    callSdk(() =>
      sdk.updateComment<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: questionnaireId, cid: commentId },
        body,
      })
    ),
  delete: (questionnaireId: string, commentId: string) =>
    callSdk(() =>
      sdk.deleteComment<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id: questionnaireId, cid: commentId },
      })
    ).then(() => undefined),
};
