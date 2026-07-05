import { apiClient } from '$lib/api/runtime';
import * as sdk from '$lib/api/generated/sdk.gen';
import { callSdk } from './http';

export const passwordReset = {
  request: (email: string) =>
    callSdk(() =>
      sdk.passwordReset<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        body: { email },
      })
    ) as Promise<{ message: string }>,
  confirm: (token: string, newPassword: string) =>
    callSdk(() =>
      sdk.confirmPasswordReset<true>({
        client: apiClient,
        responseStyle: 'data',
        throwOnError: true,
        body: {
          token,
          new_password: newPassword,
        },
      })
    ) as Promise<{ message: string }>,
};
