import { auth } from '../auth';

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

export async function callSdk<T>(request: () => Promise<T | SdkFieldResponse<T>>): Promise<T> {
  try {
    return unwrapSdkResult(await request());
  } catch (error) {
    if (getApiErrorStatus(error) === 401) {
      const session = await auth.getSession();
      if (session) {
        return unwrapSdkResult(await request());
      }
      await auth.signOut();
    }

    throw new Error(parseApiErrorMessage(error, 'Request failed'));
  }
}
