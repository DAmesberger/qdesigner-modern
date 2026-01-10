<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { serviceWorkerProgress } from '$lib/services/serviceWorkerProgress';

  interface LoadingStage {
    id: string;
    name: string;
    weight: number; // Percentage weight of this stage
    status: 'pending' | 'loading' | 'complete' | 'error';
    message?: string;
  }

  let stages = $state<LoadingStage[]>([
    {
      id: 'service-worker',
      name: 'Installing offline capabilities',
      weight: 10,
      status: 'pending',
    },
    { id: 'core-bundle', name: 'Loading application core', weight: 20, status: 'pending' },
    { id: 'auth', name: 'Checking authentication', weight: 10, status: 'pending' },
    { id: 'resources', name: 'Loading essential resources', weight: 30, status: 'pending' },
    { id: 'features', name: 'Loading features', weight: 20, status: 'pending' },
    { id: 'data', name: 'Preparing offline data', weight: 10, status: 'pending' },
  ]);

  const progress = tweened(0, {
    duration: 300,
    easing: cubicOut,
  });

  let currentStage = $state<string>('');
  let errorMessage = $state<string>('');
  let showRetry = $state(false);
  let startTime = Date.now();
  let estimatedTime = $state<number | null>(null);

  // Resource tracking
  let totalResources = $state(0);
  let loadedResources = $state(0);

  // Calculate overall progress
  $effect(() => {
    let totalProgress = 0;
    let completedWeight = 0;

    for (const stage of stages) {
      if (stage.status === 'complete') {
        completedWeight += stage.weight;
      } else if (stage.status === 'loading' && totalResources > 0) {
        // For current stage, use resource loading progress
        const stageProgress = (loadedResources / totalResources) * stage.weight;
        completedWeight += stageProgress;
      }
    }

    progress.set(completedWeight);
  });

  // Update current stage message
  $effect(() => {
    const activeStage = stages.find((s) => s.status === 'loading');
    if (activeStage) {
      currentStage = activeStage.message || activeStage.name;
    }
  });

  async function updateStage(stageId: string, status: LoadingStage['status'], message?: string) {
    const stage = stages.find((s) => s.id === stageId);
    if (stage) {
      stage.status = status;
      if (message) stage.message = message;
      stages = [...stages]; // Trigger reactivity
    }
  }

  async function trackServiceWorker() {
    updateStage('service-worker', 'loading');

    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');

        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;

        updateStage('service-worker', 'complete');
      } catch (error) {
        console.error('Service worker registration failed:', error);
        updateStage('service-worker', 'error', 'Offline mode unavailable');
        // Continue without service worker
      }
    } else {
      updateStage('service-worker', 'complete', 'Offline mode not supported');
    }
  }

  async function loadApplication() {
    try {
      // Stage 1: Service Worker
      await trackServiceWorker();

      // Stage 2: Core Bundle (handled by SvelteKit)
      updateStage('core-bundle', 'loading');
      // This stage completes when the component mounts
      updateStage('core-bundle', 'complete');

      // Stage 3: Authentication
      updateStage('auth', 'loading');
      // Check auth state (implement based on your auth system)
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate auth check
      updateStage('auth', 'complete');

      // Stage 4: Resources
      updateStage('resources', 'loading', 'Loading fonts and icons...');
      totalResources = 10; // Example
      for (let i = 0; i < totalResources; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate resource loading
        loadedResources = i + 1;
      }
      updateStage('resources', 'complete');

      // Stage 5: Features
      updateStage('features', 'loading', 'Loading question types...');
      await new Promise((resolve) => setTimeout(resolve, 800)); // Simulate feature loading
      updateStage('features', 'complete');

      // Stage 6: Data
      updateStage('data', 'loading', 'Syncing offline data...');
      await new Promise((resolve) => setTimeout(resolve, 600)); // Simulate data sync
      updateStage('data', 'complete');

      // Hide loader from app-shell.html if it exists
      if ((window as any).AppLoader) {
        (window as any).AppLoader.hide();
      }
    } catch (error) {
      console.error('Loading error:', error);
      errorMessage = error instanceof Error ? error.message : 'Failed to load application';
      showRetry = true;
    }
  }

  function retry() {
    errorMessage = '';
    showRetry = false;
    stages = stages.map((s) => ({ ...s, status: 'pending' }));
    loadedResources = 0;
    totalResources = 0;
    loadApplication();
  }

  onMount(() => {
    // Initialize service worker progress tracking
    serviceWorkerProgress.init();

    // Subscribe to service worker progress
    const unsubscribe = serviceWorkerProgress.subscribe((state) => {
      if (state.type === 'loading' && state.stage === 'caching') {
        // Update resources stage with SW progress
        totalResources = state.total;
        loadedResources = state.loaded;
        updateStage(
          'resources',
          'loading',
          state.resource ? `Caching ${state.resource}` : 'Caching resources...'
        );
      }
    });

    loadApplication();

    return () => {
      unsubscribe();
      serviceWorkerProgress.destroy();
    };
  });
</script>

<div class="app-loader" class:error={showRetry}>
  <div class="loader-content">
    <h1 class="logo">QDesigner</h1>

    <div class="progress-container">
      <div class="progress-bar">
        <div class="progress-fill" style="width: {$progress}%">
          <div class="progress-shimmer"></div>
        </div>
      </div>

      <div class="progress-text">{Math.round($progress)}%</div>
    </div>

    <div class="status">
      {#if errorMessage}
        <p class="error-message">{errorMessage}</p>
      {:else}
        <p class="status-message">{currentStage}</p>
      {/if}

      {#if totalResources > 0 && !errorMessage}
        <p class="resource-count">
          {loadedResources} / {totalResources} resources
        </p>
      {/if}
    </div>

    <div class="stages">
      {#each stages as stage}
        <div
          class="stage"
          class:complete={stage.status === 'complete'}
          class:loading={stage.status === 'loading'}
        >
          <div class="stage-icon">
            {#if stage.status === 'complete'}
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
            {:else if stage.status === 'loading'}
              <div class="spinner"></div>
            {:else}
              <div class="dot"></div>
            {/if}
          </div>
          <span class="stage-name">{stage.name}</span>
        </div>
      {/each}
    </div>

    {#if showRetry}
      <button class="retry-button" onclick={retry}> Retry Loading </button>
    {/if}
  </div>
</div>

<style>
  .app-loader {
    position: fixed;
    inset: 0;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .app-loader.error {
    background: #fef2f2;
  }

  .loader-content {
    width: 90%;
    max-width: 420px;
    text-align: center;
  }

  .logo {
    font-size: 3rem;
    font-weight: 700;
    color: #4f46e5;
    margin: 0 0 3rem;
    letter-spacing: -0.025em;
  }

  .progress-container {
    position: relative;
    margin-bottom: 2rem;
  }

  .progress-bar {
    height: 12px;
    background: #e5e7eb;
    border-radius: 9999px;
    overflow: hidden;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%);
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .progress-shimmer {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
    transform: translateX(-100%);
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    100% {
      transform: translateX(100%);
    }
  }

  .progress-text {
    position: absolute;
    right: 0;
    top: -1.75rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #4f46e5;
  }

  .status {
    margin-bottom: 2rem;
    min-height: 3rem;
  }

  .status-message {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0 0 0.25rem;
  }

  .resource-count {
    font-size: 0.75rem;
    color: #9ca3af;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .error-message {
    color: #dc2626;
    font-weight: 500;
    margin: 0 0 1rem;
  }

  .stages {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    text-align: left;
    margin-bottom: 2rem;
  }

  .stage {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: #9ca3af;
    transition: color 0.2s;
  }

  .stage.loading {
    color: #4f46e5;
    font-weight: 500;
  }

  .stage.complete {
    color: #10b981;
  }

  .stage-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: #d1d5db;
    border-radius: 50%;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #e5e7eb;
    border-top-color: #4f46e5;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .retry-button {
    padding: 0.625rem 1.5rem;
    background: #4f46e5;
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .retry-button:hover {
    background: #4338ca;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }

  .retry-button:active {
    transform: translateY(0);
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .app-loader {
      background: #111827;
    }

    .app-loader.error {
      background: #1f1315;
    }

    .progress-bar {
      background: #374151;
    }

    .status-message {
      color: #9ca3af;
    }

    .resource-count {
      color: #6b7280;
    }

    .stage {
      color: #6b7280;
    }

    .stage.loading {
      color: #818cf8;
    }

    .stage.complete {
      color: #34d399;
    }

    .dot {
      background: #4b5563;
    }

    .spinner {
      border-color: #374151;
      border-top-color: #818cf8;
    }
  }
</style>
