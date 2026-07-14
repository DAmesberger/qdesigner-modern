import { expect, type Locator, type Page } from '@playwright/test';

export class DesignerPage {
  readonly page: Page;
  readonly root: Locator;
  readonly emptyAddTextButton: Locator;
  readonly previewButton: Locator;
  readonly previewModal: Locator;
  readonly previewQuestionList: Locator;
  readonly commandSearch: Locator;
  readonly questionCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('designer-root');
    this.emptyAddTextButton = page.getByTestId('designer-empty-state');
    this.previewButton = page.getByTestId('designer-preview-button');
    this.previewModal = page.getByTestId('designer-preview-modal');
    this.previewQuestionList = page.getByTestId('preview-question-list');
    this.commandSearch = page.getByTestId('command-search');
    // The question CARDS on the canvas: direct children of the list, each
    // `designer-question-{id}`. Scoping to direct children matters — a bare
    // /^designer-question-/ testid regex also matches the card's own delete/move-up/
    // move-down buttons AND the properties panel's `designer-question-id` /
    // `-internal-name` fields, so one added question resolved to seven elements.
    this.questionCards = page
      .getByTestId('designer-question-list')
      .locator('> [data-testid^="designer-question-"]');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async addTextQuestionFromEmptyState(): Promise<void> {
    await expect(this.emptyAddTextButton).toBeVisible();
    await this.emptyAddTextButton.click();
    await expect(this.page.getByTestId('designer-module-text-input')).toBeVisible();
    await this.page.getByTestId('designer-module-text-input').click();
    await expect(this.questionCards).toHaveCount(1);
  }

  async addQuestionUsingCommandPalette(commandId: string): Promise<void> {
    await this.page.keyboard.press('Control+K');
    await expect(this.commandSearch).toBeVisible();
    await this.page.getByTestId(`command-${commandId}`).click();
  }

  /**
   * Dismiss the question-properties flyout if it is open. Selecting a question opens it with
   * a full-screen `fixed inset-0` backdrop that swallows clicks aimed at the header, so any
   * header action taken right after adding/selecting a question must close it first — exactly
   * as a user would.
   */
  async closeFlyoutIfOpen(): Promise<void> {
    const close = this.page.getByTestId('designer-flyout-close');
    if (await close.isVisible()) {
      await close.click();
      await expect(close).toBeHidden();
    }
  }

  async openPreview(): Promise<void> {
    await this.closeFlyoutIfOpen();
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
