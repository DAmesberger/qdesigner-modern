import type { APIRequestContext, Page } from '@playwright/test';
import { DEV_URLS } from './dev-urls';
import {
  createSingleChoiceQuestion,
  pageWithQuestions,
  QuestionnaireBuilder,
} from './questionnaire-builder';

const TEST_PASSWORD = 'TestPassword123!';

export interface ProvisionedWorkspace {
  email: string;
  password: string;
  userId: string;
  fullName: string;
  sessionCookie: string;
  csrfToken: string;
  expiresAt: number;
  organizationId: string;
  projectId: string;
}

export interface ProvisionedQuestionnaire {
  email: string;
  password: string;
  userId: string;
  fullName: string;
  sessionCookie: string;
  csrfToken: string;
  expiresAt: number;
  organizationId: string;
  projectId: string;
  questionnaireId: string;
  questionnaireCode: string;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface SessionCredential {
  sessionCookie: string;
  csrfToken: string;
}

function isUnsafe(method: HttpMethod): boolean {
  return method !== 'GET';
}

function extractCookieValue(setCookie: string | undefined, name: string): string {
  const match = setCookie?.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
  if (!match?.[1]) {
    throw new Error(`Missing ${name} cookie in auth response`);
  }
  return match[1];
}

async function requestJson(
  requestContext: APIRequestContext,
  method: HttpMethod,
  path: string,
  body?: unknown,
  session?: SessionCredential
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party API response
): Promise<any> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (session) {
    headers.Cookie = `qd_session=${session.sessionCookie}`;
    if (isUnsafe(method)) {
      headers['X-CSRF-Token'] = session.csrfToken;
    }
  }

  const response = await requestContext.fetch(`/api${path}`, {
    method,
    headers,
    data: body,
  });

  if (!response.ok()) {
    const errorBody = await response.text();
    throw new Error(`API ${method} /api${path} failed (${response.status()}): ${errorBody}`);
  }

  if (response.status() === 204) {
    return null;
  }

  return response.json();
}

export async function installAuthSession(page: Page, session: SessionCredential): Promise<void> {
  await page.context().addCookies([
    {
      name: 'qd_session',
      value: session.sessionCookie,
      url: DEV_URLS.backend,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * The two questions the @fullstack golden path answers. Exported so the spec asserts the
 * persisted server-side value against the same source of truth it clicked.
 */
export const FILLOUT_ITEMS = [
  { id: 'q_intro', text: 'Pick a fruit', chose: 'Banana', value: 'banana' },
  { id: 'q_done', text: 'Pick a colour', chose: 'Green', value: 'green' },
] as const;

function buildFilloutDefinition(name: string) {
  const builder = new QuestionnaireBuilder(name, {
    id: `fullstack-${Date.now()}`,
    randomizationSeed: 'seed-fullstack',
  });

  builder.addPage(pageWithQuestions('p1', FILLOUT_ITEMS.map((item) => item.id)));
  for (const item of FILLOUT_ITEMS) {
    builder.addQuestion(
      createSingleChoiceQuestion({
        id: item.id,
        text: item.text,
        options: [
          { key: 'a', label: item.chose, value: item.value },
          { key: 'b', label: 'Something else', value: 'other' },
        ],
      })
    );
  }

  const definition = builder.build();

  return {
    ...definition,
    description: 'Fullstack questionnaire for creation + fillout verification',
    settings: {
      ...definition.settings,
      requireConsent: false,
      allowAnonymous: true,
    },
  };
}

export function deriveQuestionnaireCode(questionnaireId: string): string {
  return questionnaireId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function buildFilloutPath(questionnaireCode: string): string {
  return `/q/${questionnaireCode.toUpperCase()}`;
}

/** The auth limiter's window (10 requests / 60 s per IP), plus a second of slack. */
const AUTH_RATE_WINDOW_MS = 61000;

/**
 * Register, waiting out the auth rate limiter on a 429 rather than failing the lane.
 *
 * `/api/auth/register` is anonymous, so its rate-limit bucket is keyed by client IP
 * (`rate_limit_key` falls back to the IP when no user is authenticated) — one shared 10/60 s
 * budget for every worker, every lane, and every developer re-run from the same machine. A
 * lane that happens to start inside a window an earlier lane already spent would die at
 * provisioning with a 429 that says nothing about the code under test.
 *
 * This is a test-harness accommodation, NOT a relaxation of the limiter: the limit is a real
 * defence against credential-stuffing and is left exactly as it is (it is not even
 * env-tunable — see `AppState::rate_limiter`). We simply wait for the window to roll over.
 */
async function registerWithRateRetry(
  requestContext: APIRequestContext,
  data: { email: string; password: string; full_name: string }
) {
  const post = () =>
    requestContext.fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      data,
    });

  const first = await post();
  if (first.status() !== 429) return first;

  await new Promise((resolve) => setTimeout(resolve, AUTH_RATE_WINDOW_MS));
  return post();
}

export async function provisionWorkspace(
  requestContext: APIRequestContext,
  options?: {
    emailPrefix?: string;
    organizationName?: string;
    organizationSlug?: string;
    projectName?: string;
    projectCode?: string;
  }
): Promise<ProvisionedWorkspace> {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emailPrefix = options?.emailPrefix || 'fullstack';
  const email = `${emailPrefix}.${runId}@test.local`;
  const organizationName = options?.organizationName || `E2E Org ${runId}`;
  const orgSlug = (options?.organizationSlug || `e2e-org-${runId}`).toLowerCase();
  const projectName = options?.projectName || `E2E Project ${runId}`;
  const projectCode = options?.projectCode || `FS${Date.now().toString().slice(-8)}`;
  const fullName = 'Playwright Fullstack User';

  const authResponse = await registerWithRateRetry(requestContext, {
    email,
    password: TEST_PASSWORD,
    full_name: fullName,
  });

  if (!authResponse.ok()) {
    throw new Error(`API POST /api/auth/register failed (${authResponse.status()}): ${await authResponse.text()}`);
  }

  const auth = await authResponse.json();
  const session = {
    sessionCookie: extractCookieValue(authResponse.headers()['set-cookie'], 'qd_session'),
    csrfToken: String(auth.csrf_token || ''),
  };
  if (!session.csrfToken) {
    throw new Error('Missing csrf_token in auth response');
  }
  const userId = String(auth.user?.id || '');
  const expiresAt = Math.floor(new Date(String(auth.expires_at)).getTime() / 1000);

  const organization = await requestJson(
    requestContext,
    'POST',
    '/organizations',
    {
      name: organizationName,
      slug: orgSlug,
    },
    session
  );

  const project = await requestJson(
    requestContext,
    'POST',
    '/projects',
    {
      organization_id: organization.id,
      name: projectName,
      code: projectCode,
      is_public: true,
    },
    session
  );

  return {
    email,
    password: TEST_PASSWORD,
    userId,
    fullName,
    sessionCookie: session.sessionCookie,
    csrfToken: session.csrfToken,
    expiresAt,
    organizationId: organization.id,
    projectId: project.id,
  };
}

export async function listProjectQuestionnaires(
  requestContext: APIRequestContext,
  projectId: string,
  session: SessionCredential
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party API response
): Promise<any[]> {
  return requestJson(requestContext, 'GET', `/projects/${projectId}/questionnaires`, undefined, session);
}

export async function getSessionById(
  requestContext: APIRequestContext,
  sessionId: string,
  session: SessionCredential
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party API response
): Promise<any> {
  return requestJson(requestContext, 'GET', `/sessions/${sessionId}`, undefined, session);
}

export interface PersistedResponse {
  question_id: string;
  value: unknown;
}

/**
 * Poll `GET /api/sessions/{id}/responses` until at least `expected` rows have synced.
 * The runtime writes answers IndexedDB-first and syncs them (ADR 0023 D2), so a
 * completion screen does not imply the rows have landed server-side yet.
 */
export async function pollSessionResponses(
  requestContext: APIRequestContext,
  sessionId: string,
  session: SessionCredential,
  expected: number,
  timeoutMs = 30000
): Promise<PersistedResponse[]> {
  const deadline = Date.now() + timeoutMs;
  let rows: PersistedResponse[] = [];
  while (Date.now() < deadline) {
    rows = await requestJson(
      requestContext,
      'GET',
      `/sessions/${sessionId}/responses`,
      undefined,
      session
    );
    if (rows.length >= expected) return rows;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return rows;
}

export async function provisionPublishedQuestionnaire(
  requestContext: APIRequestContext
): Promise<ProvisionedQuestionnaire> {
  const workspace = await provisionWorkspace(requestContext);
  const questionnaireName = `Fullstack Fillout ${Date.now()}`;
  const definition = buildFilloutDefinition(questionnaireName);

  const questionnaire = await requestJson(
    requestContext,
    'POST',
    `/projects/${workspace.projectId}/questionnaires`,
    {
      name: questionnaireName,
      description: 'Provisioned by Playwright fullstack tests',
      content: definition,
      settings: {},
    },
    workspace
  );

  await requestJson(
    requestContext,
    'POST',
    `/projects/${workspace.projectId}/questionnaires/${questionnaire.id}/publish`,
    undefined,
    workspace
  );

  return {
    email: workspace.email,
    password: workspace.password,
    userId: workspace.userId,
    fullName: workspace.fullName,
    sessionCookie: workspace.sessionCookie,
    csrfToken: workspace.csrfToken,
    expiresAt: workspace.expiresAt,
    organizationId: workspace.organizationId,
    projectId: workspace.projectId,
    questionnaireId: questionnaire.id,
    questionnaireCode: deriveQuestionnaireCode(questionnaire.id),
  };
}
