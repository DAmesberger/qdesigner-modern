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
    this.root = page.getByTestId('designer-root');
    this.emptyAddTextButton = page.getByTestId('designer-empty-add-text-question');
    this.previewButton = page.getByTestId('designer-preview-button');
    this.previewModal = page.getByTestId('designer-preview-modal');
    this.previewQuestionList = page.getByTestId('preview-question-list');
    this.commandButton = page.getByTestId('designer-command-button');
    this.commandSearch = page.getByTestId('command-search');
    this.saveButton = page.getByTestId('designer-save-button');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async addTextQuestionFromEmptyState(): Promise<void> {
    await expect(this.emptyAddTextButton).toBeVisible();
    await this.emptyAddTextButton.click();
    await expect(this.page.getByTestId(/^designer-question-/)).toHaveCount(1);
  }

  async addQuestionUsingCommandPalette(commandId: string): Promise<void> {
    await this.commandButton.click();
    await expect(this.commandSearch).toBeVisible();
    await this.page.getByTestId(`command-${commandId}`).click();
  }

  async openPreview(): Promise<void> {
    await this.previewButton.click();
    await expect(this.previewModal).toBeVisible();
  }

  async closePreview(): Promise<void> {
    await this.page.getByTestId('designer-preview-close').click();
    await expect(this.previewModal).toBeHidden();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.page.getByTestId('designer-save-status')).not.toContainText('Save failed');
  }
}
