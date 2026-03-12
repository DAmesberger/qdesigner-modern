import { expect, type Locator, type Page } from '@playwright/test';

export class DesignerPage {
  readonly page: Page;
  readonly root: Locator;
  readonly emptyAddTextButton: Locator;
  readonly previewButton: Locator;
  readonly previewModal: Locator;
  readonly previewQuestionList: Locator;
  readonly commandSearch: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('designer-root');
    this.emptyAddTextButton = page.getByTestId('designer-empty-state');
    this.previewButton = page.getByTestId('designer-preview-button');
    this.previewModal = page.getByTestId('designer-preview-modal');
    this.previewQuestionList = page.getByTestId('preview-question-list');
    this.commandSearch = page.getByTestId('command-search');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async addTextQuestionFromEmptyState(): Promise<void> {
    await expect(this.emptyAddTextButton).toBeVisible();
    await this.emptyAddTextButton.click();
    await expect(this.page.getByTestId('designer-module-text-input')).toBeVisible();
    await this.page.getByTestId('designer-module-text-input').click();
    await expect(this.page.getByTestId(/^designer-question-/)).toHaveCount(1);
  }

  async addQuestionUsingCommandPalette(commandId: string): Promise<void> {
    await this.page.keyboard.press('Control+K');
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
    await this.page.keyboard.press('Control+S');
  }
}
