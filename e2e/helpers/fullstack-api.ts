import type { APIRequestContext } from '@playwright/test';
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
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  organizationId: string;
  projectId: string;
}

export interface ProvisionedQuestionnaire {
  email: string;
  password: string;
  userId: string;
  fullName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  organizationId: string;
  projectId: string;
  questionnaireId: string;
  questionnaireCode: string;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function requestJson(
  requestContext: APIRequestContext,
  method: HttpMethod,
  path: string,
  body?: unknown,
  token?: string
): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
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

  const auth = await requestJson(
    requestContext,
    'POST',
    '/auth/register',
    {
      email,
      password: TEST_PASSWORD,
      full_name: fullName,
    }
  );

  const token = auth.access_token as string;
  const refreshToken = auth.refresh_token as string;
  const expiresIn = Number(auth.expires_in || 3600);
  const userId = String(auth.user?.id || '');

  const organization = await requestJson(
    requestContext,
    'POST',
    '/organizations',
    {
      name: organizationName,
      slug: orgSlug,
    },
    token
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
    token
  );

  return {
    email,
    password: TEST_PASSWORD,
    userId,
    fullName,
    accessToken: token,
    refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    organizationId: organization.id,
    projectId: project.id,
  };
}

export async function listProjectQuestionnaires(
  requestContext: APIRequestContext,
  projectId: string,
  accessToken: string
): Promise<any[]> {
  return requestJson(requestContext, 'GET', `/projects/${projectId}/questionnaires`, undefined, accessToken);
}

export async function getSessionById(
  requestContext: APIRequestContext,
  sessionId: string,
  accessToken: string
): Promise<any> {
  return requestJson(requestContext, 'GET', `/sessions/${sessionId}`, undefined, accessToken);
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
    workspace.accessToken
  );

  await requestJson(
    requestContext,
    'POST',
    `/projects/${workspace.projectId}/questionnaires/${questionnaire.id}/publish`,
    undefined,
    workspace.accessToken
  );

  return {
    email: workspace.email,
    password: workspace.password,
    userId: workspace.userId,
    fullName: workspace.fullName,
    accessToken: workspace.accessToken,
    refreshToken: workspace.refreshToken,
    expiresAt: workspace.expiresAt,
    organizationId: workspace.organizationId,
    projectId: workspace.projectId,
    questionnaireId: questionnaire.id,
    questionnaireCode: deriveQuestionnaireCode(questionnaire.id),
  };
}
