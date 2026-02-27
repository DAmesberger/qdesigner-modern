import { expect, test } from '@playwright/test';
import { questionnaireName } from '../fixtures/test-data';
import { ProjectPage } from '../page-objects/project-page';
import { DesignerPage } from '../page-objects/designer-page';

test.describe('@smoke questionnaire creation and preview fillout', () => {
  test('user can create a questionnaire and open preview', async ({ page }) => {
    const projectId = 'test-project-1';
    const name = questionnaireName('Smoke');
    const projectPage = new ProjectPage(page);
    const designerPage = new DesignerPage(page);

    await projectPage.open(projectId);
    await projectPage.createQuestionnaire(name, 'Created by smoke e2e');

    await designerPage.expectLoaded();
    await expect(page.getByTestId('designer-header')).toContainText(name);

    await designerPage.openPreview();
    await expect(designerPage.previewModal).toBeVisible();
    await designerPage.closePreview();
  });

  test('runtime fillout harness starts successfully', async ({ page }) => {
    await page.goto('/test-runtime');

    const startButton = page.getByTestId('test-runtime-start-button');
    await expect(startButton).toBeVisible();
    await startButton.click();

    await expect(startButton).toBeHidden({ timeout: 30000 });
    await expect(page.getByTestId('test-runtime-canvas')).toBeVisible();
  });
});
