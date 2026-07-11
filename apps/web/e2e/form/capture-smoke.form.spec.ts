import { expect, test } from './form-fixtures';
import {
  clickContinue,
  continueButton,
  currentCard,
  drawStroke,
  filloutPath,
  type FormQuestion,
  pollResponses,
  publishFormStudy,
  responseFor,
  startFormSession,
  waitForCard,
  warmModules,
} from './form-api';

/**
 * @form per-type capture smoke (issue #35). One study covering the remaining DOM question
 * types — single/multiple-choice, scale, rating, matrix, ranking, date-time, drawing — each
 * answered through its real runtime component, asserting the SHAPE of the persisted
 * server-side value. Broad but shallow: the deep behaviors (blocking validation, offline
 * binaries) live in the other specs.
 *
 * The form is answered OFFLINE (after pre-warming every module chunk online), then synced
 * once on reconnect. This is deliberate: the runtime persists ~4 derived variables per
 * question and syncs eagerly, so eight questions answered online burst well past the
 * `/sync` endpoint's 10-requests/60s-per-IP limiter and answers dead-letter. Batching the
 * whole session into one reconnect sync keeps it under budget — and exercises the same
 * offline-first write path the deep specs cover. (The per-IP `/sync` limit dead-lettering
 * answers on a normal-length form filled at normal speed is itself a product concern,
 * reported alongside this lane.)
 */

const QUESTIONS: FormQuestion[] = [
  {
    id: 'q_single',
    type: 'single-choice',
    required: true,
    display: { prompt: 'Pick one fruit' },
    config: {
      responseType: { type: 'single' },
      options: [
        { id: 'a', label: 'Apple', value: 'apple' },
        { id: 'b', label: 'Banana', value: 'banana' },
      ],
    },
  },
  {
    id: 'q_multi',
    type: 'multiple-choice',
    required: true,
    display: { prompt: 'Pick colors' },
    config: {
      responseType: { type: 'multiple' },
      options: [
        { id: 'r', label: 'Red', value: 'red' },
        { id: 'g', label: 'Green', value: 'green' },
        { id: 'b', label: 'Blue', value: 'blue' },
      ],
    },
  },
  {
    id: 'q_scale',
    type: 'scale',
    required: true,
    display: { prompt: 'Rate 1 to 5' },
    config: { displayType: 'buttons', min: 1, max: 5, step: 1 },
  },
  {
    id: 'q_rating',
    type: 'rating',
    required: true,
    display: { prompt: 'How many stars?' },
    config: { levels: 5, style: 'stars' },
  },
  {
    id: 'q_matrix',
    type: 'matrix',
    required: true,
    display: { prompt: 'Rate each' },
    config: {
      responseType: 'single',
      rows: [{ id: 'r1', label: 'Taste' }],
      columns: [
        { id: 'c1', label: 'Bad', value: 1 },
        { id: 'c2', label: 'Good', value: 2 },
      ],
    },
  },
  {
    id: 'q_rank',
    type: 'ranking',
    required: true,
    display: { prompt: 'Rank these' },
    config: {
      items: [
        { id: 'first', label: 'First' },
        { id: 'second', label: 'Second' },
        { id: 'third', label: 'Third' },
      ],
    },
  },
  {
    id: 'q_date',
    type: 'date-time',
    required: true,
    display: { prompt: 'Pick a date' },
    config: { mode: 'date' },
  },
  {
    id: 'q_draw',
    type: 'drawing',
    required: true,
    display: { prompt: 'Draw something' },
    config: { canvas: { width: 400, height: 300 } },
  },
];

test.describe('@form per-type capture smoke → persisted value shapes', () => {
  test.describe.configure({ timeout: 120000 });

  test('every DOM question type captures a well-shaped server-side value', async ({
    page,
    context,
    request,
    workspace,
  }) => {
    const study = await publishFormStudy(request, workspace, QUESTIONS, 'Form per-type smoke');

    await page.goto(filloutPath(study.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();
    const sessionId = await startFormSession(page);
    expect(sessionId).toBeTruthy();

    // The first item (single-choice) mounts online; warm the remaining module chunks so the
    // whole form can run offline, then drop the network. All eight answers queue locally and
    // sync in one batch on reconnect (see the file header for why).
    await waitForCard(page, 'single-choice');
    await warmModules(page, QUESTIONS.map((q) => q.type));
    await context.setOffline(true);

    // single-choice → the chosen option's value.
    let card = currentCard(page, 'single-choice');
    await card.locator('.choice-label', { hasText: 'Banana' }).click();
    await expectAdvance(page);

    // multiple-choice → an array of the chosen option values (selection order).
    card = await waitForCard(page, 'multiple-choice');
    await card.locator('.choice-label', { hasText: 'Red' }).click();
    await card.locator('.choice-label', { hasText: 'Blue' }).click();
    await expectAdvance(page);

    // scale (buttons variant) → the chosen point number.
    card = await waitForCard(page, 'scale');
    await card.locator('.scale-button').nth(3).click(); // points [1..5] → 4
    await expectAdvance(page);

    // rating (stars) → the chosen rating number.
    card = await waitForCard(page, 'rating');
    await card.getByRole('button', { name: 'Rate 4 out of 5' }).click();
    await expectAdvance(page);

    // matrix → { rowId: columnValue }.
    card = await waitForCard(page, 'matrix');
    // The native radio is hidden behind a styled indicator span; force past the overlay.
    await card.locator('input[type=radio]').nth(1).check({ force: true }); // r1 → Good (value 2)
    await expectAdvance(page);

    // ranking → an ordered array of item ids. Clicking the first "Add to ranking" each
    // time consumes the unranked list top-to-bottom, yielding [first, second, third].
    card = await waitForCard(page, 'ranking');
    for (let i = 0; i < 3; i += 1) {
      await card.getByRole('button', { name: 'Add to ranking' }).first().click();
    }
    await expectAdvance(page);

    // date-time (date mode) → an ISO datetime string for the picked day.
    card = await waitForCard(page, 'date-time');
    await card.locator('input[type=date]').fill('2026-07-15');
    await expectAdvance(page);

    // drawing → { imageData: <png data URL>, … }.
    card = await waitForCard(page, 'drawing');
    await drawStroke(page, card.locator('.drawing-canvas'));
    await expectAdvance(page);

    // Completed entirely offline; reconnect drains the whole session in one batched sync.
    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('fillout-error')).toHaveCount(0);
    await context.setOffline(false);

    const responses = await pollResponses(request, sessionId, workspace, QUESTIONS.length, 45000);
    expect(responses).toHaveLength(QUESTIONS.length);

    expect(responseFor(responses, 'q_single').value).toBe('banana');
    expect(responseFor(responses, 'q_multi').value).toEqual(['red', 'blue']);
    expect(responseFor(responses, 'q_scale').value).toBe(4);
    expect(responseFor(responses, 'q_rating').value).toBe(4);
    expect(responseFor(responses, 'q_matrix').value).toEqual({ r1: 2 });
    expect(responseFor(responses, 'q_rank').value).toEqual(['first', 'second', 'third']);

    // date-time persists an ISO datetime for the picked day. The module parses the local
    // date, so the UTC instant lands on the 15th or its eve depending on the runner's TZ —
    // assert the ISO shape and that it resolves within a day of the pick.
    const dateValue = String(responseFor(responses, 'q_date').value);
    expect(dateValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    const dayMs = Math.abs(new Date(dateValue).getTime() - Date.parse('2026-07-15T00:00:00Z'));
    expect(dayMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);

    const drawValue = responseFor(responses, 'q_draw').value as { imageData?: string };
    expect(typeof drawValue.imageData).toBe('string');
    expect(drawValue.imageData!.startsWith('data:image/png')).toBe(true);
  });
});

/** Continue must be enabled once the item is answered; click it to advance to the next. */
async function expectAdvance(page: import('@playwright/test').Page): Promise<void> {
  await expect(continueButton(page)).toBeEnabled();
  await clickContinue(page);
}
