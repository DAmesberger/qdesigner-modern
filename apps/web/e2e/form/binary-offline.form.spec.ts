import { expect, test } from './form-fixtures';
import {
  clickContinue,
  continueButton,
  countBinaries,
  fileUploadQuestion,
  filloutPath,
  pollUploadedResponses,
  publishFormStudy,
  readBinaries,
  responseFor,
  setCanvasPngFile,
  startFormSession,
  waitForCard,
} from './form-api';

const ONE_MB = 1024 * 1024;

/**
 * @form binary answers are offline-first (ADR 0029 Half 2, issues #34/#35). An oversize file
 * fails loudly at capture and writes NOTHING; a valid file captures a pending structured
 * reference (bytes in the `filloutBinaries` Dexie table, response value `{clientId,…,status:
 * 'pending'}` — never a blob: URL), the session completes without waiting, and on sync the
 * server value becomes `{status:'uploaded', mediaUrl}` while the local blob is deleted. A
 * text/plain file rides alongside the PNG to cover the #48 MIME carve-out.
 *
 * The capture runs offline (the module mounts online, then the network drops), which both
 * pins the pending rows deterministically for assertion and batches the whole session into
 * one reconnect sync — keeping the lane off the `/sync` per-IP rate limiter.
 */
test.describe('@form binary answers — offline-first capture, deferred upload', () => {
  test.describe.configure({ timeout: 120000 });

  test('oversize blocks with zero rows; valid PNG + text capture pending, then upload on sync', async ({
    page,
    context,
    request,
    workspace,
  }) => {
    const study = await publishFormStudy(request, workspace, [
      fileUploadQuestion('q_png', { prompt: 'Upload an image', maxSizeBytes: ONE_MB }),
      fileUploadQuestion('q_txt', { prompt: 'Upload a text file', maxSizeBytes: ONE_MB }),
    ]);

    await page.goto(filloutPath(study.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();
    const sessionId = await startFormSession(page);
    expect(sessionId).toBeTruthy();

    // The file-upload module mounts online, then the network drops — captures run
    // client-side and stay pending until the reconnect sync (no eager online upload).
    const pngCard = await waitForCard(page, 'file-upload');
    await context.setOffline(true);
    const pngInput = pngCard.locator('input[type=file]');
    const sizeError = page.getByTestId('file-upload-form-error');

    // An oversize synthetic file: blocks at capture with a size error and writes NO blob.
    await pngInput.setInputFiles({
      name: 'too-big.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(ONE_MB + 512 * 1024, 1),
    });
    await expect(sizeError).toBeVisible();
    await expect(sizeError).toHaveAttribute('role', 'alert');
    await expect(continueButton(page)).toBeDisabled();
    expect(await countBinaries(page, sessionId)).toBe(0);

    // A valid, genuinely-sniffable PNG: captured offline-first into filloutBinaries as a
    // pending reference — bytes present, status pending, no mediaUrl (never a blob: URL).
    await setCanvasPngFile(pngInput, 'answer.png');
    await expect(sizeError).toHaveCount(0);
    await expect(continueButton(page)).toBeEnabled();

    const pngRow = (await readBinaries(page, sessionId)).find((b) => b.name === 'answer.png');
    expect(pngRow).toBeTruthy();
    expect(pngRow!.status).toBe('pending');
    expect(pngRow!.mimeType).toBe('image/png');
    expect(pngRow!.hasBytes).toBe(true);
    expect(pngRow!.mediaUrl).toBeFalsy();
    const pngClientId = pngRow!.clientId;

    await clickContinue(page);

    // ── Question 2: a text/plain file (issue #48 MIME carve-out) ─────────────────
    const txtCard = await waitForCard(page, 'file-upload');
    const txtInput = txtCard.locator('input[type=file]');
    await txtInput.setInputFiles({
      name: 'answer.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('a short text answer', 'utf8'),
    });
    await expect(continueButton(page)).toBeEnabled();

    // Offline, both blobs are pinned pending (nothing has drained yet).
    const binaries = await readBinaries(page, sessionId);
    expect(binaries).toHaveLength(2);
    const txtRow = binaries.find((b) => b.mimeType === 'text/plain');
    expect(txtRow).toBeTruthy();
    expect(txtRow!.status).toBe('pending');
    expect(txtRow!.hasBytes).toBe(true);
    const txtClientId = txtRow!.clientId;

    // ── Completion never waits on binary sync ────────────────────────────────────
    await clickContinue(page);
    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('fillout-error')).toHaveCount(0);

    // ── Reconnect: server value is uploaded; local blobs are gone ────────────────
    await context.setOffline(false);
    const responses = await pollUploadedResponses(request, sessionId, workspace, ['q_png', 'q_txt']);

    const png = responseFor(responses, 'q_png').value as {
      clientId: string;
      status: string;
      mimeType: string;
      mediaUrl: string;
    };
    expect(png.status).toBe('uploaded');
    expect(png.clientId).toBe(pngClientId);
    expect(png.mimeType).toBe('image/png');
    expect(typeof png.mediaUrl).toBe('string');
    expect(png.mediaUrl.startsWith('blob:')).toBe(false);

    const txt = responseFor(responses, 'q_txt').value as {
      clientId: string;
      status: string;
      mimeType: string;
      mediaUrl: string;
    };
    expect(txt.status).toBe('uploaded');
    expect(txt.clientId).toBe(txtClientId);
    // #48: the text/plain MIME is preserved through capture → upload → patch.
    expect(txt.mimeType).toBe('text/plain');
    expect(txt.mediaUrl.startsWith('blob:')).toBe(false);

    // The pinned blobs are deleted once the server durably holds them.
    await expect.poll(() => countBinaries(page, sessionId), { timeout: 30000 }).toBe(0);
  });
});
