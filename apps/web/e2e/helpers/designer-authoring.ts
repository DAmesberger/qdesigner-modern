import { expect, type Page } from '@playwright/test';
import { installAuthSession, type ProvisionedWorkspace } from './fullstack-api';
import { DesignerPage } from '../page-objects/designer-page';

/** Only account/workspace setup uses APIs; questionnaire writes use the designer. */
export async function createInDesigner(page: Page, workspace: ProvisionedWorkspace, name: string) {
  page.setDefaultTimeout(15000);
  await installAuthSession(page, workspace);
  await page.goto(`/projects/${workspace.projectId}`);
  await page.getByTestId('create-questionnaire-button').click();
  await page.getByTestId('questionnaire-name-input').fill(name);
  await page.getByTestId('questionnaire-create-confirm').click();
  await page.waitForURL(new RegExp(`/projects/${workspace.projectId}/designer/`));
  const designer = new DesignerPage(page);
  await designer.expectLoaded();
  return designer;
}

export async function addModule(
  designer: DesignerPage,
  type: string,
  name: string,
  category: 'display' | 'question' = 'question'
) {
  const page = designer.page;
  await designer.closeFlyoutIfOpen();
  if (!(await page.getByTestId('designer-module-palette').isVisible())) {
    await page.getByTestId('rail-add').click();
  }
  await page.getByTestId(`designer-module-category-${category}`).click();
  await page.getByTestId(`designer-module-${type}`).click();
  if (type === 'reaction-experiment') {
    // Adding this module intentionally opens its dedicated authoring workspace.
    await page.getByRole('button', { name: 'Exit Lab', exact: true }).click();
  }
  await designer.closeFlyoutIfOpen();
  await expect(page.getByLabel('Question Type', { exact: true })).toHaveValue(type);
  const input = page.getByTestId('designer-question-internal-name');
  await input.fill(name);
  await page.getByLabel('Required question', { exact: true }).check();
  return page.getByTestId('designer-question-id').inputValue();
}

export async function saveAndReload(designer: DesignerPage) {
  await designer.closeFlyoutIfOpen();
  await designer.save();
  await expect(designer.page.getByTestId('designer-save-indicator')).toHaveAttribute(
    'data-save-status',
    'saved',
    { timeout: 30000 }
  );
  await designer.page.reload();
  await designer.expectLoaded();
}

export async function publishInDesigner(designer: DesignerPage) {
  await designer.closeFlyoutIfOpen();
  const published = designer.page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/publish') &&
      response.ok()
  );
  await designer.page.getByTestId('designer-publish-button').click();
  await published;
}
