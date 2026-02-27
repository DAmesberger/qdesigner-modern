import { expect, type Locator, type Page } from '@playwright/test';

export class ProjectPage {
  readonly page: Page;
  readonly createQuestionnaireButton: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly createConfirmButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createQuestionnaireButton = page
      .getByTestId('create-questionnaire-button')
      .or(page.getByTestId('create-questionnaire-empty-button'))
      .first();
    this.nameInput = page.getByTestId('questionnaire-name-input');
    this.descriptionInput = page.getByTestId('questionnaire-description-input');
    this.createConfirmButton = page.getByTestId('questionnaire-create-confirm');
  }

  async open(projectId: string): Promise<void> {
    await this.page.goto(`/projects/${projectId}`);
    await expect(this.createQuestionnaireButton).toBeVisible();
  }

  async createQuestionnaire(
    name: string,
    description = '',
    options?: { waitForDesignerNavigation?: boolean }
  ): Promise<void> {
    await this.createQuestionnaireButton.click();
    await expect(this.nameInput).toBeVisible();
    await this.nameInput.fill(name);

    if (description) {
      await this.descriptionInput.fill(description);
    }

    if (options?.waitForDesignerNavigation === false) {
      await this.createConfirmButton.click();
      return;
    }

    await Promise.all([
      this.page.waitForURL(/\/projects\/[^/]+\/designer\//, { timeout: 30000 }),
      this.createConfirmButton.click(),
    ]);
  }
}
