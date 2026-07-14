import { expect, test } from '@playwright/test';
import { questionnaireName } from '../fixtures/test-data';
import { installAuthSession, provisionWorkspace } from '../helpers/fullstack-api';
import { ProjectPage } from '../page-objects/project-page';
import { DesignerPage } from '../page-objects/designer-page';

/**
 * @smoke the shortest authoring path that must never break: sign in, open a real project,
 * create a questionnaire, land in the designer, add a question, preview it.
 *
 * It used to drive a hardcoded `test-project-1` with no auth wiring at all — a project id
 * that exists in no database, behind routes that redirect an anonymous visitor to /login. The
 * repo's own audit said as much (docs/decisions/PHASE_7_FINDINGS.md:34). It was testing a
 * fiction, so it never passed. Now it provisions a real workspace over the API and installs
 * the session cookie, exactly like the @fullstack lane.
 *
 * Scope stays deliberately narrow — authoring + preview only. Publish and participant fillout
 * are the @fullstack lane's job; the DOM question types are the @form lane's.
 */
test.describe('@smoke questionnaire creation and preview', () => {
  test('user can create a questionnaire, add a question, and open preview', async ({
    page,
    request,
  }) => {
    const workspace = await provisionWorkspace(request, { emailPrefix: 'smoke' });
    await installAuthSession(page, workspace);

    const name = questionnaireName('Smoke');
    const projectPage = new ProjectPage(page);
    const designerPage = new DesignerPage(page);

    await projectPage.open(workspace.projectId);
    await projectPage.createQuestionnaire(name, 'Created by smoke e2e');

    await designerPage.expectLoaded();
    await expect(page.getByTestId('designer-header')).toContainText(name);

    await designerPage.addTextQuestionFromEmptyState();

    await designerPage.openPreview();
    await expect(designerPage.previewModal).toBeVisible();
    await designerPage.closePreview();
  });
});
