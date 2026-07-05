import { createClient } from '$lib/api/generated/client';
import {
  login as loginRequest,
  logout as logoutRequest,
  me as meRequest,
  refresh as refreshRequest,
  register as registerRequest,
} from '$lib/api/generated/sdk.gen';
import type { User, Session, AuthResult, AuthChangeEvent } from '$lib/shared/types/auth';

const STORAGE_KEY = 'qdesigner-auth';
const API_BASE = import.meta.env.VITE_API_URL || '';
const authApiClient = createClient({
  baseUrl: API_BASE,
  responseStyle: 'data',
  throwOnError: true,
  // Carry the httpOnly refresh_token cookie so login/refresh/logout can set,
  // rotate, and clear it (F003 — the refresh token is never exposed to JS).
  credentials: 'include',
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

type ApiErrorEnvelope = {
  error?: string | { message?: string; status?: number };
  message?: string;
};

function parseApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const typed = payload as ApiErrorEnvelope;

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
  }

  return fallback;
}

/** Matches the flat JSON returned by the Rust backend. */
interface ApiAuthUser {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: ApiAuthUser;
}

type SdkFieldResponse<T> = {
  data: T;
  request: Request;
  response: Response;
};

function normalizeUser(user: ApiAuthUser): User {
  const now = new Date().toISOString();

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name ?? null,
    avatarUrl: user.avatar_url ?? null,
    emailConfirmedAt: null,
    lastSignInAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

type AuthChangeCallback = (event: AuthChangeEvent) => void;

class AuthService {
  private session: Session | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<AuthChangeCallback> = new Set();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private unwrapSdkResult<T>(result: T | SdkFieldResponse<T>): T {
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
   * Bootstrap the in-memory session on app mount. There are no persisted
   * tokens anymore: the access token lives only in memory and the refresh
   * token in an httpOnly cookie. So we ask the server for a fresh access token
   * via a silent refresh — it succeeds only if a valid refresh cookie exists.
   * Idempotent and concurrency-safe (a single in-flight promise is shared).
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          await this.refreshSession();
        } finally {
          this.initialized = true;
        }
      })();
    }
    return this.initPromise;
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    try {
      const data = this.unwrapSdkResult<AuthResponse>(
        await loginRequest({
          responseStyle: 'data',
          throwOnError: true,
          client: authApiClient,
          body: { email, password },
        }) as unknown as AuthResponse | SdkFieldResponse<AuthResponse>
      );
      const session = this.createSession(data);
      this.setSession(session);
      return { session, user: session.user, error: null };
    } catch (err) {
      return {
        session: null,
        user: null,
        error: parseApiErrorMessage(err, 'Network error'),
      };
    }
  }

  async signUp(email: string, password: string, fullName: string): Promise<AuthResult> {
    try {
      const data = this.unwrapSdkResult<AuthResponse>(
        await registerRequest({
          responseStyle: 'data',
          throwOnError: true,
          client: authApiClient,
          body: { email, password, full_name: fullName },
        }) as unknown as AuthResponse | SdkFieldResponse<AuthResponse>
      );
      const session = this.createSession(data);
      this.setSession(session);
      return { session, user: session.user, error: null };
    } catch (err) {
      return {
        session: null,
        user: null,
        error: parseApiErrorMessage(err, 'Network error'),
      };
    }
  }

  async ensureDevQuickLoginPersonas(): Promise<void> {
    if (!import.meta.env.DEV) return;

    try {
      await fetch(`${API_BASE}/api/dev/bootstrap-personas`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
    } catch {
      // Best-effort only for development convenience.
    }
  }

  async signOut(): Promise<void> {
    const token = this.session?.accessToken;
    this.clearSession();

    if (token) {
      try {
        await logoutRequest({
          responseStyle: 'data',
          throwOnError: true,
          client: authApiClient,
          auth: token,
        });
      } catch {
        // Ignore errors on sign out
      }
    }
  }

  async getSession(): Promise<Session | null> {
    if (!this.initialized) await this.init();

    // If the in-memory access token expired, mint a new one from the refresh
    // cookie (the server reads it; no token is passed from JS).
    if (this.session && this.session.expiresAt <= Date.now() / 1000) {
      await this.refreshSession();
    }

    return this.session;
  }

  async getUser(): Promise<User | null> {
    const session = await this.getSession();
    if (!session) return null;

    try {
      const rawUser = this.unwrapSdkResult<ApiAuthUser>(
        (await meRequest({
          responseStyle: 'data',
          throwOnError: true,
          client: authApiClient,
          auth: session.accessToken,
        })) as unknown as ApiAuthUser | SdkFieldResponse<ApiAuthUser>
      );
      const user = normalizeUser(rawUser);
      // Update cached user
      this.session = { ...session, user };
      this.storeSession(this.session);
      return user;
    } catch (error) {
      const message = parseApiErrorMessage(error, '');
      if (message.includes('Unauthorized') || message.includes('Invalid token')) {
        this.clearSession();
        return null;
      }
      return session.user; // Return cached on network error
    }
  }

  getAccessToken(): string | null {
    return this.session?.accessToken ?? null;
  }

  onAuthStateChange(callback: AuthChangeCallback): () => void {
    this.listeners.add(callback);

    // Immediately fire with current state
    if (this.session) {
      callback({ event: 'SIGNED_IN', session: this.session });
    }

    return () => {
      this.listeners.delete(callback);
    };
  }

  // Private methods

  private async refreshSession(): Promise<boolean> {
    try {
      // No token in the body: the refresh token rides in the httpOnly cookie,
      // which the browser attaches because authApiClient sets credentials:
      // 'include'. Send an empty object so the request still carries a JSON body.
      const data = this.unwrapSdkResult<AuthResponse>(
        await refreshRequest({
          responseStyle: 'data',
          throwOnError: true,
          client: authApiClient,
          body: {},
        }) as unknown as AuthResponse | SdkFieldResponse<AuthResponse>
      );
      const session = this.createSession(data);
      this.setSession(session, 'TOKEN_REFRESHED');
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  private createSession(data: AuthResponse): Session {
    // The refresh token is intentionally not read from the body — it arrives
    // as an httpOnly cookie the server set. Only the access token is kept, in
    // memory.
    return {
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      user: normalizeUser(data.user),
    };
  }

  private setSession(session: Session, event: AuthChangeEvent['event'] = 'SIGNED_IN'): void {
    this.session = session;
    this.storeSession(session);
    this.scheduleRefresh();
    this.notify({ event, session });
  }

  private clearSession(): void {
    this.session = null;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.notify({ event: 'SIGNED_OUT', session: null });
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (!this.session) return;

    // Refresh 60 seconds before expiry
    const msUntilExpiry = (this.session.expiresAt - Math.floor(Date.now() / 1000) - 60) * 1000;
    if (msUntilExpiry > 0) {
      this.refreshTimer = setTimeout(() => {
        if (this.session) {
          this.refreshSession();
        }
      }, msUntilExpiry);
    }
  }

  private storeSession(session: Session): void {
    if (typeof localStorage !== 'undefined') {
      // Persist only non-secret profile data for fast UI hydration. Tokens are
      // never written to storage (F003): the access token stays in memory and
      // the refresh token lives in an httpOnly cookie.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          expiresAt: session.expiresAt,
          user: session.user,
        })
      );
    }
  }

  private notify(event: AuthChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Auth state change listener error:', err);
      }
    }
  }
}

export const auth = new AuthService();
