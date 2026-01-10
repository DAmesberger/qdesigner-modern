<script lang="ts">
  import type { Question } from '$lib/shared';

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
    <select id="mode" bind:value={question.config.mode} class="select">
      <option value="date">Date Only</option>
      <option value="time">Time Only</option>
      <option value="datetime">Date & Time</option>
    </select>
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
        <select id="time-step" bind:value={question.config.timeStep} class="select">
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
          <button class="btn btn-secondary" onclick={addDisabledDate} disabled={!newDisabledDate}>
            Add
          </button>
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
    color: #374151;
  }

  .input,
  .select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    transition: all 0.15s;
  }

  .input:hover,
  .select:hover {
    border-color: #d1d5db;
  }

  .input:focus,
  .select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
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
    border-top: 1px solid #e5e7eb;
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
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
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    cursor: pointer;
    transition: all 0.15s;
  }

  .example-chip:hover {
    background: #e5e7eb;
    border-color: #d1d5db;
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
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .remove-btn {
    padding: 0.125rem;
    border: none;
    background: none;
    color: #6b7280;
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    color: #dc2626;
  }

  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Preview */
  .preview-box {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
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
    color: #374151;
  }

  .preview-label strong {
    color: #111827;
  }

  .preview-constraints {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .preview-constraints p {
    margin: 0.25rem 0;
  }

  .preview-note {
    font-size: 0.75rem;
    color: #6b7280;
    font-style: italic;
  }
</style>
