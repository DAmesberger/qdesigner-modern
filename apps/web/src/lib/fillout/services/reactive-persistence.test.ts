import { beforeEach, expect, it } from 'vitest';
import { db } from '$lib/services/db/indexeddb';
import { OfflineSessionService } from './OfflineSessionService';
import { OfflineResponsePersistence } from './OfflineResponsePersistence';
import type { ResumeState } from '$lib/runtime/core/ResumeState';

beforeEach(async () => {
  await db.filloutSessions.clear();
  await db.filloutEvents.clear();
  await db.filloutResponses.clear();
});

it('persists nested reactive arrays in the resume cursor as an independent snapshot', async () => {
  const session = await OfflineSessionService.createSession('reactive', 1, 0, 0);
  const ids = new Proxy(['first'], {});
  const state: ResumeState = {
    schemaVersion: 1,
    questionnaireVersion: '1.0.0',
    currentPageIndex: 0,
    currentItemIndex: 1,
    loopIterationState: {},
    variableSnapshot: {},
    presentedItemIds: ids,
    capturedAt: 123,
  };
  await OfflineSessionService.updateResumeState(session.id, state);
  ids.push('later');
  expect(await OfflineSessionService.getResumeState(session.id)).toEqual({
    ...state,
    presentedItemIds: ['first'],
  });
});

it('persists interaction metadata and answer provenance containing reactive values', async () => {
  const metadata = { selected: new Proxy(['a', 'b'], {}) };
  await OfflineResponsePersistence.saveEvent('reactive', {
    eventType: 'change',
    timestampUs: 1,
    metadata,
  });
  await OfflineResponsePersistence.saveResponse('reactive', {
    questionId: 'choices',
    value: metadata.selected,
    metadata,
  });
  expect((await db.filloutEvents.toArray())[0]?.metadata).toEqual({ selected: ['a', 'b'] });
  expect((await OfflineResponsePersistence.getUnsyncedResponses('reactive'))[0]?.value).toEqual([
    'a',
    'b',
  ]);
});
