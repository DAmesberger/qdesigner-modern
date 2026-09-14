import { db, type FilloutSession } from '$lib/services/db/indexeddb';
import { browser } from '$app/environment';
import type { ResumeState } from '$lib/runtime/core/ResumeState';
import { FilloutCrypto } from './crypto/FilloutCrypto';
import { storageSnapshot } from './storageSnapshot.svelte';

type SessionMetadata = Record<string, unknown> | undefined;

/**
 * Manages fillout sessions offline-first using IndexedDB.
 * Sessions are created client-side with crypto.randomUUID() — no server round-trip needed.
 */
export class OfflineSessionService {
  /** Encrypt outside the transaction, then commit only against the snapshot
   * that was read. A concurrent progress/completion update retries its merge. */
  private static async mutateSession(
    sessionId: string,
    makePatch: (session: FilloutSession) => Promise<Partial<FilloutSession>>
  ): Promise<void> {
    for (;;) {
      const snapshot = await db.filloutSessions.get(sessionId);
      if (!snapshot) return;
      const patch = await makePatch(snapshot);
      const committed = await db.transaction('rw', db.filloutSessions, async () => {
        const current = await db.filloutSessions.get(sessionId);
        if (!current || (current.syncRevision ?? 0) !== (snapshot.syncRevision ?? 0)) return false;
        await db.filloutSessions.update(sessionId, {
          ...patch,
          syncRevision: (current.syncRevision ?? 0) + 1,
          updatedAt: Date.now(),
          synced: 0,
        });
        return true;
      });
      if (committed) return;
    }
  }
  /**
   * E-OFF-2: encrypt a session's `metadata` blob (consent, url params,
   * fingerprint, progress) at rest. `browserInfo`/version/status stay cleartext —
   * the latter are indexed and non-content. Undefined passes through untouched.
   */
  private static async encryptMeta(
    sessionId: string,
    meta: SessionMetadata
  ): Promise<SessionMetadata> {
    return (await FilloutCrypto.encryptField(sessionId, meta)) as SessionMetadata;
  }

  /** Decrypt a stored metadata slot back to a plain object (or undefined). */
  private static async decryptMeta(sessionId: string, meta: unknown): Promise<SessionMetadata> {
    return (await FilloutCrypto.decryptField(sessionId, meta)) as SessionMetadata;
  }

  /**
   * Return a copy of a stored session row with its `metadata` decrypted, so all
   * callers see plaintext regardless of at-rest encryption. No-op on undefined.
   */
  private static async decryptRow(
    row: FilloutSession | undefined
  ): Promise<FilloutSession | undefined> {
    if (!row) return row;
    if (row.metadata === undefined) return row;
    return { ...row, metadata: await this.decryptMeta(row.id, row.metadata) };
  }

  /**
   * Create a new session locally.
   */
  static async createSession(
    questionnaireId: string,
    versionMajor: number,
    versionMinor: number,
    versionPatch: number,
    participantId?: string,
    metadata?: Record<string, unknown>,
    browserInfo?: Record<string, unknown>
  ): Promise<FilloutSession> {
    const id = crypto.randomUUID();
    const session: FilloutSession = {
      id,
      questionnaireId,
      status: 'active',
      versionMajor,
      versionMinor,
      versionPatch,
      participantId,
      metadata: await this.encryptMeta(id, metadata),
      browserInfo,
      createdAt: Date.now(),
      synced: 0,
    };

    await db.filloutSessions.put(session);
    // Return the plaintext view to the caller (the stored row is encrypted).
    return { ...session, metadata };
  }

  /**
   * Record a durable LOCAL pin row for a session that was created on the SERVER
   * (online path). Online sessions otherwise have no `filloutSessions` row, which
   * would make their pinned definition/media invisible to `protectedVersionKeys`
   * (GC/eviction could discard an in-flight session's assets) and unavailable for
   * offline resume. Written with `synced = 1` so `getUnsyncedSessions()` never
   * treats it as a session needing a server create — the sync engine drains this
   * session's data via its unsynced CHILD records, and `ensureServerSession`
   * short-circuits on `api.sessions.get`. Idempotent (keyed by id).
   */
  static async recordServerSession(input: {
    id: string;
    questionnaireId: string;
    versionMajor: number;
    versionMinor: number;
    versionPatch: number;
    participantId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const existing = await db.filloutSessions.get(input.id);
    // The session's version pin is immutable. Reopening an existing pin must
    // preserve pending completion metadata, cursor and its acknowledgement token.
    if (existing) return;
    // New metadata is encrypted; when absent, keep the existing (already
    // encrypted) row value untouched.
    const metadata =
      input.metadata !== undefined ? await this.encryptMeta(input.id, input.metadata) : undefined;
    const session: FilloutSession = {
      id: input.id,
      questionnaireId: input.questionnaireId,
      status: 'active',
      versionMajor: input.versionMajor,
      versionMinor: input.versionMinor,
      versionPatch: input.versionPatch,
      participantId: input.participantId,
      metadata,
      createdAt: Date.now(),
      synced: 1,
    };
    try {
      await db.filloutSessions.add(session);
    } catch (error) {
      // Another tab may have pinned the same server session after our read.
      if (!(error instanceof Error) || error.name !== 'ConstraintError') throw error;
    }
  }

  /**
   * Resume an existing session from IndexedDB.
   */
  static async resumeSession(sessionId: string): Promise<FilloutSession | null> {
    const session = await db.filloutSessions.get(sessionId);
    if (!session || session.status === 'completed') return null;
    return (await this.decryptRow(session)) ?? null;
  }

  /**
   * Find active session for a questionnaire.
   */
  static async findActiveSession(questionnaireId: string): Promise<FilloutSession | null> {
    const session = await db.filloutSessions
      .where('[questionnaireId+status]')
      .equals([questionnaireId, 'active'])
      .first();
    return (await this.decryptRow(session)) ?? null;
  }

  /**
   * Update session progress metadata and, optionally, the durable resume cursor
   * (E-OFF-1). `progress` keeps its historical home under `metadata.progress`; the
   * typed `cursor` fields (authoritative `answeredQuestionIds` + `lastItemIndex` /
   * `lastPageId` hints) are written as top-level columns so a reload / offline resume
   * has a durable pointer even before any child record syncs. Bumps `updatedAt` and
   * re-arms `synced:0`. No-op when the row is absent (online session with no local pin).
   */
  static async updateProgress(
    sessionId: string,
    progress: Record<string, unknown>,
    cursor?: {
      lastItemIndex?: number;
      lastPageId?: string;
      answeredQuestionIds?: string[];
    }
  ): Promise<void> {
    await this.mutateSession(sessionId, async (session) => {
      const currentMeta = (await this.decryptMeta(sessionId, session.metadata)) ?? {};
      const patch: Partial<FilloutSession> = {
        metadata: await this.encryptMeta(sessionId, { ...currentMeta, progress }),
      };
      if (cursor) {
        if (cursor.lastItemIndex !== undefined) patch.lastItemIndex = cursor.lastItemIndex;
        if (cursor.lastPageId !== undefined) patch.lastPageId = cursor.lastPageId;
        if (cursor.answeredQuestionIds !== undefined)
          patch.answeredQuestionIds = cursor.answeredQuestionIds;
      }
      return patch;
    });
  }

  /**
   * Persist the full true save-and-continue snapshot (E-FLOW-3) on the local session
   * row and re-arm synced:0 so FilloutUploadSync mirrors it to `sessions.state_snapshot`.
   * No-op when the row is absent (online-created session with no local pin yet) — the
   * offline-first response/cursor write path (updateProgress) still covers resume then.
   */
  static async updateResumeState(sessionId: string, resumeState: ResumeState): Promise<void> {
    resumeState = storageSnapshot(resumeState);
    await this.mutateSession(sessionId, async () => ({ resumeState }));
  }

  /**
   * Read the persisted {@link ResumeState} for a session, if any. Undefined when the
   * row is missing or predates E-FLOW-3 (only the E-OFF-1 answer cursor was stored).
   */
  static async getResumeState(sessionId: string): Promise<ResumeState | undefined> {
    const session = await db.filloutSessions.get(sessionId);
    return session?.resumeState;
  }

  /**
   * Discard the persisted {@link ResumeState} for a session (E-FLOW-3, FIX-F12). Called
   * when a participant chooses "Start over" on the welcome screen so a subsequent reload
   * does not silently resume the abandoned position. No-op when the row is absent.
   */
  static async clearResumeState(sessionId: string): Promise<void> {
    await this.mutateSession(sessionId, async () => ({ resumeState: undefined }));
  }

  /**
   * Shallow-merge a metadata patch into an existing session row, preserving
   * prior keys, and re-arm synced:0 so FilloutUploadSync.collectSessionsToSync
   * ships the merged metadata (its payload carries session.metadata). No-op when
   * the row is absent (online-created session with no local pin yet). Undefined
   * patch values are dropped so they don't clobber existing keys.
   */
  static async mergeMetadata(sessionId: string, patch: Record<string, unknown>): Promise<void> {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleaned[k] = v;
    }

    await this.mutateSession(sessionId, async (session) => {
      const currentMeta = (await this.decryptMeta(sessionId, session.metadata)) ?? {};
      return { metadata: await this.encryptMeta(sessionId, { ...currentMeta, ...cleaned }) };
    });
  }

  /**
   * Mark session as completed.
   */
  static async completeSession(sessionId: string): Promise<void> {
    await this.mutateSession(sessionId, async () => ({
      status: 'completed',
      completedAt: Date.now(),
    }));
  }

  /**
   * Mark session as abandoned.
   */
  static async abandonSession(sessionId: string): Promise<void> {
    await this.mutateSession(sessionId, async () => ({
      status: 'abandoned',
    }));
  }

  /**
   * Get a session row by id (undefined when it exists only on the server).
   */
  static async getSession(sessionId: string): Promise<FilloutSession | undefined> {
    return this.decryptRow(await db.filloutSessions.get(sessionId));
  }

  /**
   * Get all unsynced sessions.
   */
  static async getUnsyncedSessions(): Promise<FilloutSession[]> {
    const rows = await db.filloutSessions.where('synced').equals(0).toArray();
    return Promise.all(rows.map((r) => this.decryptRow(r) as Promise<FilloutSession>));
  }

  /**
   * Mark session as synced.
   */
  static async markSynced(sessionId: string, expectedRevision: number): Promise<boolean> {
    let acknowledged = false;
    await db.filloutSessions
      .where('id')
      .equals(sessionId)
      .modify((session) => {
        if ((session.syncRevision ?? 0) !== expectedRevision) return;
        session.synced = 1;
        acknowledged = true;
      });
    return acknowledged;
  }

  /**
   * Collect device and browser info.
   */
  static getDeviceInfo(): Record<string, unknown> {
    if (!browser) return {};

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        pixelRatio: window.devicePixelRatio,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touchSupport: 'ontouchstart' in window,
    };
  }
}
