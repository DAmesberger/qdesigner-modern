import { db, type FilloutBinary } from '$lib/services/db/indexeddb';

/**
 * Default per-question size cap when the designer leaves `maxSize` unset
 * (ADR 0029 Half 2). There is NO platform ceiling — researchers pick their own
 * value; this is only the fallback.
 */
export const DEFAULT_BINARY_MAX_BYTES = 25 * 1024 * 1024;

/**
 * The structured reference a binary answer stores in its response `value`
 * (ADR 0029 Half 2). It is NEVER a `blob:` URL and never inline base64: the
 * bytes live in the `filloutBinaries` Dexie table keyed by {@link clientId};
 * this reference is what the module emits through `onResponse` and what the
 * researcher-facing surfaces read. On upload ack the sync engine rewrites it to
 * `{clientId, name, size, mimeType, status:'uploaded', mediaUrl}`.
 */
export interface BinaryAnswerReference {
  /** Links to the `filloutBinaries` row holding the bytes (and to the upload patch). */
  clientId: string;
  name: string;
  size: number;
  mimeType: string;
  status: 'pending' | 'uploaded';
  /** Present once uploaded — the same-origin server media URL. */
  mediaUrl?: string;
}

/**
 * Per-binary upload retry backoff (issue #34 QA). A permanently-failing upload must
 * NOT be re-attempted on every sync trigger — the fillout engine fires `syncNow` on
 * session completion, on every `online` event (network flap), and on manual sync, so
 * without a per-row gate a dead upload hot-loops (51 attempts in ~2 min was observed).
 * Mirrors the response-sync path's schedule: 1s base, ×2 per attempt, capped at 60s.
 */
const BINARY_RETRY_BASE_MS = 1000;
const BINARY_RETRY_MAX_MS = 60000;

/** Backoff window (ms) to wait after the Nth failed attempt before retrying. */
export function binaryRetryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(BINARY_RETRY_BASE_MS * 2 ** (attempts - 1), BINARY_RETRY_MAX_MS);
}

/**
 * True when a pending binary is due for another upload attempt: either it has never
 * been tried (attempts 0 / no timestamp) or its backoff window has elapsed. A row
 * that is NOT due stays pinned and pending — it is simply skipped this pass.
 */
export function isBinaryDueForRetry(row: FilloutBinary, now: number = Date.now()): boolean {
  const attempts = row.attempts ?? 0;
  if (attempts <= 0 || row.lastAttemptAt === undefined) return true;
  return now - row.lastAttemptAt >= binaryRetryDelayMs(attempts);
}

/** Why a capture write failed loudly (surfaced to the participant via onValidation). */
export type BinaryCaptureFailure = 'oversize' | 'quota';

/**
 * Thrown by {@link OfflineBinaryPersistence.capture} when a file cannot be
 * accepted. The participant is present and can act, so these fail loudly at
 * capture (blocking Continue through the module's onValidation channel) rather
 * than degrading to a metadata-only fallback (ADR 0029 Half 2).
 */
export class BinaryCaptureError extends Error {
  constructor(
    readonly reason: BinaryCaptureFailure,
    message: string
  ) {
    super(message);
    this.name = 'BinaryCaptureError';
  }
}

/** True when `v` is a {@link BinaryAnswerReference} (used to patch response values). */
export function isBinaryAnswerReference(v: unknown): v is BinaryAnswerReference {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as BinaryAnswerReference).clientId === 'string' &&
    typeof (v as BinaryAnswerReference).mimeType === 'string' &&
    ((v as BinaryAnswerReference).status === 'pending' ||
      (v as BinaryAnswerReference).status === 'uploaded')
  );
}

/**
 * Read a Blob's bytes as an ArrayBuffer. Prefers the standard `Blob.arrayBuffer()`
 * (all real browsers), falling back to `FileReader` for environments whose Blob
 * lacks it (e.g. some jsdom builds under test).
 */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('failed to read blob'));
    reader.readAsArrayBuffer(blob);
  });
}

function humanBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Offline-first persistence for participant binary answers (ADR 0029 Half 2).
 * Capture writes the Blob to IndexedDB keyed by a fresh `clientId` and returns a
 * structured reference the module stores in its response value;
 * {@link FilloutUploadSync} later uploads the blob and deletes the row.
 */
export class OfflineBinaryPersistence {
  /**
   * Persist one captured file and return the reference to embed in the response
   * value. Enforces the per-question size cap and surfaces a durable-write
   * failure (typically quota) as a {@link BinaryCaptureError} so the module can
   * block Continue instead of silently losing the answer.
   *
   * `maxSize` is the designer-configured cap; falls back to
   * {@link DEFAULT_BINARY_MAX_BYTES} when unset. No platform ceiling is applied.
   */
  static async capture(
    sessionId: string,
    questionId: string,
    file: Blob,
    name: string,
    maxSize?: number
  ): Promise<BinaryAnswerReference> {
    const cap = maxSize && maxSize > 0 ? maxSize : DEFAULT_BINARY_MAX_BYTES;
    if (file.size > cap) {
      throw new BinaryCaptureError(
        'oversize',
        `File is ${humanBytes(file.size)}; the maximum is ${humanBytes(cap)}.`
      );
    }

    const clientId = crypto.randomUUID();
    const mimeType = file.type || 'application/octet-stream';
    // Read the bytes out of the Blob up front (IndexedDB stores the ArrayBuffer,
    // not the Blob object — see FilloutBinary.data).
    const data = await blobToArrayBuffer(file);
    const record: FilloutBinary = {
      clientId,
      sessionId,
      questionId,
      name,
      size: file.size,
      mimeType,
      data,
      status: 'pending',
      attempts: 0,
      createdAt: Date.now(),
    };

    try {
      await db.filloutBinaries.add(record);
    } catch (err) {
      // A quota-exceeded (or otherwise failed) durable write must fail loudly at
      // capture — no metadata-only fallback (ADR 0029 Half 2).
      const domName = err instanceof DOMException ? err.name : '';
      const quota =
        domName === 'QuotaExceededError' || domName === 'NS_ERROR_DOM_QUOTA_REACHED';
      // Both cases are a failed durable write with the participant present, so both
      // block Continue under the `quota` reason; only the message differs.
      throw new BinaryCaptureError(
        'quota',
        quota
          ? 'Not enough storage on this device to save the file.'
          : `Could not save the file to this device: ${
              err instanceof Error ? err.message : 'unknown error'
            }`
      );
    }

    return { clientId, name, size: file.size, mimeType, status: 'pending' };
  }

  /** Reconstruct an uploadable Blob from a stored row's bytes + mime type. */
  static toBlob(row: FilloutBinary): Blob {
    return new Blob([row.data], { type: row.mimeType });
  }

  /** Pending (not-yet-uploaded) binaries for one session, oldest first. */
  static async getPending(sessionId: string): Promise<FilloutBinary[]> {
    const rows = await db.filloutBinaries
      .where('[sessionId+status]')
      .equals([sessionId, 'pending'])
      .toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Pending binaries whose retry-backoff window has elapsed (issue #34 QA), oldest
   * first. Not-yet-due rows stay pinned and pending — they are just skipped this pass
   * so a permanently-failing upload can't be hammered on every sync trigger.
   */
  static async getRetryablePending(
    sessionId: string,
    now: number = Date.now()
  ): Promise<FilloutBinary[]> {
    const rows = await this.getPending(sessionId);
    return rows.filter((r) => isBinaryDueForRetry(r, now));
  }

  /** Count of pending binaries for a session (drives the researcher-facing surface). */
  static async countPending(sessionId: string): Promise<number> {
    return db.filloutBinaries.where('[sessionId+status]').equals([sessionId, 'pending']).count();
  }

  /** Session ids that still hold at least one pending binary (drives the sync drain set). */
  static async getSessionIdsWithPendingBinaries(): Promise<string[]> {
    const rows = await db.filloutBinaries.where('status').equals('pending').toArray();
    return [...new Set(rows.map((r) => r.sessionId))];
  }

  /** Delete a binary row once the server durably holds it (upload ack + response patch). */
  static async delete(clientId: string): Promise<void> {
    await db.filloutBinaries.delete(clientId);
  }

  /**
   * Record a failed upload attempt (kept pending for retry — the blob stays pinned).
   * Stamps `lastAttemptAt` so {@link isBinaryDueForRetry} can back the next attempt off
   * (1s→60s) instead of letting the sync loop retry it hot (issue #34 QA).
   */
  static async recordFailure(clientId: string, error: string): Promise<void> {
    await db.filloutBinaries.where('clientId').equals(clientId).modify((r) => {
      r.attempts = (r.attempts ?? 0) + 1;
      r.lastError = error;
      r.lastAttemptAt = Date.now();
    });
  }
}
