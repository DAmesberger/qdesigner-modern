import { expect, test } from '@playwright/test';
import { provisionWorkspace } from '../helpers/fullstack-api';
import { addModule, createInDesigner, saveAndReload } from '../helpers/designer-authoring';
import { DesignerPage } from '../page-objects/designer-page';

const FORM_TYPES = [
  'text-display',
  'text-instruction',
  'instruction',
  'media-display',
  'bar-chart',
  'statistical-feedback',
  'text-input',
  'number-input',
  'single-choice',
  'multiple-choice',
  'scale',
  'rating',
  'matrix',
  'ranking',
  'date-time',
  'file-upload',
  'media-response',
  'drawing',
];

test('@fullstack all form catalogue modules can be authored, exported, imported and edited without configuration loss', async ({
  page,
  request,
}) => {
  test.setTimeout(300000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  const workspace = await provisionWorkspace(request);
  const headers = { Cookie: `qd_session=${workspace.sessionCookie}` };
  // Portable exchange targets another project; names are reserved within a project.
  const destination = await request.post('/api/projects', {
    headers: { ...headers, 'X-CSRF-Token': workspace.csrfToken },
    data: {
      organization_id: workspace.organizationId,
      name: 'Imported forms',
      code: `copy-${Date.now()}`,
      is_public: true,
    },
  });
  expect(destination.status(), await destination.text()).toBe(201);
  const destinationId = (await destination.json()).id;
  const designer = await createInDesigner(page, workspace, `Form catalogue ${Date.now()}`);
  for (const type of FORM_TYPES) {
    await addModule(
      designer,
      type,
      `authored_${type.replaceAll('-', '_')}`,
      FORM_TYPES.indexOf(type) < 6 ? 'display' : 'question'
    );
    if (['text-display', 'text-instruction', 'instruction', 'media-display'].includes(type)) {
      await page.getByLabel('Content', { exact: true }).fill(`Authored content for ${type}`);
      await page.getByLabel('Content', { exact: true }).blur();
    } else if (type === 'text-input') {
      await page.getByLabel('Placeholder Text', { exact: true }).fill('Authored placeholder');
    } else if (type === 'number-input') {
      await page.getByLabel('Suffix', { exact: true }).fill('kg');
    } else if (type === 'single-choice' || type === 'multiple-choice') {
      await page.getByLabel('Label', { exact: true }).first().fill(`Authored ${type} option`);
    } else if (type === 'rating') {
      await page.getByLabel('Visual Style', { exact: true }).selectOption('hearts');
    } else if (type === 'scale') {
      await page.getByLabel('Maximum', { exact: true }).fill('9');
    } else if (type === 'matrix') {
      await page.getByLabel('Sticky column headers', { exact: true }).uncheck();
    } else if (type === 'ranking') {
      await page.getByRole('button', { name: 'Move up', exact: true }).nth(1).click();
    } else if (type === 'date-time') {
      await page.getByLabel('Display Format', { exact: true }).fill('DD/MM/YYYY');
    } else if (type === 'file-upload') {
      await page.getByLabel('Maximum File Size', { exact: true }).selectOption('5242880');
    } else if (type === 'media-response') {
      await page.getByLabel('Maximum Duration', { exact: true }).selectOption('30');
    } else if (type === 'drawing') {
      await page.getByLabel('Width (px)', { exact: true }).fill('480');
    } else if (type === 'bar-chart') {
      await page.getByRole('button', { name: 'Axes', exact: true }).click();
      await page.getByLabel('Minimum', { exact: true }).fill('5');
    } else if (type === 'statistical-feedback') {
      await page.getByLabel('Title', { exact: true }).fill('Authored feedback title');
    }
  }
  await saveAndReload(designer);
  expect(browserErrors).toEqual([]);
  await expect(designer.questionCards).toHaveCount(FORM_TYPES.length);
  const originalId = new URL(page.url()).pathname.split('/').at(-1)!;
  const endpoint = `/api/projects/${workspace.projectId}/questionnaires`;
  const exported = await request.get(`${endpoint}/${originalId}/definition`, { headers });
  expect(exported.status(), await exported.text()).toBe(200);
  const artifact = await exported.json();
  const portable = JSON.parse(artifact.canonical);
  expect(
    Object.values(portable.questions)
      .map((q) => (q as { type: string }).type)
      .sort()
  ).toEqual([...FORM_TYPES].sort());
  const byType = Object.fromEntries(
    Object.values(portable.questions).map((q) => [(q as { type: string }).type, q])
  ) as Record<string, { display?: Record<string, unknown>; config?: Record<string, unknown> }>;
  for (const type of ['text-display', 'text-instruction', 'instruction', 'media-display']) {
    expect(byType[type]!.display?.content).toBe(`Authored content for ${type}`);
  }
  expect(byType.scale!.config?.max).toBe(9);
  expect(byType['text-input']!.config?.placeholder).toBe('Authored placeholder');
  expect(byType['number-input']!.config?.suffix).toBe('kg');
  expect(byType.rating!.config?.style).toBe('hearts');
  for (const type of ['single-choice', 'multiple-choice']) {
    expect((byType[type]!.config?.options as Array<{ label: string }>)[0]?.label).toBe(
      `Authored ${type} option`
    );
  }
  expect(byType.matrix!.config?.stickyHeaders).toBe(false);
  expect((byType.ranking!.config?.items as Array<{ id: string }>).map((item) => item.id)).toEqual([
    'item2',
    'item1',
    'item3',
    'item4',
  ]);
  expect(byType['date-time']!.config?.format).toBe('DD/MM/YYYY');
  expect(byType['file-upload']!.config?.maxSize).toBe(5242880);
  expect(byType['media-response']!.config?.maxDuration).toBe(30);
  expect(byType.drawing!.config?.canvas).toMatchObject({ width: 480 });
  expect(byType['bar-chart']!.config?.axes).toMatchObject({ y: { min: 5 } });
  expect(byType['statistical-feedback']!.config?.title).toBe('Authored feedback title');
  expect(byType['statistical-feedback']).toHaveProperty('dataSource', {
    variables: [],
    aggregation: 'none',
  });

  await page.goto(`/projects/${destinationId}`);
  await page.getByRole('button', { name: 'Import Definition', exact: true }).click();
  await page.getByTestId('qdef-file-input').setInputFiles({
    name: 'forms.qdef.json',
    mimeType: 'application/json',
    buffer: Buffer.from(artifact.canonical),
  });
  await expect(page.getByTestId('qdef-validation-heading')).toHaveText('Definition is valid');
  await page.getByRole('button', { name: 'Create Draft', exact: true }).click();
  await page.waitForURL(new RegExp(`/projects/${destinationId}/designer/[^/]+$`));
  const imported = new DesignerPage(page);
  await imported.expectLoaded();
  const importedId = new URL(page.url()).pathname.split('/').at(-1)!;
  expect(importedId).not.toBe(originalId);
  // Mount each real configuration editor before saving, to catch editor-driven
  // normalization or field loss in addition to the server round trip.
  for (const [id, question] of Object.entries(portable.questions)) {
    await imported.closeFlyoutIfOpen();
    await page.getByTestId(`designer-question-${id}`).click();
    await expect(page.getByLabel('Question Type', { exact: true })).toHaveValue(
      (question as { type: string }).type
    );
  }
  await saveAndReload(imported);
  await expect(imported.questionCards).toHaveCount(FORM_TYPES.length);
  const reread = await request.get(
    `/api/projects/${destinationId}/questionnaires/${importedId}/definition`,
    { headers }
  );
  expect(reread.status(), await reread.text()).toBe(200);
  const result = await reread.json();
  expect(result.canonical).toBe(artifact.canonical);
  expect(result.digest).toBe(artifact.digest);
  expect(browserErrors).toEqual([]);
});
