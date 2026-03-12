<script lang="ts">
  import Button from '$lib/components/common/Button.svelte';
  import Card from '$lib/components/common/Card.svelte';
  import type { QuestionnaireSession } from '$lib/shared';
  import type { DistributionSettings } from '$lib/shared/types/questionnaire';
  import type { ScoreInterpreterConfig } from '$lib/runtime/feedback/ScoreInterpreter';
  import { generateReport, type ReportConfig } from '$lib/runtime/feedback/ReportGenerator';

  interface Props {
    session?: QuestionnaireSession;
    customMessage?: string;
    showStatistics?: boolean;
    showDownload?: boolean;
    /** Score interpretation configs for PDF report generation */
    scoreConfigs?: ScoreInterpreterConfig[];
    /** Variables/scores available for interpretation */
    variables?: Record<string, unknown>;
    /** Report title override */
    reportTitle?: string;
    /** Distribution settings for redirect/panel behavior */
    distributionSettings?: DistributionSettings;
    /** URL params captured at fillout start, used for redirect variable substitution */
    urlParams?: Record<string, string>;
    onClose?: () => void;
    onDownload?: () => void;
  }

  let {
    session,
    customMessage,
    showStatistics = true,
    showDownload = false,
    scoreConfigs = [],
    variables = {},
    reportTitle,
    distributionSettings,
    urlParams = {},
    onClose,
    onDownload,
  }: Props = $props();

  let generatingReport = $state(false);
  let redirectCountdown = $state(5);

  // Calculate statistics
  const duration = $derived(() => {
    if (!session?.startTime || !session?.endTime) return null;
    const ms = session.endTime - session.startTime;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  const completionCode = $derived(() => {
    if (distributionSettings?.panelIntegration?.completionCode) {
      return distributionSettings.panelIntegration.completionCode;
    }
    // Generate a completion code from session ID
    return session?.id.slice(-8).toUpperCase() || 'COMPLETE';
  });

  // Build redirect URL with variable substitution
  const redirectUrl = $derived(() => {
    const panel = distributionSettings?.panelIntegration;
    let url = distributionSettings?.completionRedirectUrl || panel?.completionUrl || '';
    if (!url) return null;

    // Substitute {{variableName}} with actual values from urlParams and variables
    url = url.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
      if (varName in urlParams) return encodeURIComponent(urlParams[varName] ?? '');
      if (varName in variables) return encodeURIComponent(String(variables[varName] ?? ''));
      if (varName === 'COMPLETION_CODE') return encodeURIComponent(completionCode());
      if (varName === 'SESSION_ID') return encodeURIComponent(session?.id ?? '');
      if (varName === 'PARTICIPANT_ID') return encodeURIComponent(session?.participantId ?? '');
      return '';
    });

    // Append specified params
    if (distributionSettings?.completionRedirectParams?.length) {
      const separator = url.includes('?') ? '&' : '?';
      const params = distributionSettings.completionRedirectParams
        .map((p) => {
          const val = urlParams[p] ?? (variables[p] != null ? String(variables[p]) : '');
          return `${encodeURIComponent(p)}=${encodeURIComponent(val)}`;
        })
        .join('&');
      url = `${url}${separator}${params}`;
    }

    return url;
  });

  // Panel-specific redirect URLs
  const panelRedirectUrl = $derived(() => {
    const panel = distributionSettings?.panelIntegration;
    if (!panel) return null;

    switch (panel.provider) {
      case 'prolific':
        return `https://app.prolific.com/submissions/complete?cc=${encodeURIComponent(completionCode())}`;
      case 'sona': {
        const base = panel.completionUrl;
        if (!base) return null;
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}survey_code=${encodeURIComponent(completionCode())}`;
      }
      default:
        return null;
    }
  });

  const effectiveRedirectUrl = $derived(() => redirectUrl() || panelRedirectUrl());

  // Auto-redirect countdown
  $effect(() => {
    const target = effectiveRedirectUrl();
    if (!target) return;

    redirectCountdown = 5;
    const interval = setInterval(() => {
      redirectCountdown--;
      if (redirectCountdown <= 0) {
        clearInterval(interval);
        window.location.href = target;
      }
    }, 1000);

    return () => clearInterval(interval);
  });

  function handleClose() {
    if (onClose) {
      onClose();
    } else {
      // Default to going home
      window.location.href = '/';
    }
  }

  async function handleDownloadReport() {
    if (generatingReport || scoreConfigs.length === 0) return;
    generatingReport = true;
    try {
      const config: ReportConfig = {
        title: reportTitle || 'Participant Feedback Report',
        participantId: session?.participantId ?? undefined,
        scoreConfigs,
        includeChart: true,
      };
      await generateReport(config, { variables });
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
    } finally {
      generatingReport = false;
    }
  }

  const showReportButton = $derived(scoreConfigs.length > 0);
</script>

<div class="min-h-screen flex items-center justify-center p-4 bg-background" data-testid="fillout-completion-screen">
  <Card class="completion-card">
    <div class="completion-content p-8 text-center">
      <!-- Success icon -->
      <div class="w-16 h-16 mx-auto mb-6 text-success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-full h-full">
          <circle cx="12" cy="12" r="10" stroke-width="2" />
          <path d="M8 12l3 3 5-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>

      <h1 class="text-3xl font-bold mb-4 text-foreground" data-testid="fillout-completion-title">Thank You!</h1>

      <p class="text-lg text-muted-foreground mb-8 leading-relaxed">
        {customMessage || 'Your responses have been successfully recorded.'}
      </p>

      {#if showStatistics && session}
        <div class="flex gap-8 justify-center mb-8 p-6 bg-muted rounded-lg">
          {#if duration()}
            <div class="flex flex-col gap-1">
              <span class="text-sm text-muted-foreground">Time taken</span>
              <span class="text-2xl font-semibold text-foreground">{duration()}</span>
            </div>
          {/if}

          {#if session.responses?.length}
            <div class="flex flex-col gap-1">
              <span class="text-sm text-muted-foreground">Questions answered</span>
              <span class="text-2xl font-semibold text-foreground">{session.responses.length}</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Completion code -->
      <div class="mb-8 p-6 bg-muted rounded-lg">
        <p class="text-sm text-muted-foreground mb-2">Your completion code:</p>
        <div class="flex items-center justify-center gap-2 mb-2">
          <code class="text-2xl font-semibold tracking-widest text-primary font-mono">{completionCode()}</code>
          <button
            class="w-8 h-8 p-1.5 bg-background border border-border rounded-md cursor-pointer transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95"
            onclick={() => navigator.clipboard.writeText(completionCode())}
            title="Copy to clipboard"
            aria-label="Copy to clipboard"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-full h-full">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke-width="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke-width="2" />
            </svg>
          </button>
        </div>
        <p class="text-xs text-muted-foreground opacity-80">Please save this code for your records.</p>
      </div>

      <!-- Panel integration / redirect info -->
      {#if effectiveRedirectUrl()}
        <div class="mb-6 p-4 bg-muted rounded-lg text-center" data-testid="fillout-redirect-info">
          {#if distributionSettings?.panelIntegration}
            <p class="text-sm text-foreground mb-2">
              Redirecting to {distributionSettings.panelIntegration.provider === 'prolific'
                ? 'Prolific'
                : distributionSettings.panelIntegration.provider === 'mturk'
                  ? 'MTurk'
                  : distributionSettings.panelIntegration.provider === 'sona'
                    ? 'SONA'
                    : distributionSettings.panelIntegration.provider === 'cloudresearch'
                      ? 'CloudResearch'
                      : 'completion page'} in {redirectCountdown} seconds...
            </p>
          {:else}
            <p class="text-sm text-foreground mb-2">
              Redirecting in {redirectCountdown} seconds...
            </p>
          {/if}
          <a href={effectiveRedirectUrl()} class="text-xs text-primary underline">Click here if not redirected automatically</a>
        </div>
      {/if}

      <!-- MTurk submit form -->
      {#if distributionSettings?.panelIntegration?.provider === 'mturk' && distributionSettings.panelIntegration.mturkHitId}
        <div class="mb-6 text-center" data-testid="fillout-mturk-form">
          <form
            method="POST"
            action="https://www.mturk.com/mturk/externalSubmit"
          >
            <input type="hidden" name="assignmentId" value={urlParams['assignmentId'] ?? ''} />
            <input type="hidden" name="completionCode" value={completionCode()} />
            <Button variant="default" size="lg" type="submit">
              Submit HIT
            </Button>
          </form>
        </div>
      {/if}

      <div class="flex gap-4 justify-center mb-6">
        {#if showDownload && onDownload}
          <Button variant="outline" size="lg" onclick={onDownload}>Download Responses</Button>
        {/if}

        {#if showReportButton}
          <Button
            variant="outline"
            size="lg"
            onclick={handleDownloadReport}
            disabled={generatingReport}
          >
            {generatingReport ? 'Generating...' : 'Download Report (PDF)'}
          </Button>
        {/if}

        <Button variant="default" size="lg" onclick={handleClose}>
          {onClose ? 'Close' : 'Return Home'}
        </Button>
      </div>

      <p class="text-xs text-muted-foreground opacity-80">
        If you have any questions about this study, please contact the research team.
      </p>
    </div>
  </Card>
</div>

<style>
  :global(.completion-card) {
    width: 100%;
    max-width: 600px;
  }

  @media (max-width: 640px) {
    .completion-content {
      padding: 1.5rem;
    }
  }
</style>
