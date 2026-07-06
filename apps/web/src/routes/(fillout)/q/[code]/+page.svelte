<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import Spinner from '$lib/components/ui/feedback/Spinner.svelte';
  import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
  import WelcomeScreen from '$lib/fillout/components/WelcomeScreen.svelte';
  import ConsentScreen from '$lib/fillout/components/ConsentScreen.svelte';
  import CompletionScreen from '$lib/fillout/components/CompletionScreen.svelte';
  import { FilloutRuntime } from '$lib/fillout/runtime/FilloutRuntime';
  import ModularRenderer from '$lib/runtime/ModularRenderer.svelte';
  import type { FormQuestionHost, FormHostPresentation } from '$lib/runtime/core/FormQuestionHost';
  import type { ResumeState } from '$lib/runtime/core/ResumeState';
  import type { ConsentData } from '$lib/fillout/types';
  import type { QuestionnaireSession } from '$lib/shared';
  import {
    localizeQuestionnaire,
    resolveText,
    getBaseLocale,
    getAvailableLocales,
    getLocaleLabel,
  } from '$lib/shared';
  import { OfflineSessionService } from '$lib/fillout/services/OfflineSessionService';
  import { FilloutContentCache } from '$lib/fillout/services/FilloutContentCache';
  import { FilloutUploadSync } from '$lib/fillout/services/FilloutUploadSync';
  import { QuotaService } from '$lib/fillout/services/QuotaService';
  import { FraudDetectionService } from '$lib/fillout/services/FraudDetectionService';
  import { api } from '$lib/services/api';
  import { db } from '$lib/services/db/indexeddb';
  import { ensureModulesRegistered } from '$lib/modules/register-all';
  import { TimingGatekeeper } from '$lib/runtime/timing';
  import type { GatekeeperResult } from '$lib/runtime/timing';
  import DeviceQualificationBanner from '$lib/runtime/timing/components/DeviceQualificationBanner.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // --- Content translation (MOD-04, ADR 0022) -------------------------------
  // The definition is a FilloutDefinition (core Questionnaire + the top-level
  // `consent` / `completionMessage` chrome fields the screens below read).
  const rawDefinition = $derived(data.questionnaire.definition);
  const baseLocale = $derived(getBaseLocale(rawDefinition));
  const availableLocales = $derived(getAvailableLocales(rawDefinition));
  // The participant's explicit pick (null until they choose). ?lang= seeds it.
  let pickedLocale = $state<string | null>(null);
  const requestedLocale = $derived(data.urlParams?.lang ?? '');
  const effectiveLocale = $derived(
    pickedLocale && availableLocales.includes(pickedLocale)
      ? pickedLocale
      : requestedLocale && availableLocales.includes(requestedLocale)
        ? requestedLocale
        : baseLocale
  );
  // Definition with question prompts / option labels / page titles localized.
  const definition = $derived(localizeQuestionnaire(rawDefinition, effectiveLocale));
  const languageOptions = $derived(
    availableLocales.map((code) => ({ code, label: getLocaleLabel(rawDefinition, code) }))
  );
  // Chrome strings resolve at the screen boundary (fall back to base text).
  const welcomeMessage = $derived(
    resolveText(rawDefinition, effectiveLocale, { kind: 'chrome', slot: 'welcome' }, '')
  );
  const consentText = $derived(
    resolveText(
      rawDefinition,
      effectiveLocale,
      { kind: 'chrome', slot: 'consent' },
      rawDefinition?.consent?.content || ''
    )
  );
  const completionMessage = $derived(
    resolveText(
      rawDefinition,
      effectiveLocale,
      { kind: 'chrome', slot: 'completion' },
      rawDefinition?.settings?.distribution?.completionMessage ||
        rawDefinition?.completionMessage ||
        ''
    )
  );

  function handleLocaleChange(code: string) {
    pickedLocale = code;
    // Reflect the choice in the address bar (shareable) without re-running load.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', code);
      history.replaceState(history.state, '', url);
    } catch {
      // window/history unavailable — the in-memory pick still drives rendering.
    }
  }

  let container = $state<HTMLDivElement>();
  let canvas = $state<HTMLCanvasElement>();
  // CONTRACT-LAZY (Slice 4.6): the page no longer owns a WebGLRenderer. There is exactly
  // ONE renderer, owned + lazily created by the runtime; the page keeps only the canvas
  // (bound below) and delegates resize to runtime.resize().
  let runtime: FilloutRuntime | null = null;
  let syncEngine: FilloutUploadSync | null = null;
  let loading = $state(false);
  let loadingMessage = $state('Loading questionnaire...');
  let loadingProgress = $state(0);
  let error = $state<string | null>(null);
  let currentScreen = $state<'welcome' | 'consent' | 'runtime' | 'complete' | 'over-quota'>('welcome');
  let overQuotaMessage = $state<string>('');
  // `session` spans three assignment shapes across create / resume / offline paths
  // (camelCase SessionData, snake_case Session DTO, a locally-built offline stub), so
  // it stays loosely typed; normalizing it is runtime-wiring work (F040), out of scope.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session = $state<any>(null);
  let completedSession = $state<QuestionnaireSession | undefined>(undefined);
  let conditionGroupCounts = $state<number[] | undefined>(undefined);

  // Fraud prevention state
  let fraudFingerprint = $state<string | undefined>(undefined);

  // Offline state
  let isOffline = $state(!navigator.onLine);
  let syncStatus = $state<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  let savedLocally = $state(false);

  // Resume state (E-OFF-1): a non-blocking toast confirming the runtime rehydrated at
  // the right question, and a dismiss flag for the pinned-version-unavailable notice.
  let resumeNotice = $state<string | null>(null);
  let pinnedFallbackDismissed = $state(false);

  // True save-and-continue snapshot (E-FLOW-3, FIX-F12). Mutable so a fresh-session create
  // (or an explicit "Start over") can drop it — it must only ever be applied to the SAME
  // session it was captured on, never a brand-new one. `resumeFrom` is passed into the
  // FilloutRuntime config ALONGSIDE resumeSnapshot: hydrate seeds prior answers, resumeFrom
  // restores the exact cursor/loop/variables and jumps to the captured page.
  let activeResumeState = $state<ResumeState | undefined>(data.resumeState ?? undefined);

  // --- Timing qualification (Slice 3.4) -------------------------------------
  // Reaction paradigms depend on frame-exact stimulus onset. The session-wide
  // TimingGatekeeper runs device calibration once; the ReactionEngine reuses
  // that exact measurement (TimingGatekeeper.shared()) for visual-latency
  // compensation, and the banner below surfaces the grade to the participant.
  const REACTION_QUESTION_TYPES = new Set(['reaction-time', 'reaction-experiment']);
  let qualification = $state<GatekeeperResult | null>(null);
  let bannerDismissed = $state(false);

  const questionList = $derived(definition?.questions ?? []);
  const hasReactionQuestion = $derived(
    questionList.some((q) => REACTION_QUESTION_TYPES.has(q?.type))
  );
  // The reaction-experiment paradigm (IAT / Stroop / Flanker / …) is the one that
  // "declares it requires precision timing": its scientific validity hinges on
  // sub-frame onset accuracy, so a red grade there is a hard warning.
  const requiresPrecisionTiming = $derived(
    questionList.some((q) => q?.type === 'reaction-experiment')
  );
  // Warn on yellow/red; green needs no banner (it would just be noise).
  const showTimingBanner = $derived(
    hasReactionQuestion && !bannerDismissed && qualification !== null && qualification.grade !== 'green'
  );
  // Red grade on a precision paradigm: prominent block/warn (participants are not
  // hard-stopped — dead-ending a study is worse — but are strongly cautioned).
  const timingBlocked = $derived(
    hasReactionQuestion && requiresPrecisionTiming && qualification?.grade === 'red'
  );

  // Photosensitivity accommodation (F097). Reaction paradigms alternate high-contrast
  // stimuli at 250-500ms ISIs; we surface the OS reduced-motion preference to STRENGTHEN
  // the advisory copy, but deliberately do NOT slow the ISIs — silently altering stimulus
  // timing per participant would corrupt cross-participant data comparability. The
  // accommodation is informed consent to proceed, not a timing change. Route is ssr=false
  // so window is available; still guard for safety.
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Shared Web Audio unlock. Created + resumed on a user gesture (welcome start /
  // consent accept) so the browser's document-scoped autoplay policy permits the
  // reaction engine's own AudioContext.resume() when it primes audio pre-trial.
  let audioUnlockContext: AudioContext | null = null;
  function ensureAudioUnlocked(): void {
    try {
      const Ctor =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- webkit-prefixed fallback
          : (window as any).webkitAudioContext;
      if (!Ctor) return;
      if (!audioUnlockContext) {
        audioUnlockContext = new Ctor();
      }
      if (audioUnlockContext && audioUnlockContext.state === 'suspended') {
        void audioUnlockContext.resume().catch(() => {});
      }
    } catch {
      // Best-effort: audio unlock never blocks participation.
    }
  }

  function beginTimingQualification(): void {
    if (!hasReactionQuestion || qualification) return;
    // Runs calibration once (shared + cached). The reaction engines resolve the
    // same instance, so this does NOT double-calibrate — it just populates the
    // banner grade in parallel with runtime startup.
    TimingGatekeeper.shared()
      .qualify()
      .then((result) => {
        qualification = result;
      })
      .catch(() => {
        // Non-critical: absence of a grade just means no banner.
      });
  }

  // HTML-overlay form rendering (ADR 0018: hybrid fillout rendering contract).
  // The runtime mounts per-module runtime Svelte components here for form-style
  // questions and instruction/display items; reaction-time paradigms stay on WebGL.
  let activePresentation = $state<FormHostPresentation | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- captured value spans every module answer shape
  let currentValue = $state<any>(undefined);
  let hasAnswered = $state(false);

  const activeItem = $derived(
    activePresentation
      ? {
          ...activePresentation.item,
          category: activePresentation.category,
          config: activePresentation.config,
        }
      : null
  );

  const canAdvance = $derived(
    !activePresentation || !activePresentation.interactive || !activePresentation.required || hasAnswered
  );

  const formHost: FormQuestionHost = {
    present(presentation) {
      currentValue = presentation.initialValue;
      hasAnswered = presentation.initialValue !== undefined && presentation.initialValue !== null;
      activePresentation = presentation;
    },
    clear() {
      activePresentation = null;
      currentValue = undefined;
      hasAnswered = false;
    },
  };

  function handleOverlayResponse(value: unknown) {
    currentValue = value;
    hasAnswered = value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);
  }

  function submitOverlayAnswer() {
    const presentation = activePresentation;
    if (!presentation) return;
    if (presentation.interactive && presentation.required && !hasAnswered) return;
    presentation.onSubmit(currentValue);
  }

  // Initialize on mount
  onMount(() => {
    // Track online/offline
    const handleOnline = () => { isOffline = false; };
    const handleOffline = () => { isOffline = true; };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Start sync engine
    syncEngine = new FilloutUploadSync({
      onSyncStart: () => { syncStatus = 'syncing'; },
      onSyncComplete: (result) => {
        syncStatus = result.errors.length > 0 ? 'error' : 'synced';
        // Reset after a bit
        setTimeout(() => { syncStatus = 'idle'; }, 3000);
      },
    });
    syncEngine.start();

    const init = async () => {
      // Resume short-circuit (E-OFF-1): a session that already completed routes straight
      // to the completion screen instead of re-running the questionnaire.
      if (data.resumeCompleted) {
        if (data.existingSession) {
          session = data.existingSession;
          sessionStorage.setItem('qd_api_session_id', session.id);
        }
        currentScreen = 'complete';
        return;
      }

      if (data.existingSession) {
        session = data.existingSession;
        sessionStorage.setItem('qd_api_session_id', session.id);
        if (session.status === 'in_progress' || session.status === 'active') {
          currentScreen = 'runtime';
          await initializeRuntime();
        }
      } else if (data.resumeSnapshot && data.resumeSessionId) {
        // Offline / anonymous same-device resume (E-OFF-1): the server did not return an
        // `existingSession` (no network, or the API won't hand an anonymous participant
        // their session), but IndexedDB holds this session's answers. Continue the SAME
        // session id — not a fresh one — so restored + new responses stay coherent.
        session = {
          id: data.resumeSessionId,
          questionnaire_id: data.questionnaire.id,
          status: 'active',
        };
        sessionStorage.setItem('qd_api_session_id', session.id);
        currentScreen = 'runtime';
        await initializeRuntime();
      } else if (data.questionnaire.definition.settings?.requireConsent === false) {
        currentScreen = 'welcome';
      }
    };

    init();

    return () => {
      runtime?.dispose();
      syncEngine?.stop();
      if (audioUnlockContext) {
        void audioUnlockContext.close().catch(() => {});
        audioUnlockContext = null;
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.body.classList.remove('fillout');
      sessionStorage.removeItem('qd_api_session_id');
    };
  });

  async function handleStart() {
    // "Start" is a user gesture — unlock audio here so the no-consent path also
    // satisfies the autoplay policy before any reaction trial (CONTRACT-AUDIO).
    ensureAudioUnlocked();
    if (data.questionnaire.definition.settings?.requireConsent) {
      currentScreen = 'consent';
    } else {
      await createSessionAndStart();
    }
  }

  // "Start over" from the welcome-screen resume choice (E-FLOW-3, FIX-F12): discard the
  // saved position (both the in-memory resumeFrom and the persisted ResumeState) so this
  // and any future reload begin cleanly at index 0, then run the normal start flow. The
  // fresh-create branches in createSessionAndStart mint a new session id, so no prior
  // answers are hydrated — a true restart.
  async function handleStartOver() {
    activeResumeState = undefined;
    if (data.resumeStateSessionId) {
      await OfflineSessionService.clearResumeState(data.resumeStateSessionId).catch(() => {});
    }
    await handleStart();
  }

  async function handleConsent(consentData: ConsentData) {
    await createSessionAndStart(consentData);
  }

  async function handleDeclineConsent() {
    goto('/');
  }

  async function createSessionAndStart(consentData?: ConsentData) {
    try {
      loading = true;

      // Fraud prevention checks before session creation. The fingerprint is generated here
      // and sent to the server AT create time (below); server-side fingerprint dedup is
      // reported back via the create response `duplicate` flag rather than a separate
      // read-probe that RLS hides from anonymous callers (slice 2.5).
      const fpSettings = data.questionnaire.definition.settings?.fraudPrevention;
      if (fpSettings && navigator.onLine) {
        const fraudResult = await FraudDetectionService.checkAll(
          data.questionnaire.id,
          fpSettings
        );
        fraudFingerprint = fraudResult.fingerprint;

        // Cookie/behavior fraud (evaluated locally) can terminate before we create a session.
        if (!fraudResult.passed) {
          if (fpSettings.fraudAction === 'terminate') {
            error = fpSettings.fraudMessage || 'This survey is not available for your submission.';
            loading = false;
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
      // falls back to the last cached snapshot (dropping the old `navigator.onLine`
      // gate). When neither live nor cached data exists it returns `unchecked`,
      // and we record `quotaUnchecked` on the session instead of silently allowing.
      let quotaUnchecked = false;
      const quotaGroups = data.questionnaire.definition?.settings?.quotas;
      if (quotaGroups && quotaGroups.length > 0) {
        const urlParams = new Map(Object.entries(data.urlParams ?? {}));
        let quotaResult = await QuotaService.checkQuotas(
          data.questionnaire.id,
          quotaGroups,
          urlParams
        );
        // A swallowed fetch failure surfaces as `unchecked`; while online, retry once.
        if (quotaResult.unchecked && navigator.onLine) {
          quotaResult = await QuotaService.checkQuotas(
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
          overQuotaMessage = quotaResult.message || 'This study has reached its target number of participants.';
          currentScreen = 'over-quota';
          loading = false;
          return;
        }
        quotaUnchecked = quotaResult.unchecked === true;
      }

      if (navigator.onLine) {
        if (data.existingSession) {
          // Resume the in-flight server session addressed by ?sid= (already non-completed).
          session = data.existingSession;
        } else {
          // Create a fresh server session. The version pin + fingerprint + consent/urlParams
          // all go in the CREATE request so the server can (a) record the exact version this
          // session ran against (slice 2.2) and (b) dedup by fingerprint atomically (slice 2.5).
          const metadata: Record<string, unknown> = {
            device_info: OfflineSessionService.getDeviceInfo(),
          };
          if (consentData) {
            metadata.consent = { ...consentData, timestamp: new Date().toISOString() };
          }
          if (data.urlParams && Object.keys(data.urlParams).length > 0) {
            metadata.urlParams = data.urlParams;
          }
          if (fraudFingerprint) {
            metadata.fingerprint = fraudFingerprint;
          }
          if (quotaUnchecked) {
            metadata.quotaUnchecked = true;
          }

          const created = await api.sessions.create({
            questionnaireId: data.questionnaire.id,
            participantId: data.participantId || undefined,
            versionMajor: data.questionnaire.versionMajor ?? 1,
            versionMinor: data.questionnaire.versionMinor ?? 0,
            versionPatch: data.questionnaire.versionPatch ?? 0,
            metadata,
          });
          session = created;
          // A brand-new session id — a resumeFrom captured against a prior local session
          // must NOT be applied here (it would restore an unrelated cursor/variables).
          activeResumeState = undefined;

          // Server-side fingerprint dedup (slice 2.5): react to the typed `duplicate`
          // flag api.sessions.create() surfaces from the create response.
          if (fpSettings?.preventDuplicates && created.duplicate === true) {
            if (fpSettings.fraudAction === 'terminate') {
              error = fpSettings.fraudMessage || 'This survey is not available for your submission.';
              loading = false;
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
        // resumed offline. Online sessions otherwise have no filloutSessions row
        // (the recurring trap). Fire-and-forget; failure only loses the local pin.
        if (session?.id) {
          await OfflineSessionService.recordServerSession({
            id: session.id,
            questionnaireId: data.questionnaire.id,
            versionMajor: data.questionnaire.versionMajor ?? 1,
            versionMinor: data.questionnaire.versionMinor ?? 0,
            versionPatch: data.questionnaire.versionPatch ?? 0,
            participantId: data.participantId || undefined,
          }).catch(() => {});
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
        const offlineSession = await OfflineSessionService.createSession(
          data.questionnaire.id,
          data.questionnaire.versionMajor ?? 1,
          data.questionnaire.versionMinor ?? 0,
          data.questionnaire.versionPatch ?? 0,
          data.participantId || undefined,
          Object.keys(offlineMetadata).length > 0 ? offlineMetadata : undefined,
          OfflineSessionService.getDeviceInfo(),
        );
        session = {
          id: offlineSession.id,
          questionnaire_id: offlineSession.questionnaireId,
          status: 'active',
        };
        // Brand-new offline session — drop any prior-session resumeFrom (see above).
        activeResumeState = undefined;
      }

      sessionStorage.setItem('qd_api_session_id', session.id);

      currentScreen = 'runtime';
      loading = false;
      await tick();
      await initializeRuntime();
    } catch (err) {
      console.error('Failed to create session:', err);
      error = err instanceof Error ? err.message : 'Failed to start questionnaire';
    } finally {
      loading = false;
    }
  }

  async function initializeRuntime() {
    try {
      loading = true;

      // Modules must be registered before the runtime can resolve question types.
      // On a resumed session this is invoked directly from onMount (fire-and-forget)
      // and can win the race against the root layout's un-awaited registration; an
      // empty registry previously made QuestionnaireRuntime.showCurrentItem silently
      // skip every item (Slice 1.8). Awaiting the shared, idempotent promise here
      // guarantees a populated registry for both the resumed path and
      // createSessionAndStart. Kept INSIDE the try so a registration rejection
      // surfaces the error screen instead of stranding the participant on a blank
      // runtime (the resumed path has no outer try/catch).
      await ensureModulesRegistered();

      // Kick device qualification for the timing banner (no-op unless this
      // questionnaire contains a reaction paradigm). Shared + cached, so the
      // reaction engines reuse the same result without re-calibrating.
      beginTimingQualification();

      if (!canvas) {
        await tick();
        if (!canvas) {
          throw new Error('Runtime canvas is not ready');
        }
      }

      // No page-level WebGLRenderer (CONTRACT-LAZY, Slice 4.6): the runtime owns the
      // single renderer and creates it lazily — only if a WebGL item is reached — so a
      // form-only questionnaire never calls getContext('webgl2').
      loadingMessage = 'Loading questionnaire...';

      // Fetch condition counts (online only)
      if (navigator.onLine) {
        try {
          const counts = await api.questionnaires.conditionCounts(data.questionnaire.id);
          if (counts) {
            conditionGroupCounts = Object.values(counts).map(Number);
          }
        } catch {
          // Non-critical
        }
      }

      runtime = new FilloutRuntime({
        canvas,
        questionnaire: definition,
        sessionId: session.id,
        participantId: data.participantId || undefined,
        conditionGroupCounts,
        formHost,
        enableOfflineSync: true,
        // Resumable sessions (E-OFF-1): rehydrate prior answers + variable state so the
        // runtime resumes at the first unanswered item rather than restarting at zero.
        resumeSnapshot: data.resumeSnapshot ?? undefined,
        resumeFromDevice: data.resumeFromDevice,
        // True save-and-continue (E-FLOW-3, FIX-F12): restore the exact cursor / loop
        // counters / variable context and jump straight to the captured page —
        // complementary to resumeSnapshot, which seeds prior answers. Undefined ⇒ the
        // E-OFF-1 answer-cursor resume alone (fresh starts clear activeResumeState below).
        resumeFrom: activeResumeState ?? undefined,
        onComplete: async (completed) => {
          completedSession = completed;
          currentScreen = 'complete';
          savedLocally = true;

          // Mark completed for fraud prevention duplicate detection
          FraudDetectionService.markCompleted(data.questionnaire.id);

          // Mark offline session complete
          await OfflineSessionService.completeSession(session.id).catch(() => {});

          // Trigger sync
          syncEngine?.syncNow();

          // Opportunistic GC now that a session finished. The just-completed session's
          // definition + media stay protected until its records sync (protectedVersionKeys
          // covers unsynced sessions), so this only reclaims already-synced stale versions.
          FilloutContentCache.pruneDefinitions().catch(() => {});
          FilloutContentCache.enforceMediaQuota().catch(() => {});
        },
        onSessionUpdate: (progress) => {
          if (loading) {
            loadingProgress = progress;
            loadingMessage = `Loading media resources... ${Math.round(progress * 2)}%`;
          }
        },
      });

      loadingMessage = 'Starting questionnaire...';
      await runtime.start();
      loading = false;

      // Resume toast (E-OFF-1): confirm we rehydrated at the right spot. N is the first
      // unanswered question (restored count + 1) of the total.
      if (data.resumeSnapshot) {
        const restored = data.resumeSnapshot.responses.length;
        const total = questionList.length || restored;
        resumeNotice = `Resuming where you left off (question ${Math.min(restored + 1, total)} of ${total})`;
        setTimeout(() => {
          resumeNotice = null;
        }, 6000);
      }
    } catch (err) {
      console.error('Failed to initialize runtime:', err);
      loading = false;

      let errorMessage = err instanceof Error ? err.message : 'Failed to start questionnaire';
      if (errorMessage.includes('Failed to preload')) {
        errorMessage = `Unable to load required media files:\n${errorMessage}`;
      }
      error = errorMessage;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    runtime?.handleKeyPress(event);
  }

  function handleResize() {
    // Delegate to the runtime's single owned renderer (Slice 4.6). No-op until that
    // renderer is lazily created — form-only questionnaires never allocate one.
    runtime?.resize(window.innerWidth, window.innerHeight);
  }

  // --- Shared-device "End session / clear this device" (F005) ---------------
  // On a shared/kiosk device the completed participant must be able to wipe all
  // fillout data from IndexedDB so the next person can't read it. We probe for
  // still-unsynced rows first: if any exist, clearing them is unrecoverable data
  // loss, so the action requires an explicit confirmation showing the warning.
  let clearConfirmOpen = $state(false);
  let clearUnsyncedCount = $state(0);
  let clearing = $state(false);
  let clearDone = $state(false);

  async function countUnsyncedFilloutRows(): Promise<number> {
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

  async function requestClearDevice() {
    clearUnsyncedCount = await countUnsyncedFilloutRows();
    clearConfirmOpen = true;
  }

  async function confirmClearDevice() {
    clearing = true;
    try {
      await db.clearAllFilloutData();
      // Drop the API session pointer so a stale id can't be reused on this device.
      try { sessionStorage.removeItem('qd_api_session_id'); } catch { /* no-op */ }
      clearDone = true;
      clearConfirmOpen = false;
    } catch (err) {
      console.error('Failed to clear device data:', err);
    } finally {
      clearing = false;
    }
  }

  function cancelClearDevice() {
    clearConfirmOpen = false;
  }
</script>

<svelte:window on:keydown={handleKeyDown} on:resize={handleResize} />

<div class="fillout-page" bind:this={container} data-testid="fillout-root">
  <!-- Offline / Sync indicators -->
  {#if isOffline || syncStatus !== 'idle'}
    <div class="status-bar" data-testid="fillout-status-bar">
      {#if isOffline}
        <div class="status-badge offline">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M13 10l-4 4m0-4l4 4" />
          </svg>
          Offline — responses saved locally
        </div>
      {:else if syncStatus === 'syncing'}
        <div class="status-badge syncing">
          <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Syncing responses...
        </div>
      {:else if syncStatus === 'synced'}
        <div class="status-badge synced">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          Synced to server
        </div>
      {:else if syncStatus === 'error'}
        <div class="status-badge error">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Sync error — will retry
        </div>
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="error-container" data-testid="fillout-error">
      <EmptyState
        title="Unable to load questionnaire"
        description={error}
        buttonText="Go back"
        onAction={() => goto('/')}
      />
    </div>
  {:else if loading && currentScreen !== 'runtime'}
    <div class="loading-container" data-testid="fillout-loading">
      <Spinner size="lg" />
      <p class="loading-text">{loadingMessage}</p>
      {#if loadingProgress > 0}
        <div class="loading-progress">
          <div class="progress-bar" style="width: {loadingProgress}%"></div>
        </div>
      {/if}
    </div>
  {:else if currentScreen === 'welcome'}
    <WelcomeScreen
      questionnaire={definition}
      projectName={data.questionnaire.projectName}
      onStart={handleStart}
      hasResumeState={!!activeResumeState}
      onContinue={handleStart}
      onStartOver={handleStartOver}
      {welcomeMessage}
      languageOptions={languageOptions}
      activeLocale={effectiveLocale}
      onLocaleChange={handleLocaleChange}
      showPhotosensitivityAdvisory={hasReactionQuestion}
      {prefersReducedMotion}
    />
  {:else if currentScreen === 'consent'}
    <ConsentScreen
      content={consentText}
      checkboxes={rawDefinition.consent?.checkboxes}
      requireSignature={rawDefinition.consent?.requireSignature}
      onAccept={handleConsent}
      onDecline={handleDeclineConsent}
      onPrimeAudio={ensureAudioUnlocked}
    />
  {:else if currentScreen === 'runtime'}
    {#if showTimingBanner && qualification}
      <div class="timing-banner" data-testid="fillout-timing-banner">
        <DeviceQualificationBanner
          result={qualification}
          onDismiss={timingBlocked ? undefined : () => (bannerDismissed = true)}
        />
        {#if timingBlocked}
          <p class="timing-block-note" data-testid="fillout-timing-block-note">
            This study measures reaction times to within a few milliseconds and
            your device did not pass the timing check. You may continue, but the
            recorded times may be less accurate than the study requires.
          </p>
        {/if}
      </div>
    {/if}

    {#if resumeNotice}
      <div class="resume-toast" data-testid="fillout-resume-toast" role="status">
        {resumeNotice}
      </div>
    {/if}

    {#if data.pinnedFallback && !pinnedFallbackDismissed}
      <div class="pinned-fallback-note" data-testid="fillout-pinned-fallback-note" role="status">
        <span>
          The exact version this session started on isn't stored on this device, so it's
          continuing on the latest version. Your prior answers were restored.
        </span>
        <button
          type="button"
          class="pinned-fallback-dismiss"
          data-testid="fillout-pinned-fallback-dismiss"
          onclick={() => (pinnedFallbackDismissed = true)}
        >
          Dismiss
        </button>
      </div>
    {/if}

    <!-- role="img" names the stimulus canvas for screen readers so it isn't an unnamed
         graphic (F097); the Svelte a11y lint flags canvas+role but this is the intended,
         WCAG-recommended pattern for giving a canvas an accessible name. -->
    <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
    <canvas
      bind:this={canvas}
      class="fillout-canvas"
      width={window.innerWidth}
      height={window.innerHeight}
      role="img"
      aria-label="Reaction task stimulus display"
      data-testid="fillout-runtime-canvas"
    ></canvas>

    <div class="html-overlay" data-testid="fillout-runtime-overlay">
      {#if activePresentation && activeItem}
        <div class="form-overlay" data-testid="fillout-form-overlay">
          <div class="form-card" data-question-type={activePresentation.type}>
            {#key activePresentation.item.id}
              <ModularRenderer
                item={activeItem}
                mode="runtime"
                variables={activePresentation.variables}
                bind:value={currentValue}
                onResponse={handleOverlayResponse}
                onValidation={activePresentation.onValidation}
                onInteraction={activePresentation.onInteraction}
              />
            {/key}

            <div class="form-actions">
              <button
                type="button"
                class="form-continue"
                data-testid="fillout-form-continue"
                disabled={!canAdvance}
                onclick={submitOverlayAnswer}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {:else if currentScreen === 'over-quota'}
    <div class="loading-container" data-testid="fillout-over-quota">
      <EmptyState
        title="Study Full"
        description={overQuotaMessage}
        buttonText="Go back"
        onAction={() => goto('/')}
      />
    </div>
  {:else if currentScreen === 'complete'}
    <CompletionScreen
      session={completedSession}
      customMessage={completionMessage}
      distributionSettings={rawDefinition.settings?.distribution}
      urlParams={data.urlParams}
      showStatistics={true}
      onClose={() => goto('/')}
    />

    <!-- Shared-device data hygiene (F005): let the participant wipe every
         fillout record from this browser before handing it back. -->
    <div class="shared-device-panel" data-testid="fillout-clear-device">
      {#if clearDone}
        <p class="shared-device-done" data-testid="fillout-clear-device-done">
          This device has been cleared. It is safe to hand back.
        </p>
      {:else if clearConfirmOpen}
        <div class="shared-device-confirm" data-testid="fillout-clear-device-confirm">
          {#if clearUnsyncedCount > 0}
            <p class="shared-device-warning" data-testid="fillout-clear-device-warning">
              Warning: {clearUnsyncedCount} response{clearUnsyncedCount === 1 ? '' : 's'} on this
              device {clearUnsyncedCount === 1 ? 'has' : 'have'} not been sent to the server yet.
              Clearing now will permanently discard {clearUnsyncedCount === 1 ? 'it' : 'them'}.
            </p>
          {:else}
            <p class="shared-device-note">
              All data on this device has been sent to the server. Clear it to remove your
              answers from this browser?
            </p>
          {/if}
          <div class="shared-device-actions">
            <button
              type="button"
              class="shared-device-btn danger"
              data-testid="fillout-clear-device-confirm-btn"
              disabled={clearing}
              onclick={confirmClearDevice}
            >
              {clearing ? 'Clearing…' : 'Clear this device'}
            </button>
            <button
              type="button"
              class="shared-device-btn"
              data-testid="fillout-clear-device-cancel-btn"
              disabled={clearing}
              onclick={cancelClearDevice}
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button
          type="button"
          class="shared-device-btn"
          data-testid="fillout-clear-device-btn"
          onclick={requestClearDevice}
        >
          End session / clear this device
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .fillout-page {
    width: 100vw;
    height: 100vh;
    position: relative;
    overflow: hidden;
    background: hsl(var(--background));
  }

  .status-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    justify-content: center;
    padding: 0.5rem;
    pointer-events: none;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    pointer-events: auto;
    backdrop-filter: blur(8px);
  }

  .status-badge.offline {
    background: rgb(254 243 199 / 0.9);
    color: rgb(146 64 14);
    border: 1px solid rgb(253 224 71 / 0.5);
  }

  .status-badge.syncing {
    background: rgb(219 234 254 / 0.9);
    color: rgb(30 64 175);
    border: 1px solid rgb(147 197 253 / 0.5);
  }

  .status-badge.synced {
    background: rgb(220 252 231 / 0.9);
    color: rgb(22 101 52);
    border: 1px solid rgb(134 239 172 / 0.5);
  }

  .status-badge.error {
    background: rgb(254 226 226 / 0.9);
    color: rgb(153 27 27);
    border: 1px solid rgb(252 165 165 / 0.5);
  }

  .loading-container,
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 1rem;
  }

  .loading-text {
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
  }

  .loading-progress {
    width: 200px;
    height: 4px;
    background: hsl(var(--muted));
    border-radius: 2px;
    overflow: hidden;
    margin-top: 0.5rem;
  }

  .progress-bar {
    height: 100%;
    background: hsl(var(--primary));
    transition: width 0.3s ease;
  }

  .fillout-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  .timing-banner {
    position: fixed;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 90;
    width: min(640px, calc(100vw - 1.5rem));
    pointer-events: auto;
  }

  .timing-block-note {
    margin-top: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: hsl(var(--destructive) / 0.1);
    border: 1px solid hsl(var(--destructive) / 0.3);
    color: hsl(var(--destructive));
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .resume-toast {
    position: fixed;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 95;
    max-width: min(560px, calc(100vw - 1.5rem));
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    background: hsl(var(--primary) / 0.1);
    border: 1px solid hsl(var(--primary) / 0.3);
    color: hsl(var(--primary));
    font-size: 0.8125rem;
    font-weight: 500;
    text-align: center;
    pointer-events: none;
  }

  .pinned-fallback-note {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 95;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: min(560px, calc(100vw - 1.5rem));
    padding: 0.625rem 1rem;
    border-radius: 0.5rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.12);
    color: hsl(var(--muted-foreground));
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .pinned-fallback-dismiss {
    flex-shrink: 0;
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    color: hsl(var(--foreground));
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
  }

  .html-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .html-overlay :global(*) {
    pointer-events: auto;
  }

  .form-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    overflow-y: auto;
  }

  .form-card {
    width: 100%;
    max-width: 720px;
    max-height: calc(100vh - 3rem);
    overflow-y: auto;
    background: hsl(var(--card));
    color: hsl(var(--card-foreground));
    border-radius: 0.75rem;
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.15);
    padding: 2rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1.5rem;
  }

  .form-continue {
    padding: 0.625rem 1.5rem;
    border-radius: 0.5rem;
    border: none;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .form-continue:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .shared-device-panel {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    width: min(560px, calc(100vw - 1.5rem));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-align: center;
  }

  .shared-device-confirm {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.875rem 1rem;
    border-radius: 0.5rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.12);
  }

  .shared-device-warning {
    color: hsl(var(--destructive));
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .shared-device-note {
    color: hsl(var(--muted-foreground));
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .shared-device-done {
    color: hsl(var(--muted-foreground));
    font-size: 0.8125rem;
  }

  .shared-device-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .shared-device-btn {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    color: hsl(var(--foreground));
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .shared-device-btn:hover {
    opacity: 0.85;
  }

  .shared-device-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .shared-device-btn.danger {
    background: hsl(var(--destructive));
    color: hsl(var(--destructive-foreground));
    border-color: hsl(var(--destructive));
  }

  :global(.dark) .status-badge.offline {
    background: rgb(120 53 15 / 0.8);
    color: rgb(253 224 71);
    border-color: rgb(161 98 7 / 0.5);
  }

  :global(.dark) .status-badge.syncing {
    background: rgb(30 58 138 / 0.8);
    color: rgb(147 197 253);
    border-color: rgb(59 130 246 / 0.5);
  }

  :global(.dark) .status-badge.synced {
    background: rgb(20 83 45 / 0.8);
    color: rgb(134 239 172);
    border-color: rgb(34 197 94 / 0.5);
  }

  :global(.dark) .status-badge.error {
    background: rgb(127 29 29 / 0.8);
    color: rgb(252 165 165);
    border-color: rgb(220 38 38 / 0.5);
  }
</style>
