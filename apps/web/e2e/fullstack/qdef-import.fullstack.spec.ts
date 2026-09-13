import { expect, test } from '@playwright/test';
import {
  installAuthSession,
  listProjectQuestionnaires,
  provisionWorkspace,
} from '../helpers/fullstack-api';
import { saveAndReload } from '../helpers/designer-authoring';
import { DesignerPage } from '../page-objects/designer-page';
import { DEV_URLS } from '../helpers/dev-urls';

test.describe('@fullstack portable draft import', () => {
  for (const [type, completeMetadata] of [
    ['text-display', true],
    ['text-instruction', false],
  ] as const) {
    test(`imports ${type} with ${completeMetadata ? 'explicit' : 'omitted'} optional metadata and preserves it through reload`, async ({
      page,
      request,
    }) => {
      test.setTimeout(120000);
      page.setDefaultTimeout(15000);
      const workspace = await provisionWorkspace(request);
      const name = `Imported welcome ${Date.now()}`;
      const definition = {
        $schema: 'https://schemas.qdesigner.dev/questionnaire/1.0.0',
        format: 'qdesigner.questionnaire',
        formatVersion: '1.0.0',
        questionnaire: {
          name,
          ...(completeMetadata ? { description: 'Portable introduction' } : {}),
          version: '2.3.4',
          defaultLocale: 'de',
        },
        assets: {},
        variables: {},
        questions: {
          welcome: {
            type,
            required: false,
            display: { content: 'Welcome to the imported study.' },
          },
        },
        structure: {
          pages: [
            {
              id: 'introduction',
              ...(completeMetadata ? { name: 'Introduction' } : {}),
              blocks: [
                {
                  id: 'copy',
                  ...(completeMetadata ? { name: 'Copy' } : {}),
                  type: 'standard',
                  questionIds: ['welcome'],
                },
              ],
            },
          ],
        },
        flow: [],
        rules: [],
        settings: { allowBackNavigation: false, showProgressBar: true },
        translations: {},
        extensions: {},
      };
      await installAuthSession(page, workspace);
      await page.goto(`/projects/${workspace.projectId}`);
      await page.getByRole('button', { name: 'Import Definition', exact: true }).click();
      const inspected = page.waitForResponse(
        (r) => r.url().endsWith('/questionnaire-definitions/dry-run') && r.ok()
      );
      await page.getByTestId('qdef-file-input').setInputFiles({
        name: 'welcome.qdef.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(definition)),
      });
      const preview = await (await inspected).json();
      await expect(page.getByTestId('qdef-validation-heading')).toHaveText('Definition is valid');
      expect(await listProjectQuestionnaires(request, workspace.projectId, workspace)).toHaveLength(
        0
      );
      await page.getByRole('button', { name: 'Create Draft', exact: true }).click();
      await page.waitForURL(new RegExp(`/projects/${workspace.projectId}/designer/[^/]+$`));
      const designer = new DesignerPage(page);
      await designer.expectLoaded();
      await expect(page.getByTestId('designer-title')).toHaveText(name);
      await expect(designer.questionCards).toHaveCount(1);
      await saveAndReload(designer);
      await expect(page.getByTestId('designer-title')).toHaveText(name);
      await expect(designer.questionCards).toHaveCount(1);
      const drafts = await listProjectQuestionnaires(request, workspace.projectId, workspace);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]).toMatchObject({
        name,
        status: 'draft',
        version_major: 2,
        version_minor: 3,
        version_patch: 4,
        settings: { language: 'de', showProgressBar: true },
      });
      const exported = await request.get(
        `${DEV_URLS.backend}/api/projects/${workspace.projectId}/questionnaires/${drafts[0].id}/definition`,
        { headers: { Cookie: `qd_session=${workspace.sessionCookie}` } }
      );
      expect(exported.status(), await exported.text()).toBe(200);
      const artifact = await exported.json();
      expect(artifact.canonical).toBe(preview.canonical);
      expect(artifact.digest).toBe(preview.digest);
    });
  }
});
