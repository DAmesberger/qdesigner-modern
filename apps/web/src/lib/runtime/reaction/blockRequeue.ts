/**
 * Enforce-mode visibility re-queue for a reaction BLOCK (F-59, ADR 0027).
 *
 * Under the `enforce` validity policy, a visibility/focus loss during a trial
 * aborts that trial (the engine returns `abortedForVisibility`). This helper is
 * the block-loop orchestration that ADR 0027 prescribes around that abort:
 *
 *  1. pause on the engine's "return to the study" overlay until the participant is
 *     back (`onVisibilityPause`), then
 *  2. re-queue the aborted trial at the END of the block, under a bounded cap
 *     ({@link MAX_VISIBILITY_REQUEUES_PER_BLOCK} re-queues per block); beyond the
 *     cap the trial is recorded as invalidated-and-lost (not re-queued).
 *
 * The aborted attempt itself is run + persisted by `runTrial` exactly like any
 * other invalid trial (an `invalidated: 'visibility'` row) — this helper only owns
 * ORDER + the pause; it never suppresses persistence. In `record` mode it is a
 * plain sequential run of the block (the aborted-for-visibility branch is never
 * taken because the engine flags-and-continues instead of aborting).
 */

/** Bounded number of visibility re-queues permitted within a single block. */
export const MAX_VISIBILITY_REQUEUES_PER_BLOCK = 3;

export interface BlockRequeueOutcome {
  /** How many trials were re-queued to the block's end for a visibility loss. */
  requeued: number;
  /** How many aborted trials were dropped after the re-queue cap was spent. */
  lost: number;
}

export interface RunBlockOptions<P> {
  /** The block's planned trials, in order. */
  block: readonly P[];
  /** Study timing-validity posture; only `enforce` re-queues. */
  policy: 'record' | 'enforce';
  /**
   * Run (and persist) one planned trial, returning whether the engine aborted it
   * for a visibility loss under `enforce`. Must fully handle mapping + persistence
   * of the attempt — this helper is order-only.
   */
  runTrial: (planned: P) => Promise<{ abortedForVisibility: boolean }>;
  /** Pause until the participant returns (engine overlay). Called before a re-queue. */
  onVisibilityPause: () => Promise<void>;
  /** Override the per-block re-queue cap (tests). */
  maxRequeues?: number;
}

/**
 * Run a block's trials with enforce-mode visibility re-queue. Terminates: at most
 * `maxRequeues` extra runs are ever appended, so the queue always drains.
 */
export async function runBlockWithVisibilityRequeue<P>(
  options: RunBlockOptions<P>
): Promise<BlockRequeueOutcome> {
  const { block, policy, runTrial, onVisibilityPause } = options;
  const maxRequeues = options.maxRequeues ?? MAX_VISIBILITY_REQUEUES_PER_BLOCK;

  const queue: P[] = [...block];
  let requeued = 0;
  let lost = 0;

  while (queue.length > 0) {
    const planned = queue.shift()!;
    const { abortedForVisibility } = await runTrial(planned);

    if (policy !== 'enforce' || !abortedForVisibility) continue;

    // The trial was aborted mid-flight for a visibility/focus loss. Pause on the
    // return-to-study overlay until the participant is back, then re-queue (bounded)
    // or record the trial lost once the cap is spent.
    await onVisibilityPause();
    if (requeued < maxRequeues) {
      queue.push(planned);
      requeued += 1;
    } else {
      lost += 1;
    }
  }

  return { requeued, lost };
}
