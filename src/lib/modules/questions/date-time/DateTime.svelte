<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
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

  interface Props extends QuestionProps {
    question: Question & { config: DateTimeConfig };
  }

  let {
    question,
    mode = 'runtime',
    value = $bindable(''),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  // Configuration
  const config = $derived(question.config);
  const inputMode = $derived(config.mode || 'date');
  const showCalendar = $derived(config.showCalendar !== false);
  const format = $derived(config.format || getDefaultFormat(inputMode));

  // State
  let dateValue = $state('');
  let timeValue = $state('');
  let showDatePicker = $state(false);
  let selectedDate = $state<Date | null>(null);
  let currentMonth = $state(new Date());

  // Initialize values
  $effect(() => {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        selectedDate = date;
        updateInputValues(date);
      }
    } else if (config.defaultToToday && !value) {
      const today = new Date();
      selectedDate = today;
      updateInputValues(today);
      handleChange();
    }
  });

  // Validation
  $effect(() => {
    const errors: string[] = [];
    let isValid = true;

    if (question.required && !value) {
      errors.push('This field is required');
      isValid = false;
    } else if (value) {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        errors.push('Invalid date/time format');
        isValid = false;
      } else {
        if (config.minDate && date < new Date(config.minDate)) {
          errors.push(`Date must be after ${formatDate(new Date(config.minDate), format)}`);
          isValid = false;
        }
        if (config.maxDate && date > new Date(config.maxDate)) {
          errors.push(`Date must be before ${formatDate(new Date(config.maxDate), format)}`);
          isValid = false;
        }
        if (config.disabledDates?.includes(dateValue)) {
          errors.push('This date is not available');
          isValid = false;
        }
      }
    }

    onValidation?.({ valid: isValid, errors });
  });

  // Get default format based on mode
  function getDefaultFormat(mode: string): string {
    switch (mode) {
      case 'date':
        return 'YYYY-MM-DD';
      case 'time':
        return 'HH:mm';
      case 'datetime':
        return 'YYYY-MM-DD HH:mm';
      default:
        return 'YYYY-MM-DD';
    }
  }

  // Update input values from date
  function updateInputValues(date: Date) {
    dateValue = formatDate(date, 'YYYY-MM-DD');
    timeValue = formatDate(date, 'HH:mm');
  }

  // Format date according to pattern
  function formatDate(date: Date, pattern: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return pattern
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes);
  }

  // Parse date from inputs
  function parseDate(): Date | null {
    if (inputMode === 'date' && dateValue) {
      return new Date(dateValue + 'T00:00:00');
    } else if (inputMode === 'time' && timeValue) {
      const today = new Date();
      const [hours = 0, minutes = 0] = timeValue.split(':').map(Number);
      today.setHours(hours, minutes, 0, 0);
      return today;
    } else if (inputMode === 'datetime' && dateValue && timeValue) {
      return new Date(dateValue + 'T' + timeValue + ':00');
    }
    return null;
  }

  // Handle date input change
  function handleDateInput(event: Event) {
    const input = event.target as HTMLInputElement;
    dateValue = input.value;
    handleChange();
  }

  // Handle time input change
  function handleTimeInput(event: Event) {
    const input = event.target as HTMLInputElement;
    timeValue = input.value;
    handleChange();
  }

  // Handle any change
  function handleChange() {
    const date = parseDate();
    if (date && !isNaN(date.getTime())) {
      selectedDate = date;
      value = date.toISOString();
      onResponse?.(value);
      onInteraction?.({
        type: 'change',
        timestamp: Date.now(),
        data: { date: value, mode: inputMode },
      });
    } else if (!dateValue && !timeValue) {
      value = '';
      onResponse?.(value);
    }
  }

  // Calendar functions
  function toggleCalendar() {
    showDatePicker = !showDatePicker;
    onInteraction?.({
      type: 'toggle-calendar' as any,
      timestamp: Date.now(),
      data: { open: showDatePicker },
    });
  }

  function selectDate(date: Date) {
    selectedDate = date;
    updateInputValues(date);
    showDatePicker = false;
    handleChange();
    onInteraction?.({
      type: 'select-date' as any,
      timestamp: Date.now(),
      data: { date: date.toISOString() },
    });
  }

  function previousMonth() {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
  }

  function nextMonth() {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
  }

  function getDaysInMonth(date: Date): Date[] {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];

    // Add empty days for alignment
    const startDay = firstDay.getDay();
    for (let i = 0; i < startDay; i++) {
      days.push(new Date(year, month, -startDay + i + 1));
    }

    // Add days of month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    // Add days to complete the week
    const endDay = lastDay.getDay();
    if (endDay < 6) {
      for (let i = 1; i <= 6 - endDay; i++) {
        days.push(new Date(year, month + 1, i));
      }
    }

    return days;
  }

  function isSameDay(date1: Date | null, date2: Date): boolean {
    if (!date1) return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  function isCurrentMonth(date: Date): boolean {
    return date.getMonth() === currentMonth.getMonth();
  }

  function isToday(date: Date): boolean {
    const today = new Date();
    return isSameDay(today, date);
  }

  function isDisabled(date: Date): boolean {
    if (config.minDate && date < new Date(config.minDate)) return true;
    if (config.maxDate && date > new Date(config.maxDate)) return true;
    if (config.disabledDates?.includes(formatDate(date, 'YYYY-MM-DD'))) return true;
    return false;
  }

  // Format helpers
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Click outside handler
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.datetime-container')) {
      showDatePicker = false;
    }
  }

  $effect(() => {
    if (showDatePicker) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return undefined;
  });
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div class="datetime-container">
    <div class="input-group">
      {#if inputMode === 'date' || inputMode === 'datetime'}
        <div class="input-wrapper">
          <input
            type="date"
            bind:value={dateValue}
            oninput={handleDateInput}
            min={config.minDate}
            max={config.maxDate}
            {disabled}
            class="date-input"
          />
          {#if showCalendar}
            <button
              type="button"
              onclick={toggleCalendar}
              {disabled}
              class="calendar-button"
              aria-label="Open calendar"
            >
              📅
            </button>
          {/if}
        </div>
      {/if}

      {#if inputMode === 'time' || inputMode === 'datetime'}
        <div class="input-wrapper">
          <input
            type="time"
            bind:value={timeValue}
            oninput={handleTimeInput}
            step={config.timeStep ? config.timeStep * 60 : undefined}
            {disabled}
            class="time-input"
          />
        </div>
      {/if}
    </div>

    {#if showDatePicker && showCalendar && (inputMode === 'date' || inputMode === 'datetime')}
      <div
        class="calendar-dropdown"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="-1"
        onkeydown={(e) => e.key === 'Escape' && (showDatePicker = false)}
      >
        <div class="calendar-header">
          <button
            type="button"
            onclick={previousMonth}
            class="nav-button"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span class="month-year">
            {monthNames[currentMonth.getMonth()]}
            {currentMonth.getFullYear()}
          </span>
          <button type="button" onclick={nextMonth} class="nav-button" aria-label="Next month">
            ›
          </button>
        </div>

        <div class="calendar-grid">
          {#each weekDays as day}
            <div class="weekday">{day}</div>
          {/each}

          {#each getDaysInMonth(currentMonth) as date}
            <button
              type="button"
              onclick={() => selectDate(date)}
              disabled={isDisabled(date)}
              class="calendar-day"
              class:other-month={!isCurrentMonth(date)}
              class:selected={isSameDay(selectedDate, date)}
              class:today={isToday(date)}
              class:disabled={isDisabled(date)}
            >
              {date.getDate()}
            </button>
          {/each}
        </div>

        {#if config.defaultToToday}
          <div class="calendar-footer">
            <button
              type="button"
              onclick={() => selectDate(new Date())}
              class="today-button"
              disabled={isDisabled(new Date())}
            >
              Today
            </button>
          </div>
        {/if}
      </div>
    {/if}

    {#if selectedDate && format !== 'YYYY-MM-DD' && format !== 'HH:mm'}
      <div class="formatted-value">
        {formatDate(selectedDate, format)}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .datetime-container {
    width: 100%;
    position: relative;
  }

  .input-group {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .date-input,
  .time-input {
    padding: 0.75rem 1rem;
    border: 2px solid hsl(var(--border));
    border-radius: 0.5rem;
    font-size: 1rem;
    font-family: inherit;
    background: hsl(var(--background));
    transition: all 0.2s;
  }

  .date-input:hover:not(:disabled),
  .time-input:hover:not(:disabled) {
    border-color: hsl(var(--border));
  }

  .date-input:focus,
  .time-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .date-input:disabled,
  .time-input:disabled {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    cursor: not-allowed;
  }

  /* Calendar button */
  .calendar-button {
    padding: 0.5rem;
    background: hsl(var(--muted));
    border: 2px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 1.25rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .calendar-button:hover:not(:disabled) {
    background: hsl(var(--border));
    border-color: hsl(var(--border));
  }

  .calendar-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Calendar dropdown */
  .calendar-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.5rem;
    background: hsl(var(--card));
    border: 2px solid hsl(var(--border));
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px hsl(var(--foreground) / 0.1);
    z-index: 10;
    padding: 1rem;
  }

  .calendar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .nav-button {
    padding: 0.25rem 0.5rem;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    transition: color 0.2s;
  }

  .nav-button:hover {
    color: hsl(var(--foreground));
  }

  .month-year {
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.25rem;
  }

  .weekday {
    padding: 0.5rem;
    text-align: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
  }

  .calendar-day {
    padding: 0.5rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
    aspect-ratio: 1;
    min-width: 2rem;
  }

  .calendar-day:hover:not(:disabled) {
    background: hsl(var(--muted));
  }

  .calendar-day.other-month {
    color: hsl(var(--border));
  }

  .calendar-day.selected {
    background: hsl(var(--primary));
    color: hsl(var(--background));
  }

  .calendar-day.today {
    border-color: hsl(var(--primary));
    font-weight: 600;
  }

  .calendar-day.disabled {
    color: hsl(var(--border));
    cursor: not-allowed;
  }

  .calendar-day.disabled:hover {
    background: none;
  }

  .calendar-footer {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid hsl(var(--border));
    text-align: center;
  }

  .today-button {
    padding: 0.375rem 0.75rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .today-button:hover:not(:disabled) {
    background: hsl(var(--border));
  }

  .today-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Formatted value display */
  .formatted-value {
    margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: hsl(var(--muted));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .input-group {
      flex-direction: column;
      align-items: stretch;
    }

    .input-wrapper {
      width: 100%;
    }

    .date-input,
    .time-input {
      width: 100%;
    }

    .calendar-dropdown {
      left: 50%;
      transform: translateX(-50%);
    }
  }
</style>
