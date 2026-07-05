import { apiClient } from '$lib/api/runtime';
import * as sdk from '$lib/api/generated/sdk.gen';
import { callSdk } from './http';
import { mapVerificationResult } from './mappers';

export const emailVerification = {
  send: async (email: string) =>
    mapVerificationResult(
      await callSdk(() =>
        sdk.sendVerificationCode<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body: { email },
        })
      )
    ),
  verify: async (email: string, code: string) =>
    mapVerificationResult(
      await callSdk(() =>
        sdk.verifyCode<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body: { email, code },
        })
      )
    ),
  resend: async (email: string) =>
    mapVerificationResult(
      await callSdk(() =>
        sdk.resendVerificationCode<true>({
          client: apiClient,
          responseStyle: 'data',
          throwOnError: true,
          body: { email },
        })
      )
    ),
};
