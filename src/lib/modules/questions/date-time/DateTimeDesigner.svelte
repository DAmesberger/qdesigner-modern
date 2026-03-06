<script lang="ts">
  import type { Question } from '$lib/shared';
  import Button from '$lib/components/common/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface DateTimeConfig {
    mode: 'date' | 'time' | 'datetime';
    format: string;
    showCalendar: boolean;
    minDate?: string | null;
    maxDate?: string | null;
    disabledDates?: string[];
    defaultToToday?: boolean;
    timeStep?: number;
  }

  interface Props {
    question: Question & { config: DateTimeConfig };
  }

  let { question = $bindable() }: Props = $props();

  let newDisabledDate = $state('');

  const formatExamples = {
    date: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY'],
    time: ['HH:mm', 'HH:mm:ss', 'hh:mm A'],
    datetime: ['YYYY-MM-DD HH:mm', 'DD/MM/YYYY HH:mm', 'MM-DD-YYYY hh:mm A'],
  };

  function addDisabledDate() {
    if (!newDisabledDate) return;

    if (!question.config.disabledDates) {
      question.config.disabledDates = [];
    }

    if (!question.config.disabledDates.includes(newDisabledDate)) {
      question.config.disabledDates = [...question.config.disabledDates, newDisabledDate];
    }

    newDisabledDate = '';
  }

  function removeDisabledDate(date: string) {
    if (!question.config.disabledDates) return;
    question.config.disabledDates = question.config.disabledDates.filter((d) => d !== date);
  }

  // Update format when mode changes
  $effect(() => {
    const defaultFormats = {
      date: 'YYYY-MM-DD',
      time: 'HH:mm',
      datetime: 'YYYY-MM-DD HH:mm',
    };

    if (
      !question.config.format ||
      !question.config.format.includes(question.config.mode === 'time' ? ':' : '-')
    ) {
      question.config.format = defaultFormats[question.config.mode];
    }
  });
</script>

<div class="designer-panel">
  <!-- Input Mode -->
  <div class="form-group">
    <label for="mode" class="label-text">Input Mode</label>
    <Select id="mode" bind:value={question.config.mode}>
      <option value="date">Date Only</option>
      <option value="time">Time Only</option>
      <option value="datetime">Date & Time</option>
    </Select>
  </div>

  <!-- Date Format -->
  <div class="form-group">
    <label for="format" class="label-text">Display Format</label>
    <input
      id="format"
      type="text"
      bind:value={question.config.format}
      placeholder="e.g., YYYY-MM-DD"
      class="input"
    />
    <div class="format-examples">
      <p class="help-text">Examples for {question.config.mode}:</p>
      <div class="example-chips">
        {#each formatExamples[question.config.mode] as example}
          <button class="example-chip" onclick={() => (question.config.format = example)}>
            {example}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Display Options -->
  <div class="section">
    <h4 class="section-title">Display Options</h4>

    {#if question.config.mode !== 'time'}
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={question.config.showCalendar} class="checkbox" />
          <span>Show calendar picker button</span>
        </label>
      </div>
    {/if}

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.defaultToToday} class="checkbox" />
        <span>Default to today's date/time</span>
      </label>
    </div>

    {#if question.config.mode === 'time' || question.config.mode === 'datetime'}
      <div class="form-group">
        <label for="time-step">Time Step (minutes)</label>
        <select id="time-step" bind:value={question.config.timeStep} class="block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-foreground bg-background shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6">
          <option value={1}>1 minute</option>
          <option value={5}>5 minutes</option>
          <option value={10}>10 minutes</option>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>1 hour</option>
        </select>
      </div>
    {/if}
  </div>

  <!-- Date Constraints -->
  {#if question.config.mode !== 'time'}
    <div class="section">
      <h4 class="section-title">Date Constraints</h4>

      <div class="form-group">
        <label for="min-date">Minimum Date</label>
        <input id="min-date" type="date" bind:value={question.config.minDate} class="input" />
        <p class="help-text">Earliest date that can be selected</p>
      </div>

      <div class="form-group">
        <label for="max-date">Maximum Date</label>
        <input id="max-date" type="date" bind:value={question.config.maxDate} class="input" />
        <p class="help-text">Latest date that can be selected</p>
      </div>

      <!-- Disabled Dates -->
      <div class="form-group">
        <span class="label-text">Disabled Dates</span>
        <div class="disabled-dates-input">
          <input
            type="date"
            bind:value={newDisabledDate}
            placeholder="Select date to disable"
            class="input"
          />
          <Button variant="secondary" size="sm" onclick={addDisabledDate} disabled={!newDisabledDate}>
            Add
          </Button>
        </div>

        {#if question.config.disabledDates?.length}
          <div class="disabled-dates-list">
            {#each question.config.disabledDates as date}
              <div class="disabled-date-item">
                <span>{date}</span>
                <button
                  class="remove-btn"
                  onclick={() => removeDisabledDate(date)}
                  aria-label="Remove date"
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>
        {/if}
        <p class="help-text">Specific dates that cannot be selected</p>
      </div>
    </div>
  {/if}

  <!-- Preview -->
  <div class="section">
    <h4 class="section-title">Preview</h4>
    <div class="preview-box">
      <div class="preview-content">
        <p class="preview-label">Input Type: <strong>{question.config.mode}</strong></p>
        <p class="preview-label">Format: <strong>{question.config.format}</strong></p>

        {#if question.config.minDate || question.config.maxDate}
          <div class="preview-constraints">
            {#if question.config.minDate}
              <p>Min: {question.config.minDate}</p>
            {/if}
            {#if question.config.maxDate}
              <p>Max: {question.config.maxDate}</p>
            {/if}
          </div>
        {/if}

        {#if question.config.defaultToToday}
          <p class="preview-note">Will default to current date/time</p>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .label-text {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  .input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    transition: all 0.15s;
  }

  .input:hover {
    border-color: hsl(var(--border));
  }

  .input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid hsl(var(--border));
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  /* Format examples */
  .format-examples {
    margin-top: 0.5rem;
  }

  .example-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .example-chip {
    padding: 0.25rem 0.5rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    cursor: pointer;
    transition: all 0.15s;
  }

  .example-chip:hover {
    background: hsl(var(--border));
    border-color: hsl(var(--border));
  }

  /* Disabled dates */
  .disabled-dates-input {
    display: flex;
    gap: 0.5rem;
  }

  .disabled-dates-input .input {
    flex: 1;
  }

  .disabled-dates-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .disabled-date-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .remove-btn {
    padding: 0.125rem;
    border: none;
    background: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    color: hsl(var(--destructive));
  }

  /* Preview */
  .preview-box {
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .preview-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .preview-label {
    font-size: 0.875rem;
    color: hsl(var(--foreground));
  }

  .preview-label strong {
    color: hsl(var(--foreground));
  }

  .preview-constraints {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .preview-constraints p {
    margin: 0.25rem 0;
  }

  .preview-note {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }
</style>
