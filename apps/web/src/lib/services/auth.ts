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

class AuthService {
  private session: Session | null = null;
  private listeners: Set<AuthChangeCallback> = new Set();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.loadSession();
        this.initialized = true;
      })();
    }
    return this.initPromise;
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

  private async loadSession(): Promise<boolean> {
    try {
      const view = await this.request<SessionView>('/api/auth/session', { method: 'GET' });
      const session = this.sessionFromView(view);
      if (session) {
        this.setSession(session, this.session ? 'TOKEN_REFRESHED' : 'SIGNED_IN');
        return true;
      }
      this.clearSession();
      return false;
    } catch {
      this.clearSession();
      return false;
    }
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
