import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { installAuthSession, provisionWorkspace } from '../helpers/fullstack-api';
import { saveAndReload } from '../helpers/designer-authoring';
import { DesignerPage } from '../page-objects/designer-page';

async function prepareDraft(page: Page, request: APIRequestContext) {
  page.setDefaultTimeout(15000);
  const workspace = await provisionWorkspace(request);
  const name = `Before replacement ${Date.now()}`;
  const definition = {
    $schema: 'https://schemas.qdesigner.dev/questionnaire/1.0.0',
    format: 'qdesigner.questionnaire',
    formatVersion: '1.0.0',
    questionnaire: { name, version: '1.0.0' },
    assets: {},
    variables: {},
    questions: {
      welcome: { type: 'text-instruction', display: { content: 'Before replacement' } },
    },
    structure: {
      pages: [
        { id: 'page', blocks: [{ id: 'block', type: 'standard', questionIds: ['welcome'] }] },
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
  await page.getByTestId('qdef-file-input').setInputFiles({
    name: 'before.qdef.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(definition)),
  });
  await expect(page.getByTestId('qdef-validation-heading')).toHaveText('Definition is valid');
  await page.getByRole('button', { name: 'Create Draft', exact: true }).click();
  await page.waitForURL(new RegExp(`/projects/${workspace.projectId}/designer/[^/]+$`));
  const designer = new DesignerPage(page);
  await designer.expectLoaded();
  await saveAndReload(designer);
  const questionnaireId = new URL(page.url()).pathname.split('/').at(-1)!;
  const endpoint = `/api/projects/${workspace.projectId}/questionnaires/${questionnaireId}`;
  const headers = {
    Cookie: `qd_session=${workspace.sessionCookie}`,
    'X-CSRF-Token': workspace.csrfToken,
    'X-Requested-With': 'XMLHttpRequest',
  };
  return { workspace, designer, definition, questionnaireId, endpoint, headers };
}

test('@fullstack replacing a draft refreshes both collaborators and cannot restore the old document', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  const { workspace, designer, questionnaireId, endpoint, headers } = await prepareDraft(
    page,
    request
  );
  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const other = await otherContext.newPage();
    await installAuthSession(other, workspace);
    await other.goto(page.url());
    const otherDesigner = new DesignerPage(other);
    await otherDesigner.expectLoaded();
    await otherDesigner.save();
    await expect(other.getByTestId('designer-save-indicator')).toHaveAttribute(
      'data-save-status',
      'saved',
      { timeout: 30000 }
    );
    const exported = await request.get(`${endpoint}/definition`, { headers });
    expect(exported.status(), await exported.text()).toBe(200);
    const before = await exported.json();
    const replacement = JSON.parse(before.canonical);
    replacement.questionnaire.name = `After replacement ${Date.now()}`;
    replacement.questions[Object.keys(replacement.questions)[0]!].display.content =
      'Replacement content';
    const session = await request.get('/api/auth/session', { headers });
    headers['X-CSRF-Token'] = (await session.json()).csrf_token;
    const applied = await request.post(
      `/api/projects/${workspace.projectId}/questionnaire-definitions/apply`,
      {
        headers,
        data: {
          definition: JSON.stringify(replacement),
          questionnaireId,
          expectedRevision: before.revision,
          commit: true,
          idempotencyKey: `replace-${questionnaireId}`,
        },
      }
    );
    expect(applied.status(), await applied.text()).toBe(200);
    const result = await applied.json();
    for (const collaborator of [page, other]) {
      await expect(collaborator.getByTestId('designer-replacement-conflict')).toBeVisible({
        timeout: 10000,
      });
      await expect(collaborator.getByTestId('designer-root')).toHaveCount(0);
    }
    // Closing old clients must not flush their old Yjs binary over replacement.
    await otherContext.close();
    await page.getByRole('button', { name: 'Reload Current Draft', exact: true }).click();
    await designer.expectLoaded();
    await expect(page.getByTestId('designer-title')).toHaveText(replacement.questionnaire.name);
    await expect(designer.questionCards).toHaveCount(1);
    await saveAndReload(designer);
    const after = await request.get(`${endpoint}/definition`, { headers });
    expect(after.status(), await after.text()).toBe(200);
    expect((await after.json()).digest).toBe(result.digest);
  } finally {
    await otherContext.close();
  }
});

for (const concurrentEdit of [false, true]) {
  test(`@fullstack replacement dialog ${concurrentEdit ? 'preserves concurrent work and explains revision reconciliation' : 'replaces the previewed draft and reloads its new generation'}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);
    const { workspace, designer, definition, questionnaireId, endpoint, headers } =
      await prepareDraft(page, request);
    definition.questionnaire.name = `Replacement from dialog ${Date.now()}`;
    definition.questions.welcome.display.content = 'Replacement from dialog';
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page
      .getByRole('menuitem', { name: 'Replace draft from definition', exact: true })
      .click();
    const previewResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith('/questionnaire-definitions/apply') &&
        r.request().postDataJSON().commit === false
    );
    await page.getByTestId('qdef-file-input').setInputFiles({
      name: 'replacement.qdef.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(definition)),
    });
    const preview = await (await previewResponse).json();
    await expect(page.getByTestId('qdef-validation-heading')).toHaveText('Definition is valid');
    await expect(page.getByTestId('qdef-semantic-diff')).toContainText('Replacement from dialog');
    if (concurrentEdit) {
      const session = await request.get('/api/auth/session', { headers });
      headers['X-CSRF-Token'] = (await session.json()).csrf_token;
      const changed = await request.patch(endpoint, {
        headers,
        data: { name: 'Concurrent draft edit', expected_collaboration_epoch: 0 },
      });
      expect(changed.status(), await changed.text()).toBe(200);
    }
    const commitResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith('/questionnaire-definitions/apply') &&
        r.request().postDataJSON().commit === true &&
        r.status() !== 403
    );
    await page.getByRole('button', { name: 'Replace Draft', exact: true }).click();
    const committed = await commitResponse;
    if (concurrentEdit) {
      expect(committed.status()).toBe(409);
      await expect(page.getByTestId('qdef-validation-heading')).toHaveText(
        'Definition needs attention'
      );
      await expect(page.getByTestId('qdef-diagnostics')).toContainText('REVISION_CONFLICT');
      await expect(page.getByTestId('qdef-revision-conflict-guidance')).toContainText(
        `The current server revision is ${preview.revision + 1}.`
      );
      await expect(
        page.getByRole('button', { name: 'Reload Current Draft', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Replace Draft', exact: true })).toHaveCount(0);
      const unchanged = await request.get(endpoint, { headers });
      expect((await unchanged.json()).name).toBe('Concurrent draft edit');
    } else {
      expect(committed.status()).toBe(200);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await designer.expectLoaded();
      await expect(page.getByTestId('designer-title')).toHaveText(definition.questionnaire.name);
      expect(new URL(page.url()).pathname).toBe(
        `/projects/${workspace.projectId}/designer/${questionnaireId}`
      );
      await saveAndReload(designer);
      const exported = await request.get(`${endpoint}/definition`, { headers });
      expect((await exported.json()).digest).toBe(preview.digest);
    }
  });
}

test('@fullstack reconnecting an offline collaborator cannot merge its old edits into a replacement', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const { workspace, designer, definition, questionnaireId, endpoint, headers } =
    await prepareDraft(page, request);
  const exported = await request.get(`${endpoint}/definition`, { headers });
  const before = await exported.json();
  await page.context().setOffline(true);
  await page.getByTestId('designer-title').click();
  await page.getByTestId('designer-title-input').fill('Unsynchronized old document');
  await page.getByTestId('designer-title-input').press('Enter');
  await expect(page.getByTestId('designer-title')).toHaveText('Unsynchronized old document');
  definition.questionnaire.name = 'Replacement while collaborator was offline';
  definition.questions.welcome.display.content = 'Only the replacement belongs here';
  const session = await request.get('/api/auth/session', { headers });
  headers['X-CSRF-Token'] = (await session.json()).csrf_token;
  const response = await request.post(
    `/api/projects/${workspace.projectId}/questionnaire-definitions/apply`,
    {
      headers,
      data: {
        definition: JSON.stringify(definition),
        questionnaireId,
        expectedRevision: before.revision,
        commit: true,
        idempotencyKey: `offline-${questionnaireId}`,
      },
    }
  );
  expect(response.status(), await response.text()).toBe(200);
  const committed = await response.json();
  await page.context().setOffline(false);
  await expect(page.getByTestId('designer-replacement-conflict')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('designer-root')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reload Current Draft', exact: true }).click();
  await designer.expectLoaded();
  await expect(page.getByTestId('designer-title')).toHaveText(definition.questionnaire.name);
  await saveAndReload(designer);
  const after = await request.get(`${endpoint}/definition`, { headers });
  expect((await after.json()).digest).toBe(committed.digest);
});

test('@fullstack stable edits reload into the designer and retain their original retry receipt', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const { workspace, designer, questionnaireId, endpoint, headers } = await prepareDraft(
    page,
    request
  );
  const exported = await request.get(`${endpoint}/definition`, { headers });
  const before = await exported.json();
  const session = await request.get('/api/auth/session', { headers });
  headers['X-CSRF-Token'] = (await session.json()).csrf_token;
  const data = {
    edits: [
      { op: 'replace', path: '/questionnaire/name', value: 'Study after stable edits' },
      {
        op: 'replace',
        path: '/questions/@welcome/display/content',
        value: 'Edited welcome instruction',
      },
      {
        op: 'add',
        path: '/questions/@second',
        value: { type: 'text-instruction', display: { content: 'Second instruction' } },
      },
      {
        op: 'add',
        path: '/pages/@page/blocks/@block/questions/@second',
        value: 'second',
        before: 'welcome',
      },
    ],
    questionnaireId,
    expectedRevision: before.revision,
    commit: false,
    idempotencyKey: `edits-${questionnaireId}`,
  };
  const applyUri = `/api/projects/${workspace.projectId}/questionnaire-definitions/apply`;
  const previewResponse = await request.post(applyUri, { headers, data });
  expect(previewResponse.status(), await previewResponse.text()).toBe(200);
  const preview = await previewResponse.json();
  expect(preview.valid).toBe(true);
  expect(preview.committed).toBe(false);
  await expect(designer.questionCards).toHaveCount(1);
  data.commit = true;
  const committedResponse = await request.post(applyUri, { headers, data });
  expect(committedResponse.status(), await committedResponse.text()).toBe(200);
  const committed = await committedResponse.json();
  expect(committed.diff).toEqual(preview.diff);
  expect(committed.beforeDigest).toBe(before.digest);
  expect(committed.revision).toBe(before.revision + 1);
  await expect(page.getByTestId('designer-replacement-conflict')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Reload Current Draft', exact: true }).click();
  await designer.expectLoaded();
  await expect(page.getByTestId('designer-title')).toHaveText('Study after stable edits');
  await expect(designer.questionCards).toHaveCount(2);
  await saveAndReload(designer);
  const afterResponse = await request.get(`${endpoint}/definition`, { headers });
  const after = await afterResponse.json();
  expect(after.digest).toBe(committed.digest);
  const document = JSON.parse(after.canonical);
  expect(document.structure.pages[0].blocks[0].questionIds).toEqual(['second', 'welcome']);
  expect(document.questions.welcome.display.content).toBe('Edited welcome instruction');
  const renewedSession = await request.get('/api/auth/session', { headers });
  headers['X-CSRF-Token'] = (await renewedSession.json()).csrf_token;
  const retried = await request.post(applyUri, { headers, data });
  expect(retried.status(), await retried.text()).toBe(200);
  expect(await retried.json()).toEqual(committed);
});
