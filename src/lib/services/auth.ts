import type { User, Session, AuthResult, AuthChangeEvent } from '$lib/types/auth';

const STORAGE_KEY = 'qdesigner-auth';
const API_BASE = import.meta.env.VITE_API_URL || '';

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
interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

type AuthChangeCallback = (event: AuthChangeEvent) => void;

class AuthService {
  private session: Session | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<AuthChangeCallback> = new Set();
  private initialized = false;

  /** Initialize from stored tokens. Call once on app mount. */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const stored = this.getStoredSession();
    if (stored) {
      // Check if access token is still valid
      if (stored.expiresAt > Date.now() / 1000) {
        this.session = stored;
        this.scheduleRefresh();
      } else if (stored.refreshToken) {
        // Try to refresh
        await this.refreshSession(stored.refreshToken);
      }
    }
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errorPayload: unknown = await res.json().catch(() => null);
        return {
          session: null,
          user: null,
          error: parseApiErrorMessage(errorPayload, `Login failed (${res.status})`),
        };
      }

      const data: AuthResponse = await res.json();
      const session = this.createSession(data);
      this.setSession(session);
      return { session, user: data.user, error: null };
    } catch (err) {
      return {
        session: null,
        user: null,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  async signUp(email: string, password: string, fullName: string): Promise<AuthResult> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName }),
      });

      if (!res.ok) {
        const errorPayload: unknown = await res.json().catch(() => null);
        return {
          session: null,
          user: null,
          error: parseApiErrorMessage(errorPayload, `Registration failed (${res.status})`),
        };
      }

      const data: AuthResponse = await res.json();
      const session = this.createSession(data);
      this.setSession(session);
      return { session, user: data.user, error: null };
    } catch (err) {
      return {
        session: null,
        user: null,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  async ensureDevQuickLoginPersonas(): Promise<void> {
    if (!import.meta.env.DEV) return;

    try {
      await fetch(`${API_BASE}/api/dev/bootstrap-personas`, {
        method: 'POST',
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
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // Ignore errors on sign out
      }
    }
  }

  async getSession(): Promise<Session | null> {
    if (!this.initialized) await this.init();

    // If session expired but we have refresh token, try refresh
    if (this.session && this.session.expiresAt <= Date.now() / 1000 && this.session.refreshToken) {
      await this.refreshSession(this.session.refreshToken);
    }

    return this.session;
  }

  async getUser(): Promise<User | null> {
    const session = await this.getSession();
    if (!session) return null;

    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.clearSession();
          return null;
        }
        return session.user; // Return cached user
      }

      const user: User = await res.json();
      // Update cached user
      this.session = { ...session, user };
      this.storeSession(this.session);
      return user;
    } catch {
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

  private async refreshSession(refreshToken: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        this.clearSession();
        return false;
      }

      const data: AuthResponse = await res.json();
      const session = this.createSession(data);
      this.setSession(session, 'TOKEN_REFRESHED');
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  private createSession(data: AuthResponse): Session {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      user: data.user,
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
        if (this.session?.refreshToken) {
          this.refreshSession(this.session.refreshToken);
        }
      }, msUntilExpiry);
    }
  }

  private storeSession(session: Session): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
          user: session.user,
        })
      );
    }
  }

  private getStoredSession(): Session | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      return JSON.parse(stored) as Session;
    } catch {
      return null;
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
