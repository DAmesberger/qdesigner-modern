import { apiClient } from '$lib/api/runtime';
import {
  createSeries as createSeriesRequest,
  listSeries as listSeriesRequest,
  updateSeries as updateSeriesRequest,
  enroll as enrollRequest,
  listEnrollments as listEnrollmentsRequest,
} from '$lib/api/generated/sdk.gen';
import type {
  SeriesRecord,
  CreateSeriesRequest,
  UpdateSeriesRequest,
  EnrollRequest,
  EnrollResponse,
  EnrollmentRecord,
} from '$lib/api/generated/types.gen';
import { callSdk } from './http';

/**
 * Researcher-facing longitudinal / EMA study-series client (E-FLOW-2).
 * Wraps the generated SDK (auth-attached `apiClient`) with `callSdk` for
 * 401-refresh + error normalization, matching the other `services/api/*`
 * clients. The anonymous participant surface (resolve / complete /
 * unsubscribe) lives in `fillout/services/SeriesEnrollmentService.ts`.
 */
export const series = {
  list: (questionnaireId: string) =>
    callSdk(() =>
      listSeriesRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        query: { questionnaire_id: questionnaireId },
      })
    ) as Promise<SeriesRecord[]>,

  create: (body: CreateSeriesRequest) =>
    callSdk(() =>
      createSeriesRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        body,
      })
    ) as Promise<SeriesRecord>,

  update: (id: string, body: UpdateSeriesRequest) =>
    callSdk(() =>
      updateSeriesRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id },
        body,
      })
    ) as Promise<SeriesRecord>,

  enroll: (id: string, body: EnrollRequest) =>
    callSdk(() =>
      enrollRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id },
        body,
      })
    ) as Promise<EnrollResponse>,

  listEnrollments: (id: string) =>
    callSdk(() =>
      listEnrollmentsRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id },
      })
    ) as Promise<EnrollmentRecord[]>,
};
