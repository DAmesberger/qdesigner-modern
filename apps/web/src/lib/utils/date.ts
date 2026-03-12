/**
 * Format a date to show the distance from now in a human-readable format
 * @param date - The date to format
 * @returns A string like "2 hours", "3 days", etc.
 */
export function formatDistanceToNow(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInWeeks = Math.floor(diffInDays / 7);
  const diffInMonths = Math.floor(diffInDays / 30);
  const diffInYears = Math.floor(diffInDays / 365);

  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''}`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''}`;
  } else if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays !== 1 ? 's' : ''}`;
  } else if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks !== 1 ? 's' : ''}`;
  } else if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths !== 1 ? 's' : ''}`;
  } else {
    return `${diffInYears} year${diffInYears !== 1 ? 's' : ''}`;
  }
}

/**
 * Format a date to a locale string
 * @param date - The date to format
 * @param options - Intl.DateTimeFormatOptions
 * @returns A formatted date string
 */
export function formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(undefined, options);
}

/**
 * Format a date to a locale time string
 * @param date - The date to format
 * @param options - Intl.DateTimeFormatOptions
 * @returns A formatted time string
 */
export function formatTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleTimeString(undefined, options);
}

/**
 * Format a date to a locale date and time string
 * @param date - The date to format
 * @param options - Intl.DateTimeFormatOptions
 * @returns A formatted date and time string
 */
export function formatDateTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString(undefined, options);
}