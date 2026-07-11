import { tick } from 'svelte';
import { goto } from '$app/navigation';
import { m } from '$lib/paraglide/messages';
import type {
  FormQuestionHost,
  FormHostPresentation,
  FormTimerState,
} from '$lib/runtime/core/FormQuestionHost';
import { buildQuestionAnnouncement } from '$lib/fillout/a11y/announce';
import { computeProgressTotal, type FilloutProgress } from '$lib/fillout/progress';
import type { ResumeState } from '$lib/runtime/core/ResumeState';
import type {
  ConsentData,
  FilloutDefinition,
  FilloutQuestionnairePayload,
} from '$lib/fillout/types';
import type { Question, QuestionnaireSession } from '$lib/shared';
import { OfflineSessionService } from '$lib/fillout/services/OfflineSessionService';
import { FilloutContentCache } from '$lib/fillout/services/FilloutContentCache';
import { FilloutUploadSync, type SyncResult } from '$lib/fillout/services/FilloutUploadSync';
import { OfflineResponsePersistence } from '$lib/fillout/services/OfflineResponsePersistence';
import { SeriesEnrollmentService } from '$lib/fillout/services/SeriesEnrollmentService';
import { SyncLedger } from '$lib/fillout/services/integrity/SyncLedger';
import { QuotaService } from '$lib/fillout/services/QuotaService';
import { FraudDetectionService } from '$lib/fillout/services/FraudDetectionService';
import type { ScreenOutResult } from '$lib/fillout/services/ScreenerController';
import { api } from '$lib/services/api';
import { db, filloutDefinitionKey, type FilloutServerVariable } from '$lib/services/db/indexeddb';
import { collectServerVariables, declHash } from '@qdesigner/questionnaire-core';
import type { ServerVariableSnapshot } from '$lib/runtime/core/QuestionnaireRuntime';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import {
  definitionNeedsWebGL,
  isWebGLUnavailableError,
  probeWebGL2Support,
} from '$lib/fillout/webglPreflight';
import { TimingGatekeeper } from '$lib/runtime/timing';
import type { GatekeeperResult } from '$lib/runtime/timing';
import type { FilloutRuntime, FilloutRuntimeConfig } from '$lib/fillout/runtime/FilloutRuntime';
import type { Session, SeriesPromptResolution } from '$lib/api/generated/types.gen';
import type { ResumeSnapshot } from '$lib/fillout/runtime/responseMapping';

/**
 * The subset of the fillout entry page's `load` return the controller reads. Kept
 * as a standalone interface (rather than the route's generated `PageData`) so this
 * headless module carries no dependency on the route file — the `.svelte` view
 * constructs it with the real `PageData`, which is structurally compatible.
 */
export interface FilloutPageData {
  questionnaire: FilloutQuestionnairePayload;
  existingSession: Session | null;
  code: string;
  participantId: string | null;
  urlParams: Record<string, string>;
  preview: boolean;
  isOffline: boolean;
  pinnedFallback: boolean;
  resumeSnapshot: ResumeSnapshot | null;
  resumeCompleted: boolean;
  resumeFromDevice: boolean;
  resumeState?: ResumeState;
  resumeStateSessionId: string | null;
  resumeSessionId: string | null;
  /**
   * Honest cross-device resume fallback (F-10). True when a `?sid=` resume link was opened
   * but the session isn't resumable on THIS device — the server resume endpoints are
   * auth-gated, so an anonymous cross-device open silently falls back to a fresh same-device
   * run. Drives a dismissible welcome-screen notice; it never blocks starting.
   */
  crossDeviceResumeUnavailable?: boolean;
  /**
   * Longitudinal / EMA series wave context (E-FLOW-2), resolved in `load`
   * from a `?token=` reminder link. `seriesToken` is the enrollment resume
   * token (bound onto the created session + used for the completion
   * callback); `seriesPrompt` carries the wave index + elapsed days for the
   * `_waveIndex` / `_seriesElapsedDays` flow variables. Both null for a
   * plain (non-series) fillout.
   */
  seriesToken?: string | null;
  seriesPrompt?: SeriesPromptResolution | null;
}

/**
 * Locale-dependent runtime inputs supplied by the view at start/resume time. Locale
 * selection lives in the `.svelte` view (ADR 0022 content translation), so the
 * localized `definition`, `rawDefinition`, `questionList`, and the DOM `canvas`
 * cross the boundary as a lazily-read accessor — captured when the runtime is built.
 */
export interface FilloutRuntimeInputs {
  canvas: HTMLCanvasElement | undefined;
  /** Definition with prompts / labels / titles localized for the active locale. */
  definition: FilloutDefinition;
  /** The un-localized definition (server-variable snapshots key off this). */
  rawDefinition: FilloutDefinition;
  questionList: Question[];
  hasReactionQuestion: boolean;
}

/**
 * Injectable service bag. Defaults are the real implementations; tests swap them to
 * exercise the lifecycle headlessly. `offlineSession`, `fraud`, `quota`, `content`
 * are STATIC-method classes, so the bag carries the class references (not instances);
 * `makeSyncEngine` / `makeRuntime` / `gatekeeper` are factories over the instance/shared
 * services.
 */
export interface FilloutServiceBag {
  offlineSession: typeof OfflineSessionService;
  fraud: typeof FraudDetectionService;
  quota: typeof QuotaService;
  content: typeof FilloutContentCache;
  makeSyncEngine: (opts: {
    onSyncStart?: () => void;
    onSyncComplete?: (result: SyncResult) => void;
  }) => FilloutUploadSync;
  // Async so the default factory can dynamically import FilloutRuntime, keeping the
  // mathjs subgraph (FilloutRuntime → QuestionnaireRuntime → VariableEngine → mathjs)
  // off the fillout route's static/modulepreload graph (F103). Sync test doubles that
  // return a runtime directly still satisfy this (awaited at the call site).
  makeRuntime: (config: FilloutRuntimeConfig) => FilloutRuntime | Promise<FilloutRuntime>;
  gatekeeper: () => TimingGatekeeper;
}

function defaultServiceBag(): FilloutServiceBag {
  return {
    offlineSession: OfflineSessionService,
    fraud: FraudDetectionService,
    quota: QuotaService,
    content: FilloutContentCache,
    makeSyncEngine: (opts) => new FilloutUploadSync(opts),
    makeRuntime: async (config) => {
      // Dynamic import (F103): defers the mathjs chunk until first runtime construction,
      // so the public /q/[code] initial graph never statically references it.
      const { FilloutRuntime } = await import('$lib/fillout/runtime/FilloutRuntime');
      return new FilloutRuntime(config);
    },
    gatekeeper: () => TimingGatekeeper.shared(),
  };
}

/** 30-day default staleness window when a declaration omits `server.staleAfterMs`. */
const SERVER_VAR_DEFAULT_STALE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Whether the document is cross-origin isolated (F-59, ADR 0027). Full timer
 * resolution (~5µs vs ~100µs) requires COOP/COEP. The enforce-mode isolation gate
 * consults this before creating a session for a timing-critical reaction study.
 */
function isCrossOriginIsolated(): boolean {
  return typeof globalThis !== 'undefined' && globalThis.crossOriginIsolated === true;
}

/**
 * Headless controller for the `(fillout)/q/[code]` entry page (F040). Owns the
 * service wiring (offline session, upload sync, quotas, fraud, timing gatekeeper,
 * runtime) and the screen state machine, leaving the `.svelte` file a thin view that
 * renders screens and forwards events. Being a `.svelte.ts` runes module, its
 * `$state` fields are reactive when read from the component; computed values are
 * exposed as getters over that state (the designer-store idiom). Strictly
 * behavior-preserving code motion from the former 900-line component.
 */
export class FilloutPageController {
  // --- Screen state machine ---------------------------------------------------
  screen = $state<
    | 'welcome'
    | 'consent'
    | 'runtime'
    | 'complete'
    | 'over-quota'
    | 'screened-out'
    | 'webgl-unsupported'
    | 'timing-isolation-required'
    | 'media-error'
  >('welcome');
  overQuotaMessage = $state('');
  // Structured eligibility screen-out outcome (F-20). Set when a `terminate` flow
  // rule or a screener rule ends the session as ineligible; drives the dedicated
  // screened-out screen (honest copy, no completion code) instead of the thank-you.
  screenOut = $state<ScreenOutResult | null>(null);
  loading = $state(false);
  loadingMessage = $state(m.fillout_loading_default());
  loadingProgress = $state(0);
  error = $state<string | null>(null);
  // Recoverable media-preload failure (R2-5). When runtime start fails because one or
  // more media resources could not be fetched, we route to a dedicated retry screen
  // instead of the generic dead-end: the session already exists and no answer has been
  // recorded yet (preload precedes the first item), so re-running the runtime build
  // re-attempts only the preload without a duplicate session or lost progress.
  // `mediaErrorCount` is the failed-resource count for the curated headline; the raw
  // ResourceManager detail is kept in `mediaErrorDetails` for a collapsed secondary line.
  mediaErrorCount = $state(0);
  mediaErrorDetails = $state<string | null>(null);

  // --- Session state ----------------------------------------------------------
  // `session` spans three assignment shapes across create / resume / offline paths
  // (camelCase SessionData, snake_case Session DTO, a locally-built offline stub), so
  // it stays loosely typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session = $state<any>(null);
  completedSession = $state<QuestionnaireSession | undefined>(undefined);
  conditionGroupCounts = $state<number[] | undefined>(undefined);
  // E-FLOW-6: server-allocated 0-based participant index + authoritative arm assignment.
  participantNumber = $state<number | undefined>(undefined);
  serverAssignment = $state<{ condition: string; conditionIndex: number } | undefined>(undefined);
  // Fraud prevention state
  fraudFingerprint = $state<string | undefined>(undefined);
  // E-FLOW-7: participant's selected interlocking quota cell key, computed at entry and
  // pinned to metadata + exposed as the `_quotaCell` flow variable. Non-reactive.
  quotaCellKey: string | null = null;

  // --- Offline / sync state ---------------------------------------------------
  isOffline = $state(false);
  syncStatus = $state<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  savedLocally = $state(false);

  // Connectivity UX (E-OFF-6): persistent, non-transient sync readout. `pendingCount`
  // is the SyncLedger's `pending` tally (records queued locally, not yet server-acked);
  // it survives reloads because the ledger lives in IndexedDB, so a participant who
  // closed the tab with unsent data still sees it on return. `lastSyncedAt` is the epoch
  // ms of the last fully-successful drain.
  pendingCount = $state(0);
  deadletterCount = $state(0);
  lastSyncedAt = $state<number | null>(null);
  private statsTimer: ReturnType<typeof setInterval> | null = null;

  // Dead-study affordance (F-53). `deadletterCount` above is scoped to THIS questionnaire's
  // sessions so a stale, unsubmittable session for an unrelated/deleted study never inflates
  // this page's banner. Those orphaned dead-letter sessions are surfaced ONCE here instead:
  // `deadStudyCount` drives a dismissible "a previous study on this device no longer accepts
  // answers — export or discard" notice; `deadStudySessionIds` are the sessions the discard
  // crypto-erases. Never auto-deletes — export is always offered first.
  deadStudyCount = $state(0);
  deadStudyDismissed = $state(false);
  private deadStudySessionIds: string[] = [];

  // Resume state (E-OFF-1 / E-FLOW-3, FIX-F12).
  resumeNotice = $state<string | null>(null);
  pinnedFallbackDismissed = $state(false);
  // Honest cross-device resume fallback (F-10). Seeded from load; a dismissible welcome
  // notice explains that an anonymous session can't be moved between devices, then the
  // participant starts fresh here.
  crossDeviceNotice = $state(false);

  // --- Explicit offline provisioning (F-21 / R2-6) ---------------------------
  // Field participants who know they'll lose signal can prefetch everything a full run
  // needs from the welcome screen. `offlinePrep` is the affordance's state machine;
  // `offlinePrepDone/Total` drive the "N of M" progress readout. Readiness is recomputed
  // from Cache-API membership (no new schema) so it survives a reload.
  offlinePrep = $state<'idle' | 'preparing' | 'ready' | 'partial' | 'quota-exceeded' | 'error'>(
    'idle'
  );
  offlinePrepDone = $state(0);
  offlinePrepTotal = $state(0);
  // True save-and-continue snapshot: mutable so a fresh-session create (or "Start over")
  // can drop it — it must only ever be applied to the SAME session it was captured on.
  activeResumeState = $state<ResumeState | undefined>(undefined);

  // --- Timing qualification (Slice 3.4) --------------------------------------
  qualification = $state<GatekeeperResult | null>(null);
  bannerDismissed = $state(false);

  // --- HTML-overlay form rendering (ADR 0018) --------------------------------
  activePresentation = $state<FormHostPresentation | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- captured value spans every module answer shape
  currentValue = $state<any>(undefined);
  hasAnswered = $state(false);
  timerState = $state<FormTimerState | null>(null);
  // A11y (F094/F098): persistent live-region text.
  liveAnnouncement = $state('');

  // --- Participant progress indicator (F-7 / R2-1) ---------------------------
  // Page-based position for the fillout chrome's progress bar. Null until the first
  // item is presented; then `{ current, total }` where `current` is the 1-based
  // ordinal of the furthest page reached (monotonic — see recordItemProgress) and
  // `total` is the page count, or null for an indeterminate flow (adaptive/CAT block
  // or a dynamic-length / flow-loop design; see computeProgressTotal).
  progress = $state<FilloutProgress | null>(null);
  // Memoized page-based total (computeProgressTotal is a pure fn of the definition).
  // `undefined` = not yet computed; a computed value is number | null.
  private progressTotal: number | null | undefined = undefined;

  // --- Non-reactive service handles ------------------------------------------
  private runtime: FilloutRuntime | null = null;
  // W-5: set once dispose() runs (page unmount). initializeRuntime checks it after
  // each await so a runtime built AFTER unmount is torn down instead of leaking its
  // WebGL context + rAF loop (browsers cap ~16 live contexts).
  private isDisposed = false;
  private syncEngine: FilloutUploadSync | null = null;
  private audioUnlockContext: AudioContext | null = null;
  private lastPresentedItemId: string | null = null;
  private readonly services: FilloutServiceBag;

  /**
   * View-provided accessor for the locale-dependent runtime inputs + the DOM canvas.
   * Read lazily (at runtime-construction time) so it reflects the participant's latest
   * locale pick and the freshly-bound canvas. Must be set before start/resume.
   */
  getRuntimeInputs: (() => FilloutRuntimeInputs) | null = null;

  /**
   * View-provided hook fired when a NEW form item is presented (item id changed), used
   * by the view to move keyboard focus to the freshly-mounted question region. Kept out
   * of the controller because it is a DOM concern (tick + element focus).
   */
  presentFocusHook: (() => void) | null = null;

  constructor(
    private readonly data: FilloutPageData,
    services: Partial<FilloutServiceBag> = {}
  ) {
    this.services = { ...defaultServiceBag(), ...services };
    this.isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
    this.activeResumeState = data.resumeState ?? undefined;
    this.crossDeviceNotice = data.crossDeviceResumeUnavailable ?? false;
  }

  // --- Derived / presentational reads ----------------------------------------

  /**
   * Flatten the completed session's variable snapshot into the plain record the
   * CompletionScreen / E-FEEDBACK-3 report page consume.
   */
  get completedVariables(): Record<string, unknown> {
    return Object.fromEntries(
      (this.completedSession?.variables ?? []).map((v) => [v.variableId, v.value])
    );
  }

  get activeItem() {
    return this.activePresentation
      ? {
          ...this.activePresentation.item,
          category: this.activePresentation.category,
          config: this.activePresentation.config,
        }
      : null;
  }

  get canAdvance(): boolean {
    return (
      !this.activePresentation ||
      !this.activePresentation.interactive ||
      !this.activePresentation.required ||
      this.hasAnswered
    );
  }

  // --- FormQuestionHost bridge (runtime → overlay state) ---------------------
  readonly formHost: FormQuestionHost = {
    present: (presentation) => {
      this.currentValue = presentation.initialValue;
      this.hasAnswered =
        presentation.initialValue !== undefined && presentation.initialValue !== null;
      this.activePresentation = presentation;
      // Fire the view's focus hook only when the item actually changed — re-presents
      // (e.g. validation re-render) must not steal focus from a module's inner input.
      const changed = presentation.item.id !== this.lastPresentedItemId;
      this.lastPresentedItemId = presentation.item.id;
      if (changed) this.presentFocusHook?.();
    },
    clear: () => {
      this.activePresentation = null;
      this.currentValue = undefined;
      this.hasAnswered = false;
      this.timerState = null;
    },
    updateTimer: (state) => {
      this.timerState = state;
    },
    getCurrentValue: () => this.currentValue,
  };

  /**
   * Update the participant progress readout from a newly presented item (F-7). Driven
   * by the runtime's `onQuestionPresented` callback, so it advances for WebGL reaction
   * stimuli too (the indicator lives in the page chrome, not the form card).
   *
   * Page-based and MONOTONIC: `current` is the furthest page ordinal reached, so
   * back-navigation or a flow loop revisiting an earlier page never makes the bar
   * regress. When the total is known, `current` is clamped to it so the bar can never
   * read over 100%.
   */
  recordItemProgress(event: { pageIndex: number }): void {
    if (this.progressTotal === undefined) {
      this.progressTotal = computeProgressTotal(this.data.questionnaire.definition);
    }
    const total = this.progressTotal;
    const reached = Math.max(this.progress?.current ?? 0, event.pageIndex + 1);
    this.progress = {
      current: total !== null ? Math.min(reached, total) : reached,
      total,
    };
  }

  handleOverlayResponse(value: unknown) {
    this.currentValue = value;
    this.hasAnswered =
      value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);
  }

  submitOverlayAnswer() {
    const presentation = this.activePresentation;
    if (!presentation) return;
    if (presentation.interactive && presentation.required && !this.hasAnswered) return;
    presentation.onSubmit(this.currentValue);
  }

  // --- Lifecycle wiring -------------------------------------------------------

  /** Track online/offline transitions (the view forwards window events here). */
  setOffline(offline: boolean) {
    this.isOffline = offline;
  }

  /** Construct + start the upload-sync engine (call once, on mount). */
  startSyncEngine(): void {
    this.syncEngine = this.services.makeSyncEngine({
      onSyncStart: () => {
        this.syncStatus = 'syncing';
      },
      onSyncComplete: (result) => {
        const failed = result.errors.length > 0;
        this.syncStatus = failed ? 'error' : 'synced';
        // A clean drain is the anchor for the "last synced" readout (E-OFF-6).
        if (!failed) {
          this.lastSyncedAt = Date.now();
        }
        // Refresh the pending/dead-letter tallies now that records drained.
        void this.refreshSyncStats();
        // Reset the transient status chip after a bit (the persistent panel keeps
        // showing the honest pending/last-synced state independently).
        setTimeout(() => {
          this.syncStatus = 'idle';
        }, 3000);
      },
    });
    this.syncEngine.start();
    // Seed the pending count from the ledger (survives reloads) and keep it live so
    // newly-persisted answers show up in the panel even without a sync round-trip.
    void this.refreshSyncStats();
    if (typeof setInterval !== 'undefined') {
      this.statsTimer = setInterval(() => void this.refreshSyncStats(), 4000);
    }
  }

  /** Whether a sync drain is currently in flight (drives the panel spinner). */
  get isSyncing(): boolean {
    return this.syncStatus === 'syncing';
  }

  /**
   * Refresh the connectivity-UX tallies from the SyncLedger (E-OFF-6). Best-effort:
   * a read failure leaves the last-known counts in place rather than flapping to zero.
   */
  async refreshSyncStats(): Promise<void> {
    try {
      // F-53: scope the panel tallies to THIS questionnaire's sessions. The sync engine
      // still drains every session globally — only the DISPLAYED count is per-study, so a
      // dead-letter session for an unrelated/deleted questionnaire can't keep showing "N
      // answers could not be submitted" on every /q/* load.
      const scoped = await this.currentQuestionnaireSessionIds();
      const stats = await SyncLedger.statsForSessions(scoped);
      this.pendingCount = stats.pending;
      this.deadletterCount = stats.deadletter;

      // Orphaned dead-letter sessions (belong to a different / no-longer-present study)
      // become the one-time dead-study affordance rather than an eternal banner count.
      const dead = await SyncLedger.deadletterSessionIds();
      this.deadStudySessionIds = [...dead].filter((id) => !scoped.has(id));
      this.deadStudyCount = this.deadStudySessionIds.length;
    } catch {
      // Non-critical: the panel keeps its last-known counts.
    }
  }

  /**
   * Session ids belonging to the CURRENT questionnaire (F-53): every locally-tracked
   * session for this questionnaire id, plus the active session (an online-created session
   * has no local `filloutSessions` row, but its ledger rows are still this study's).
   */
  private async currentQuestionnaireSessionIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    try {
      const qid = this.data.questionnaire.id;
      if (qid) {
        const rows = await db.filloutSessions.where('questionnaireId').equals(qid).toArray();
        for (const row of rows) ids.add(row.id);
      }
    } catch {
      // Unreadable session table — leave the set as-is (active session still included below).
    }
    if (this.session?.id) ids.add(this.session.id);
    return ids;
  }

  /** Dismiss the dead-study notice for this page view (F-53). */
  dismissDeadStudyNotice(): void {
    this.deadStudyDismissed = true;
  }

  /**
   * Discard (crypto-erase) the unsubmittable answers of previous studies on this device
   * (F-53): the sessions whose dead-letter records don't belong to the current
   * questionnaire. Force-deletes each session's records + encryption key + ledger rows —
   * intentional, irreversible loss, so the caller MUST confirm and offer export first.
   */
  async discardDeadStudies(): Promise<void> {
    const ids = this.deadStudySessionIds.slice();
    for (const id of ids) {
      await db.purgeSessionCompletely(id).catch(() => {});
    }
    this.deadStudySessionIds = [];
    this.deadStudyCount = 0;
    this.deadStudyDismissed = true;
    await this.refreshSyncStats();
  }

  /**
   * Manual "Sync now" (E-OFF-6 step 2). No-op while offline; otherwise drains the
   * upload queue and refreshes the tallies. The engine serializes concurrent drains
   * under a cross-tab lock, so a double-tap is safe.
   */
  async manualSync(): Promise<void> {
    if (!this.syncEngine || this.isOffline) return;
    try {
      await this.syncEngine.syncNow();
    } finally {
      await this.refreshSyncStats();
    }
  }

  // --- Explicit offline provisioning (F-21 / R2-6) ---------------------------

  /** Dismiss the honest cross-device resume notice (F-10). */
  dismissCrossDeviceNotice(): void {
    this.crossDeviceNotice = false;
  }

  /**
   * Recompute the welcome screen's offline-readiness badge from Cache-API membership
   * (F-21). Zero network, no persisted flag: a reload after a full prefetch reads back
   * `ready`. Only meaningful before a session starts, so it leaves an in-flight
   * `preparing` state untouched.
   */
  async refreshOfflineReadiness(): Promise<void> {
    if (this.offlinePrep === 'preparing') return;
    try {
      const readiness = await this.services.content.checkOfflineReadiness(
        this.data.questionnaire.definition as unknown as Record<string, unknown>
      );
      this.offlinePrepTotal = readiness.total;
      this.offlinePrepDone = readiness.cached;
      this.offlinePrep = readiness.ready ? 'ready' : this.offlinePrep === 'idle' ? 'idle' : 'partial';
    } catch {
      // Non-critical: leave the affordance in its last state.
    }
  }

  /**
   * Explicit "Prepare offline" action (F-21). Ensures the app shell is provisioned (best
   * effort), then prefetches every media asset a full run needs through the same-origin
   * proxy into the media Cache-API bucket, reporting "N of M" progress. The definition
   * snapshot is already cached by the load path. Confirms a `ready` state, or honestly
   * reports a partial / over-quota / failed outcome the participant can act on.
   */
  async prepareOffline(): Promise<void> {
    if (this.offlinePrep === 'preparing') return;
    this.offlinePrep = 'preparing';
    this.offlinePrepDone = 0;
    this.offlinePrepTotal = 0;
    try {
      await this.ensureAppShellCached();
      const q = this.data.questionnaire;
      const readiness = await this.services.content.prepareOffline(
        q.id,
        {
          major: q.versionMajor ?? 1,
          minor: q.versionMinor ?? 0,
          patch: q.versionPatch ?? 0,
        },
        q.definition as unknown as Record<string, unknown>,
        {
          onProgress: (done, total) => {
            this.offlinePrepDone = done;
            this.offlinePrepTotal = total;
          },
        }
      );
      this.offlinePrepTotal = readiness.total;
      this.offlinePrepDone = readiness.cached;
      this.offlinePrep = readiness.quotaExceeded
        ? 'quota-exceeded'
        : readiness.ready
          ? 'ready'
          : 'partial';
    } catch {
      this.offlinePrep = 'error';
    }
  }

  /**
   * Best-effort app-shell provisioning for offline (F-21). When a service worker is already
   * controlling the page its install step has precached the shell, so this is a no-op. When
   * none is registered we register one in production so `/offline.html` + the app shell are
   * available offline; in dev the SW is intentionally kept absent (HMR), so we skip — media
   * still caches via the Cache API without it.
   */
  private async ensureAppShellCached(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (navigator.serviceWorker.controller) return;
    if (import.meta.env.DEV) return;
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    } catch {
      // Non-critical: the media cache does not depend on the shell being present.
    }
  }

  /**
   * Bootstrap from the load data (call once, on mount). Routes completed / resumed /
   * in-progress sessions straight into the runtime, else lands on the welcome screen.
   */
  async initFromLoad(): Promise<void> {
    const data = this.data;
    // Resume short-circuit (E-OFF-1): a completed session routes straight to the
    // completion screen instead of re-running the questionnaire.
    if (data.resumeCompleted) {
      if (data.existingSession) {
        this.session = data.existingSession;
        sessionStorage.setItem('qd_api_session_id', this.session.id);
      }
      // A resumed session that ended as a screen-out (F-20) must reopen on the
      // screened-out screen, not the thank-you. The screen-out blob was persisted to
      // the session metadata at completion time.
      const resumedScreenOut = this.extractScreenOut(data.existingSession?.metadata);
      if (resumedScreenOut) {
        this.screenOut = resumedScreenOut;
        this.screen = 'screened-out';
      } else {
        this.screen = 'complete';
      }
      return;
    }

    if (data.existingSession) {
      this.session = data.existingSession;
      sessionStorage.setItem('qd_api_session_id', this.session.id);
      if (this.session.status === 'in_progress' || this.session.status === 'active') {
        // W-11: resumed sessions bypassed the R2-4 WebGL preflight and dead-ended on
        // a raw renderer error mid-study. Gate here too, so a device that can't run
        // the reaction stimuli lands on the friendly webgl-unsupported screen.
        if (!(await this.ensureWebGLSupported())) return;
        this.screen = 'runtime';
        await this.initializeRuntime();
      }
    } else if (data.resumeSnapshot && data.resumeSessionId) {
      // Offline / anonymous same-device resume (E-OFF-1): continue the SAME session id.
      if (!(await this.ensureWebGLSupported())) return;
      this.session = {
        id: data.resumeSessionId,
        questionnaire_id: data.questionnaire.id,
        status: 'active',
      };
      sessionStorage.setItem('qd_api_session_id', this.session.id);
      this.screen = 'runtime';
      await this.initializeRuntime();
    } else if (data.questionnaire.definition.settings?.requireConsent === false) {
      this.screen = 'welcome';
    }
  }

  async handleStart(): Promise<void> {
    // "Start" is a user gesture — unlock audio here so the no-consent path also
    // satisfies the autoplay policy before any reaction trial (CONTRACT-AUDIO).
    this.ensureAudioUnlocked();

    // WebGL preflight (R2-4): a study containing reaction / webgl stimuli needs a WebGL
    // 2.0 context. Probe here — BEFORE the consent screen and BEFORE any session creation —
    // so a device that can't render the stimuli is turned away honestly instead of
    // dead-ending mid-study on a raw renderer error, and never leaves an orphan session.
    if (!(await this.ensureWebGLSupported())) return;

    if (this.data.questionnaire.definition.settings?.requireConsent) {
      this.screen = 'consent';
    } else {
      await this.createSessionAndStart();
    }
  }

  /**
   * Gate the start flow on WebGL 2.0 availability when the definition contains a v1 WebGL
   * paradigm (R2-4). Returns `true` to proceed; `false` after switching to the dedicated
   * `webgl-unsupported` screen. Zero behavioural change for a questionnaire with no WebGL
   * items — the probe is never consulted, so form-only studies are untouched.
   */
  private async ensureWebGLSupported(): Promise<boolean> {
    // The v1-contract predicate reads the module registry; ensure it is populated first.
    await ensureModulesRegistered();
    if (!definitionNeedsWebGL(this.data.questionnaire.definition)) return true;
    if (!probeWebGL2Support()) {
      this.screen = 'webgl-unsupported';
      this.loading = false;
      return false;
    }
    // F-59 (ADR 0027, enforce): a timing-critical study refuses to run without
    // cross-origin isolation — `performance.now()` is clamped (~100µs) and the
    // sub-ms timing claim cannot be met. Turn the participant away honestly BEFORE
    // any session is created, mirroring the webgl-unsupported gate. In the default
    // `record` posture this branch is skipped: the degradation is stamped into
    // per-trial provenance and the study runs to completion (byte-identical to
    // today for all existing content, which has no `validityPolicy`).
    if (
      this.data.questionnaire.definition.settings?.validityPolicy === 'enforce' &&
      !isCrossOriginIsolated()
    ) {
      this.screen = 'timing-isolation-required';
      this.loading = false;
      return false;
    }
    return true;
  }

  /**
   * "Start over" from the welcome-screen resume choice (E-FLOW-3, FIX-F12): discard the
   * saved position (both the in-memory resumeFrom and the persisted ResumeState), then
   * run the normal start flow.
   */
  async handleStartOver(): Promise<void> {
    this.activeResumeState = undefined;
    if (this.data.resumeStateSessionId) {
      await this.services.offlineSession
        .clearResumeState(this.data.resumeStateSessionId)
        .catch(() => {});
    }
    await this.handleStart();
  }

  async handleConsent(consentData: ConsentData): Promise<void> {
    await this.createSessionAndStart(consentData);
  }

  handleDeclineConsent(): void {
    goto('/');
  }

  async createSessionAndStart(consentData?: ConsentData): Promise<void> {
    const data = this.data;
    try {
      this.loading = true;

      // Fraud prevention checks before session creation. The fingerprint is generated here
      // and sent to the server AT create time (below); server-side fingerprint dedup is
      // reported back via the create response `duplicate` flag rather than a separate
      // read-probe that RLS hides from anonymous callers (slice 2.5).
      const fpSettings = data.questionnaire.definition.settings?.fraudPrevention;
      if (fpSettings && navigator.onLine) {
        const fraudResult = await this.services.fraud.checkAll(data.questionnaire.id, fpSettings);
        this.fraudFingerprint = fraudResult.fingerprint;

        // Cookie/behavior fraud (evaluated locally) can terminate before we create a session.
        if (!fraudResult.passed) {
          if (fpSettings.fraudAction === 'terminate') {
            this.error = fpSettings.fraudMessage || m.fillout_error_fraud_default();
            this.loading = false;
            return;
          } else if (fpSettings.fraudAction === 'redirect' && fpSettings.fraudRedirectUrl) {
            window.location.href = fpSettings.fraudRedirectUrl;
            return;
          }
          // 'flag' action: continue but store the flags in session metadata later
        }
      }

      // Quota gate — runs BEFORE session creation so an over-quota respondent
      // never leaves an orphan session, and so the (un)verified state can be
      // recorded into the create metadata. Evaluated even offline: checkQuotas
      // falls back to the last cached snapshot. When neither live nor cached data
      // exists it returns `unchecked`, and we record `quotaUnchecked` on the session.
      let quotaUnchecked = false;
      this.quotaCellKey = null;
      const quotaGroups = data.questionnaire.definition?.settings?.quotas;
      if (quotaGroups && quotaGroups.length > 0) {
        const urlParams = new Map(Object.entries(data.urlParams ?? {}));
        let quotaResult = await this.services.quota.checkQuotas(
          data.questionnaire.id,
          quotaGroups,
          urlParams
        );
        // A swallowed fetch failure surfaces as `unchecked`; while online, retry once.
        if (quotaResult.unchecked && navigator.onLine) {
          quotaResult = await this.services.quota.checkQuotas(
            data.questionnaire.id,
            quotaGroups,
            urlParams
          );
        }
        if (!quotaResult.allowed) {
          if (quotaResult.action === 'redirect' && quotaResult.redirectUrl) {
            window.location.href = quotaResult.redirectUrl;
            return;
          }
          this.overQuotaMessage = quotaResult.message || m.fillout_over_quota_default();
          this.screen = 'over-quota';
          this.loading = false;
          return;
        }
        quotaUnchecked = quotaResult.unchecked === true;

        // E-FLOW-7: interlocking cross-quota cells. Select the participant's cell from
        // the values known at entry (URL params); if that cell is full, block. Otherwise
        // pin the selected cell key so the server can atomically CLAIM it at completion.
        const cellResult = await this.services.quota.checkCells(
          data.questionnaire.id,
          quotaGroups,
          urlParams
        );
        if (!cellResult.allowed) {
          if (cellResult.action === 'redirect' && cellResult.redirectUrl) {
            window.location.href = cellResult.redirectUrl;
            return;
          }
          this.overQuotaMessage = cellResult.message || m.fillout_over_quota_group();
          this.screen = 'over-quota';
          this.loading = false;
          return;
        }
        this.quotaCellKey = cellResult.cellKey;
      }

      if (navigator.onLine) {
        if (data.existingSession) {
          // Resume the in-flight server session addressed by ?sid= (already non-completed).
          this.session = data.existingSession;
        } else {
          // Create a fresh server session. The version pin + fingerprint + consent/urlParams
          // all go in the CREATE request so the server can record the exact version and dedup
          // by fingerprint atomically.
          const metadata: Record<string, unknown> = {
            device_info: this.services.offlineSession.getDeviceInfo(),
          };
          if (consentData) {
            metadata.consent = { ...consentData, timestamp: new Date().toISOString() };
          }
          if (data.urlParams && Object.keys(data.urlParams).length > 0) {
            metadata.urlParams = data.urlParams;
          }
          if (this.fraudFingerprint) {
            metadata.fingerprint = this.fraudFingerprint;
          }
          if (quotaUnchecked) {
            metadata.quotaUnchecked = true;
          }
          if (this.quotaCellKey) {
            // E-FLOW-7: pin the interlocking cell so the server atomically claims it.
            metadata.quotaCell = { key: this.quotaCellKey };
          }

          const created = await api.sessions.create({
            questionnaireId: data.questionnaire.id,
            participantId: data.participantId || undefined,
            versionMajor: data.questionnaire.versionMajor ?? 1,
            versionMinor: data.questionnaire.versionMinor ?? 0,
            versionPatch: data.questionnaire.versionPatch ?? 0,
            metadata,
            // E-FLOW-2: bind this session to its series enrollment so the wave
            // prompt resolves back to it in the dataset.
            resumeToken: data.seriesToken ?? undefined,
          });
          this.session = created;
          // E-FLOW-6: seed counterbalancing + between-subjects assignment from the server's
          // atomic allocation (returned by create).
          this.participantNumber = created.participantNumber;
          this.serverAssignment = created.assignedCondition
            ? {
                condition: created.assignedCondition,
                conditionIndex: created.assignedConditionIndex ?? 0,
              }
            : undefined;
          // A brand-new session id — a resumeFrom captured against a prior local session
          // must NOT be applied here (it would restore an unrelated cursor/variables).
          this.activeResumeState = undefined;

          // Server-side fingerprint dedup (slice 2.5): react to the typed `duplicate`
          // flag api.sessions.create() surfaces from the create response.
          if (fpSettings?.preventDuplicates && created.duplicate === true) {
            if (fpSettings.fraudAction === 'terminate') {
              this.error = fpSettings.fraudMessage || m.fillout_error_fraud_default();
              this.loading = false;
              return;
            } else if (fpSettings.fraudAction === 'redirect' && fpSettings.fraudRedirectUrl) {
              window.location.href = fpSettings.fraudRedirectUrl;
              return;
            }
            // 'flag' action: continue; the server already recorded the fingerprint + flag.
          }
        }

        // Persist a durable LOCAL pin row for the online session so version GC /
        // media eviction can see the version it runs against, and so it can be
        // resumed offline. Fire-and-forget; failure only loses the local pin.
        if (this.session?.id) {
          await this.services.offlineSession
            .recordServerSession({
              id: this.session.id,
              questionnaireId: data.questionnaire.id,
              versionMajor: data.questionnaire.versionMajor ?? 1,
              versionMinor: data.questionnaire.versionMinor ?? 0,
              versionPatch: data.questionnaire.versionPatch ?? 0,
              participantId: data.participantId || undefined,
            })
            .catch(() => {});
        }
      } else {
        // Offline: create session locally, pinning the version it started against.
        const offlineMetadata: Record<string, unknown> = {};
        if (consentData) {
          offlineMetadata.consent = { ...consentData, timestamp: new Date().toISOString() };
        }
        if (quotaUnchecked) {
          offlineMetadata.quotaUnchecked = true;
        }
        if (this.quotaCellKey) {
          offlineMetadata.quotaCell = { key: this.quotaCellKey };
        }
        const offlineSession = await this.services.offlineSession.createSession(
          data.questionnaire.id,
          data.questionnaire.versionMajor ?? 1,
          data.questionnaire.versionMinor ?? 0,
          data.questionnaire.versionPatch ?? 0,
          data.participantId || undefined,
          Object.keys(offlineMetadata).length > 0 ? offlineMetadata : undefined,
          this.services.offlineSession.getDeviceInfo()
        );
        this.session = {
          id: offlineSession.id,
          questionnaire_id: offlineSession.questionnaireId,
          status: 'active',
        };
        // Brand-new offline session — drop any prior-session resumeFrom (see above).
        this.activeResumeState = undefined;
      }

      sessionStorage.setItem('qd_api_session_id', this.session.id);

      this.screen = 'runtime';
      this.loading = false;
      await tick();
      await this.initializeRuntime();
    } catch (err) {
      console.error('Failed to create session:', err);
      this.error = err instanceof Error ? err.message : m.fillout_error_start_failed();
    } finally {
      this.loading = false;
    }
  }

  /**
   * Build the injected SERVER-COMPUTED VARIABLE snapshot map from the version-pinned
   * aggregates cached by +page.ts (server-computed-variable / E-FEEDBACK-3). ZERO
   * network on this path — the read side.
   */
  private async buildServerVariableSnapshots(
    definition: FilloutDefinition,
    questionnaireId: string,
    version: { major: number; minor: number; patch: number }
  ): Promise<Record<string, ServerVariableSnapshot>> {
    const declared = collectServerVariables({ variables: definition.variables ?? [] });
    if (declared.length === 0) return {};

    const exactKey = filloutDefinitionKey(
      questionnaireId,
      version.major,
      version.minor,
      version.patch
    );
    let exactById = new Map<string, FilloutServerVariable>();
    try {
      const exactRows = await db.filloutServerVariables
        .where('definitionKey')
        .equals(exactKey)
        .toArray();
      exactById = new Map(exactRows.map((r) => [r.variableId, r]));
    } catch {
      return {};
    }

    let crossVersion: FilloutServerVariable[] | null = null;
    const now = Date.now();
    const out: Record<string, ServerVariableSnapshot> = {};
    for (const v of declared) {
      if (!v.server) continue;
      let row = exactById.get(v.id);
      if (!row) {
        // Cross-version fallback: only a byte-identical declaration is safe to reuse.
        const localHash = declHash(v.server);
        if (!crossVersion) {
          try {
            crossVersion = await db.filloutServerVariables
              .where('questionnaireId')
              .equals(questionnaireId)
              .toArray();
          } catch {
            crossVersion = [];
          }
        }
        row = crossVersion.find(
          (r) =>
            r.definitionKey !== exactKey &&
            r.declHash === localHash &&
            (r.variableId === v.id || r.name === v.name)
        );
      }
      if (!row) continue;

      const staleAfterMs =
        typeof v.server.staleAfterMs === 'number'
          ? v.server.staleAfterMs
          : SERVER_VAR_DEFAULT_STALE_MS;
      const computedMs = Date.parse(row.computedAt);
      out[v.id] = {
        n: row.n,
        stats: row.stats,
        computedAt: row.computedAt,
        stale: Number.isFinite(computedMs) ? now - computedMs > staleAfterMs : false,
      };
    }
    return out;
  }

  async initializeRuntime(): Promise<void> {
    try {
      this.loading = true;

      // Retry-safe (R2-5): dispose any runtime left over from a prior failed attempt
      // (e.g. a media-preload retry) before rebuilding, so the retry never leaks the
      // half-constructed runtime/renderer. No-op on the first call — runtime is null.
      this.runtime?.dispose();
      this.runtime = null;

      // Modules must be registered before the runtime can resolve question types.
      // Awaiting the shared, idempotent promise here guarantees a populated registry
      // for both the resumed path and createSessionAndStart. Kept INSIDE the try so a
      // registration rejection surfaces the error screen instead of a blank runtime.
      await ensureModulesRegistered();

      const inputs = this.getRuntimeInputs?.();
      if (!inputs) {
        throw new Error('Runtime inputs are not available');
      }

      // Kick device qualification for the timing banner (no-op unless this
      // questionnaire contains a reaction paradigm). Shared + cached.
      this.beginTimingQualification(inputs.hasReactionQuestion);

      let canvas = inputs.canvas;
      if (!canvas) {
        await tick();
        canvas = this.getRuntimeInputs?.()?.canvas;
        if (!canvas) {
          throw new Error('Runtime canvas is not ready');
        }
      }

      // No page-level WebGLRenderer (CONTRACT-LAZY, Slice 4.6): the runtime owns the
      // single renderer and creates it lazily — only if a WebGL item is reached.
      this.loadingMessage = m.fillout_loading_default();

      // Fetch condition counts (online only)
      if (navigator.onLine) {
        try {
          const counts = await api.questionnaires.conditionCounts(this.data.questionnaire.id);
          if (counts) {
            this.conditionGroupCounts = Object.values(counts).map(Number);
          }
        } catch {
          // Non-critical
        }
      }

      // Server-computed variables (server-computed-variable / E-FEEDBACK-3): one Dexie
      // read of the version-pinned aggregates, materialized OFFLINE into the one
      // VariableEngine at construction so flow / piping / quotas / feedback resolve
      // them with zero fetch on the read path.
      const serverVariables = await this.buildServerVariableSnapshots(
        inputs.rawDefinition,
        this.data.questionnaire.id,
        {
          major: this.data.questionnaire.versionMajor ?? 1,
          minor: this.data.questionnaire.versionMinor ?? 0,
          patch: this.data.questionnaire.versionPatch ?? 0,
        }
      );

      const built = await this.services.makeRuntime({
        canvas,
        questionnaire: inputs.definition,
        sessionId: this.session.id,
        participantId: this.data.participantId || undefined,
        participantNumber: this.participantNumber,
        conditionGroupCounts: this.conditionGroupCounts,
        serverAssignment: this.serverAssignment,
        // E-FLOW-2: expose the series wave + elapsed days to branching
        // (`_waveIndex` / `_seriesElapsedDays`) when opened from a reminder link.
        seriesContext: this.data.seriesPrompt
          ? {
              waveIndex: this.data.seriesPrompt.wave_index,
              seriesElapsedDays: this.data.seriesPrompt.series_elapsed_days,
            }
          : undefined,
        formHost: this.formHost,
        enableOfflineSync: true,
        serverVariables,
        // Resumable sessions (E-OFF-1): rehydrate prior answers + variable state.
        resumeSnapshot: this.data.resumeSnapshot ?? undefined,
        resumeFromDevice: this.data.resumeFromDevice,
        // True save-and-continue (E-FLOW-3, FIX-F12): restore the exact cursor / loop
        // counters / variable context and jump straight to the captured page.
        resumeFrom: this.activeResumeState ?? undefined,
        onComplete: (completed) => {
          void this.handleComplete(completed);
        },
        onSessionUpdate: (progress) => {
          if (this.loading) {
            this.loadingProgress = progress;
            this.loadingMessage = m.fillout_loading_media({ percent: Math.round(progress * 2) });
          }
        },
        // A11y (F094/F098): announce every presented item — including WebGL reaction
        // stimuli, which fire this before the category switch and never reach the overlay.
        onQuestionPresented: (event) => {
          this.liveAnnouncement = buildQuestionAnnouncement(event, inputs.questionList);
          this.recordItemProgress(event);
        },
      });

      // W-5: the page may have unmounted while makeRuntime was in flight. dispose()
      // ran with this.runtime still null, so tear down the just-built runtime here
      // rather than leaking its WebGL context + spinning rAF loop.
      if (this.isDisposed) {
        built.dispose();
        return;
      }
      this.runtime = built;

      // E-FLOW-7: expose the interlocking quota cell + eligibility as flow variables.
      this.runtime.setFlowVariable('_quotaCell', this.quotaCellKey ?? '');
      this.runtime.setFlowVariable('_eligible', true);

      this.loadingMessage = m.fillout_loading_starting();
      await this.runtime.start();
      // Unmounted during start(): dispose the runtime we just started (W-5).
      if (this.isDisposed) {
        this.runtime?.dispose();
        this.runtime = null;
        return;
      }
      this.loading = false;

      // Resume toast (E-OFF-1): confirm we rehydrated at the right spot.
      if (this.data.resumeSnapshot) {
        const restored = this.data.resumeSnapshot.responses.length;
        const total = inputs.questionList.length || restored;
        this.resumeNotice = m.fillout_resume_notice({
          current: Math.min(restored + 1, total),
          total,
        });
        setTimeout(() => {
          this.resumeNotice = null;
        }, 6000);
      }
    } catch (err) {
      console.error('Failed to initialize runtime:', err);
      this.loading = false;

      // Belt-and-braces (R2-4): a WebGL context can still fail to construct after a passing
      // probe (context loss, driver blacklisting). Route it to the same honest gate screen
      // rather than dumping the raw "WebGL 2.0 is required" string on the generic error one.
      if (isWebGLUnavailableError(err)) {
        this.screen = 'webgl-unsupported';
        return;
      }

      const rawMessage = err instanceof Error ? err.message : m.fillout_error_start_failed();

      // Media preload failure (R2-5): recoverable. Route to the dedicated retry screen
      // rather than dumping the raw ResourceManager exception into the generic dead-end.
      if (rawMessage.includes('Failed to preload')) {
        const match = /Failed to preload (\d+) resource/.exec(rawMessage);
        this.mediaErrorCount = match ? Number(match[1]) : 0;
        this.mediaErrorDetails = rawMessage;
        this.screen = 'media-error';
        return;
      }

      this.error = rawMessage;
    }
  }

  /**
   * Retry a failed media preload (R2-5). Re-runs the runtime build — which re-attempts
   * the preload step — against the SAME session; the offline-first session model makes
   * this safe (no new session is created, `this.session` is untouched, and any resume
   * snapshot is re-applied), so a transient network blip is recoverable without losing
   * progress. Clears the media-error state and returns to the runtime screen so the
   * loading chrome shows during the re-attempt.
   */
  async retryMediaPreload(): Promise<void> {
    this.mediaErrorCount = 0;
    this.mediaErrorDetails = null;
    this.error = null;
    this.screen = 'runtime';
    await this.initializeRuntime();
  }

  /**
   * The runtime's completion flow: snapshot the completed session, transition to the
   * completion screen, mark fraud-duplicate + offline session complete, trigger sync,
   * and opportunistically GC now that a session finished.
   */
  /**
   * Read a persisted `metadata.screenOut` blob (from a resumed completed session's
   * loosely-typed metadata bag) back into a {@link ScreenOutResult}, or null when the
   * session was a normal completion. F-20.
   */
  private extractScreenOut(metadata: unknown): ScreenOutResult | null {
    const raw =
      metadata && typeof metadata === 'object'
        ? (metadata as { screenOut?: Record<string, unknown> }).screenOut
        : undefined;
    if (!raw || typeof raw !== 'object') return null;
    const reason = typeof raw.reason === 'string' ? raw.reason : 'ineligible';
    return {
      eligible: false,
      ruleId: typeof raw.ruleId === 'string' ? raw.ruleId : undefined,
      reason,
      message: typeof raw.message === 'string' ? raw.message : undefined,
      redirectUrl: typeof raw.redirectUrl === 'string' ? raw.redirectUrl : undefined,
    };
  }

  async handleComplete(completed: QuestionnaireSession): Promise<void> {
    this.completedSession = completed;
    this.savedLocally = true;

    // Eligibility screen-out (F-20): the runtime stamps `metadata.screenOut` when the
    // session ended via a screen-out `terminate` rule or a screener rule. Its presence
    // routes to the dedicated screened-out screen — an ineligible respondent must never
    // see the thank-you (with a completion code they might expect payment for).
    const screenOutMeta = completed.metadata?.screenOut;
    const screenedOut = Boolean(screenOutMeta);
    if (screenOutMeta) {
      this.screenOut = {
        eligible: false,
        ruleId: screenOutMeta.ruleId ?? undefined,
        reason: screenOutMeta.reason,
        message: screenOutMeta.message,
        redirectUrl: screenOutMeta.redirectUrl,
      };
      this.screen = 'screened-out';
    } else {
      this.screen = 'complete';
    }

    // Mark completed for fraud prevention duplicate detection
    this.services.fraud.markCompleted(this.data.questionnaire.id);

    // Mark offline session complete
    await this.services.offlineSession.completeSession(this.session.id).catch(() => {});

    // E-FLOW-2: post completion back so the series advances the enrollment and
    // schedules the next wave. Best-effort — the wave's answers are already
    // persisted via the offline-first write path; a failed callback only delays
    // the next reminder, so it never blocks the completion screen. A screen-out is
    // NOT a wave completion, so it never advances the series.
    if (this.data.seriesToken && !screenedOut) {
      void SeriesEnrollmentService.complete(
        this.data.seriesToken,
        this.session.id,
        this.data.seriesPrompt?.wave_index
      ).catch(() => {});
    }

    // Trigger sync
    this.syncEngine?.syncNow();

    // Opportunistic GC now that a session finished. The just-completed session's
    // definition + media stay protected until its records sync, so this only reclaims
    // already-synced stale versions.
    this.services.content.pruneDefinitions().catch(() => {});
    this.services.content.enforceMediaQuota().catch(() => {});
  }

  private beginTimingQualification(hasReactionQuestion: boolean): void {
    if (!hasReactionQuestion || this.qualification) return;
    // Runs calibration once (shared + cached). The reaction engines resolve the same
    // instance, so this does NOT double-calibrate — it just populates the banner grade
    // in parallel with runtime startup.
    this.services
      .gatekeeper()
      .qualify()
      .then((result) => {
        this.qualification = result;
      })
      .catch(() => {
        // Non-critical: absence of a grade just means no banner.
      });
  }

  /**
   * Shared Web Audio unlock. Created + resumed on a user gesture (welcome start /
   * consent accept) so the browser's document-scoped autoplay policy permits the
   * reaction engine's own AudioContext.resume() when it primes audio pre-trial.
   */
  ensureAudioUnlocked(): void {
    try {
      const Ctor =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- webkit-prefixed fallback
            (window as any).webkitAudioContext;
      if (!Ctor) return;
      if (!this.audioUnlockContext) {
        this.audioUnlockContext = new Ctor();
      }
      if (this.audioUnlockContext && this.audioUnlockContext.state === 'suspended') {
        void this.audioUnlockContext.resume().catch(() => {});
      }
    } catch {
      // Best-effort: audio unlock never blocks participation.
    }
  }

  handleResize(): void {
    // Delegate to the runtime's single owned renderer (Slice 4.6). No-op until that
    // renderer is lazily created — form-only questionnaires never allocate one.
    this.runtime?.resize(window.innerWidth, window.innerHeight);
  }

  // --- Save & exit / clear-this-device (E-OFF-6 step 3, E-OFF-2/E-OFF-3) -------

  /** Public tally of unsynced rows for the Save-&-exit confirmation gate. */
  async getUnsyncedCount(): Promise<number> {
    try {
      const [r, e, v] = await Promise.all([
        db.filloutResponses.where('synced').equals(0).count(),
        db.filloutEvents.where('synced').equals(0).count(),
        db.filloutVariables.where('synced').equals(0).count(),
      ]);
      return r + e + v;
    } catch {
      return 0;
    }
  }

  /** Force a final upload drain before a shared-device exit (no-op while offline). */
  async forceSyncBeforeExit(): Promise<void> {
    if (!this.syncEngine || this.isOffline) return;
    await this.syncEngine.syncNow();
    await this.refreshSyncStats();
  }

  /**
   * Hard wipe of every fillout store on this device (E-OFF-2/E-OFF-3): participant
   * data, cached definitions + media accounting, server-variable aggregates, and — the
   * security payload — the per-session encryption keys, plus the media Cache-API store.
   * Callers MUST gate this behind the Save-&-exit confirmation flow.
   */
  async clearDeviceForHandoff(): Promise<void> {
    await db.clearThisDevice();
    try {
      sessionStorage.removeItem('qd_api_session_id');
    } catch {
      /* no-op */
    }
    this.pendingCount = 0;
    this.deadletterCount = 0;
    this.deadStudyCount = 0;
    this.deadStudySessionIds = [];
  }

  /**
   * Download a JSON snapshot of every UNSYNCED row on this device (E-OFF-5 escape
   * hatch), so a participant clearing a device that can't reach the server can still
   * recover their answers off-device. Browser-only (DOM download); a no-op in SSR.
   */
  async exportUnsyncedData(): Promise<void> {
    if (
      typeof document === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return;
    }
    const snapshot = await OfflineResponsePersistence.exportUnsyncedData();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `qdesigner-unsynced-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  /** Tear down runtime, sync engine, and the audio unlock context (call on unmount). */
  dispose(): void {
    // W-5: mark disposed so an initializeRuntime() still in flight tears down the
    // runtime it builds after this point instead of leaking it.
    this.isDisposed = true;
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    this.runtime?.dispose();
    this.syncEngine?.stop();
    if (this.audioUnlockContext) {
      void this.audioUnlockContext.close().catch(() => {});
      this.audioUnlockContext = null;
    }
  }
}
