import type { APIRequestContext, Page } from '@playwright/test';
import { DEV_URLS } from './dev-urls';
import {
  createAutoAdvanceQuestion,
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

function buildAutoFilloutDefinition(name: string) {
  const builder = new QuestionnaireBuilder(name, {
    id: `fullstack-${Date.now()}`,
    randomizationSeed: 'seed-fullstack',
  });

  builder
    .addPage(pageWithQuestions('p1', ['q_intro', 'q_done']))
    .addQuestion(createAutoAdvanceQuestion('q_intro', 'Auto step 1'))
    .addQuestion(createAutoAdvanceQuestion('q_done', 'Auto step 2'));

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

  const authResponse = await requestContext.fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    data: {
      email,
      password: TEST_PASSWORD,
      full_name: fullName,
    },
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

export async function provisionPublishedQuestionnaire(
  requestContext: APIRequestContext
): Promise<ProvisionedQuestionnaire> {
  const workspace = await provisionWorkspace(requestContext);
  const questionnaireName = `Fullstack Fillout ${Date.now()}`;
  const definition = buildAutoFilloutDefinition(questionnaireName);

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
