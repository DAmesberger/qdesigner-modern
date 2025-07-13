<script lang="ts">
  import { Button } from '$lib/shared/components/ui';
  import { Icon } from '$lib/shared/components/ui';
  import { QuestionnaireValidator, type ValidationResult } from '../utils/questionnaireValidation';
  import type { Questionnaire } from '$lib/shared';
  
  export let questionnaire: Questionnaire;
  export let autoValidate = false;
  export let onValidationComplete: (result: ValidationResult) => void = () => {};
  
  let validating = false;
  let validationResult: ValidationResult | null = null;
  let lastValidated: Date | null = null;
  let expanded = false;
  
  // Auto-validate on changes if enabled
  $: if (autoValidate && questionnaire) {
    validateQuick();
  }
  
  // Quick validation (structural only)
  function validateQuick() {
    validationResult = QuestionnaireValidator.validateQuick(questionnaire);
  }
  
  // Full validation (including media)
  async function validateFull() {
    validating = true;
    try {
      validationResult = await QuestionnaireValidator.validate(questionnaire);
      lastValidated = new Date();
      onValidationComplete(validationResult);
    } catch (error) {
      console.error('Validation error:', error);
      validationResult = {
        valid: false,
        errors: [{
          type: 'settings',
          severity: 'error',
          message: 'Validation failed: ' + (error instanceof Error ? error.message : 'Unknown error')
        }],
        warnings: []
      };
    } finally {
      validating = false;
    }
  }
  
  $: errorCount = validationResult?.errors.length || 0;
  $: warningCount = validationResult?.warnings.length || 0;
  $: hasIssues = errorCount > 0 || warningCount > 0;
</script>

<div class="validation-panel" class:expanded>
  <div class="validation-header">
    <button 
      class="header-button"
      on:click={() => expanded = !expanded}
      disabled={!hasIssues && !validating}
    >
      <div class="status-indicator" class:valid={validationResult?.valid} class:invalid={!validationResult?.valid && hasIssues}>
        {#if validating}
          <Icon name="loader-2" class="animate-spin" />
        {:else if !hasIssues}
          <Icon name="check-circle" />
        {:else}
          <Icon name="alert-circle" />
        {/if}
      </div>
      
      <div class="status-text">
        {#if validating}
          Validating...
        {:else if !validationResult}
          Not validated
        {:else if validationResult.valid}
          Valid
        {:else}
          {errorCount} error{errorCount !== 1 ? 's' : ''}, 
          {warningCount} warning{warningCount !== 1 ? 's' : ''}
        {/if}
      </div>
      
      {#if hasIssues}
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} />
      {/if}
    </button>
    
    <Button
      variant="outline"
      size="sm"
      on:click={validateFull}
      disabled={validating}
    >
      {#if validating}
        Validating...
      {:else}
        Validate All
      {/if}
    </Button>
  </div>
  
  {#if expanded && hasIssues && validationResult}
    <div class="validation-content">
      {#if validationResult.errors.length > 0}
        <div class="issue-section">
          <h4 class="issue-heading">Errors</h4>
          {#each validationResult.errors as error}
            <div class="issue-item error">
              <Icon name="x-circle" size={16} />
              <div class="issue-content">
                <div class="issue-message">{error.message}</div>
                {#if error.type === 'media'}
                  <div class="issue-type">Media validation</div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if validationResult.warnings.length > 0}
        <div class="issue-section">
          <h4 class="issue-heading">Warnings</h4>
          {#each validationResult.warnings as warning}
            <div class="issue-item warning">
              <Icon name="alert-triangle" size={16} />
              <div class="issue-content">
                <div class="issue-message">{warning.message}</div>
                {#if warning.type === 'media'}
                  <div class="issue-type">Media validation</div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if lastValidated}
        <div class="last-validated">
          Last validated: {lastValidated.toLocaleTimeString()}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .validation-panel {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: max-height 0.3s ease;
    max-height: 48px;
  }
  
  .validation-panel.expanded {
    max-height: 400px;
    overflow-y: auto;
  }
  
  .validation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  
  .header-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    color: var(--foreground);
    flex: 1;
    text-align: left;
  }
  
  .header-button:disabled {
    cursor: default;
  }
  
  .status-indicator {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .status-indicator.valid {
    color: var(--success);
  }
  
  .status-indicator.invalid {
    color: var(--destructive);
  }
  
  .status-text {
    font-size: 0.875rem;
    flex: 1;
  }
  
  .validation-content {
    padding: 1rem;
  }
  
  .issue-section {
    margin-bottom: 1rem;
  }
  
  .issue-section:last-child {
    margin-bottom: 0;
  }
  
  .issue-heading {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    margin-bottom: 0.5rem;
  }
  
  .issue-item {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    border-radius: var(--radius);
    font-size: 0.875rem;
  }
  
  .issue-item.error {
    background: hsl(var(--destructive) / 0.1);
    color: var(--destructive);
  }
  
  .issue-item.warning {
    background: hsl(var(--warning) / 0.1);
    color: var(--warning);
  }
  
  .issue-content {
    flex: 1;
  }
  
  .issue-message {
    margin-bottom: 0.25rem;
  }
  
  .issue-type {
    font-size: 0.75rem;
    opacity: 0.7;
  }
  
  .last-validated {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    text-align: center;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
</style>