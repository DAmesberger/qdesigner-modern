<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { FraudPreventionSettings } from '$lib/shared';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  let { open = $bindable(false) } = $props<{ open: boolean }>();

  const defaults: FraudPreventionSettings = {
    preventDuplicates: false,
    duplicateDetectionMethod: 'combined',
    enableHoneypot: false,
    enableBehaviorAnalysis: false,
    enableSpeederDetection: false,
    speederThresholdMultiplier: 1.0,
    enableFlatlineDetection: false,
    flatlineThreshold: 0.8,
    fraudAction: 'flag',
  };

  let settings = $derived(
    designerStore.questionnaire.settings.fraudPrevention ?? { ...defaults }
  );

  let localPreventDuplicates = $state(false);
  let localDuplicateMethod = $state<FraudPreventionSettings['duplicateDetectionMethod']>('combined');
  let localEnableHoneypot = $state(false);
  let localEnableBehavior = $state(false);
  let localAllowedCountries = $state('');
  let localBlockedCountries = $state('');
  let localEnableSpeeder = $state(false);
  let localSpeederMultiplier = $state(1.0);
  let localEnableFlatline = $state(false);
  let localFlatlineThreshold = $state(0.8);
  let localFraudAction = $state<FraudPreventionSettings['fraudAction']>('flag');
  let localRedirectUrl = $state('');
  let localFraudMessage = $state('');

  $effect(() => {
    if (open) {
      localPreventDuplicates = settings.preventDuplicates;
      localDuplicateMethod = settings.duplicateDetectionMethod;
      localEnableHoneypot = settings.enableHoneypot;
      localEnableBehavior = settings.enableBehaviorAnalysis;
      localAllowedCountries = (settings.allowedCountries ?? []).join(', ');
      localBlockedCountries = (settings.blockedCountries ?? []).join(', ');
      localEnableSpeeder = settings.enableSpeederDetection;
      localSpeederMultiplier = settings.speederThresholdMultiplier ?? 1.0;
      localEnableFlatline = settings.enableFlatlineDetection;
      localFlatlineThreshold = settings.flatlineThreshold ?? 0.8;
      localFraudAction = settings.fraudAction;
      localRedirectUrl = settings.fraudRedirectUrl ?? '';
      localFraudMessage = settings.fraudMessage ?? '';
    }
  });

  function parseCountryList(s: string): string[] | undefined {
    const items = s.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }

  function save() {
    const fp: FraudPreventionSettings = {
      preventDuplicates: localPreventDuplicates,
      duplicateDetectionMethod: localDuplicateMethod,
      enableHoneypot: localEnableHoneypot,
      enableBehaviorAnalysis: localEnableBehavior,
      allowedCountries: parseCountryList(localAllowedCountries),
      blockedCountries: parseCountryList(localBlockedCountries),
      enableSpeederDetection: localEnableSpeeder,
      speederThresholdMultiplier: localSpeederMultiplier,
      enableFlatlineDetection: localEnableFlatline,
      flatlineThreshold: localFlatlineThreshold,
      fraudAction: localFraudAction,
      fraudRedirectUrl: localRedirectUrl || undefined,
      fraudMessage: localFraudMessage || undefined,
    };

    designerStore.updateQuestionnaire({
      settings: {
        ...designerStore.questionnaire.settings,
        fraudPrevention: fp,
      },
    });

    open = false;
  }

  function cancel() {
    open = false;
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary';
  const labelClass = 'block text-sm text-foreground mb-1';
  const hintClass = 'text-xs text-muted-foreground mt-1';
</script>

<Dialog bind:open={open} title="Fraud Prevention" size="md" onclose={cancel}>
  <div class="space-y-6">
        <!-- Duplicate Prevention -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">Duplicate Prevention</h4>
          <div class="space-y-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={localPreventDuplicates}
                class="rounded border-border text-primary focus:ring-primary"
                data-testid="fp-prevent-duplicates"
              />
              <span class="text-sm text-foreground">Prevent duplicate submissions</span>
            </label>

            {#if localPreventDuplicates}
              <div>
                <label for="fp-dup-method" class={labelClass}>Detection method</label>
                <Select
                  id="fp-dup-method"
                  bind:value={localDuplicateMethod}
                  placeholder=""
                >
                  <option value="fingerprint">Browser fingerprint</option>
                  <option value="cookie">Cookie / localStorage</option>
                  <option value="ip">IP address (server-side)</option>
                  <option value="combined">Combined (fingerprint + cookie)</option>
                </Select>
                <p class={hintClass}>
                  Fingerprint uses canvas, WebGL, and browser properties. Cookie uses localStorage. Combined is most reliable.
                </p>
              </div>
            {/if}
          </div>
        </div>

        <!-- Bot Detection -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">Bot Detection</h4>
          <div class="space-y-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={localEnableHoneypot}
                class="rounded border-border text-primary focus:ring-primary"
                data-testid="fp-honeypot"
              />
              <span class="text-sm text-foreground">Enable honeypot field</span>
            </label>
            <p class={hintClass}>
              Adds a hidden field that real users cannot see. Bots that auto-fill all fields will trigger this check.
            </p>

            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={localEnableBehavior}
                class="rounded border-border text-primary focus:ring-primary"
                data-testid="fp-behavior"
              />
              <span class="text-sm text-foreground">Enable behavior analysis</span>
            </label>
            <p class={hintClass}>
              Analyzes mouse movement, typing cadence, and event timing to detect non-human interaction patterns.
            </p>
          </div>
        </div>

        <!-- Geographic Restrictions -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">Geographic Restrictions</h4>
          <div class="space-y-3">
            <div>
              <label for="fp-allowed-countries" class={labelClass}>
                Allowed countries (ISO codes, comma-separated)
              </label>
              <input
                id="fp-allowed-countries"
                type="text"
                bind:value={localAllowedCountries}
                placeholder="US, GB, DE, FR"
                class={inputClass}
                data-testid="fp-allowed-countries"
              />
              <p class={hintClass}>Leave empty to allow all countries.</p>
            </div>
            <div>
              <label for="fp-blocked-countries" class={labelClass}>
                Blocked countries (ISO codes, comma-separated)
              </label>
              <input
                id="fp-blocked-countries"
                type="text"
                bind:value={localBlockedCountries}
                placeholder="CN, RU"
                class={inputClass}
                data-testid="fp-blocked-countries"
              />
              <p class={hintClass}>Block specific countries. Overrides the allowed list.</p>
            </div>
          </div>
        </div>

        <!-- Response Quality -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">Response Quality</h4>
          <div class="space-y-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={localEnableSpeeder}
                class="rounded border-border text-primary focus:ring-primary"
                data-testid="fp-speeder"
              />
              <span class="text-sm text-foreground">Enable speeder detection</span>
            </label>

            {#if localEnableSpeeder}
              <div>
                <label for="fp-speeder-mult" class={labelClass}>
                  Threshold multiplier ({localSpeederMultiplier}x)
                </label>
                <input
                  id="fp-speeder-mult"
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  bind:value={localSpeederMultiplier}
                  class="w-full accent-primary"
                  data-testid="fp-speeder-mult"
                />
                <p class={hintClass}>
                  Lower values are stricter. 1.0 = default thresholds, 0.5 = very strict, 2.0 = lenient.
                </p>
              </div>
            {/if}

            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={localEnableFlatline}
                class="rounded border-border text-primary focus:ring-primary"
                data-testid="fp-flatline"
              />
              <span class="text-sm text-foreground">Enable flatline detection</span>
            </label>

            {#if localEnableFlatline}
              <div>
                <label for="fp-flatline-threshold" class={labelClass}>
                  Flatline threshold ({localFlatlineThreshold})
                </label>
                <input
                  id="fp-flatline-threshold"
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.05"
                  bind:value={localFlatlineThreshold}
                  class="w-full accent-primary"
                  data-testid="fp-flatline-threshold"
                />
                <p class={hintClass}>
                  Fraction of identical responses in a block to flag. 0.8 = 80% same answers triggers flag.
                </p>
              </div>
            {/if}
          </div>
        </div>

        <!-- Fraud Action -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">When Fraud Detected</h4>
          <div class="space-y-3">
            <div>
              <label for="fp-action" class={labelClass}>Action</label>
              <Select
                id="fp-action"
                bind:value={localFraudAction}
                placeholder=""
              >
                <option value="flag">Flag for review (allow completion)</option>
                <option value="terminate">Terminate session</option>
                <option value="redirect">Redirect to URL</option>
              </Select>
            </div>

            {#if localFraudAction === 'redirect'}
              <div>
                <label for="fp-redirect-url" class={labelClass}>Redirect URL</label>
                <input
                  id="fp-redirect-url"
                  type="url"
                  bind:value={localRedirectUrl}
                  placeholder="https://example.com/disqualified"
                  class={inputClass}
                  data-testid="fp-redirect-url"
                />
              </div>
            {/if}

            {#if localFraudAction === 'terminate'}
              <div>
                <label for="fp-fraud-message" class={labelClass}>Custom message</label>
                <textarea
                  id="fp-fraud-message"
                  bind:value={localFraudMessage}
                  placeholder="This survey has detected an issue with your submission."
                  class="{inputClass} resize-y"
                  rows="2"
                  data-testid="fp-fraud-message"
                ></textarea>
              </div>
            {/if}
          </div>
        </div>
  </div>

  {#snippet footer()}
    <button
      onclick={cancel}
      class="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Cancel
    </button>
    <button
      onclick={save}
      class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      data-testid="fp-save"
    >
      Save
    </button>
  {/snippet}
</Dialog>
