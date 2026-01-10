<script lang="ts">
  import Button from '$lib/components/common/Button.svelte';
  import Card from '$lib/components/common/Card.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';

  interface Props {
    title?: string;
    content: string;
    requireSignature?: boolean;
    checkboxes?: ConsentCheckbox[];
    onAccept: (data: ConsentData) => void;
    onDecline: () => void;
  }

  interface ConsentCheckbox {
    id: string;
    label: string;
    required: boolean;
  }

  interface ConsentData {
    accepted: boolean;
    timestamp: string;
    checkboxes: Record<string, boolean>;
    signature?: string;
  }

  let {
    title = 'Informed Consent',
    content,
    requireSignature = false,
    checkboxes = [],
    onAccept,
    onDecline,
  }: Props = $props();

  let checkboxStates = $state<Record<string, boolean>>({});
  let signature = $state('');
  let showError = $state(false);

  // Initialize checkbox states
  $effect(() => {
    checkboxes.forEach((cb) => {
      if (!(cb.id in checkboxStates)) {
        checkboxStates[cb.id] = false;
      }
    });
  });

  // Check if all required fields are complete
  const canAccept = $derived(() => {
    // Check required checkboxes
    const requiredCheckboxes = checkboxes.filter((cb) => cb.required);
    const allChecked = requiredCheckboxes.every((cb) => checkboxStates[cb.id]);

    // Check signature if required
    const signatureValid = !requireSignature || signature.trim().length > 0;

    return allChecked && signatureValid;
  });

  function handleAccept() {
    if (!canAccept()) {
      showError = true;
      return;
    }

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

  function handleDecline() {
    if (
      confirm(
        'Are you sure you want to decline? You will not be able to participate in this study.'
      )
    ) {
      onDecline();
    }
  }
</script>

<div class="consent-screen">
  <Card class="consent-card">
    <div class="consent-content">
      <h1 class="consent-title">{title}</h1>

      <div class="consent-text">
        {@html content}
      </div>

      {#if checkboxes.length > 0}
        <div class="consent-checkboxes">
          {#each checkboxes as checkbox}
            <label class="checkbox-label">
              <Checkbox
                bind:checked={checkboxStates[checkbox.id]}
                on:change={() => (showError = false)}
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
            Electronic Signature <span class="required">*</span>
          </label>
          <input
            id="signature"
            type="text"
            bind:value={signature}
            placeholder="Type your full name"
            class="signature-input"
            oninput={() => (showError = false)}
          />
          <p class="signature-note">
            By typing your name above, you are providing an electronic signature.
          </p>
        </div>
      {/if}

      {#if showError}
        <div class="error-message">Please complete all required fields before continuing.</div>
      {/if}

      <div class="actions">
        <Button variant="outline" size="lg" onclick={handleDecline}>Decline</Button>
        <Button variant="default" size="lg" onclick={handleAccept} disabled={!canAccept()}>
          I Agree
        </Button>
      </div>

      <p class="consent-footer">
        If you have questions about this consent form or the study, please contact the research
        team.
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
    background: var(--background);
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
    color: var(--foreground);
  }

  .consent-text {
    margin-bottom: 2rem;
    line-height: 1.6;
    color: var(--muted-foreground);
  }

  .consent-text :global(h2) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    color: var(--foreground);
  }

  .consent-text :global(h3) {
    font-size: 1.125rem;
    font-weight: 600;
    margin-top: 1.25rem;
    margin-bottom: 0.5rem;
    color: var(--foreground);
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
    background: var(--muted);
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
    color: var(--foreground);
  }

  .required {
    color: var(--destructive);
    margin-left: 0.25rem;
  }

  .signature-section {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: var(--muted);
    border-radius: 0.5rem;
  }

  .signature-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: var(--foreground);
  }

  .signature-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    color: var(--foreground);
    transition: border-color 0.2s;
  }

  .signature-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .signature-note {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .error-message {
    margin-bottom: 1rem;
    padding: 0.75rem 1rem;
    background: hsl(var(--destructive) / 0.1);
    border: 1px solid hsl(var(--destructive) / 0.2);
    border-radius: 0.375rem;
    color: var(--destructive);
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
    color: var(--muted-foreground);
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
