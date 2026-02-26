import { expect, test } from '@playwright/test';
import {
  deriveQuestionnaireCode,
  getSessionById,
  listProjectQuestionnaires,
  provisionWorkspace,
} from '../helpers/fullstack-api';

test.describe('@fullstack designer creation, publish, and participant fillout', () => {
  test.describe.configure({ timeout: 180000 });

  test('creates questionnaire in designer UI, publishes, and completes fillout by code', async ({
    page,
    request,
  }) => {
    const workspace = await provisionWorkspace(request);
    const questionnaireName = `UI Fullstack ${Date.now()}`;

    await page.addInitScript((session) => {
      window.localStorage.setItem('qdesigner-auth', JSON.stringify(session));
    }, {
      accessToken: workspace.accessToken,
      refreshToken: workspace.refreshToken,
      expiresAt: workspace.expiresAt,
      user: {
        id: workspace.userId,
        email: workspace.email,
        full_name: workspace.fullName,
        roles: ['owner'],
      },
    });

    await page.goto(`/projects/${workspace.projectId}`);
    await expect(page.getByTestId('create-questionnaire-button')).toBeVisible();

    await page.getByTestId('create-questionnaire-button').click();
    await page.getByTestId('questionnaire-name-input').fill(questionnaireName);
    await page
      .getByTestId('questionnaire-description-input')
      .fill('Created from fullstack UI E2E coverage');
    await page.getByTestId('questionnaire-create-confirm').click();

    await page.waitForURL(new RegExp(`/projects/${workspace.projectId}/designer/`), {
      timeout: 30000,
    });
    await expect(page.getByTestId('designer-root')).toBeVisible();

    const visualModeButton = page.getByTestId('designer-view-visual');
    if (await visualModeButton.isVisible()) {
      await visualModeButton.click();
    }

    const quickAddButton = page.getByTestId('designer-empty-add-text-question');
    let questionAdded = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await quickAddButton.isVisible()) {
        await quickAddButton.click();
      } else {
        await page.getByTestId('left-tab-questions').click();
        const textInputModule = page.getByTestId('designer-module-text-input');
        if (await textInputModule.isVisible()) {
          await textInputModule.click();
          const pageCanvas = page.getByTestId('designer-page-canvas');
          if (await pageCanvas.isVisible()) {
            await textInputModule.dragTo(pageCanvas);
          }
        }
      }

      try {
        await expect(page.getByTestId('designer-counts')).not.toContainText('0 questions', {
          timeout: 5000,
        });
        questionAdded = true;
        break;
      } catch {
        // Retry with the same workflow to absorb occasional UI timing issues.
      }
    }

    if (!questionAdded) {
      throw new Error('Unable to add a question in designer UI');
    }

    const internalNameInput = page.locator('input[placeholder="Optional internal identifier"]').first();
    if (await internalNameInput.isVisible()) {
      await internalNameInput.fill('ui_fullstack_item');
    }

    const saveResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        (response.request().method() === 'PATCH' || response.request().method() === 'POST') &&
        url.pathname.startsWith(`/api/projects/${workspace.projectId}/questionnaires/`) &&
        response.status() >= 200 &&
        response.status() < 300
      );
    });

    await page.getByTestId('designer-save-button').click();
    await saveResponse;
    await expect(page.getByTestId('designer-save-status')).not.toContainText('Save failed');

    const publishResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'POST' &&
        url.pathname.startsWith(`/api/projects/${workspace.projectId}/questionnaires/`) &&
        url.pathname.endsWith('/publish') &&
        response.status() === 200
      );
    });

    await page.getByTestId('designer-publish-button').click();
    await publishResponse;

    const questionnaires = await listProjectQuestionnaires(
      request,
      workspace.projectId,
      workspace.accessToken
    );
    const created = questionnaires.find((entry) => entry.name === questionnaireName);

    expect(created).toBeTruthy();
    if (!created) {
      throw new Error(`Questionnaire "${questionnaireName}" was not found after publish`);
    }
    expect(created.status).toBe('published');

    const questionnaireCode = deriveQuestionnaireCode(created.id);

    await page.goto(`/${questionnaireCode}`);
    await expect(page.locator('[data-testid="fillout-welcome-screen"]')).toBeVisible();

    const startButton = page.getByRole('button', { name: /start questionnaire/i });
    const sessionCreated = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'POST' &&
        url.pathname === '/api/sessions' &&
        response.status() === 201
      );
    });

    await startButton.click();

    const createdSessionResponse = await sessionCreated;
    const createdSession = await createdSessionResponse.json();
    const sessionId = createdSession.id as string;

    expect(sessionId).toBeTruthy();

    await expect(page.locator('[data-testid="fillout-runtime-canvas"]')).toBeVisible({
      timeout: 30000,
    });

    const completionScreen = page.locator('[data-testid="fillout-completion-screen"]');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await completionScreen.isVisible()) {
        break;
      }
      await page.keyboard.press('a');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
    }

    await expect(completionScreen).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator('[data-testid="fillout-error"]')).toHaveCount(0);

    await expect
      .poll(
        async () => {
          const session = await getSessionById(request, sessionId, workspace.accessToken);
          return session.id === sessionId;
        },
        {
          timeout: 30000,
          message: 'Persisted session was not retrievable from the API',
        }
      )
      .toBe(true);

    const persistedSession = await getSessionById(request, sessionId, workspace.accessToken);
    expect(persistedSession.id).toBe(sessionId);
    expect(['active', 'completed']).toContain(persistedSession.status);
  });
});
