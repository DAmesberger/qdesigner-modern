import type { User, Session, AuthResult, AuthChangeEvent } from '$lib/shared/types/auth';

const API_BASE = import.meta.env.VITE_API_URL || '';

type ApiErrorEnvelope = {
  error?: string | { message?: string; status?: number };
  message?: string;
};

interface ApiUser {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  roles?: string[];
}

interface ApiOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface SessionView {
  authenticated: boolean;
  provider: string | null;
  user: ApiUser | null;
  mfa_verified: boolean;
  roles: string[];
  organizations: ApiOrganization[];
  expires_at: string | null;
  csrf_token: string | null;
}

function parseApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const typed = payload as ApiErrorEnvelope;
    if (typeof typed.error === 'string' && typed.error.trim().length > 0) return typed.error;
    if (typed.error && typeof typed.error === 'object') {
      const nestedMessage = typed.error.message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
        return nestedMessage;
      }
    }
    if (typeof typed.message === 'string' && typed.message.trim().length > 0) return typed.message;
  }
  return fallback;
}

function normalizeUser(user: ApiUser): User {
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

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw data;
  }
  return data as T;
}

type AuthChangeCallback = (event: AuthChangeEvent) => void;

/**
 * Outcome of a `/api/auth/session` load. `authenticated`/`unauthenticated` are
 * *definitive* answers from the server (the session either resolved or it did
 * not); `failed` is a transient network/rate-limit condition that must not be
 * treated as "signed out" — otherwise a single 429 from the auth limiter would
 * strand an authenticated participant with no CSRF token (see issue #47).
 */
type LoadOutcome = 'authenticated' | 'unauthenticated' | 'failed';

// Exponential backoff bounds applied after a transient session-load failure so
// the interceptor cannot hammer the auth rate limiter deeper into its window.
const BASE_LOAD_BACKOFF_MS = 1_000;
const MAX_LOAD_BACKOFF_MS = 30_000;

class AuthService {
  private session: Session | null = null;
  private listeners: Set<AuthChangeCallback> = new Set();
  private initialized = false;
  // Single-flight guard: concurrent session loads share one in-flight fetch so
  // a burst of state-changing requests triggers at most one `/api/auth/session`.
  private loadInFlight: Promise<LoadOutcome> | null = null;
  // Epoch-ms until which non-forced loads are suppressed after a failure.
  private loadBackoffUntil = 0;
  private loadFailureCount = 0;

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.loadSession();
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    try {
      const view = await this.request<SessionView>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const session = this.sessionFromView(view);
      this.setSession(session);
      return { session, user: session?.user ?? null, error: null };
    } catch (err) {
      return { session: null, user: null, error: parseApiErrorMessage(err, 'Network error') };
    }
  }

  async signUp(email: string, password: string, fullName: string): Promise<AuthResult> {
    try {
      const view = await this.request<SessionView>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      const session = this.sessionFromView(view);
      this.setSession(session);
      return { session, user: session?.user ?? null, error: null };
    } catch (err) {
      return { session: null, user: null, error: parseApiErrorMessage(err, 'Network error') };
    }
  }

  async ensureDevQuickLoginPersonas(): Promise<void> {
    if (!import.meta.env.DEV) return;
    try {
      await fetch(`${API_BASE}/api/dev/bootstrap-personas`, {
        method: 'POST',
        credentials: 'include',
        headers: this.headers(true),
      });
    } catch {
      // Best-effort only for development convenience.
    }
  }

  async signOut(): Promise<void> {
    const hadSession = Boolean(this.session);
    try {
      if (hadSession) {
        await this.request('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // Ignore errors on sign out.
    } finally {
      this.clearSession();
    }
  }

  async getSession(): Promise<Session | null> {
    if (!this.initialized) await this.init();
    if (this.session && this.session.expiresAt <= Date.now() / 1000) {
      await this.loadSession();
    }
    return this.session;
  }

  async getUser(): Promise<User | null> {
    const session = await this.getSession();
    return session?.user ?? null;
  }

  getCsrfToken(): string | null {
    return this.session?.csrfToken ?? null;
  }

  /**
   * Resolve the current session CSRF token for the request interceptor. Returns
   * the cached token synchronously via {@link getCsrfToken} when present; only
   * on a cache miss does it (single-flight, backoff-guarded) load the session.
   * A definitively-anonymous client returns `null` without any network call.
   */
  async ensureCsrfToken(): Promise<string | null> {
    const cached = this.getCsrfToken();
    if (cached) return cached;
    await this.getSession();
    return this.getCsrfToken();
  }

  /**
   * Force one fresh session load (bypassing backoff) to recover a rotated or
   * dropped CSRF token, e.g. after a 403 "Missing/Invalid CSRF token". Callers
   * must retry at most once — this does not loop.
   */
  async refreshCsrfToken(): Promise<string | null> {
    await this.loadSession({ force: true });
    return this.getCsrfToken();
  }

  onAuthStateChange(callback: AuthChangeCallback): () => void {
    this.listeners.add(callback);
    if (this.session) callback({ event: 'SIGNED_IN', session: this.session });
    return () => {
      this.listeners.delete(callback);
    };
  }

  startZitadel(returnTo: string = '/'): void {
    const safeReturnTo =
      returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.startsWith('/\\')
        ? returnTo
        : '/';
    window.location.href = `${API_BASE}/api/auth/zitadel/start?return_to=${encodeURIComponent(
      safeReturnTo
    )}`;
  }

  private async loadSession(options: { force?: boolean } = {}): Promise<LoadOutcome> {
    // Coalesce concurrent loads onto one in-flight fetch. A forced refresh joins
    // an existing load too — any successful load yields the same session token.
    if (this.loadInFlight) return this.loadInFlight;

    // Respect backoff after a transient failure unless a caller explicitly needs
    // a fresh token (the one-shot 403 recovery path).
    if (!options.force && Date.now() < this.loadBackoffUntil) {
      return 'failed';
    }

    this.loadInFlight = this.performSessionLoad();
    try {
      return await this.loadInFlight;
    } finally {
      this.loadInFlight = null;
    }
  }

  private async performSessionLoad(): Promise<LoadOutcome> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/auth/session`, {
        method: 'GET',
        credentials: 'include',
        headers: this.headers(false),
      });
    } catch {
      // Network error / offline — transient, keep any existing session.
      this.registerLoadFailure(null);
      return 'failed';
    }

    // Rate limited or server error: transient. Do NOT clear the session — the
    // participant is still logged in; we just could not confirm it this instant.
    if (response.status === 429 || response.status >= 500) {
      this.registerLoadFailure(response.headers.get('Retry-After'));
      return 'failed';
    }

    // Definitive answer received — reset failure backoff and mark initialized.
    this.loadFailureCount = 0;
    this.loadBackoffUntil = 0;
    this.initialized = true;

    let view: SessionView | null = null;
    try {
      const text = await response.text();
      view = text ? (JSON.parse(text) as SessionView) : null;
    } catch {
      view = null;
    }

    const session = view ? this.sessionFromView(view) : null;
    if (session) {
      this.setSession(session, this.session ? 'TOKEN_REFRESHED' : 'SIGNED_IN');
      return 'authenticated';
    }
    this.clearSession();
    return 'unauthenticated';
  }

  private registerLoadFailure(retryAfter: string | null): void {
    this.loadFailureCount += 1;
    const retryAfterMs = this.parseRetryAfter(retryAfter);
    const backoff =
      retryAfterMs ??
      Math.min(
        BASE_LOAD_BACKOFF_MS * 2 ** (this.loadFailureCount - 1),
        MAX_LOAD_BACKOFF_MS
      );
    this.loadBackoffUntil = Date.now() + backoff;
  }

  private parseRetryAfter(value: string | null): number | null {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_LOAD_BACKOFF_MS);
    }
    const date = Date.parse(value);
    if (!Number.isNaN(date)) {
      const delta = date - Date.now();
      return delta > 0 ? Math.min(delta, MAX_LOAD_BACKOFF_MS) : 0;
    }
    return null;
  }

  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase();
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...this.headers(unsafe),
        ...(init.headers ?? {}),
      },
    });
    return readJson<T>(response);
  }

  private headers(includeCsrf: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (includeCsrf && this.session?.csrfToken) {
      headers['X-CSRF-Token'] = this.session.csrfToken;
    }
    return headers;
  }

  private sessionFromView(view: SessionView): Session | null {
    if (!view.authenticated || !view.user || !view.expires_at || !view.csrf_token) return null;
    return {
      expiresAt: Math.floor(new Date(view.expires_at).getTime() / 1000),
      user: normalizeUser(view.user),
      provider: view.provider ?? 'local',
      mfaVerified: view.mfa_verified,
      roles: view.roles,
      organizations: view.organizations,
      csrfToken: view.csrf_token,
    };
  }

  private setSession(session: Session | null, event: AuthChangeEvent['event'] = 'SIGNED_IN'): void {
    if (!session) {
      this.clearSession();
      return;
    }
    this.session = session;
    this.notify({ event, session });
  }

  private clearSession(): void {
    const hadSession = Boolean(this.session);
    this.session = null;
    if (hadSession) {
      this.notify({ event: 'SIGNED_OUT', session: null });
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
