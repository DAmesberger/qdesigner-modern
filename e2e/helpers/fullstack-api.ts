import type { APIRequestContext } from '@playwright/test';

const TEST_PASSWORD = 'TestPassword123!';

export interface ProvisionedQuestionnaire {
  email: string;
  password: string;
  organizationId: string;
  projectId: string;
  questionnaireId: string;
  questionnaireCode: string;
}

function buildAutoFilloutDefinition(name: string) {
  const nowIso = new Date().toISOString();

  return {
    id: `fullstack-${Date.now()}`,
    version: '1.0.0',
    name,
    description: 'Fullstack questionnaire for creation + fillout verification',
    created: nowIso,
    modified: nowIso,
    settings: {
      webgl: { targetFPS: 120 },
      allowBackNavigation: false,
      requireConsent: false,
      allowAnonymous: true,
    },
    variables: [],
    pages: [{ id: 'p1', questions: ['q_intro', 'q_done'] }],
    questions: [
      {
        id: 'q_intro',
        type: 'multiple-choice',
        order: 0,
        required: true,
        text: 'Auto step 1',
        responseType: {
          type: 'none',
          delay: 25,
        },
      },
      {
        id: 'q_done',
        type: 'multiple-choice',
        order: 1,
        required: true,
        text: 'Auto step 2',
        responseType: {
          type: 'none',
          delay: 25,
        },
      },
    ],
    flow: [],
  };
}

export function deriveQuestionnaireCode(questionnaireId: string): string {
  return questionnaireId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export async function provisionPublishedQuestionnaire(
  requestContext: APIRequestContext
): Promise<ProvisionedQuestionnaire> {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `fullstack.${runId}@test.local`;
  const organizationName = `E2E Org ${runId}`;
  const orgSlug = `e2e-org-${runId}`.toLowerCase();
  const projectName = `E2E Project ${runId}`;
  const projectCode = `FS${Date.now().toString().slice(-8)}`;
  const questionnaireName = `Fullstack Fillout ${runId}`;
  const definition = buildAutoFilloutDefinition(questionnaireName);

  const requestJson = async (
    method: string,
    path: string,
    body?: unknown,
    token?: string
  ): Promise<any> => {
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
  };

  const auth = await requestJson('POST', '/auth/register', {
    email,
    password: TEST_PASSWORD,
    full_name: 'Playwright Fullstack User',
  });

  const token = auth.access_token as string;

  const organization = await requestJson(
    'POST',
    '/organizations',
    {
      name: organizationName,
      slug: orgSlug,
    },
    token
  );

  const project = await requestJson(
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

  const questionnaire = await requestJson(
    'POST',
    `/projects/${project.id}/questionnaires`,
    {
      name: questionnaireName,
      description: 'Provisioned by Playwright fullstack tests',
      content: definition,
      settings: {},
    },
    token
  );

  await requestJson(
    'POST',
    `/projects/${project.id}/questionnaires/${questionnaire.id}/publish`,
    undefined,
    token
  );

  const questionnaireCode = (questionnaire.id as string).replace(/-/g, '').slice(0, 8).toUpperCase();

  return {
    email,
    password: TEST_PASSWORD,
    organizationId: organization.id,
    projectId: project.id,
    questionnaireId: questionnaire.id,
    questionnaireCode,
  };
}
