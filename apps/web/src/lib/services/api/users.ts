import { apiClient } from '$lib/api/runtime';
import {
  getProfile as getProfileRequest,
  updateProfile as updateProfileRequest,
  deleteAccount as deleteAccountRequest,
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
  // Self-service account deletion (GDPR erasure). Deliberately does NOT go
  // through `callSdk`: the caller must distinguish a semantic 401 (wrong
  // password) from a 409 (still owns a shared org), and `callSdk` both
  // swallows the HTTP status and treats every 401 as an expired-token retry.
  // The raw SDK error (`{ error: { status, message } }`) propagates so the
  // settings page can branch on it via `getApiErrorStatus`.
  deleteAccount: (password: string): Promise<void> =>
    deleteAccountRequest<true>({
      client: apiClient,
      responseStyle: 'data',
      throwOnError: true,
      body: { password },
    }).then(() => undefined),
};
