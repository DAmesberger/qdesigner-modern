<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type {
    DistributionSettings,
    UrlParameterConfig,
    PanelIntegrationConfig,
  } from '$lib/shared';
  import { Share2, X, Plus, Trash2, Copy, QrCode } from 'lucide-svelte';
  import { generateQrSvg } from './qr-code';

  let { open = $bindable(false) } = $props<{ open: boolean }>();

  let settings = $derived(
    designerStore.questionnaire.settings.distribution ?? {
      anonymousAccess: true,
      urlParameters: [],
      completionRedirectUrl: '',
      completionRedirectParams: [],
      completionMessage: '',
      panelIntegration: undefined,
      maxResponses: undefined,
      allowMultipleResponses: false,
      passwordProtection: '',
    }
  );

  // Local state
  let localAnonymousAccess = $state(true);
  let localUrlParams = $state<UrlParameterConfig[]>([]);
  let localRedirectUrl = $state('');
  let localRedirectParams = $state<string[]>([]);
  let localCompletionMessage = $state('');
  let localPanelProvider = $state<PanelIntegrationConfig['provider'] | ''>('');
  let localCompletionCode = $state('');
  let localPanelCompletionUrl = $state('');
  let localProlificStudyId = $state('');
  let localMturkHitId = $state('');
  let localSonaStudyId = $state('');
  let localMaxResponses = $state<number | undefined>(undefined);
  let localAllowMultiple = $state(false);
  let localPassword = $state('');
  let showQrCode = $state(false);
  let copied = $state(false);

  // Sync from store on open
  $effect(() => {
    if (open) {
      localAnonymousAccess = settings.anonymousAccess ?? true;
      localUrlParams = [...(settings.urlParameters ?? [])];
      localRedirectUrl = settings.completionRedirectUrl ?? '';
      localRedirectParams = [...(settings.completionRedirectParams ?? [])];
      localCompletionMessage = settings.completionMessage ?? '';
      localMaxResponses = settings.maxResponses;
      localAllowMultiple = settings.allowMultipleResponses ?? false;
      localPassword = settings.passwordProtection ?? '';
      showQrCode = false;
      copied = false;

      const panel = settings.panelIntegration;
      if (panel) {
        localPanelProvider = panel.provider;
        localCompletionCode = panel.completionCode ?? '';
        localPanelCompletionUrl = panel.completionUrl ?? '';
        localProlificStudyId = panel.prolificStudyId ?? '';
        localMturkHitId = panel.mturkHitId ?? '';
        localSonaStudyId = panel.sonaStudyId ?? '';
      } else {
        localPanelProvider = '';
        localCompletionCode = '';
        localPanelCompletionUrl = '';
        localProlificStudyId = '';
        localMturkHitId = '';
        localSonaStudyId = '';
      }
    }
  });

  const filloutUrl = $derived(() => {
    const code = designerStore.questionnaire.code;
    if (!code) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
    let url = `${origin}/${code}`;
    if (localUrlParams.length > 0) {
      const params = localUrlParams
        .map(
          (p) => `${encodeURIComponent(p.paramName)}={{${p.variableName}}}`
        )
        .join('&');
      url += `?${params}`;
    }
    return url;
  });

  function addUrlParam() {
    localUrlParams = [
      ...localUrlParams,
      { paramName: '', variableName: '', required: false },
    ];
  }

  function removeUrlParam(index: number) {
    localUrlParams = localUrlParams.filter((_, i) => i !== index);
  }

  function updateUrlParam(
    index: number,
    field: keyof UrlParameterConfig,
    value: string | boolean
  ) {
    localUrlParams = localUrlParams.map((p, i) =>
      i === index ? { ...p, [field]: value } : p
    );
  }

  async function copyUrl() {
    const url = filloutUrl();
    if (url) {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  }

  function save() {
    const panelIntegration: PanelIntegrationConfig | undefined =
      localPanelProvider
        ? {
            provider: localPanelProvider as PanelIntegrationConfig['provider'],
            completionCode: localCompletionCode || undefined,
            completionUrl: localPanelCompletionUrl || undefined,
            prolificStudyId: localProlificStudyId || undefined,
            mturkHitId: localMturkHitId || undefined,
            sonaStudyId: localSonaStudyId || undefined,
          }
        : undefined;

    const dist: DistributionSettings = {
      anonymousAccess: localAnonymousAccess,
      urlParameters: localUrlParams.filter((p) => p.paramName && p.variableName),
      completionRedirectUrl: localRedirectUrl || undefined,
      completionRedirectParams:
        localRedirectParams.length > 0 ? localRedirectParams : undefined,
      completionMessage: localCompletionMessage || undefined,
      panelIntegration,
      maxResponses: localMaxResponses && localMaxResponses > 0 ? localMaxResponses : undefined,
      allowMultipleResponses: localAllowMultiple || undefined,
      passwordProtection: localPassword || undefined,
    };

    designerStore.updateQuestionnaire({
      settings: {
        ...designerStore.questionnaire.settings,
        distribution: dist,
      },
    });

    open = false;
  }

  function cancel() {
    open = false;
  }
</script>

{#if open}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-layer-modal rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto border border-border"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-border">
        <div class="flex items-center gap-2">
          <Share2 class="w-5 h-5 text-primary" />
          <h3 class="text-lg font-semibold text-foreground">Distribution Settings</h3>
        </div>
        <button
          onclick={cancel}
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-6 space-y-6">
        <!-- Fillout URL -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-2">Fillout Link</h4>
          {#if filloutUrl()}
            <div class="flex items-center gap-2">
              <input
                type="text"
                readonly
                value={filloutUrl()}
                class="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-muted text-foreground font-mono"
                data-testid="dist-fillout-url"
              />
              <button
                onclick={copyUrl}
                class="px-3 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors flex items-center gap-1"
                title="Copy link"
              >
                <Copy class="w-4 h-4" />
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onclick={() => (showQrCode = !showQrCode)}
                class="px-3 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors"
                title="Show QR Code"
              >
                <QrCode class="w-4 h-4" />
              </button>
            </div>

            {#if showQrCode}
              <div class="mt-3 flex justify-center">
                <div class="p-4 bg-white rounded-lg border border-border inline-block">
                  {@html generateQrSvg(filloutUrl())}
                </div>
              </div>
              <p class="text-xs text-muted-foreground text-center mt-1">
                Right-click to save QR code as image
              </p>
            {/if}
          {:else}
            <p class="text-xs text-muted-foreground italic">
              Publish the questionnaire first to generate a fillout link.
            </p>
          {/if}
        </div>

        <!-- Access Settings -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">Access Control</h4>
          <div class="space-y-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={localAnonymousAccess}
                class="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span class="text-sm text-foreground">Allow anonymous access</span>
            </label>

            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={localAllowMultiple}
                class="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span class="text-sm text-foreground">Allow multiple responses per participant</span>
            </label>

            <div>
              <label for="dist-max-responses" class="block text-sm text-foreground mb-1">
                Maximum responses (0 = unlimited)
              </label>
              <input
                id="dist-max-responses"
                type="number"
                min="0"
                bind:value={localMaxResponses}
                class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                placeholder="Unlimited"
                data-testid="dist-max-responses"
              />
            </div>

            <div>
              <label for="dist-password" class="block text-sm text-foreground mb-1">
                Password protection (optional)
              </label>
              <input
                id="dist-password"
                type="text"
                bind:value={localPassword}
                class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                placeholder="Leave empty for no password"
                data-testid="dist-password"
              />
            </div>
          </div>
        </div>

        <!-- URL Parameters -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-medium text-foreground">URL Parameters</h4>
            <button
              onclick={addUrlParam}
              class="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus class="w-3.5 h-3.5" /> Add Parameter
            </button>
          </div>
          <p class="text-xs text-muted-foreground mb-3">
            Map URL query parameters to questionnaire variables. Example: ?PROLIFIC_PID=abc maps to a variable.
          </p>

          {#if localUrlParams.length === 0}
            <p class="text-xs text-muted-foreground italic py-2 text-center">
              No URL parameters configured.
            </p>
          {:else}
            <div class="space-y-2">
              <div class="grid grid-cols-[1fr_1fr_auto_auto] gap-2 text-xs text-muted-foreground font-medium">
                <span>URL Param</span>
                <span>Variable Name</span>
                <span>Req.</span>
                <span></span>
              </div>
              {#each localUrlParams as param, index (index)}
                <div class="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                  <input
                    type="text"
                    value={param.paramName}
                    oninput={(e) => updateUrlParam(index, 'paramName', e.currentTarget.value)}
                    class="px-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                    placeholder="e.g. PROLIFIC_PID"
                  />
                  <input
                    type="text"
                    value={param.variableName}
                    oninput={(e) => updateUrlParam(index, 'variableName', e.currentTarget.value)}
                    class="px-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                    placeholder="e.g. participantId"
                  />
                  <label class="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={param.required ?? false}
                      onchange={(e) => updateUrlParam(index, 'required', e.currentTarget.checked)}
                      class="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </label>
                  <button
                    onclick={() => removeUrlParam(index)}
                    class="p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                    aria-label="Remove parameter"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Completion Settings -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">Completion</h4>
          <div class="space-y-3">
            <div>
              <label for="dist-completion-message" class="block text-sm text-foreground mb-1">
                Custom completion message
              </label>
              <textarea
                id="dist-completion-message"
                bind:value={localCompletionMessage}
                class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary resize-y"
                rows="2"
                placeholder="Your responses have been successfully recorded."
                data-testid="dist-completion-message"
              ></textarea>
            </div>

            <div>
              <label for="dist-redirect-url" class="block text-sm text-foreground mb-1">
                Completion redirect URL
              </label>
              <input
                id="dist-redirect-url"
                type="text"
                bind:value={localRedirectUrl}
                class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                placeholder={"https://example.com/complete?code={{COMPLETION_CODE}}"}
                data-testid="dist-redirect-url"
              />
              <p class="text-xs text-muted-foreground mt-1">
                Use {'{{variableName}}'} for dynamic values. Available: {'{{COMPLETION_CODE}}'}, {'{{SESSION_ID}}'}, {'{{PARTICIPANT_ID}}'}, or any URL parameter name.
              </p>
            </div>
          </div>
        </div>

        <!-- Panel Integration -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">Panel Integration</h4>
          <div class="space-y-3">
            <div>
              <label for="dist-panel-provider" class="block text-sm text-foreground mb-1">
                Provider
              </label>
              <select
                id="dist-panel-provider"
                bind:value={localPanelProvider}
                class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                data-testid="dist-panel-provider"
              >
                <option value="">None</option>
                <option value="prolific">Prolific</option>
                <option value="mturk">Amazon Mechanical Turk</option>
                <option value="sona">SONA Systems</option>
                <option value="cloudresearch">CloudResearch</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {#if localPanelProvider}
              <div>
                <label for="dist-completion-code" class="block text-sm text-foreground mb-1">
                  Completion Code
                </label>
                <input
                  id="dist-completion-code"
                  type="text"
                  bind:value={localCompletionCode}
                  class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                  placeholder="Auto-generated if empty"
                  data-testid="dist-completion-code"
                />
              </div>

              {#if localPanelProvider === 'prolific'}
                <div>
                  <label for="dist-prolific-study" class="block text-sm text-foreground mb-1">
                    Prolific Study ID
                  </label>
                  <input
                    id="dist-prolific-study"
                    type="text"
                    bind:value={localProlificStudyId}
                    class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                    placeholder="e.g. 64a1b2c3d4e5f6"
                  />
                  <p class="text-xs text-muted-foreground mt-1">
                    Participants will be auto-redirected to Prolific with the completion code on finish.
                    Add PROLIFIC_PID as a URL parameter above to capture participant IDs.
                  </p>
                </div>
              {:else if localPanelProvider === 'mturk'}
                <div>
                  <label for="dist-mturk-hit" class="block text-sm text-foreground mb-1">
                    MTurk HIT ID
                  </label>
                  <input
                    id="dist-mturk-hit"
                    type="text"
                    bind:value={localMturkHitId}
                    class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                    placeholder="e.g. 3ABC123DEF456"
                  />
                  <p class="text-xs text-muted-foreground mt-1">
                    A submit form will be shown on completion. Add workerId and assignmentId as URL parameters.
                  </p>
                </div>
              {:else if localPanelProvider === 'sona'}
                <div>
                  <label for="dist-sona-study" class="block text-sm text-foreground mb-1">
                    SONA Study ID
                  </label>
                  <input
                    id="dist-sona-study"
                    type="text"
                    bind:value={localSonaStudyId}
                    class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                    placeholder="e.g. 12345"
                  />
                </div>
                <div>
                  <label for="dist-sona-url" class="block text-sm text-foreground mb-1">
                    SONA Completion URL
                  </label>
                  <input
                    id="dist-sona-url"
                    type="text"
                    bind:value={localPanelCompletionUrl}
                    class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                    placeholder="https://yourschool.sona-systems.com/webstudy_credit.aspx"
                  />
                </div>
              {:else if localPanelProvider === 'cloudresearch'}
                <div>
                  <label for="dist-cr-url" class="block text-sm text-foreground mb-1">
                    CloudResearch Completion URL
                  </label>
                  <input
                    id="dist-cr-url"
                    type="text"
                    bind:value={localPanelCompletionUrl}
                    class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                    placeholder="Completion URL from CloudResearch"
                  />
                </div>
              {:else if localPanelProvider === 'custom'}
                <div>
                  <label for="dist-custom-url" class="block text-sm text-foreground mb-1">
                    Custom Completion URL
                  </label>
                  <input
                    id="dist-custom-url"
                    type="text"
                    bind:value={localPanelCompletionUrl}
                    class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                    placeholder={"https://your-panel.com/complete?code={{COMPLETION_CODE}}"}
                  />
                  <p class="text-xs text-muted-foreground mt-1">
                    Use {'{{COMPLETION_CODE}}'} to include the generated code in the URL.
                  </p>
                </div>
              {/if}
            {/if}
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-3 px-6 py-4 border-t border-border">
        <button
          onclick={cancel}
          class="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={save}
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          data-testid="dist-save"
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}
