import { auth } from '../auth';
import { ApiError } from './errors';

type ApiErrorPayload = {
  error?: string | { message?: string; status?: number };
  message?: string;
  details?: unknown;
};

export type SdkFieldResponse<T> = {
  data: T;
  request: Request;
  response: Response;
};

export function getApiErrorStatus(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const typed = payload as ApiErrorPayload;
  if (typed.error && typeof typed.error === 'object' && typeof typed.error.status === 'number') {
    return typed.error.status;
  }

  return null;
}

export function parseApiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    const normalized = payload.trim();
    if (normalized.length > 0 && normalized !== '[object Object]') {
      return normalized;
    }
  }

  if (payload && typeof payload === 'object') {
    const typed = payload as ApiErrorPayload;

    if (typeof typed.error === 'string' && typed.error.trim().length > 0) {
      return typed.error;
    }

    if (typed.error && typeof typed.error === 'object') {
      const nestedMessage = typed.error.message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
        return nestedMessage;
      }
    }

    if (typeof typed.message === 'string' && typed.message.trim().length > 0) {
      return typed.message;
    }

    if (typed.details && typeof typed.details === 'object') {
      const detailEntries = Object.values(typed.details as Record<string, unknown>)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

      if (detailEntries.length > 0) {
        return detailEntries.join(', ');
      }
    }
  }

  return fallback;
}

export function unwrapSdkResult<T>(result: T | SdkFieldResponse<T>): T {
  if (
    result &&
    typeof result === 'object' &&
    'data' in result &&
    'request' in result &&
    'response' in result
  ) {
    return result.data;
  }

  return result as T;
}

/**
 * Keep the status on the way out. Collapsing a failure to `new Error(message)`
 * left every catch site unable to tell offline from 409 from 401, so a failed
 * save could only ever be reported as a generic "something went wrong".
 */
function toApiError(error: unknown): ApiError {
  return new ApiError(parseApiErrorMessage(error, 'Request failed'), getApiErrorStatus(error));
}

export async function callSdk<T>(request: () => Promise<T | SdkFieldResponse<T>>): Promise<T> {
  try {
    return unwrapSdkResult(await request());
  } catch (error) {
    if (getApiErrorStatus(error) === 401) {
      const session = await auth.getSession();
      if (session) {
        // The post-refresh retry must be wrapped too. Left bare, its rejection
        // escaped as the SDK's raw payload object — not an Error at all — and the
        // caller could only render it as "Unknown error occurred". This is the
        // live 401 path (a signed-in author whose token went stale), so the one
        // failure most likely to be misreported was the one we misreported.
        try {
          return unwrapSdkResult(await request());
        } catch (retryError) {
          throw toApiError(retryError);
        }
      }
      await auth.signOut();
    }

    throw toApiError(error);
  }
}
