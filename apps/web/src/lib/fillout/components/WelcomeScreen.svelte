<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import LanguagePicker from './LanguagePicker.svelte';
  import { m } from '$lib/paraglide/messages';
  import type { Questionnaire } from '$lib/shared/types/questionnaire';

  interface LocaleOption {
    code: string;
    label: string;
  }

  interface Props {
    questionnaire: Questionnaire;
    projectName?: string;
    onStart: () => void;
    estimatedDuration?: number;
    /** Localized welcome message (MOD-04, ADR 0022); falls back to description. */
    welcomeMessage?: string;
    /** Available content locales; the picker shows only when there is more than one. */
    languageOptions?: LocaleOption[];
    activeLocale?: string;
    onLocaleChange?: (code: string) => void;
    /**
     * A compatible save-and-continue snapshot exists for this session (E-FLOW-3, FIX-F12).
     * When true (and both callbacks are supplied) the single Start action is replaced by a
     * "Continue where you left off" / "Start over" choice.
     */
    hasResumeState?: boolean;
    /** Resume from the saved position. */
    onContinue?: () => void;
    /** Discard the saved position and begin fresh at the first question. */
    onStartOver?: () => void;
    /**
     * Show the photosensitivity advisory (F097). True when the questionnaire contains a
     * reaction paradigm, which alternates high-contrast stimuli at 250-500ms ISIs.
     */
    showPhotosensitivityAdvisory?: boolean;
    /**
     * The participant's OS requests reduced motion. Used only to STRENGTHEN the advisory
     * copy — timings are never altered per motion preference (that would break
     * cross-participant data comparability); the accommodation is informed consent.
     */
    prefersReducedMotion?: boolean;
    /**
     * Explicit offline provisioning (F-21). When `onPrepareOffline` is supplied, an
     * unobtrusive secondary control lets a field participant prefetch the whole study for
     * offline use. `offlineState` drives its label/status; `offlineDone` / `offlineTotal`
     * feed the "N of M" progress. Omitting `onPrepareOffline` hides the affordance entirely.
     */
    offlineState?: 'idle' | 'preparing' | 'ready' | 'partial' | 'quota-exceeded' | 'error';
    offlineDone?: number;
    offlineTotal?: number;
    onPrepareOffline?: () => void;
  }

  let {
    questionnaire,
    projectName,
    onStart,
    estimatedDuration,
    welcomeMessage,
    languageOptions = [],
    activeLocale = '',
    onLocaleChange,
    hasResumeState = false,
    onContinue,
    onStartOver,
    showPhotosensitivityAdvisory = false,
    prefersReducedMotion = false,
    offlineState = 'idle',
    offlineDone = 0,
    offlineTotal = 0,
    onPrepareOffline,
  }: Props = $props();

  // Offer the resume choice only when the caller both flagged a compatible snapshot AND
  // wired both actions; otherwise fall back to the unchanged single Start button.
  const showResumeChoice = $derived(hasResumeState && !!onContinue && !!onStartOver);

  const welcomeText = $derived(welcomeMessage?.trim() ? welcomeMessage : questionnaire.description);

  // Calculate estimated duration from questions if not provided
  const calculatedDuration = $derived.by(() => {
    if (estimatedDuration) return estimatedDuration;

    const questionCount =
      questionnaire.pages?.reduce(
        (total: number, page: any) => total + (page.questions?.length || 0),
        0
      ) || 0;

    // Rough estimate: 30 seconds per question
    return Math.ceil(questionCount * 0.5);
  });
</script>

<div class="welcome-screen" data-testid="fillout-welcome-screen">
  <Card class="welcome-card">
    <div class="welcome-content">
      {#if onLocaleChange}
        <LanguagePicker options={languageOptions} active={activeLocale} onSelect={onLocaleChange} />
      {/if}

      {#if projectName}
        <p class="project-name">{projectName}</p>
      {/if}

      <h1 class="welcome-title" data-testid="fillout-welcome-title">
        {questionnaire.name || m.fillout_welcome_default_title()}
      </h1>

      {#if welcomeText}
        <p class="welcome-description">{welcomeText}</p>
      {/if}

      <div class="info-grid">
        {#if calculatedDuration > 0}
          <div class="info-item">
            <svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" stroke-width="2" />
              <path d="M12 6v6l4 2" stroke-width="2" stroke-linecap="round" />
            </svg>
            <span>{m.fillout_welcome_minutes({ minutes: calculatedDuration })}</span>
          </div>
        {/if}

        {#if questionnaire.pages?.length}
          <div class="info-item">
            <svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="5" y="3" width="14" height="18" rx="2" stroke-width="2" />
              <line x1="9" y1="7" x2="15" y2="7" stroke-width="2" stroke-linecap="round" />
              <line x1="9" y1="11" x2="15" y2="11" stroke-width="2" stroke-linecap="round" />
              <line x1="9" y1="15" x2="13" y2="15" stroke-width="2" stroke-linecap="round" />
            </svg>
            <span>{m.fillout_welcome_sections({ count: questionnaire.pages.length })}</span>
          </div>
        {/if}
      </div>

      {#if questionnaire.settings?.requireConsent}
        <div class="instructions">
          <h3>{m.fillout_welcome_consent_heading()}</h3>
          <div class="instructions-content">
            <p>{m.fillout_welcome_consent_body()}</p>
          </div>
        </div>
      {/if}

      {#if showPhotosensitivityAdvisory}
        <div
          class="photosensitivity-advisory bg-muted border-border text-foreground"
          role="note"
          data-testid="fillout-photosensitivity-advisory"
        >
          <h3 class="text-foreground">{m.fillout_welcome_photosensitivity_title()}</h3>
          <p>{m.fillout_welcome_photosensitivity_body()}</p>
          {#if prefersReducedMotion}
            <p data-testid="fillout-photosensitivity-reduced-motion">
              {m.fillout_welcome_photosensitivity_reduced_motion()}
            </p>
          {/if}
        </div>
      {/if}

      <div class="actions">
        {#if showResumeChoice}
          <div class="resume-choice" data-testid="fillout-resume-choice">
            <Button
              variant="default"
              size="lg"
              onclick={onContinue}
              class="start-button"
              data-testid="fillout-continue-button"
            >
              {m.fillout_welcome_resume_continue()}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onclick={onStartOver}
              data-testid="fillout-start-over-button"
            >
              {m.fillout_welcome_resume_start_over()}
            </Button>
          </div>
        {:else}
          <Button
            variant="default"
            size="lg"
            onclick={onStart}
            class="start-button"
            data-testid="fillout-start-button"
          >
            {m.fillout_welcome_start()}
          </Button>
        {/if}
      </div>

      {#if onPrepareOffline}
        <!-- Explicit offline provisioning (F-21): unobtrusive secondary control. Lets a
             field participant download the whole study up front and confirm it's ready. -->
        <div class="offline-prep" data-testid="fillout-offline-prep">
          {#if offlineState === 'ready'}
            <p class="offline-prep-status offline-prep-ready" data-testid="fillout-offline-ready">
              <svg class="offline-prep-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M20 6 9 17l-5-5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {m.fillout_welcome_offline_ready()}
            </p>
          {:else if offlineState === 'preparing'}
            <p class="offline-prep-status" data-testid="fillout-offline-preparing" aria-live="polite">
              {m.fillout_welcome_offline_preparing()}{#if offlineTotal > 0}
                {' '}{m.fillout_welcome_offline_progress({ done: offlineDone, total: offlineTotal })}{/if}
            </p>
          {:else if offlineState === 'quota-exceeded'}
            <p class="offline-prep-status offline-prep-warn" data-testid="fillout-offline-quota" role="status">
              {m.fillout_welcome_offline_quota_exceeded()}
            </p>
          {:else}
            {#if offlineState === 'partial'}
              <p class="offline-prep-status offline-prep-warn" data-testid="fillout-offline-partial" role="status">
                {m.fillout_welcome_offline_partial({ done: offlineDone, total: offlineTotal })}
              </p>
            {:else if offlineState === 'error'}
              <p class="offline-prep-status offline-prep-warn" data-testid="fillout-offline-error" role="status">
                {m.fillout_welcome_offline_error()}
              </p>
            {/if}
            <button
              type="button"
              class="offline-prep-button"
              data-testid="fillout-offline-prepare-button"
              onclick={onPrepareOffline}
            >
              {offlineState === 'partial' || offlineState === 'error'
                ? m.fillout_welcome_offline_retry()
                : m.fillout_welcome_offline_make_available()}
            </button>
          {/if}
        </div>
      {/if}

      {#if questionnaire.settings?.requireAuthentication || questionnaire.settings?.requireConsent}
        <p class="privacy-notice">
          {m.fillout_welcome_privacy_notice()}
        </p>
      {/if}
    </div>
  </Card>
</div>

<style>
  .welcome-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: hsl(var(--background));
  }

  :global(.welcome-card) {
    width: 100%;
    max-width: 600px;
  }

  .welcome-content {
    padding: 2rem;
    text-align: center;
  }

  .project-name {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .welcome-title {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: hsl(var(--foreground));
  }

  .welcome-description {
    font-size: 1.125rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 2rem;
    line-height: 1.6;
  }

  .info-grid {
    display: flex;
    gap: 2rem;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
  }

  .info-icon {
    width: 1.25rem;
    height: 1.25rem;
    opacity: 0.7;
  }

  .instructions {
    background: hsl(var(--muted));
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin-bottom: 2rem;
    text-align: left;
  }

  .instructions h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    color: hsl(var(--foreground));
  }

  .instructions-content {
    font-size: 0.875rem;
    line-height: 1.6;
    color: hsl(var(--muted-foreground));
  }

  .instructions-content :global(ul) {
    list-style: disc;
    margin-left: 1.5rem;
    margin-top: 0.5rem;
  }

  .instructions-content :global(li) {
    margin-bottom: 0.25rem;
  }

  .photosensitivity-advisory {
    border-width: 1px;
    border-style: solid;
    border-radius: 0.5rem;
    padding: 1.25rem 1.5rem;
    margin-bottom: 2rem;
    text-align: left;
  }

  .photosensitivity-advisory h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .photosensitivity-advisory p {
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .photosensitivity-advisory p + p {
    margin-top: 0.75rem;
  }

  .actions {
    margin-bottom: 1.5rem;
  }

  .resume-choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  :global(.start-button) {
    min-width: 200px;
  }

  /* Explicit offline provisioning (F-21): a quiet, secondary affordance below the primary
     start action — present for field use, never competing with it. */
  .offline-prep {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .offline-prep-status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: hsl(var(--muted-foreground));
    max-width: 30rem;
  }

  .offline-prep-ready {
    color: hsl(var(--foreground));
    font-weight: 500;
  }

  .offline-prep-warn {
    color: hsl(var(--foreground));
  }

  .offline-prep-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .offline-prep-button {
    padding: 0.375rem 0.875rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--border));
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .offline-prep-button:hover {
    color: hsl(var(--foreground));
    border-color: hsl(var(--foreground) / 0.4);
  }

  .privacy-notice {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    opacity: 0.8;
  }

  @media (max-width: 640px) {
    .welcome-content {
      padding: 1.5rem;
    }

    .welcome-title {
      font-size: 1.5rem;
    }

    .info-grid {
      flex-direction: column;
      gap: 1rem;
    }
  }
</style>
