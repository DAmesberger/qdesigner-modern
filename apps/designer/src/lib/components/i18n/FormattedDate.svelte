<script lang="ts">
  import { useFormatters } from '$lib/i18n/hooks';
  
  interface Props {
    value: Date | string | number;
    format?: 'short' | 'medium' | 'long' | 'full' | 'custom';
    dateStyle?: 'full' | 'long' | 'medium' | 'short';
    timeStyle?: 'full' | 'long' | 'medium' | 'short';
    includeTime?: boolean;
    relative?: boolean;
    calendar?: boolean;
    year?: 'numeric' | '2-digit';
    month?: 'numeric' | '2-digit' | 'long' | 'short' | 'narrow';
    day?: 'numeric' | '2-digit';
    hour?: 'numeric' | '2-digit';
    minute?: 'numeric' | '2-digit';
    second?: 'numeric' | '2-digit';
    timeZone?: string;
    hour12?: boolean;
  }
  
  let {
    value,
    format = 'medium',
    dateStyle,
    timeStyle,
    includeTime = false,
    relative = false,
    calendar = false,
    year,
    month,
    day,
    hour,
    minute,
    second,
    timeZone,
    hour12
  }: Props = $props();
  
  const { formatDate, formatTime, formatRelativeTime } = useFormatters();
  
  $: dateObj = value instanceof Date ? value : new Date(value);
  
  $: formattedValue = (() => {
    if (!isFinite(dateObj.getTime())) {
      return 'Invalid Date';
    }
    
    if (relative) {
      return formatRelativeTime(dateObj);
    }
    
    const options: Intl.DateTimeFormatOptions = {};
    
    // Use preset formats or custom options
    if (format === 'custom' || (!dateStyle && !timeStyle)) {
      // Custom format
      if (year) options.year = year;
      if (month) options.month = month;
      if (day) options.day = day;
      if (hour) options.hour = hour;
      if (minute) options.minute = minute;
      if (second) options.second = second;
      if (timeZone) options.timeZone = timeZone;
      if (hour12 !== undefined) options.hour12 = hour12;
    } else {
      // Preset formats
      if (dateStyle) options.dateStyle = dateStyle;
      if (timeStyle) options.timeStyle = timeStyle;
      
      if (!dateStyle && !timeStyle) {
        switch (format) {
          case 'short':
            options.dateStyle = 'short';
            if (includeTime) options.timeStyle = 'short';
            break;
          case 'medium':
            options.dateStyle = 'medium';
            if (includeTime) options.timeStyle = 'short';
            break;
          case 'long':
            options.dateStyle = 'long';
            if (includeTime) options.timeStyle = 'medium';
            break;
          case 'full':
            options.dateStyle = 'full';
            if (includeTime) options.timeStyle = 'long';
            break;
        }
      }
    }
    
    if (calendar) {
      // Add calendar-specific formatting
      options.calendar = 'gregory'; // Can be extended for other calendars
    }
    
    return formatDate(dateObj, options);
  })();
  
  $: isoString = dateObj.toISOString();
</script>

<time 
  class="formatted-date" 
  datetime={isoString}
  title={isoString}
>
  {formattedValue}
</time>

<style>
  .formatted-date {
    /* Ensure dates in RTL languages display correctly */
    unicode-bidi: embed;
  }
</style>