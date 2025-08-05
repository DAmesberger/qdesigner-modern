/**
 * Collaboration Module - Main Exports
 * Real-time collaboration system for QDesigner Modern
 */

// Core classes
export { CollaborationClient } from './CollaborationClient.js';
export { OperationalTransform } from './OperationalTransform.js';
export { VersionControl } from './VersionControl.js';
export { ChangeTracker } from './ChangeTracker.js';

// Types
export type * from './types.js';

// Components
export { default as CommentThread } from './components/CommentThread.svelte';
export { default as PresenceIndicator } from './components/PresenceIndicator.svelte';
export { default as VersionHistory } from './components/VersionHistory.svelte';
export { default as ActivityTimeline } from './components/ActivityTimeline.svelte';

// Utility functions and helpers
export * from './utils.js';

// Default configuration
import type { CollaborationConfig } from './types.js';

export const DEFAULT_COLLABORATION_CONFIG: CollaborationConfig = {
  websocketUrl: 'ws://localhost:8080/collaboration',
  reconnectAttempts: 5,
  reconnectDelay: 1000,
  heartbeatInterval: 30000,
  operationBufferSize: 100,
  maxVersionHistory: 50,
  enableComments: true,
  enablePresence: true,
  enableVersionControl: true,
  autoSaveInterval: 5000,
  conflictResolution: 'hybrid'
};

/**
 * Initialize the collaboration system
 */
export function initializeCollaboration(config?: Partial<CollaborationConfig>) {
  const finalConfig = { ...DEFAULT_COLLABORATION_CONFIG, ...config };
  
  // Initialize singletons
  const client = new CollaborationClient(finalConfig);
  const ot = OperationalTransform.getInstance();
  const versionControl = VersionControl.getInstance();
  const changeTracker = ChangeTracker.getInstance();

  return {
    client,
    ot,
    versionControl,
    changeTracker,
    config: finalConfig
  };
}

/**
 * Generate user colors for presence indicators
 */
export function generateUserColors(userIds: string[]): Record<string, string> {
  const colors = [
    '#3B82F6', // blue
    '#10B981', // green  
    '#8B5CF6', // purple
    '#F59E0B', // yellow
    '#EF4444', // red
    '#06B6D4', // cyan
    '#EC4899', // pink
    '#84CC16', // lime
    '#F97316', // orange
    '#6366F1', // indigo
  ];

  const result: Record<string, string> = {};
  
  userIds.forEach((userId, index) => {
    result[userId] = colors[index % colors.length];
  });

  return result;
}

/**
 * Create a mock collaboration user for testing
 */
export function createMockUser(
  id: string,
  name: string,
  email: string,
  role: 'owner' | 'admin' | 'editor' | 'viewer' = 'editor'
): import('./types.js').CollaborationUser {
  return {
    id,
    name,
    email,
    role,
    color: generateUserColors([id])[id],
    status: 'online',
    lastSeen: new Date()
  };
}

/**
 * Validate websocket URL format
 */
export function validateWebSocketURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if the current environment supports WebSockets
 */
export function supportsWebSockets(): boolean {
  return typeof WebSocket !== 'undefined';
}

/**
 * Get browser information for session metadata
 */
export function getBrowserInfo(): Record<string, any> {
  if (typeof navigator === 'undefined') {
    return { browser: 'unknown', version: 'unknown' };
  }

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | undefined;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Safe JSON parse with error handling
 */
export function safeJSONParse<T = any>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Deep clone an object (for operational transformation)
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if two objects are deeply equal
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  
  if (a == null || b == null) return false;
  
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  return keysA.every(key => keysB.includes(key) && deepEqual(a[key], b[key]));
}

/**
 * Create a hash from a string (for generating colors, etc.)
 */
export function createHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Escape HTML to prevent XSS in user-generated content
 */
export function escapeHTML(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Parse @mentions from text content
 */
export function parseMentions(text: string): { userId: string; name: string; start: number; end: number }[] {
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const mentions: { userId: string; name: string; start: number; end: number }[] = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push({
      name: match[1],
      userId: match[2],
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return mentions;
}

/**
 * Format @mentions for display
 */
export function formatMentions(text: string): string {
  return text.replace(
    /@\[([^\]]+)\]\(([^)]+)\)/g,
    '<span class="mention" data-user-id="$2">@$1</span>'
  );
}

/**
 * Performance measurement utility
 */
export class PerformanceMonitor {
  private measurements = new Map<string, number>();

  start(name: string): void {
    this.measurements.set(name, performance.now());
  }

  end(name: string): number {
    const startTime = this.measurements.get(name);
    if (startTime === undefined) {
      console.warn(`No start time found for measurement: ${name}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.measurements.delete(name);
    return duration;
  }

  measure<T>(name: string, fn: () => T): T {
    this.start(name);
    const result = fn();
    const duration = this.end(name);
    console.debug(`${name} took ${duration.toFixed(2)}ms`);
    return result;
  }
}

/**
 * Event bus for loose coupling between components
 */
export class EventBus {
  private listeners = new Map<string, Set<Function>>();

  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event: string, ...args: any[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  off(event: string, callback?: Function): void {
    if (callback) {
      this.listeners.get(event)?.delete(callback);
    } else {
      this.listeners.delete(event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}