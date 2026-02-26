import { expect, test } from '@playwright/test';
import { DesignerPage } from '../page-objects/designer-page';

test.describe('@regression designer shell interactions', () => {
  test('supports command palette, view switching, and responsive drawers', async ({ page }) => {
    const projectId = 'test-project-1';
    const designerPage = new DesignerPage(page);

    await page.goto(`/projects/${projectId}/designer/new?name=Regression+Shell&description=ui`);
    await designerPage.expectLoaded();

    await page.locator('[data-testid="designer-command-button"]').click();
    await expect(page.locator('[data-testid="designer-command-palette"]')).toBeVisible();
    await expect(page.locator('[data-testid="command-switch-structure"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="designer-command-palette"]')).toBeHidden();

    await page.locator('[data-testid="designer-view-structure"]').click();
    await expect(page.locator('[data-testid="designer-canvas"]')).toBeVisible();
    await page.locator('[data-testid="designer-view-visual"]').click();

    await page.locator('[data-testid="designer-empty-add-text-question"]').click();
    await expect(page.locator('[data-testid="designer-counts"]')).not.toContainText('0 questions');
    await page.keyboard.press('Control+Shift+A');
    await expect(page.locator('[data-testid="designer-counts"]')).toContainText('2 question');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-testid="designer-toggle-left-drawer"]').click();
    await expect(page.locator('[data-testid="designer-left-sidebar"]')).toBeVisible();
    await page.getByRole('button', { name: 'Close left panel' }).first().click();

    await page.locator('[data-testid="designer-toggle-right-drawer"]').click();
    await expect(page.locator('[data-testid="designer-right-sidebar"]')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('[data-testid="designer-main-layout"]')).toBeVisible();
  });
});
