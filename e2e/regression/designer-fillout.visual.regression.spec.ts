import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  deriveQuestionnaireCode,
  type ProvisionedWorkspace,
  provisionWorkspace,
} from '../helpers/fullstack-api';

interface VisualFilloutProvision {
  accessToken: string;
  questionnaireCode: string;
}

async function seedAuthSession(page: Page, workspace: ProvisionedWorkspace): Promise<void> {
  await page.addInitScript(
    (session) => {
      window.localStorage.setItem('qdesigner-auth', JSON.stringify(session));
    },
    {
      accessToken: workspace.accessToken,
      refreshToken: workspace.refreshToken,
      expiresAt: workspace.expiresAt,
      user: {
        id: workspace.userId,
        email: workspace.email,
        full_name: workspace.fullName,
        roles: ['owner'],
      },
    }
  );
}

async function stabilizeForScreenshot(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      * {
        caret-color: transparent !important;
      }
    `,
  });
}

async function provisionVisualFilloutQuestionnaire(
  request: APIRequestContext
): Promise<VisualFilloutProvision> {
  const workspace = await provisionWorkspace(request, {
    emailPrefix: 'visual-fillout',
    organizationName: 'Visual Organization',
    projectName: 'Visual Project',
  });
  const now = new Date().toISOString();

  const definition = {
    id: `visual-fillout-${Date.now()}`,
    version: '1.0.0',
    name: 'Visual Fillout Runtime',
    description: 'Stable visual runtime state',
    created: now,
    modified: now,
    settings: {
      webgl: { targetFPS: 120 },
      allowBackNavigation: false,
      requireConsent: false,
      allowAnonymous: true,
    },
    variables: [],
    pages: [{ id: 'p1', questions: ['q_visual', 'q_done'] }],
    questions: [
      {
        id: 'q_visual',
        type: 'multiple-choice',
        order: 0,
        required: true,
        text: 'Choose yes or no.',
        responseType: {
          type: 'single',
          options: [
            { value: 'yes', label: 'Yes', key: 'y' },
            { value: 'no', label: 'No', key: 'n' },
          ],
        },
      },
      {
        id: 'q_done',
        type: 'multiple-choice',
        order: 1,
        required: true,
        text: 'Done',
        responseType: {
          type: 'none',
          delay: 250,
        },
      },
    ],
    flow: [],
  };

  const createResponse = await request.fetch(`/api/projects/${workspace.projectId}/questionnaires`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workspace.accessToken}`,
    },
    data: {
      name: 'Visual Fillout Runtime',
      description: 'Provisioned for visual regression screenshots',
      content: definition,
      settings: {},
    },
  });

  if (!createResponse.ok()) {
    throw new Error(`Failed to create visual questionnaire: ${createResponse.status()} ${await createResponse.text()}`);
  }

  const created = await createResponse.json();

  const publishResponse = await request.fetch(
    `/api/projects/${workspace.projectId}/questionnaires/${created.id}/publish`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${workspace.accessToken}`,
      },
    }
  );

  if (!publishResponse.ok()) {
    throw new Error(`Failed to publish visual questionnaire: ${publishResponse.status()} ${await publishResponse.text()}`);
  }

  return {
    accessToken: workspace.accessToken,
    questionnaireCode: deriveQuestionnaireCode(created.id),
  };
}

test.describe('@visual designer and fillout screenshots', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('captures project modal and designer authoring states', async ({ page, request }) => {
    const workspace = await provisionWorkspace(request, {
      emailPrefix: 'visual-designer',
      organizationName: 'Visual Organization',
      projectName: 'Visual Project',
    });

    await seedAuthSession(page, workspace);
    await page.goto(`/projects/${workspace.projectId}`);
    await stabilizeForScreenshot(page);

    await page.getByTestId('create-questionnaire-button').click();
    await expect(page.getByTestId('app-modal-content')).toBeVisible();

    await expect(page.getByTestId('app-modal-content')).toHaveScreenshot('project-create-modal.png', {
      animations: 'disabled',
      caret: 'hide',
    });

    await page.getByTestId('questionnaire-name-input').fill('Visual Designer Questionnaire');
    await page.getByTestId('questionnaire-description-input').fill('Visual regression questionnaire');
    await page.getByTestId('questionnaire-create-confirm').click();

    await page
      .waitForURL(new RegExp(`/projects/${workspace.projectId}/designer/`), { timeout: 30000 })
      .catch(() => null);

    if ((await page.getByTestId('designer-root').count()) === 0) {
      await page.goto(
        `/projects/${workspace.projectId}/designer/new?name=Visual%20Designer%20Questionnaire&description=Visual%20regression%20questionnaire`
      );
    }

    await expect(page.getByTestId('designer-root')).toBeVisible({ timeout: 30000 });
    await stabilizeForScreenshot(page);

    await expect(page.getByTestId('designer-main-layout')).toHaveScreenshot('designer-shell-visual.png', {
      animations: 'disabled',
      caret: 'hide',
    });

    await page.getByTestId('designer-view-visual').click();
    await page.getByTestId('designer-empty-add-choice-question').click();
    await page.getByTestId('left-tab-flow').click();
    await page.getByTestId('flow-open-add-modal').click();
    await page.getByTestId('flow-condition-input').fill('q_visual_value == "yes"');

    const flowModal = page.getByTestId('flow-add-modal');
    await expect(flowModal).toHaveScreenshot('designer-flow-modal.png', {
      animations: 'disabled',
      caret: 'hide',
    });

    await page.getByTestId('flow-cancel-button').click();
    await page.getByTestId('left-tab-questions').click();
    await page.getByTestId('designer-module-multiple-choice').click();

    const propertiesPanel = page.getByTestId('right-sidebar-content');
    await expect(propertiesPanel).toHaveScreenshot('designer-properties-panel.png', {
      animations: 'disabled',
      caret: 'hide',
      mask: [page.getByTestId('designer-question-id')],
    });
  });

  test('captures fillout welcome, runtime, and completion states', async ({ page, request }) => {
    const provisioned = await provisionVisualFilloutQuestionnaire(request);

    await page.goto(`/${provisioned.questionnaireCode}`);
    await stabilizeForScreenshot(page);

    await expect(page.getByTestId('fillout-root')).toHaveScreenshot('fillout-welcome-screen.png', {
      animations: 'disabled',
      caret: 'hide',
    });

    await page.getByTestId('fillout-start-button').click();
    await expect(page.getByTestId('fillout-runtime-canvas')).toBeVisible({ timeout: 30000 });

    await expect(page.getByTestId('fillout-root')).toHaveScreenshot('fillout-runtime-screen.png', {
      animations: 'disabled',
      caret: 'hide',
    });

    await page.keyboard.press('y');
    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });

    await expect(page.getByTestId('fillout-completion-screen')).toHaveScreenshot(
      'fillout-completion-screen.png',
      {
        animations: 'disabled',
        caret: 'hide',
        mask: [
          page.getByTestId('fillout-completion-screen').locator('code'),
          page.getByTestId('fillout-completion-screen').locator('.stat-value'),
        ],
      }
    );
  });
});
