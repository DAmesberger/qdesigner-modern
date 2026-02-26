import { expect, type Locator, type Page } from '@playwright/test';

export class DesignerPage {
  readonly page: Page;
  readonly root: Locator;
  readonly emptyAddTextButton: Locator;
  readonly previewButton: Locator;
  readonly previewModal: Locator;
  readonly previewQuestionList: Locator;
  readonly commandButton: Locator;
  readonly commandSearch: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.locator('[data-testid="designer-root"]');
    this.emptyAddTextButton = page.locator('[data-testid="designer-empty-add-text-question"]');
    this.previewButton = page.locator('[data-testid="designer-preview-button"]');
    this.previewModal = page.locator('[data-testid="designer-preview-modal"]');
    this.previewQuestionList = page.locator('[data-testid="preview-question-list"]');
    this.commandButton = page.locator('[data-testid="designer-command-button"]');
    this.commandSearch = page.locator('[data-testid="command-search"]');
    this.saveButton = page.locator('[data-testid="designer-save-button"]');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async addTextQuestionFromEmptyState(): Promise<void> {
    await expect(this.emptyAddTextButton).toBeVisible();
    await this.emptyAddTextButton.click();
    await expect(this.page.locator('[data-testid^="designer-question-"]')).toHaveCount(1);
  }

  async addQuestionUsingCommandPalette(commandId: string): Promise<void> {
    await this.commandButton.click();
    await expect(this.commandSearch).toBeVisible();
    await this.page.locator(`[data-testid="command-${commandId}"]`).click();
  }

  async openPreview(): Promise<void> {
    await this.previewButton.click();
    await expect(this.previewModal).toBeVisible();
  }

  async closePreview(): Promise<void> {
    await this.page.locator('[data-testid="designer-preview-close"]').click();
    await expect(this.previewModal).toBeHidden();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.page.locator('[data-testid="designer-save-status"]')).not.toContainText(
      'Save failed'
    );
  }
}
