<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
  import { sanitizeHtml } from '$lib/services/markdownProcessor';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import { m } from '$lib/paraglide/messages';
  import type { ConsentCheckbox, ConsentData } from '$lib/fillout/types';

  interface Props {
    /** Screen heading. Defaults to the localized "Informed Consent" chrome label. */
    title?: string;
    content: string;
    requireSignature?: boolean;
    checkboxes?: ConsentCheckbox[];
    onAccept: (data: ConsentData) => void;
    onDecline: () => void;
    /**
     * Optional audio-unlock hook (CONTRACT-AUDIO). Invoked on the "I Agree"
     * click — a guaranteed user gesture — so Web Audio can be unlocked before
     * the first reaction trial, which may run after async session creation.
     */
    onPrimeAudio?: () => void | Promise<void>;
  }

  let {
    title,
    content,
    requireSignature = false,
    checkboxes = [],
    onAccept,
    onDecline,
    onPrimeAudio,
  }: Props = $props();

  // Author-supplied heading wins; otherwise the built-in localized chrome label.
  const resolvedTitle = $derived(title ?? m.fillout_consent_default_title());

  // Seed synchronously (not only in the $effect below) so the very first render
  // already has a boolean for every checkbox: `bind:checked` on the child Checkbox
  // rejects `undefined` (it has a `$bindable(false)` fallback), which would throw
  // props_invalid_value on the initial paint — the effect runs too late to prevent it.
  let checkboxStates = $state<Record<string, boolean>>(
    Object.fromEntries(checkboxes.map((cb) => [cb.id, false]))
  );
  let signature = $state('');
  let showError = $state(false);

  // Backfill any checkboxes that arrive/change after mount (prop is reactive).
  $effect(() => {
    checkboxes.forEach((cb) => {
      if (!(cb.id in checkboxStates)) {
        checkboxStates[cb.id] = false;
      }
    });
  });

  // Check if all required fields are complete
  const canAccept = $derived.by(() => {
    // Check required checkboxes
    const requiredCheckboxes = checkboxes.filter((cb) => cb.required);
    const allChecked = requiredCheckboxes.every((cb) => checkboxStates[cb.id]);

    // Check signature if required
    const signatureValid = !requireSignature || signature.trim().length > 0;

    return allChecked && signatureValid;
  });

  function handleAccept() {
    if (!canAccept) {
      showError = true;
      return;
    }

    // Unlock audio on this user gesture before the (possibly async) session
    // start so the reaction engine's AudioContext can resume without tripping
    // the browser autoplay policy. Best-effort; never blocks consent.
    void onPrimeAudio?.();

    const consentData: ConsentData = {
      accepted: true,
      timestamp: new Date().toISOString(),
      checkboxes: { ...checkboxStates },
    };

    if (requireSignature) {
      consentData.signature = signature;
    }

    onAccept(consentData);
  }

  async function handleDecline() {
    if (
      await confirmDialog({
        title: m.fillout_consent_decline_dialog_title(),
        message: m.fillout_consent_decline_dialog_message(),
        confirmLabel: m.fillout_consent_decline(),
        cancelLabel: m.fillout_action_go_back(),
        destructive: true,
      })
    ) {
      onDecline();
    }
  }
</script>

<div class="consent-screen" data-testid="fillout-consent-screen">
  <Card class="consent-card">
    <div class="consent-content">
      <h1 class="consent-title" data-testid="fillout-consent-title">{resolvedTitle}</h1>

      <div class="consent-text">
        {@html sanitizeHtml(content)}
      </div>

      {#if checkboxes.length > 0}
        <div class="consent-checkboxes">
          {#each checkboxes as checkbox}
            <label class="checkbox-label">
              <Checkbox
                bind:checked={checkboxStates[checkbox.id]}
                onchange={() => (showError = false)}
              />
              <span class="checkbox-text">
                {checkbox.label}
                {#if checkbox.required}
                  <span class="required">*</span>
                {/if}
              </span>
            </label>
          {/each}
        </div>
      {/if}

      {#if requireSignature}
        <div class="signature-section">
          <label for="signature" class="signature-label">
            {m.fillout_consent_signature_label()} <span class="required">*</span>
          </label>
          <input
            id="signature"
            type="text"
            bind:value={signature}
            placeholder={m.fillout_consent_signature_placeholder()}
            class="signature-input"
            oninput={() => (showError = false)}
            data-testid="fillout-consent-signature"
          />
          <p class="signature-note">
            {m.fillout_consent_signature_note()}
          </p>
        </div>
      {/if}

      {#if showError}
        <!-- Assertive (R2-5): SR users must hear the validation failure on a blocked submit. -->
        <div class="error-message" role="alert">
          {m.fillout_consent_validation_error()}
        </div>
      {/if}

      <div class="actions">
        <Button
          variant="outline"
          size="lg"
          onclick={handleDecline}
          data-testid="fillout-consent-decline-button">{m.fillout_consent_decline()}</Button
        >
        <!-- Not disabled while incomplete (R2-5 a11y): an unexplained disabled control gives
             SR users no reason why they can't proceed. Instead the click is allowed to reach
             handleAccept, which surfaces the assertive validation message on a failed submit.
             aria-disabled advertises the invalid state without swallowing the click. -->
        <Button
          variant="default"
          size="lg"
          onclick={handleAccept}
          aria-disabled={!canAccept}
          data-testid="fillout-consent-accept-button"
        >
          {m.fillout_consent_agree()}
        </Button>
      </div>

      <p class="consent-footer">
        {m.fillout_consent_footer()}
      </p>
    </div>
  </Card>
</div>

<style>
  .consent-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: hsl(var(--background));
  }

  :global(.consent-card) {
    width: 100%;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .consent-content {
    padding: 2rem;
  }

  .consent-title {
    font-size: 1.75rem;
    font-weight: 700;
    margin-bottom: 1.5rem;
    text-align: center;
    color: hsl(var(--foreground));
  }

  .consent-text {
    margin-bottom: 2rem;
    line-height: 1.6;
    color: hsl(var(--muted-foreground));
  }

  .consent-text :global(h2) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    color: hsl(var(--foreground));
  }

  .consent-text :global(h3) {
    font-size: 1.125rem;
    font-weight: 600;
    margin-top: 1.25rem;
    margin-bottom: 0.5rem;
    color: hsl(var(--foreground));
  }

  .consent-text :global(p) {
    margin-bottom: 1rem;
  }

  .consent-text :global(ul),
  .consent-text :global(ol) {
    margin-left: 1.5rem;
    margin-bottom: 1rem;
  }

  .consent-text :global(li) {
    margin-bottom: 0.5rem;
  }

  .consent-checkboxes {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: hsl(var(--muted));
    border-radius: 0.5rem;
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    cursor: pointer;
  }

  .checkbox-text {
    font-size: 0.875rem;
    line-height: 1.5;
    color: hsl(var(--foreground));
  }

  .required {
    color: hsl(var(--destructive));
    margin-left: 0.25rem;
  }

  .signature-section {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: hsl(var(--muted));
    border-radius: 0.5rem;
  }

  .signature-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: hsl(var(--foreground));
  }

  .signature-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    color: hsl(var(--foreground));
    transition: border-color 0.2s;
  }

  .signature-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
  }

  .signature-note {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .error-message {
    margin-bottom: 1rem;
    padding: 0.75rem 1rem;
    background: hsl(var(--destructive) / 0.1);
    border: 1px solid hsl(var(--destructive) / 0.2);
    border-radius: 0.375rem;
    color: hsl(var(--destructive));
    font-size: 0.875rem;
  }

  .actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .consent-footer {
    text-align: center;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    opacity: 0.8;
  }

  @media (max-width: 640px) {
    .consent-content {
      padding: 1.5rem;
    }

    .consent-title {
      font-size: 1.5rem;
    }

    .actions {
      flex-direction: column;
    }
  }
</style>
