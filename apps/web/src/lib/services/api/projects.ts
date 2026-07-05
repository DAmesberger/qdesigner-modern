import { apiClient } from '$lib/api/runtime';
import * as sdk from '$lib/api/generated/sdk.gen';
import { callSdk } from './http';
import { mapProject } from './mappers';
import type { Project } from '$lib/shared/types/api';

export const projects = {
  list: async (orgId?: string) =>
    (
      await callSdk(() =>
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
      await callSdk(() =>
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
      await callSdk(() =>
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
      await callSdk(() =>
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
    callSdk(() =>
      sdk.deleteProject<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        path: { id },
      })
    ).then(() => undefined),
  members: {
    list: async (projectId: string) =>
      await callSdk(() =>
        sdk.listProjectMembers<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId },
        })
      ),
    add: (projectId: string, data: { email: string; role: string }) =>
      callSdk(() =>
        sdk.addProjectMember<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId },
          body: data,
        })
      ) as Promise<{ message: string }>,
    update: (projectId: string, userId: string, data: { role: string }) =>
      callSdk(() =>
        sdk.updateProjectMember<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId, uid: userId },
          body: data,
        })
      ) as Promise<{ message: string }>,
    remove: (projectId: string, userId: string) =>
      callSdk(() =>
        sdk.removeProjectMember<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          path: { id: projectId, uid: userId },
        })
      ).then(() => undefined),
  },
};
