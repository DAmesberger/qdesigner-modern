import { expect, test } from './form-fixtures';
import {
  clickContinue,
  filloutPath,
  pollResponses,
  publishFormStudy,
  startFormSession,
  textInputQuestion,
  waitForCard,
} from './form-api';
import { DEV_URLS } from '../helpers/dev-urls';
import { getSessionById } from '../helpers/fullstack-api';

test.describe('@form recovery through real sync', () => {
  test.describe.configure({ timeout: 120000 });

  test('resumes at the next question and deduplicates retry after a committed sync loses its acknowledgement', async ({
    page,
    request,
    workspace,
  }) => {
    const study = await publishFormStudy(request, workspace, [
      textInputQuestion('first', { prompt: 'First answer' }),
      textInputQuestion('second', { prompt: 'Second answer' }),
    ]);
    await page.goto(filloutPath(study.questionnaireCode));
    const sessionId = await startFormSession(page);
    await (await waitForCard(page, 'text-input')).getByRole('textbox').fill('before reload');
    await clickContinue(page);
    await pollResponses(request, sessionId, workspace, 1);
    await page.reload();
    // A same-tab reload with the session URL resumes automatically.
    await expect(page.getByTestId('fillout-resume-toast')).toContainText('question 2 of 2');
    const card = await waitForCard(page, 'text-input');
    await expect(card.getByRole('textbox')).toHaveValue('');
    let deliveries = 0;
    await page.route(`**/api/sessions/${sessionId}/sync`, async (route) => {
      const body = route.request().postDataJSON();
      if (body.responses?.some((r: { question_id: string }) => r.question_id === 'second')) {
        deliveries++;
        if (deliveries === 1) {
          // The real server commits, but the browser never receives the acknowledgement.
          const committed = await route.fetch();
          expect(committed.ok()).toBe(true);
          await route.abort('connectionreset');
          return;
        }
      }
      await route.continue();
    });
    await card.getByRole('textbox').fill('after reload');
    await clickContinue(page);
    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible();
    await expect.poll(() => deliveries, { timeout: 30000 }).toBeGreaterThanOrEqual(2);
    const rows = await pollResponses(request, sessionId, workspace, 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.question_id, r.value])).toEqual(
      expect.arrayContaining([
        ['first', 'before reload'],
        ['second', 'after reload'],
      ])
    );
    expect(new Set(rows.map((r) => r.client_id)).size).toBe(2);
    await expect
      .poll(async () => (await getSessionById(request, sessionId, workspace)).status)
      .toBe('completed');
  });

  test('honors transient Retry-After while another participant on the same IP completes', async ({
    page,
    request,
    workspace,
    browser,
  }) => {
    const study = await publishFormStudy(request, workspace, [
      textInputQuestion('answer', { prompt: 'Your answer' }),
    ]);
    const otherContext = await browser.newContext({ baseURL: DEV_URLS.frontend });
    try {
      const other = await otherContext.newPage();
      await Promise.all([
        page.goto(filloutPath(study.questionnaireCode)),
        other.goto(filloutPath(study.questionnaireCode)),
      ]);
      const [firstId, secondId] = await Promise.all([
        startFormSession(page),
        startFormSession(other),
      ]);
      const attempts: number[] = [];
      await page.route(`**/api/sessions/${firstId}/sync`, async (route) => {
        if (route.request().postDataJSON().responses?.length) {
          attempts.push(Date.now());
          if (attempts.length === 1) {
            await route.fulfill({
              status: 429,
              headers: { 'Retry-After': '3', 'Content-Type': 'text/plain' },
              body: 'Please retry later',
            });
            return;
          }
        }
        await route.continue();
      });
      await Promise.all([
        (await waitForCard(page, 'text-input')).getByRole('textbox').fill('throttled participant'),
        (await waitForCard(other, 'text-input')).getByRole('textbox').fill('other participant'),
      ]);
      await Promise.all([clickContinue(page), clickContinue(other)]);
      const secondRows = await pollResponses(request, secondId, workspace, 1);
      expect(secondRows).toEqual([
        expect.objectContaining({ question_id: 'answer', value: 'other participant' }),
      ]);
      const firstRows = await pollResponses(request, firstId, workspace, 1);
      expect(firstRows).toEqual([
        expect.objectContaining({ question_id: 'answer', value: 'throttled participant' }),
      ]);
      expect(attempts.length).toBeGreaterThanOrEqual(2);
      expect(attempts[1]! - attempts[0]!).toBeGreaterThanOrEqual(3000);
      for (const id of [firstId, secondId]) {
        await expect
          .poll(async () => (await getSessionById(request, id, workspace)).status)
          .toBe('completed');
      }
    } finally {
      await otherContext.close();
    }
  });
});
