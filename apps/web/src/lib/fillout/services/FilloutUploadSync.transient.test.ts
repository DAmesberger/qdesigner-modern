import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/services/db/indexeddb';
import { ApiError } from '$lib/services/api/errors';

vi.mock('$lib/services/api', () => ({
  api: { sessions: { sync: vi.fn() } },
}));

const { FilloutUploadSync } = await import('./FilloutUploadSync');
const { OfflineSessionService } = await import('./OfflineSessionService');
const { OfflineResponsePersistence } = await import('./OfflineResponsePersistence');
const { SyncLedger, DEAD_LETTER_ATTEMPTS } = await import('./integrity/SyncLedger');
const { api } = await import('$lib/services/api');

beforeEach(async () => {
  await Promise.all([
    db.filloutSessions.clear(),
    db.filloutResponses.clear(),
    db.filloutEvents.clear(),
    db.filloutVariables.clear(),
    db.filloutSyncLedger.clear(),
    db.filloutTrials.clear(),
    db.filloutBinaries.clear(),
  ]);
  vi.mocked(api.sessions.sync).mockReset();
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('transient sync failures preserve automatic delivery (#51)', () => {
  it.each([429, 503, null])(
    'keeps answers pending beyond the rejection budget for status %s',
    async (status) => {
      const session = await OfflineSessionService.createSession('q-transient', 1, 0, 0);
      await OfflineResponsePersistence.saveResponse(session.id, { questionId: 'q1', value: 7 });
      vi.mocked(api.sessions.sync).mockRejectedValue(
        new ApiError('Temporarily unavailable', status)
      );
      let now = Date.now();
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const engine = new FilloutUploadSync();
      try {
        for (let attempt = 0; attempt <= DEAD_LETTER_ATTEMPTS; attempt++) {
          now += 120000;
          await engine.syncNow();
        }
        expect(api.sessions.sync).toHaveBeenCalledTimes(DEAD_LETTER_ATTEMPTS + 1);
        expect(await SyncLedger.stats()).toMatchObject({ pending: 1, deadletter: 0, acked: 0 });
        expect(await OfflineResponsePersistence.getUnsyncedResponses(session.id)).toHaveLength(1);
        now += 120000;
        vi.mocked(api.sessions.sync).mockResolvedValue({
          responses_synced: 1,
          events_synced: 0,
          variables_synced: 0,
        });
        await engine.syncNow();
        expect(await SyncLedger.stats()).toMatchObject({ pending: 0, deadletter: 0, acked: 1 });
      } finally {
        engine.stop();
      }
    }
  );
});

it('honors Retry-After despite eager sync calls, then delivers automatically eligible records', async () => {
  const session = await OfflineSessionService.createSession('q-limited', 1, 0, 0);
  await OfflineResponsePersistence.saveResponse(session.id, { questionId: 'q1', value: 9 });
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.mocked(api.sessions.sync)
    .mockRejectedValueOnce(new ApiError('Rate limited', 429, 60000))
    .mockResolvedValue({ responses_synced: 1, events_synced: 0, variables_synced: 0 });
  const engine = new FilloutUploadSync();
  try {
    await engine.syncNow();
    now += 59000;
    // The page controller and response persistence own separate upload engines.
    // A fresh engine (also representative of a reload) must honor the same deadline.
    const otherEngine = new FilloutUploadSync();
    try {
      await otherEngine.syncNow();
    } finally {
      otherEngine.stop();
    }
    expect(api.sessions.sync).toHaveBeenCalledTimes(1);
    expect(await SyncLedger.stats()).toMatchObject({ pending: 1, deadletter: 0 });
    now += 1000;
    await engine.syncNow();
    expect(api.sessions.sync).toHaveBeenCalledTimes(2);
    expect(await SyncLedger.stats()).toMatchObject({ acked: 1, pending: 0, deadletter: 0 });
  } finally {
    engine.stop();
  }
});
