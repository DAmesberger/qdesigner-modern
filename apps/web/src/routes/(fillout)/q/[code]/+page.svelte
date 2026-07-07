<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import Spinner from '$lib/components/ui/feedback/Spinner.svelte';
  import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
  import WelcomeScreen from '$lib/fillout/components/WelcomeScreen.svelte';
  import ConsentScreen from '$lib/fillout/components/ConsentScreen.svelte';
  import CompletionScreen from '$lib/fillout/components/CompletionScreen.svelte';
  import SyncStatusPanel from '$lib/fillout/components/SyncStatusPanel.svelte';
  import ShareDeviceExit from '$lib/fillout/components/ShareDeviceExit.svelte';
  import { m } from '$lib/paraglide/messages';
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
  import { SeriesEnrollmentService } from '$lib/fillout/services/SeriesEnrollmentService';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // Headless lifecycle + service wiring (F040). The controller owns the screen state
  // machine, session create/resume, quota/fraud gates, the runtime, and the onComplete
  // flow; this view stays presentational — locale selection, screen rendering, and event
  // forwarding to controller methods. See lib/fillout/FilloutPageController.svelte.ts.
  const controller = new FilloutPageController(data);

  // --- Longitudinal / EMA series gate (E-FLOW-2) ----------------------------
  // A `?token=` reminder link either (a) unsubscribes, (b) lands on a wave that
  // is not open yet / already finished ("come back later"), or (c) opens the
  // current wave normally. (a)/(b) intercept BEFORE the runtime starts so no
  // premature session is created; (c) falls through to the normal fillout with
  // the wave pinned + `_waveIndex` seeded.
  const seriesPrompt = $derived(data.seriesPrompt ?? null);
  const seriesUnsubscribe = $derived(Boolean(data.seriesUnsubscribe && data.seriesToken));
  const seriesComeBackLater = $derived(
    !seriesUnsubscribe &&
      !!seriesPrompt &&
      (seriesPrompt.status !== 'active' ||
        (!!seriesPrompt.scheduled_at &&
          new Date(seriesPrompt.scheduled_at).getTime() > Date.now()))
  );
  const seriesGateActive = $derived(seriesUnsubscribe || seriesComeBackLater);
  const seriesNextTime = $derived(
    seriesPrompt?.next_prompt_at ?? seriesPrompt?.scheduled_at ?? null
  );
  let seriesUnsubDone = $state(false);
  let seriesUnsubFailed = $state(false);

  function formatSeriesTime(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  }

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

  // --- Connectivity UX (E-OFF-6) --------------------------------------------
  // Persistent sync widget: visible whenever the participant is actually in/after a
  // session, or whenever there is something honest to report (offline, pending, or a
  // drain in flight). Kept off the pristine welcome screen so it isn't noise there.
  const hasQuotas = $derived((rawDefinition?.settings?.quotas?.length ?? 0) > 0);
  const showSyncPanel = $derived(
    controller.screen === 'runtime' ||
      controller.screen === 'complete' ||
      controller.isOffline ||
      controller.pendingCount > 0 ||
      controller.isSyncing
  );
  // Reload-persistent prompt (step 7): the SyncLedger pending tally lives in IndexedDB,
  // so a participant who closed the tab mid-session sees this on the entry screens.
  const showUnsyncedBanner = $derived(
    controller.pendingCount > 0 &&
      (controller.screen === 'welcome' || controller.screen === 'consent')
  );
  // Honest offline-quota disclosure (step 4): eligibility can't be checked offline, so
  // say so up front rather than silently admitting — server re-checks on submission (P1-T4).
  const showOfflineQuotaDisclosure = $derived(
    hasQuotas && controller.isOffline && controller.screen === 'welcome'
  );

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

  // ── Org branding (E-RBAC-8) ────────────────────────────────────────────
  // Theme the participant chrome with the owning org's brand. `--primary` is an
  // HSL triple (`H S% L%`) per the P1-T2 token contract, so a hex primaryColor is
  // converted before it can drive `hsl(var(--primary))`. Everything falls back to
  // the platform default token when a field is unset or branding is unavailable.
  function hexToHslTriple(hex: string): string | null {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!match || !match[1]) return null;
    let h = match[1];
    if (h.length === 3)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let hue = 0;
    let sat = 0;
    const d = max - min;
    if (d !== 0) {
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue /= 6;
    }
    return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%`;
  }

  const brandPrimaryHsl = $derived(
    data.branding?.primary_color ? hexToHslTriple(data.branding.primary_color) : null
  );
  // Override the `--primary` token on the fillout root only — scoped, so the rest
  // of the app is untouched. Empty string leaves the default token in place.
  const brandStyle = $derived(brandPrimaryHsl ? `--primary: ${brandPrimaryHsl};` : '');
  // Logo / header ride above the non-runtime chrome screens (welcome, consent,
  // completion). Hidden during the WebGL runtime so nothing overlays a stimulus.
  const showBrandBar = $derived(
    !!data.branding &&
      (!!data.branding.logo_url || !!data.branding.participant_header) &&
      controller.screen !== 'runtime'
  );

  onMount(() => {
    // Track online/offline
    const handleOnline = () => controller.setOffline(false);
    const handleOffline = () => controller.setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // E-FLOW-2 series gate: unsubscribe / come-back-later intercept the runtime
    // so no premature wave session is created. Only the normal (current-wave)
    // path starts the fillout.
    if (seriesUnsubscribe && data.seriesToken) {
      void SeriesEnrollmentService.unsubscribe(data.seriesToken).then((ok) => {
        seriesUnsubDone = ok;
        seriesUnsubFailed = !ok;
      });
    } else if (!seriesGateActive) {
      controller.startSyncEngine();
      controller.initFromLoad();
    }

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

<div class="fillout-page" bind:this={container} data-testid="fillout-root" style={brandStyle}>
  <!-- Persistent SR-only live region (F094): survives screen switches so every
       question presentation is announced. -->
  <div class="sr-only" role="status" aria-live="polite">{controller.liveAnnouncement}</div>

  <!-- Whitelabel branding (E-RBAC-8): org logo + participant header on the chrome
       screens. Themed by the `--primary` override on the root above. -->
  {#if showBrandBar}
    <div class="brand-bar" data-testid="fillout-brand-bar">
      {#if data.branding?.logo_url}
        <img class="brand-logo" src={data.branding.logo_url} alt={data.branding.name} />
      {/if}
      {#if data.branding?.participant_header}
        <span class="brand-header">{data.branding.participant_header}</span>
      {/if}
    </div>
  {/if}

  <!-- Persistent connectivity widget (E-OFF-6): online/offline, N answers pending,
       last-synced time, and a manual Sync-now control. Replaces the auto-hiding badge. -->
  {#if showSyncPanel}
    <div class="status-bar" data-testid="fillout-status-bar">
      <SyncStatusPanel
        online={!controller.isOffline}
        syncing={controller.isSyncing}
        pending={controller.pendingCount}
        lastSyncedAt={controller.lastSyncedAt}
        onSyncNow={() => controller.manualSync()}
      />
    </div>
  {/if}

  <!-- Reload-persistent "unsynced on this device" prompt (E-OFF-6 step 7). -->
  {#if showUnsyncedBanner}
    <div class="unsynced-banner" data-testid="fillout-unsynced-banner" role="status">
      {m.fillout_unsynced_banner({ count: controller.pendingCount })}
    </div>
  {/if}

  {#if seriesUnsubscribe}
    <!-- E-FLOW-2: reminder opt-out. Withdraws the enrollment; the scheduler
         stops sending (its due scan filters status='active'). -->
    <div class="series-gate" data-testid="fillout-series-unsubscribe">
      <EmptyState
        title="Unsubscribed"
        description={seriesUnsubFailed
          ? 'We could not process your request. The link may have expired.'
          : seriesUnsubDone
            ? 'You will no longer receive reminders for this study.'
            : 'Processing your request…'}
      />
    </div>
  {:else if seriesComeBackLater}
    <!-- E-FLOW-2: the current wave is not open yet, or the study is complete. -->
    <div class="series-gate" data-testid="fillout-series-comeback">
      {#if seriesPrompt?.status === 'completed'}
        <EmptyState
          title="Study complete"
          description="You have completed all waves of this study. Thank you for taking part."
        />
      {:else if seriesPrompt?.status === 'withdrawn'}
        <EmptyState
          title="You have unsubscribed"
          description="You are no longer enrolled in this study."
        />
      {:else}
        <EmptyState
          title="Come back soon"
          description={seriesNextTime
            ? `Your next questionnaire${
                seriesPrompt?.wave_label ? ` (${seriesPrompt.wave_label})` : ''
              } opens on ${formatSeriesTime(seriesNextTime)}. We'll email you a reminder.`
            : 'Your next questionnaire is not open yet. We\'ll email you a reminder when it is.'}
        />
      {/if}
    </div>
  {:else if controller.error}
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
    {#if showOfflineQuotaDisclosure}
      <div
        class="offline-quota-note"
        data-testid="fillout-offline-quota-note"
        role="status"
      >
        {m.fillout_offline_quota_notice()}
      </div>
    {/if}
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

    <!-- Shared-device data hygiene (E-OFF-6 step 3): force a final sync, then wipe every
         fillout store + keys + media cache (E-OFF-2/E-OFF-3) so the kiosk is safe to hand
         back. Unsynced rows require explicit confirmation and offer the E-OFF-5 export first. -->
    <div class="shared-device-panel" data-testid="fillout-clear-device">
      <ShareDeviceExit
        online={!controller.isOffline}
        countUnsynced={() => controller.getUnsyncedCount()}
        onSync={() => controller.forceSyncBeforeExit()}
        onClear={() => controller.clearDeviceForHandoff()}
        onExport={() => controller.exportUnsyncedData()}
      />
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

  /* Whitelabel brand bar (E-RBAC-8): centered logo + header above chrome screens. */
  .brand-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 95;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    pointer-events: none;
  }

  .brand-logo {
    max-height: 40px;
    max-width: 180px;
    width: auto;
    object-fit: contain;
  }

  .brand-header {
    font-size: 0.95rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .unsynced-banner {
    position: fixed;
    top: 3rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 96;
    width: min(560px, calc(100vw - 1.5rem));
    padding: 0.625rem 1rem;
    border-radius: 0.5rem;
    background: hsl(var(--warning) / 0.12);
    border: 1px solid hsl(var(--warning) / 0.35);
    color: hsl(var(--foreground));
    font-size: 0.8125rem;
    line-height: 1.4;
    text-align: center;
  }

  .offline-quota-note {
    position: fixed;
    top: 3rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 96;
    width: min(560px, calc(100vw - 1.5rem));
    padding: 0.625rem 1rem;
    border-radius: 0.5rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    color: hsl(var(--muted-foreground));
    font-size: 0.8125rem;
    line-height: 1.4;
    text-align: center;
  }

  .loading-container,
  .error-container,
  .series-gate {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 1rem;
    padding: 1.5rem;
    text-align: center;
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

</style>
