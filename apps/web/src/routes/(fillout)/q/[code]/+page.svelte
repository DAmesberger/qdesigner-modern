<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import Spinner from '$lib/components/ui/feedback/Spinner.svelte';
  import EmptyState from '$lib/components/common/EmptyState.svelte';
  import WelcomeScreen from '$lib/fillout/components/WelcomeScreen.svelte';
  import ConsentScreen from '$lib/fillout/components/ConsentScreen.svelte';
  import CompletionScreen from '$lib/fillout/components/CompletionScreen.svelte';
  import { FilloutRuntime } from '$lib/fillout/runtime/FilloutRuntime';
  import { WebGLRenderer } from '$lib/renderer/WebGLRenderer';
  import type { Questionnaire } from '$lib/shared/types/questionnaire';
  import { QuestionnaireAccessService } from '$lib/fillout/services/QuestionnaireAccessService';
  import { OfflineSessionService } from '$lib/fillout/services/OfflineSessionService';
  import { FilloutSyncEngine } from '$lib/fillout/services/FilloutSyncEngine';
  import { QuotaService } from '$lib/fillout/services/QuotaService';
  import { FraudDetectionService } from '$lib/fillout/services/FraudDetectionService';
  import { api } from '$lib/services/api';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let container = $state<HTMLDivElement>();
  let canvas = $state<HTMLCanvasElement>();
  let runtime: FilloutRuntime | null = null;
  let renderer: WebGLRenderer | null = null;
  let syncEngine: FilloutSyncEngine | null = null;
  let loading = $state(false);
  let loadingMessage = $state('Loading questionnaire...');
  let loadingProgress = $state(0);
  let error = $state<string | null>(null);
  let currentScreen = $state<'welcome' | 'consent' | 'runtime' | 'complete' | 'over-quota'>('welcome');
  let overQuotaMessage = $state<string>('');
  let session = $state<any>(null);
  let completedSession = $state<any>(null);
  let conditionGroupCounts = $state<number[] | undefined>(undefined);

  // Fraud prevention state
  let fraudFingerprint = $state<string | undefined>(undefined);

  // Offline state
  let isOffline = $state(!navigator.onLine);
  let syncStatus = $state<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  let savedLocally = $state(false);

  // Initialize on mount
  onMount(() => {
    // Track online/offline
    const handleOnline = () => { isOffline = false; };
    const handleOffline = () => { isOffline = true; };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Start sync engine
    syncEngine = new FilloutSyncEngine({
      onSyncStart: () => { syncStatus = 'syncing'; },
      onSyncComplete: (result) => {
        syncStatus = result.errors.length > 0 ? 'error' : 'synced';
        // Reset after a bit
        setTimeout(() => { syncStatus = 'idle'; }, 3000);
      },
    });
    syncEngine.start();

    const init = async () => {
      if (data.existingSession) {
        session = data.existingSession;
        sessionStorage.setItem('qd_api_session_id', session.id);
        if (session.status === 'in_progress' || session.status === 'active') {
          currentScreen = 'runtime';
          await initializeRuntime();
        }
      } else if (data.questionnaire.definition.settings?.requireConsent === false) {
        currentScreen = 'welcome';
      }
    };

    init();

    return () => {
      runtime?.dispose();
      renderer?.destroy();
      syncEngine?.stop();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.body.classList.remove('fillout');
      sessionStorage.removeItem('qd_api_session_id');
    };
  });

  async function handleStart() {
    if (data.questionnaire.definition.settings?.requireConsent) {
      currentScreen = 'consent';
    } else {
      await createSessionAndStart();
    }
  }

  async function handleConsent(consentData: any) {
    await createSessionAndStart(consentData);
  }

  async function handleDeclineConsent() {
    goto('/');
  }

  async function createSessionAndStart(consentData?: any) {
    try {
      loading = true;

      // Fraud prevention checks before session creation
      const fpSettings = data.questionnaire.definition.settings?.fraudPrevention;
      if (fpSettings && navigator.onLine) {
        const fraudResult = await FraudDetectionService.checkAll(
          data.questionnaire.id,
          fpSettings
        );
        fraudFingerprint = fraudResult.fingerprint;

        // Server-side duplicate check via fingerprint
        if (fpSettings.preventDuplicates && fraudResult.fingerprint) {
          const dupCheck = await FraudDetectionService.checkDuplicateViaAPI(
            data.questionnaire.id,
            fraudResult.fingerprint
          );
          if (dupCheck.isDuplicate) {
            fraudResult.flags.push('duplicate_fingerprint');
            fraudResult.passed = false;
          }
        }

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

      if (navigator.onLine) {
        // Online: use the existing API flow
        const { session: newSession } = await QuestionnaireAccessService.createOrResumeSession(
          data.questionnaire.id,
          data.participantId || undefined,
          data.existingSession?.id
        );
        session = newSession;
      } else {
        // Offline: create session locally
        const offlineSession = await OfflineSessionService.createSession(
          data.questionnaire.id,
          data.questionnaire.versionMajor ?? 1,
          data.questionnaire.versionMinor ?? 0,
          data.questionnaire.versionPatch ?? 0,
          data.participantId || undefined,
          consentData ? { consent: { ...consentData, timestamp: new Date().toISOString() } } : undefined,
          OfflineSessionService.getDeviceInfo(),
        );
        session = {
          id: offlineSession.id,
          questionnaire_id: offlineSession.questionnaireId,
          status: 'active',
        };
      }

      sessionStorage.setItem('qd_api_session_id', session.id);

      // Store consent data, URL params, and fingerprint as session metadata
      if (navigator.onLine) {
        const metadata: Record<string, unknown> = {};
        if (consentData) {
          metadata.consent = { ...consentData, timestamp: new Date().toISOString() };
        }
        if (data.urlParams && Object.keys(data.urlParams).length > 0) {
          metadata.urlParams = data.urlParams;
        }
        if (fraudFingerprint) {
          metadata.fingerprint = fraudFingerprint;
        }
        if (Object.keys(metadata).length > 0) {
          try {
            await api.sessions.update(session.id, { metadata } as any);
          } catch (err) {
            console.error('Failed to store session metadata:', err);
          }
        }
      }

      // Check quotas before starting runtime (online only)
      const quotaGroups = data.questionnaire.definition?.settings?.quotas;
      if (navigator.onLine && quotaGroups && quotaGroups.length > 0) {
        try {
          const urlParams = new Map(Object.entries(data.urlParams ?? {}));
          const quotaResult = await QuotaService.checkQuotas(
            data.questionnaire.id,
            quotaGroups,
            urlParams
          );
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
        } catch {
          // Non-critical: allow participation if quota check fails
        }
      }

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
    if (!canvas) {
      await tick();
      if (!canvas) {
        throw new Error('Runtime canvas is not ready');
      }
    }

    try {
      loading = true;
      loadingMessage = 'Initializing WebGL...';

      renderer = new WebGLRenderer({ canvas });

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
        questionnaire: data.questionnaire.definition,
        sessionId: session.id,
        participantId: data.participantId || undefined,
        conditionGroupCounts,
        enableOfflineSync: true,
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
    if (renderer && canvas) {
      renderer.resize(window.innerWidth, window.innerHeight);
    }
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
      questionnaire={data.questionnaire.definition}
      projectName={data.questionnaire.projectName}
      onStart={handleStart}
    />
  {:else if currentScreen === 'consent'}
    <ConsentScreen
      content={data.questionnaire.definition.consent?.content || ''}
      checkboxes={data.questionnaire.definition.consent?.checkboxes}
      requireSignature={data.questionnaire.definition.consent?.requireSignature}
      onAccept={handleConsent}
      onDecline={handleDeclineConsent}
    />
  {:else if currentScreen === 'runtime'}
    <canvas
      bind:this={canvas}
      class="fillout-canvas"
      width={window.innerWidth}
      height={window.innerHeight}
      data-testid="fillout-runtime-canvas"
    ></canvas>

    <div class="html-overlay" data-testid="fillout-runtime-overlay">
      <!-- Dynamic HTML content rendered here -->
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
      customMessage={data.questionnaire.definition.settings?.distribution?.completionMessage || data.questionnaire.definition.completionMessage}
      distributionSettings={data.questionnaire.definition.settings?.distribution}
      urlParams={data.urlParams}
      showStatistics={true}
      onClose={() => goto('/')}
    />
  {/if}
</div>

<style>
  .fillout-page {
    width: 100vw;
    height: 100vh;
    position: relative;
    overflow: hidden;
    background: var(--background);
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
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }

  .loading-progress {
    width: 200px;
    height: 4px;
    background: var(--muted);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 0.5rem;
  }

  .progress-bar {
    height: 100%;
    background: var(--primary);
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
