import { expect, test } from './form-fixtures';
import {
  clickContinue,
  continueButton,
  countBinaries,
  countUnsyncedResponses,
  fileUploadQuestion,
  filloutPath,
  getResponses,
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
 * @form offline round-trip (mirrors the @reaction offline-roundtrip spec). The question's
 * module mounts online, then the network drops: the binary answer is captured entirely
 * client-side — blob pinned pending in IndexedDB, the response row queued unsynced — and the
 * session completes offline without waiting. On reconnect the `online` event drives a full
 * sync, including the binary upload and the response patch to `{status:'uploaded', mediaUrl}`.
 *
 * A single file-upload question keeps the flow on one already-mounted module (the dev server
 * lazy-loads each module type on first render, so a *new* type first needed offline can't
 * fetch its chunk — the same reason the reaction offline spec stays on one paradigm).
 */
test.describe('@form offline round-trip — binary answer survives a mid-session disconnect', () => {
  test.describe.configure({ timeout: 120000 });

  test('binary answer captured offline persists to IndexedDB and syncs on reconnect', async ({
    page,
    context,
    request,
    workspace,
  }) => {
    const study = await publishFormStudy(request, workspace, [
      fileUploadQuestion('q_file', { prompt: 'Upload a file', maxSizeBytes: ONE_MB }),
    ]);

    await page.goto(filloutPath(study.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();
    const sessionId = await startFormSession(page);
    expect(sessionId).toBeTruthy();

    // The module mounts online, THEN the network drops — the capture runs client-side.
    const fileCard = await waitForCard(page, 'file-upload');
    await context.setOffline(true);

    await setCanvasPngFile(fileCard.locator('input[type=file]'), 'offline.png');
    await expect(continueButton(page)).toBeEnabled();

    // The blob is pinned pending in IndexedDB while offline (never a blob: URL).
    const offlineBinaries = await readBinaries(page, sessionId);
    expect(offlineBinaries).toHaveLength(1);
    const binary = offlineBinaries[0]!;
    expect(binary.status).toBe('pending');
    expect(binary.hasBytes).toBe(true);
    expect(binary.mimeType).toBe('image/png');
    expect(binary.mediaUrl).toBeFalsy();
    const fileClientId = binary.clientId;

    // A session completed offline is complete — it never waits on binary sync.
    await clickContinue(page);
    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });

    // Still offline: the response row is queued locally and nothing has reached the server.
    expect(await countUnsyncedResponses(page, sessionId)).toBeGreaterThanOrEqual(1);
    const offlineServer = await getResponses(request, sessionId, workspace);
    expect(offlineServer).toHaveLength(0);

    // Reconnect — the `online` event drains the queue (response + the binary patch).
    await context.setOffline(false);

    const synced = await pollUploadedResponses(request, sessionId, workspace, ['q_file']);
    const file = responseFor(synced, 'q_file').value as {
      clientId: string;
      status: string;
      mediaUrl: string;
    };
    expect(file.status).toBe('uploaded');
    // The clientId minted at offline capture is the one that lands, uploaded, server-side.
    expect(file.clientId).toBe(fileClientId);
    expect(file.mediaUrl.startsWith('blob:')).toBe(false);

    // The pinned blob is deleted once the server durably holds it.
    await expect.poll(() => countBinaries(page, sessionId), { timeout: 30000 }).toBe(0);
  });
});
