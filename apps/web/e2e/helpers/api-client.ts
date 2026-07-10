/**
 * Direct API client for test data setup.
 * Talks directly to the Rust backend, bypassing the frontend.
 */

import { DEV_URLS } from './dev-urls';

const BACKEND_URL = DEV_URLS.backend;

export class TestApiClient {
  private sessionCookie: string | null = null;
  private csrfToken: string | null = null;

  async login(email: string, password: string): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      throw new Error(`Login failed for ${email}: ${res.status}`);
    }

    const data = await res.json();
    const setCookie = res.headers.get('set-cookie') ?? '';
    const match = setCookie.match(/(?:^|,\s*)qd_session=([^;]+)/);
    if (!match?.[1] || !data.csrf_token) {
      throw new Error(`Login did not return a qd_session cookie and csrf_token for ${email}`);
    }
    this.sessionCookie = match[1];
    this.csrfToken = data.csrf_token;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (this.sessionCookie) headers.Cookie = `qd_session=${this.sessionCookie}`;
    if (this.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }
    if (body) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API ${method} ${path} failed: ${res.status} - ${err}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  get<T>(path: string) { return this.request<T>('GET', path); }
  post<T>(path: string, body?: unknown) { return this.request<T>('POST', path, body); }
  patch<T>(path: string, body?: unknown) { return this.request<T>('PATCH', path, body); }
  delete(path: string) { return this.request<void>('DELETE', path); }

  // Convenience methods for common operations
  async createProject(orgId: string, name: string, code: string) {
    return this.post('/api/projects', {
      organization_id: orgId,
      name,
      code: code.toUpperCase(),
    });
  }

  async createQuestionnaire(projectId: string, name: string, content?: Record<string, unknown>) {
    return this.post(`/api/projects/${projectId}/questionnaires`, {
      name,
      content: content || {},
    });
  }

  async getUser() {
    return this.get('/api/auth/me');
  }

  async getOrganizations() {
    return this.get('/api/organizations');
  }
}

export function createTestClient() {
  return new TestApiClient();
}
