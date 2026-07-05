import { apiClient } from '$lib/api/runtime';
import {
  getProfile as getProfileRequest,
  updateProfile as updateProfileRequest,
} from '$lib/api/generated/sdk.gen';
import type { UserProfile as GeneratedUserProfile } from '$lib/api/generated/types.gen';
import { callSdk } from './http';

export const users = {
  getProfile: () =>
    callSdk(() =>
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
    callSdk(() =>
      updateProfileRequest<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        body: data,
      })
    ) as Promise<GeneratedUserProfile>,
};
