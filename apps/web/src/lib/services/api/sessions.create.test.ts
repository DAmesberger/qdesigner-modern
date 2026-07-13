import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Session create must be ack-validated (same class as the binary pin-until-ack bug).
 *
 * The service worker's offline queue answers a failed POST with a synthetic
 * `202 {queued:true}` — a 2xx, so the HTTP client resolves it. For `POST /api/sessions`
 * that body has no `id`, and `mapSession` would coerce it to `''`: the fillout runtime
 * would then carry a session with no identity and every downstream write (responses,
 * events, media) would key on nothing. It must fail loudly instead.
 *
 * `static/sw.js` no longer queues `POST /api/sessions`; this is the second half of the
 * defense — the guard holds even if that regresses or a proxy fabricates a 2xx.
 */

vi.mock('$lib/api/generated/sdk.gen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/api/generated/sdk.gen')>();
  return { ...actual, createSession: vi.fn() };
});

const sdk = await import('$lib/api/generated/sdk.gen');
const { sessions } = await import('./sessions');

const createSession = sdk.createSession as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  createSession.mockReset();
});

describe('sessions.create ack validation', () => {
  it('rejects a synthetic 202 {queued:true} instead of returning a session with no id', async () => {
    createSession.mockResolvedValue({ queued: true, message: 'Request queued for offline sync' });

    await expect(
      sessions.create({ questionnaireId: 'q-1', versionMajor: 1, versionMinor: 0, versionPatch: 0 })
    ).rejects.toThrow(/not acknowledged/i);
  });

  it('rejects a response whose id is empty/blank', async () => {
    createSession.mockResolvedValue({ id: '   ', questionnaire_id: 'q-1', status: 'active' });

    await expect(sessions.create({ questionnaireId: 'q-1' })).rejects.toThrow(/not acknowledged/i);
  });

  it('returns the mapped session on a genuine create', async () => {
    createSession.mockResolvedValue({
      id: 'sess-42',
      questionnaire_id: 'q-1',
      status: 'active',
      metadata: {},
      participant_number: 7,
    });

    const created = await sessions.create({ questionnaireId: 'q-1' });
    expect(created.id).toBe('sess-42');
    expect(created.questionnaireId).toBe('q-1');
    expect(created.participantNumber).toBe(7);
    expect(created.duplicate).toBe(false);
  });
});
