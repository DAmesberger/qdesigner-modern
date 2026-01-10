// QDesigner Modern i18n Formatting Utilities
// Locale-aware formatting functions with enhanced features

import { getCurrentLanguage, getLanguageConfig } from '../config';
import type { FormatterOptions } from '../types';

// Enhanced locale-aware formatters
export class LocaleFormatter {
  private locale: string;
  private region?: string;

  constructor(language?: string) {
    const lang = language || getCurrentLanguage();
    const config = getLanguageConfig(lang);
    this.locale = lang;
    this.region = config?.region;
  }

  private getFullLocale(): string {
    return this.region ? `${this.locale}-${this.region}` : this.locale;
  }

  // Number formatting
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    try {
      return new Intl.NumberFormat(this.getFullLocale(), options).format(value);
    } catch (error) {
      // Fallback to basic locale if region-specific fails
      return new Intl.NumberFormat(this.locale, options).format(value);
    }
  }

  // Currency formatting
  formatCurrency(
    value: number, 
    currency?: string, 
    options?: Intl.NumberFormatOptions
  ): string {
    const config = getLanguageConfig(this.locale);
    const defaultCurrency = currency || config?.currency || 'USD';
    
    try {
      return new Intl.NumberFormat(this.getFullLocale(), {
        style: 'currency',
        currency: defaultCurrency,
        ...options
      }).format(value);
    } catch (error) {
      // Fallback with USD if currency is not supported
      return new Intl.NumberFormat(this.locale, {
        style: 'currency',
        currency: 'USD',
        ...options
      }).format(value);
    }
  }

  // Percentage formatting
  formatPercentage(
    value: number, 
    options?: { decimals?: number; style?: 'decimal' | 'percent' }
  ): string {
    const { decimals = 0, style = 'percent' } = options || {};
    
    if (style === 'decimal') {
      return this.formatNumber(value, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }) + '%';
    }
    
    return new Intl.NumberFormat(this.getFullLocale(), {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value / 100);
  }

  // Date formatting
  formatDate(
    date: Date | string | number, 
    options?: Intl.DateTimeFormatOptions
  ): string {
    const dateObj = this.parseDate(date);
    if (!dateObj) return 'Invalid Date';
    
    const config = getLanguageConfig(this.locale);
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    };
    
    // Use language-specific date format preferences
    if (config?.dateFormat) {
      if (config.dateFormat.includes('MM/dd/yyyy')) {
        defaultOptions.month = '2-digit';
        defaultOptions.day = '2-digit';
      } else if (config.dateFormat.includes('dd.MM.yyyy')) {
        defaultOptions.day = '2-digit';
        defaultOptions.month = '2-digit';
      }
    }
    
    try {
      return new Intl.DateTimeFormat(this.getFullLocale(), {
        ...defaultOptions,
        ...options
      }).format(dateObj);
    } catch (error) {
      return new Intl.DateTimeFormat(this.locale, {
        ...defaultOptions,
        ...options
      }).format(dateObj);
    }
  }

  // Time formatting
  formatTime(
    date: Date | string | number, 
    options?: Intl.DateTimeFormatOptions
  ): string {
    const dateObj = this.parseDate(date);
    if (!dateObj) return 'Invalid Time';
    
    const config = getLanguageConfig(this.locale);
    const is24Hour = config?.timeFormat === '24h';
    
    const defaultOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !is24Hour
    };
    
    try {
      return new Intl.DateTimeFormat(this.getFullLocale(), {
        ...defaultOptions,
        ...options
      }).format(dateObj);
    } catch (error) {
      return new Intl.DateTimeFormat(this.locale, {
        ...defaultOptions,
        ...options
      }).format(dateObj);
    }
  }

  // Date and time formatting
  formatDateTime(
    date: Date | string | number, 
    options?: Intl.DateTimeFormatOptions
  ): string {
    const dateObj = this.parseDate(date);
    if (!dateObj) return 'Invalid DateTime';
    
    const config = getLanguageConfig(this.locale);
    const is24Hour = config?.timeFormat === '24h';
    
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: !is24Hour
    };
    
    try {
      return new Intl.DateTimeFormat(this.getFullLocale(), {
        ...defaultOptions,
        ...options
      }).format(dateObj);
    } catch (error) {
      return new Intl.DateTimeFormat(this.locale, {
        ...defaultOptions,
        ...options
      }).format(dateObj);
    }
  }

  // Relative time formatting
  formatRelativeTime(
    date: Date | string | number,
    options?: { 
      numeric?: 'always' | 'auto'; 
      style?: 'long' | 'short' | 'narrow';
      baseTime?: Date | string | number;
    }
  ): string {
    const { numeric = 'auto', style = 'long', baseTime = new Date() } = options || {};
    
    const dateObj = this.parseDate(date);
    const baseObj = this.parseDate(baseTime);
    
    if (!dateObj || !baseObj) return 'Invalid Date';
    
    try {
      const rtf = new Intl.RelativeTimeFormat(this.getFullLocale(), {
        numeric,
        style
      });
      
      const diff = dateObj.getTime() - baseObj.getTime();
      const { value, unit } = this.getRelativeTimeValue(diff);
      
      return rtf.format(value, unit);
    } catch (error) {
      // Fallback for browsers without RelativeTimeFormat
      return this.getFallbackRelativeTime(dateObj, baseObj);
    }
  }

  // List formatting
  formatList(
    items: string[], 
    options?: {
      type?: 'conjunction' | 'disjunction' | 'unit';
      style?: 'long' | 'short' | 'narrow';
    }
  ): string {
    const { type = 'conjunction', style = 'long' } = options || {};
    
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    
    // Check for modern ListFormat support
    if ('ListFormat' in Intl) {
      try {
        // @ts-ignore - ListFormat might not be in all TypeScript versions
        return new Intl.ListFormat(this.getFullLocale(), {
          style,
          type
        }).format(items);
      } catch {
        // Fall through to manual formatting
      }
    }
    
    // Manual list formatting fallback
    return this.formatListManually(items, type);
  }

  // File size formatting
  formatFileSize(
    bytes: number, 
    options?: { 
      decimals?: number; 
      binary?: boolean; 
      style?: 'long' | 'short' 
    }
  ): string {
    const { decimals = 1, binary = false, style = 'short' } = options || {};
    
    if (bytes === 0) return '0 Bytes';
    
    const k = binary ? 1024 : 1000;
    const sizes = binary 
      ? ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
      : ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const longSizes = binary
      ? ['bytes', 'kibibytes', 'mebibytes', 'gibibytes', 'tebibytes', 'pebibytes']
      : ['bytes', 'kilobytes', 'megabytes', 'gigabytes', 'terabytes', 'petabytes'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    
    const formattedValue = this.formatNumber(value, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    
    const unit = style === 'long' ? longSizes[i] : sizes[i];
    
    return `${formattedValue} ${unit}`;
  }

  // Memory/Storage formatting
  formatMemory(bytes: number, options?: { style?: 'binary' | 'decimal' }): string {
    const { style = 'binary' } = options || {};
    return this.formatFileSize(bytes, { 
      binary: style === 'binary',
      decimals: 1,
      style: 'short'
    });
  }

  // Duration formatting
  formatDuration(
    milliseconds: number, 
    options?: { 
      style?: 'long' | 'short' | 'compact';
      units?: ('days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds')[];
      precision?: number;
    }
  ): string {
    const { 
      style = 'long', 
      units = ['days', 'hours', 'minutes', 'seconds'],
      precision = 2 
    } = options || {};
    
    if (milliseconds < 0) {
      return `-${this.formatDuration(-milliseconds, options)}`;
    }
    
    const durations = {
      days: Math.floor(milliseconds / (1000 * 60 * 60 * 24)),
      hours: Math.floor((milliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((milliseconds % (1000 * 60)) / 1000),
      milliseconds: milliseconds % 1000
    };
    
    const parts: string[] = [];
    let addedParts = 0;
    
    for (const unit of units) {
      if (addedParts >= precision) break;
      
      const value = durations[unit];
      if (value > 0 || (parts.length === 0 && unit === units[units.length - 1])) {
        parts.push(this.formatDurationPart(value, unit, style));
        addedParts++;
      }
    }
    
    if (parts.length === 0) return '0';
    
    return style === 'compact' ? parts.join('') : parts.join(' ');
  }

  // Range formatting
  formatRange(
    start: number | Date, 
    end: number | Date, 
    type: 'number' | 'date' | 'time' = 'number',
    options?: any
  ): string {
    try {
      if (type === 'number') {
        const startNum = typeof start === 'number' ? start : Number(start);
        const endNum = typeof end === 'number' ? end : Number(end);
        
        // Use NumberFormat range if available
        if ('formatRange' in Intl.NumberFormat.prototype) {
          // @ts-ignore
          return new Intl.NumberFormat(this.getFullLocale(), options).formatRange(startNum, endNum);
        }
        
        return `${this.formatNumber(startNum, options)} – ${this.formatNumber(endNum, options)}`;
      } else {
        const startDate = this.parseDate(start);
        const endDate = this.parseDate(end);
        
        if (!startDate || !endDate) return 'Invalid Date Range';
        
        // Use DateTimeFormat range if available
        if ('formatRange' in Intl.DateTimeFormat.prototype) {
          // @ts-ignore
          return new Intl.DateTimeFormat(this.getFullLocale(), options).formatRange(startDate, endDate);
        }
        
        const formatter = type === 'time' ? this.formatTime : this.formatDate;
        return `${formatter.call(this, startDate, options)} – ${formatter.call(this, endDate, options)}`;
      }
    } catch (error) {
      // Fallback to simple formatting
      const startFormatted = type === 'number' 
        ? this.formatNumber(start as number, options)
        : type === 'time' 
          ? this.formatTime(start, options)
          : this.formatDate(start, options);
          
      const endFormatted = type === 'number' 
        ? this.formatNumber(end as number, options)
        : type === 'time' 
          ? this.formatTime(end, options)
          : this.formatDate(end, options);
          
      return `${startFormatted} – ${endFormatted}`;
    }
  }

  // Helper methods
  private parseDate(date: Date | string | number): Date | null {
    if (date instanceof Date) return date;
    
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private getRelativeTimeValue(diff: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
    const absDiff = Math.abs(diff);
    
    if (absDiff < 60000) { // Less than 1 minute
      return { value: Math.round(diff / 1000), unit: 'second' };
    } else if (absDiff < 3600000) { // Less than 1 hour
      return { value: Math.round(diff / 60000), unit: 'minute' };
    } else if (absDiff < 86400000) { // Less than 1 day
      return { value: Math.round(diff / 3600000), unit: 'hour' };
    } else if (absDiff < 2592000000) { // Less than 30 days
      return { value: Math.round(diff / 86400000), unit: 'day' };
    } else if (absDiff < 31536000000) { // Less than 1 year
      return { value: Math.round(diff / 2592000000), unit: 'month' };
    } else {
      return { value: Math.round(diff / 31536000000), unit: 'year' };
    }
  }

  private getFallbackRelativeTime(date: Date, base: Date): string {
    const diff = date.getTime() - base.getTime();
    const { value, unit } = this.getRelativeTimeValue(diff);
    
    const isPast = value < 0;
    const absValue = Math.abs(value);
    
    const unitLabels = {
      second: absValue === 1 ? 'second' : 'seconds',
      minute: absValue === 1 ? 'minute' : 'minutes',
      hour: absValue === 1 ? 'hour' : 'hours',
      day: absValue === 1 ? 'day' : 'days',
      month: absValue === 1 ? 'month' : 'months',
      year: absValue === 1 ? 'year' : 'years'
    };
    
    const label = (unitLabels as any)[unit];
    return isPast 
      ? `${absValue} ${label} ago`
      : `in ${absValue} ${label}`;
  }

  private formatListManually(items: string[], type: 'conjunction' | 'disjunction' | 'unit'): string {
    if (items.length === 2) {
      const connector = type === 'disjunction' ? ' or ' : ' and ';
      return items.join(connector);
    }
    
    const lastItem = items[items.length - 1];
    const otherItems = items.slice(0, -1);
    const connector = type === 'disjunction' ? ', or ' : ', and ';
    
    return otherItems.join(', ') + connector + lastItem;
  }

  private formatDurationPart(value: number, unit: string, style: 'long' | 'short' | 'compact'): string {
    if (style === 'compact') {
      const shortUnits = {
        days: 'd',
        hours: 'h',
        minutes: 'm',
        seconds: 's',
        milliseconds: 'ms'
      };
      return `${value}${shortUnits[unit as keyof typeof shortUnits]}`;
    }
    
    if (style === 'short') {
      const shortForms = {
        days: value === 1 ? 'day' : 'days',
        hours: value === 1 ? 'hr' : 'hrs',
        minutes: value === 1 ? 'min' : 'mins',
        seconds: value === 1 ? 'sec' : 'secs',
        milliseconds: 'ms'
      };
      return `${value} ${shortForms[unit as keyof typeof shortForms]}`;
    }
    
    // Long style (default)
    const longForms = {
      days: value === 1 ? 'day' : 'days',
      hours: value === 1 ? 'hour' : 'hours',
      minutes: value === 1 ? 'minute' : 'minutes',
      seconds: value === 1 ? 'second' : 'seconds',
      milliseconds: value === 1 ? 'millisecond' : 'milliseconds'
    };
    
    return `${value} ${longForms[unit as keyof typeof longForms]}`;
  }
}

// Global formatter instance
let globalFormatter: LocaleFormatter;

// Factory function to get/create formatter
export function getFormatter(language?: string): LocaleFormatter {
  if (!globalFormatter || (language && language !== globalFormatter['locale'])) {
    globalFormatter = new LocaleFormatter(language);
  }
  return globalFormatter;
}

// Convenience functions for common formatting tasks
export function formatNumber(value: number, options?: Intl.NumberFormatOptions, language?: string): string {
  return getFormatter(language).formatNumber(value, options);
}

export function formatCurrency(value: number, currency?: string, options?: Intl.NumberFormatOptions, language?: string): string {
  return getFormatter(language).formatCurrency(value, currency, options);
}

export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions, language?: string): string {
  return getFormatter(language).formatDate(date, options);
}

export function formatTime(date: Date | string | number, options?: Intl.DateTimeFormatOptions, language?: string): string {
  return getFormatter(language).formatTime(date, options);
}

export function formatDateTime(date: Date | string | number, options?: Intl.DateTimeFormatOptions, language?: string): string {
  return getFormatter(language).formatDateTime(date, options);
}

export function formatRelativeTime(date: Date | string | number, options?: { numeric?: 'always' | 'auto'; style?: 'long' | 'short' | 'narrow' }, language?: string): string {
  return getFormatter(language).formatRelativeTime(date, options);
}

export function formatPercentage(value: number, decimals?: number, language?: string): string {
  return getFormatter(language).formatPercentage(value, { decimals });
}

export function formatFileSize(bytes: number, options?: { decimals?: number; binary?: boolean }, language?: string): string {
  return getFormatter(language).formatFileSize(bytes, options);
}

export function formatDuration(milliseconds: number, options?: { style?: 'long' | 'short' | 'compact' }, language?: string): string {
  return getFormatter(language).formatDuration(milliseconds, options);
}

export function formatList(items: string[], options?: { type?: 'conjunction' | 'disjunction'; style?: 'long' | 'short' }, language?: string): string {
  return getFormatter(language).formatList(items, options);
}

// Specialized formatters
export const scientificFormatter = {
  formatScientific(value: number, precision: number = 2, language?: string): string {
    return getFormatter(language).formatNumber(value, {
      notation: 'scientific',
      maximumFractionDigits: precision
    });
  },
  
  formatEngineering(value: number, precision: number = 2, language?: string): string {
    return getFormatter(language).formatNumber(value, {
      notation: 'engineering',
      maximumFractionDigits: precision
    });
  },
  
  formatCompact(value: number, style: 'short' | 'long' = 'short', language?: string): string {
    return getFormatter(language).formatNumber(value, {
      notation: 'compact',
      compactDisplay: style
    });
  }
};

export const surveyFormatter = {
  formatLikertScale(value: number, min: number = 1, max: number = 5, language?: string): string {
    const formatter = getFormatter(language);
    return `${formatter.formatNumber(value)} / ${formatter.formatNumber(max)}`;
  },
  
  formatResponseTime(milliseconds: number, language?: string): string {
    return getFormatter(language).formatDuration(milliseconds, { 
      style: 'short',
      units: ['seconds', 'milliseconds'],
      precision: 2 
    });
  },
  
  formatSampleSize(n: number, language?: string): string {
    const formatter = getFormatter(language);
    return `n = ${formatter.formatNumber(n)}`;
  },
  
  formatConfidenceInterval(lower: number, upper: number, level: number = 95, language?: string): string {
    const formatter = getFormatter(language);
    return `${level}% CI: [${formatter.formatNumber(lower, { maximumFractionDigits: 3 })}, ${formatter.formatNumber(upper, { maximumFractionDigits: 3 })}]`;
  }
};