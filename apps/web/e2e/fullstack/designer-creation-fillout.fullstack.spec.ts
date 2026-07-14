import { expect, test } from '@playwright/test';
import {
  buildFilloutPath,
  deriveQuestionnaireCode,
  getSessionById,
  installAuthSession,
  listProjectQuestionnaires,
  provisionWorkspace,
} from '../helpers/fullstack-api';
// Canonical DOM-overlay drivers — see the note in creation-fillout.fullstack.spec.ts.
import { clickContinue, continueButton, waitForCard } from '../form/form-api';

/**
 * The only lane that drives the DESIGNER UI end to end: author a questionnaire in the
 * designer, publish it from the designer, then fill it out by code as a participant.
 *
 * That coverage earned its keep — it is what caught the `applyRemoteUpdate` identity wipe
 * (the Y.Doc room, seeded from a create payload serialized before the server minted the id,
 * blanked the store's questionnaire id; every later save then re-POSTed a create, 409'd, and
 * Publish silently bailed — so nothing a designer authored was ever persisted).
 */
test.describe('@fullstack designer creation, publish, and participant fillout', () => {
  test.describe.configure({ timeout: 180000 });

  test('creates questionnaire in designer UI, publishes, and completes fillout by code', async ({
    page,
    request,
  }) => {
    const workspace = await provisionWorkspace(request);
    const questionnaireName = `UI Fullstack ${Date.now()}`;

    await installAuthSession(page, workspace);

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

    await page.getByTestId('designer-empty-state').click();
    await expect(page.getByTestId('designer-module-text-input')).toBeVisible();
    await page.getByTestId('designer-module-text-input').click();

    const internalNameInput = page.getByTestId('designer-question-internal-name').first();
    await expect(internalNameInput).toBeVisible();
    await internalNameInput.fill('ui_fullstack_item');

    const flyoutClose = page.getByTestId('designer-flyout-close');
    if (await flyoutClose.isVisible()) {
      await flyoutClose.click();
    }

    const saveResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'PATCH' &&
        url.pathname.startsWith(`/api/projects/${workspace.projectId}/questionnaires/`) &&
        !url.pathname.endsWith('/publish') &&
        response.status() >= 200 &&
        response.status() < 300
      );
    });

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
    await saveResponse;
    await publishResponse;

    const questionnaires = await listProjectQuestionnaires(
      request,
      workspace.projectId,
      workspace
    );
    const created = questionnaires.find((entry) => entry.name === questionnaireName);

    expect(created).toBeTruthy();
    if (!created) {
      throw new Error(`Questionnaire "${questionnaireName}" was not found after publish`);
    }
    expect(created.status).toBe('published');

    const questionnaireCode = deriveQuestionnaireCode(created.id);

    await page.goto(buildFilloutPath(questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();

    const startButton = page.getByTestId('fillout-start-button');
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

    await expect(page.getByTestId('fillout-runtime-canvas')).toBeVisible({
      timeout: 30000,
    });

    // Answer the text-input item the designer just authored, through its real runtime
    // component. (This previously mashed `a` + `Enter` at an unfocused page 20 times, which
    // types into nothing: the required answer stayed empty, Continue stayed disabled, and
    // completion was unreachable. Fill the field and press the button the participant sees.)
    const card = await waitForCard(page, 'text-input');
    await card.getByRole('textbox').fill('fullstack answer');
    await expect(continueButton(page)).toBeEnabled();
    await clickContinue(page);

    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('fillout-error')).toHaveCount(0);

    await expect
      .poll(
        async () => {
          const session = await getSessionById(request, sessionId, workspace);
          return session.id === sessionId;
        },
        {
          timeout: 30000,
          message: 'Persisted session was not retrievable from the API',
        }
      )
      .toBe(true);

    const persistedSession = await getSessionById(request, sessionId, workspace);
    expect(persistedSession.id).toBe(sessionId);
    expect(['active', 'completed']).toContain(persistedSession.status);
  });
});
