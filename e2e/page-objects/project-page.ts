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
      .locator(
        '[data-testid="create-questionnaire-button"], [data-testid="create-questionnaire-empty-button"]'
      )
      .first();
    this.nameInput = page.locator('[data-testid="questionnaire-name-input"]');
    this.descriptionInput = page.locator('[data-testid="questionnaire-description-input"]');
    this.createConfirmButton = page.locator('[data-testid="questionnaire-create-confirm"]');
  }

  async open(projectId: string): Promise<void> {
    await this.page.goto(`/projects/${projectId}`);
    await expect(this.createQuestionnaireButton).toBeVisible();
  }

  async createQuestionnaire(name: string, description = ''): Promise<void> {
    await this.createQuestionnaireButton.click();
    await expect(this.nameInput).toBeVisible();
    await this.nameInput.fill(name);

    if (description) {
      await this.descriptionInput.fill(description);
    }

    await this.createConfirmButton.click();
  }
}
