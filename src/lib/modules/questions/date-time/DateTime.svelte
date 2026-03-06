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
  <div class="datetime-container w-full relative">
    <div class="input-group flex gap-4 items-center flex-wrap max-sm:flex-col max-sm:items-stretch">
      {#if inputMode === 'date' || inputMode === 'datetime'}
        <div class="relative flex items-center gap-2 max-sm:w-full">
          <input
            type="date"
            bind:value={dateValue}
            oninput={handleDateInput}
            min={config.minDate}
            max={config.maxDate}
            {disabled}
            class="date-input py-3 px-4 border-2 border-border rounded-lg text-base font-[inherit] bg-background transition-all duration-200 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed max-sm:w-full"
          />
          {#if showCalendar}
            <button
              type="button"
              onclick={toggleCalendar}
              {disabled}
              class="p-2 bg-muted border-2 border-border rounded-md text-xl cursor-pointer transition-all duration-200 hover:not-disabled:bg-border disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Open calendar"
            >
              📅
            </button>
          {/if}
        </div>
      {/if}

      {#if inputMode === 'time' || inputMode === 'datetime'}
        <div class="relative flex items-center gap-2 max-sm:w-full">
          <input
            type="time"
            bind:value={timeValue}
            oninput={handleTimeInput}
            step={config.timeStep ? config.timeStep * 60 : undefined}
            {disabled}
            class="time-input py-3 px-4 border-2 border-border rounded-lg text-base font-[inherit] bg-background transition-all duration-200 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed max-sm:w-full"
          />
        </div>
      {/if}
    </div>

    {#if showDatePicker && showCalendar && (inputMode === 'date' || inputMode === 'datetime')}
      <div
        class="absolute top-full left-0 mt-2 bg-[hsl(var(--card))] border-2 border-border rounded-lg shadow-md z-10 p-4 max-sm:left-1/2 max-sm:-translate-x-1/2"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="-1"
        onkeydown={(e) => e.key === 'Escape' && (showDatePicker = false)}
      >
        <div class="flex justify-between items-center mb-4">
          <button
            type="button"
            onclick={previousMonth}
            class="py-1 px-2 bg-transparent border-none text-2xl cursor-pointer text-muted-foreground transition-colors duration-200 hover:text-foreground"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span class="font-semibold text-foreground">
            {monthNames[currentMonth.getMonth()]}
            {currentMonth.getFullYear()}
          </span>
          <button type="button" onclick={nextMonth} class="py-1 px-2 bg-transparent border-none text-2xl cursor-pointer text-muted-foreground transition-colors duration-200 hover:text-foreground" aria-label="Next month">
            ›
          </button>
        </div>

        <div class="grid grid-cols-7 gap-1">
          {#each weekDays as day}
            <div class="p-2 text-center text-xs font-semibold text-muted-foreground">{day}</div>
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
          <div class="mt-3 pt-3 border-t border-border text-center">
            <button
              type="button"
              onclick={() => selectDate(new Date())}
              class="py-1.5 px-3 bg-muted border border-border rounded text-sm font-medium cursor-pointer transition-all duration-200 hover:not-disabled:bg-border disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isDisabled(new Date())}
            >
              Today
            </button>
          </div>
        {/if}
      </div>
    {/if}

    {#if selectedDate && format !== 'YYYY-MM-DD' && format !== 'HH:mm'}
      <div class="mt-2 py-2 px-3 bg-muted rounded-md text-sm text-muted-foreground font-mono">
        {formatDate(selectedDate, format)}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  /* Calendar day — .selected, .today, .other-month, .disabled, :hover */
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
</style>
