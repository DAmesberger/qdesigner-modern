import { expect, test } from '@playwright/test';
import { DesignerPage } from '../page-objects/designer-page';

test.describe('@regression designer shell interactions', () => {
  test('supports command palette, view switching, and responsive drawers', async ({ page }) => {
    const projectId = 'test-project-1';
    const designerPage = new DesignerPage(page);

    await page.goto(`/projects/${projectId}/designer/new?name=Regression+Shell&description=ui`);
    await designerPage.expectLoaded();

    await page.getByTestId('designer-command-button').click();
    await expect(page.getByTestId('designer-command-palette')).toBeVisible();
    await expect(page.getByTestId('command-switch-structure')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('designer-command-palette')).toBeHidden();

    await page.getByTestId('designer-view-structure').click();
    await expect(page.getByTestId('designer-canvas')).toBeVisible();
    await page.getByTestId('designer-view-visual').click();

    await page.getByTestId('designer-empty-add-text-question').click();
    await expect(page.getByTestId('designer-counts')).not.toContainText('0 questions');
    await page.keyboard.press('Control+Shift+A');
    await expect(page.getByTestId('designer-counts')).toContainText('2 question');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('designer-toggle-left-drawer').click();
    await expect(page.getByTestId('designer-left-sidebar')).toBeVisible();
    await page.getByTestId('designer-left-sidebar-close').click();

    await page.getByTestId('designer-toggle-right-drawer').click();
    await expect(page.getByTestId('designer-right-sidebar')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByTestId('designer-main-layout')).toBeVisible();
  });
});
