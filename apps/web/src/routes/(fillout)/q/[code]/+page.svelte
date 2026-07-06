<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import Spinner from '$lib/components/ui/feedback/Spinner.svelte';
  import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
  import WelcomeScreen from '$lib/fillout/components/WelcomeScreen.svelte';
  import ConsentScreen from '$lib/fillout/components/ConsentScreen.svelte';
  import CompletionScreen from '$lib/fillout/components/CompletionScreen.svelte';
  import ModularRenderer from '$lib/runtime/ModularRenderer.svelte';
  import TimerDisplay from '$lib/components/ui/TimerDisplay.svelte';
  import {
    localizeQuestionnaire,
    resolveText,
    getBaseLocale,
    getAvailableLocales,
    getLocaleLabel,
  } from '$lib/shared';
  import DeviceQualificationBanner from '$lib/runtime/timing/components/DeviceQualificationBanner.svelte';
  import {
    FilloutPageController,
    type FilloutRuntimeInputs,
  } from '$lib/fillout/FilloutPageController.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // Headless lifecycle + service wiring (F040). The controller owns the screen state
  // machine, session create/resume, quota/fraud gates, the runtime, and the onComplete
  // flow; this view stays presentational — locale selection, screen rendering, and event
  // forwarding to controller methods. See lib/fillout/FilloutPageController.svelte.ts.
  const controller = new FilloutPageController(data);

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

  // DOM element refs — bound in the template, handed to the controller lazily.
  let container = $state<HTMLDivElement>();
  // CONTRACT-LAZY (Slice 4.6): the page no longer owns a WebGLRenderer. There is exactly
  // ONE renderer, owned + lazily created by the runtime; the page keeps only the canvas
  // (bound below) and delegates resize to the controller.
  let canvas = $state<HTMLCanvasElement>();
  // A11y (F094/F098): focus target for the form card.
  let formCardEl = $state<HTMLDivElement>();

  // --- Timing qualification banner (Slice 3.4) ------------------------------
  // Reaction paradigms depend on frame-exact stimulus onset. The controller runs the
  // session-wide TimingGatekeeper; this view derives the banner visibility from the
  // resulting grade (`controller.qualification`) and the locale-dependent question list.
  const REACTION_QUESTION_TYPES = new Set(['reaction-time', 'reaction-experiment']);
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
    hasReactionQuestion &&
      !controller.bannerDismissed &&
      controller.qualification !== null &&
      controller.qualification.grade !== 'green'
  );
  // Red grade on a precision paradigm: prominent block/warn (participants are not
  // hard-stopped — dead-ending a study is worse — but are strongly cautioned).
  const timingBlocked = $derived(
    hasReactionQuestion && requiresPrecisionTiming && controller.qualification?.grade === 'red'
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

  // Bridge the locale-dependent runtime inputs + the DOM canvas to the controller. Read
  // lazily (at runtime-construction time) so they reflect the participant's latest locale
  // pick and the freshly-bound canvas.
  controller.getRuntimeInputs = (): FilloutRuntimeInputs => ({
    canvas,
    definition,
    rawDefinition,
    questionList,
    hasReactionQuestion,
  });
  // Move keyboard focus to the freshly-mounted question region on a NEW item. tick()
  // waits for the {#key} subtree remount.
  controller.presentFocusHook = () => void tick().then(() => formCardEl?.focus());

  onMount(() => {
    // Track online/offline
    const handleOnline = () => controller.setOffline(false);
    const handleOffline = () => controller.setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    controller.startSyncEngine();
    controller.initFromLoad();

    return () => {
      controller.dispose();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.body.classList.remove('fillout');
      sessionStorage.removeItem('qd_api_session_id');
    };
  });
</script>

<svelte:window
  on:keydown={(e) => controller.handleKeyDown(e)}
  on:resize={() => controller.handleResize()}
/>

<div class="fillout-page" bind:this={container} data-testid="fillout-root">
  <!-- Persistent SR-only live region (F094): survives screen switches so every
       question presentation is announced. -->
  <div class="sr-only" role="status" aria-live="polite">{controller.liveAnnouncement}</div>

  <!-- Offline / Sync indicators -->
  {#if controller.isOffline || controller.syncStatus !== 'idle'}
    <div class="status-bar" data-testid="fillout-status-bar">
      {#if controller.isOffline}
        <div class="status-badge offline">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M13 10l-4 4m0-4l4 4" />
          </svg>
          Offline — responses saved locally
        </div>
      {:else if controller.syncStatus === 'syncing'}
        <div class="status-badge syncing">
          <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Syncing responses...
        </div>
      {:else if controller.syncStatus === 'synced'}
        <div class="status-badge synced">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          Synced to server
        </div>
      {:else if controller.syncStatus === 'error'}
        <div class="status-badge error">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Sync error — will retry
        </div>
      {/if}
    </div>
  {/if}

  {#if controller.error}
    <div class="error-container" data-testid="fillout-error">
      <EmptyState
        title="Unable to load questionnaire"
        description={controller.error}
        buttonText="Go back"
        onAction={() => goto('/')}
      />
    </div>
  {:else if controller.loading && controller.screen !== 'runtime'}
    <div class="loading-container" data-testid="fillout-loading">
      <Spinner size="lg" />
      <p class="loading-text">{controller.loadingMessage}</p>
      {#if controller.loadingProgress > 0}
        <div class="loading-progress">
          <div class="progress-bar" style="width: {controller.loadingProgress}%"></div>
        </div>
      {/if}
    </div>
  {:else if controller.screen === 'welcome'}
    <WelcomeScreen
      questionnaire={definition}
      projectName={data.questionnaire.projectName}
      onStart={() => controller.handleStart()}
      hasResumeState={!!controller.activeResumeState}
      onContinue={() => controller.handleStart()}
      onStartOver={() => controller.handleStartOver()}
      {welcomeMessage}
      languageOptions={languageOptions}
      activeLocale={effectiveLocale}
      onLocaleChange={handleLocaleChange}
      showPhotosensitivityAdvisory={hasReactionQuestion}
      {prefersReducedMotion}
    />
  {:else if controller.screen === 'consent'}
    <ConsentScreen
      content={consentText}
      checkboxes={rawDefinition.consent?.checkboxes}
      requireSignature={rawDefinition.consent?.requireSignature}
      onAccept={(c) => controller.handleConsent(c)}
      onDecline={() => controller.handleDeclineConsent()}
      onPrimeAudio={() => controller.ensureAudioUnlocked()}
    />
  {:else if controller.screen === 'runtime'}
    <h1 class="sr-only">{definition?.name ?? 'Questionnaire'}</h1>
    {#if showTimingBanner && controller.qualification}
      <div class="timing-banner" data-testid="fillout-timing-banner">
        <DeviceQualificationBanner
          result={controller.qualification}
          onDismiss={timingBlocked ? undefined : () => (controller.bannerDismissed = true)}
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

    {#if controller.resumeNotice}
      <div class="resume-toast" data-testid="fillout-resume-toast" role="status">
        {controller.resumeNotice}
      </div>
    {/if}

    {#if data.pinnedFallback && !controller.pinnedFallbackDismissed}
      <div class="pinned-fallback-note" data-testid="fillout-pinned-fallback-note" role="status">
        <span>
          The exact version this session started on isn't stored on this device, so it's
          continuing on the latest version. Your prior answers were restored.
        </span>
        <button
          type="button"
          class="pinned-fallback-dismiss"
          data-testid="fillout-pinned-fallback-dismiss"
          onclick={() => (controller.pinnedFallbackDismissed = true)}
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
      {#if controller.activePresentation && controller.activeItem}
        <div class="form-overlay" data-testid="fillout-form-overlay">
          <div
            class="form-card"
            data-question-type={controller.activePresentation.type}
            bind:this={formCardEl}
            tabindex="-1"
          >
            {#if controller.timerState}
              <div class="form-timer" data-testid="fillout-form-timer">
                <TimerDisplay
                  remainingMs={controller.timerState.remainingMs}
                  totalMs={controller.timerState.totalMs}
                  warning={controller.timerState.warning}
                />
              </div>
            {/if}
            {#key controller.activePresentation.item.id}
              <ModularRenderer
                item={controller.activeItem}
                mode="runtime"
                variables={controller.activePresentation.variables}
                bind:value={controller.currentValue}
                onResponse={(v) => controller.handleOverlayResponse(v)}
                onValidation={controller.activePresentation.onValidation}
                onInteraction={controller.activePresentation.onInteraction}
              />
            {/key}

            <div class="form-actions">
              <button
                type="button"
                class="form-continue"
                data-testid="fillout-form-continue"
                disabled={!controller.canAdvance}
                onclick={() => controller.submitOverlayAnswer()}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {:else if controller.screen === 'over-quota'}
    <div class="loading-container" data-testid="fillout-over-quota">
      <EmptyState
        title="Study Full"
        description={controller.overQuotaMessage}
        buttonText="Go back"
        onAction={() => goto('/')}
      />
    </div>
  {:else if controller.screen === 'complete'}
    <CompletionScreen
      session={controller.completedSession}
      customMessage={completionMessage}
      variables={controller.completedVariables}
      reportConfig={rawDefinition.settings?.report}
      distributionSettings={rawDefinition.settings?.distribution}
      urlParams={data.urlParams}
      showStatistics={true}
      onClose={() => goto('/')}
    />

    <!-- Shared-device data hygiene (F005): let the participant wipe every
         fillout record from this browser before handing it back. -->
    <div class="shared-device-panel" data-testid="fillout-clear-device">
      {#if controller.clearDone}
        <p class="shared-device-done" data-testid="fillout-clear-device-done">
          This device has been cleared. It is safe to hand back.
        </p>
      {:else if controller.clearConfirmOpen}
        <div class="shared-device-confirm" data-testid="fillout-clear-device-confirm">
          {#if controller.clearUnsyncedCount > 0}
            <p class="shared-device-warning" data-testid="fillout-clear-device-warning">
              Warning: {controller.clearUnsyncedCount} response{controller.clearUnsyncedCount === 1
                ? ''
                : 's'} on this device {controller.clearUnsyncedCount === 1 ? 'has' : 'have'} not been
              sent to the server yet. Clearing now will permanently discard {controller.clearUnsyncedCount ===
              1
                ? 'it'
                : 'them'}.
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
              disabled={controller.clearing}
              onclick={() => controller.confirmClearDevice()}
            >
              {controller.clearing ? 'Clearing…' : 'Clear this device'}
            </button>
            <button
              type="button"
              class="shared-device-btn"
              data-testid="fillout-clear-device-cancel-btn"
              disabled={controller.clearing}
              onclick={() => controller.cancelClearDevice()}
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
          onclick={() => controller.requestClearDevice()}
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

  .form-timer {
    margin-bottom: 1.25rem;
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
