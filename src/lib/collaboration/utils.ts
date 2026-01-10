/**
 * Collaboration Utilities
 * Helper functions and utilities for the collaboration system
 */

import type { 
  Operation, 
  CollaborationUser, 
  CursorPosition, 
  Selection,
  CommentPosition,
  PathArray 
} from './types.js';

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Convert a dot-notation path to an array
 */
export function pathStringToArray(path: string): PathArray {
  return path.split('.').filter(segment => segment.length > 0);
}

/**
 * Convert a path array to dot notation
 */
export function pathArrayToString(path: PathArray): string {
  return path.join('.');
}

/**
 * Get a nested value from an object using a path array
 */
export function getNestedValue(obj: any, path: PathArray): any {
  let current = obj;
  for (const segment of path) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Set a nested value in an object using a path array
 */
export function setNestedValue(obj: any, path: PathArray, value: any): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!;
    if (!(segment in current) || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[path[path.length - 1]] = value;
}

/**
 * Delete a nested value from an object using a path array
 */
export function deleteNestedValue(obj: any, path: PathArray): boolean {
  if (path.length === 0) return false;
  
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!;
    if (!(segment in current) || typeof current[segment] !== 'object') {
      return false;
    }
    current = current[segment];
  }
  
  const lastSegment = path[path.length - 1]!;
  if (lastSegment in current) {
    delete current[lastSegment];
    return true;
  }
  
  return false;
}

// ============================================================================
// Operation Utilities
// ============================================================================

/**
 * Create a standardized operation ID
 */
export function createOperationId(userId: string, timestamp: Date = new Date()): string {
  return `op_${userId}_${timestamp.getTime()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Validate operation structure
 */
export function validateOperation(operation: any): operation is Operation {
  if (!operation || typeof operation !== 'object') return false;
  
  const required = ['id', 'type', 'userId', 'timestamp', 'path'];
  for (const field of required) {
    if (!(field in operation)) return false;
  }
  
  if (!Array.isArray(operation.path)) return false;
  if (!(operation.timestamp instanceof Date)) return false;
  
  const validTypes = ['insert', 'delete', 'update', 'move', 'reorder'];
  if (!validTypes.includes(operation.type)) return false;
  
  return true;
}

/**
 * Create an insert operation
 */
export function createInsertOperation(
  userId: string,
  path: PathArray,
  position: number,
  content: any,
  target: 'question' | 'page' | 'variable' | 'option' | 'block'
): Operation {
  return {
    id: createOperationId(userId),
    type: 'insert',
    userId,
    timestamp: new Date(),
    path,
    position,
    content,
    target
  } as any;
}

/**
 * Create a delete operation
 */
export function createDeleteOperation(
  userId: string,
  path: PathArray,
  position: number,
  length: number = 1,
  target: 'question' | 'page' | 'variable' | 'option' | 'block',
  deletedContent?: any
): Operation {
  return {
    id: createOperationId(userId),
    type: 'delete',
    userId,
    timestamp: new Date(),
    path,
    position,
    length,
    target,
    deletedContent
  } as any;
}

/**
 * Create an update operation
 */
export function createUpdateOperation(
  userId: string,
  path: PathArray,
  property: string,
  oldValue: any,
  newValue: any
): Operation {
  return {
    id: createOperationId(userId),
    type: 'update',
    userId,
    timestamp: new Date(),
    path,
    property,
    oldValue,
    newValue
  } as any;
}

/**
 * Create a move operation
 */
export function createMoveOperation(
  userId: string,
  fromPath: PathArray,
  toPath: PathArray,
  fromPosition: number,
  toPosition: number
): Operation {
  return {
    id: createOperationId(userId),
    type: 'move',
    userId,
    timestamp: new Date(),
    path: fromPath, // Base path for compatibility
    fromPath,
    toPath,
    fromPosition,
    toPosition
  } as any;
}

// ============================================================================
// User Utilities
// ============================================================================

/**
 * Generate a random color for a user
 */
export function generateUserColor(userId: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7DBDD'
  ];
  
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length]!;
}

/**
 * Get user initials from name
 */
export function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/**
 * Create a CSS class name for user-specific styling
 */
export function getUserClassName(userId: string): string {
  return `user-${userId.replace(/[^a-zA-Z0-9]/g, '-')}`;
}

// ============================================================================
// Position and Selection Utilities
// ============================================================================

/**
 * Create a cursor position for a specific element
 */
export function createCursorPosition(
  type: 'question' | 'page' | 'variable' | 'general',
  targetId: string,
  coordinates: { x: number; y: number },
  property?: string,
  textPosition?: number
): CursorPosition {
  return {
    type,
    targetId,
    coordinates,
    property,
    textPosition
  };
}

/**
 * Create a selection for specific elements
 */
export function createSelection(
  type: 'question' | 'page' | 'variable' | 'multiple',
  targetIds: string[],
  bounds?: { x: number; y: number; width: number; height: number },
  textRange?: { start: number; end: number }
): Selection {
  return {
    type,
    targetIds,
    bounds,
    textRange
  };
}

/**
 * Create a comment position
 */
export function createCommentPosition(
  type: 'question' | 'page' | 'variable' | 'general',
  targetId: string,
  property?: string,
  coordinates?: { x: number; y: number },
  textRange?: { start: number; end: number }
): CommentPosition {
  return {
    type,
    targetId,
    property,
    coordinates,
    textRange
  };
}

// ============================================================================
// Conflict Resolution Utilities
// ============================================================================

/**
 * Compare two operations for conflict detection
 */
export function operationsConflict(op1: Operation, op2: Operation): boolean {
  // Same user operations don't conflict
  if (op1.userId === op2.userId) return false;
  
  // Different paths don't conflict unless one is a parent of the other
  if (!pathsIntersect(op1.path, op2.path)) return false;
  
  // Same path operations might conflict
  if (pathsEqual(op1.path, op2.path)) {
    // Update operations on the same property conflict
    if (op1.type === 'update' && op2.type === 'update') {
      return (op1 as any).property === (op2 as any).property;
    }
    
    // Insert/delete operations at same position conflict
    if ((op1.type === 'insert' || op1.type === 'delete') && 
        (op2.type === 'insert' || op2.type === 'delete')) {
      return (op1 as any).position === (op2 as any).position;
    }
  }
  
  return false;
}

/**
 * Check if two paths are equal
 */
export function pathsEqual(path1: PathArray, path2: PathArray): boolean {
  if (path1.length !== path2.length) return false;
  return path1.every((segment, index) => segment === path2[index]);
}

/**
 * Check if two paths intersect (one is a parent of the other)
 */
export function pathsIntersect(path1: PathArray, path2: PathArray): boolean {
  const minLength = Math.min(path1.length, path2.length);
  for (let i = 0; i < minLength; i++) {
    if (path1[i] !== path2[i]) return false;
  }
  return true;
}

/**
 * Check if path1 is a parent of path2
 */
export function isParentPath(parentPath: PathArray, childPath: PathArray): boolean {
  if (parentPath.length >= childPath.length) return false;
  return parentPath.every((segment, index) => segment === childPath[index]);
}

/**
 * Check if path1 is a child of path2
 */
export function isChildPath(childPath: PathArray, parentPath: PathArray): boolean {
  return isParentPath(parentPath, childPath);
}

// ============================================================================
// Time and Date Utilities
// ============================================================================

/**
 * Format a relative time string
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

/**
 * Format a timestamp for display
 */
export function formatTimestamp(date: Date, includeTime: boolean = true): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  
  return date.toLocaleDateString(undefined, options);
}

/**
 * Check if a date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

/**
 * Check if a date is yesterday
 */
export function isYesterday(date: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate user role
 */
export function isValidUserRole(role: string): role is CollaborationUser['role'] {
  return ['owner', 'admin', 'editor', 'viewer'].includes(role);
}

/**
 * Validate user status
 */
export function isValidUserStatus(status: string): status is CollaborationUser['status'] {
  return ['online', 'away', 'offline'].includes(status);
}

/**
 * Validate color format (hex)
 */
export function isValidHexColor(color: string): boolean {
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexRegex.test(color);
}

// ============================================================================
// Text Processing Utilities
// ============================================================================

/**
 * Truncate text to a maximum length
 */
export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Extract mentions from text
 */
export function extractMentions(text: string): string[] {
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const mentions: string[] = [];
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[2]); // Extract user ID
  }
  
  return mentions;
}

/**
 * Replace mentions with formatted HTML
 */
export function formatMentions(text: string, users: CollaborationUser[]): string {
  const userMap = new Map(users.map(u => [u.id, u]));
  
  return text.replace(
    /@\[([^\]]+)\]\(([^)]+)\)/g,
    (match, name, userId) => {
      const user = userMap.get(userId);
      const displayName = user ? user.name : name;
      return `<span class="mention" data-user-id="${userId}" style="color: ${user?.color || '#666'}"}>@${displayName}</span>`;
    }
  );
}

/**
 * Highlight search terms in text
 */
export function highlightText(text: string, searchTerm: string): string {
  if (!searchTerm) return text;
  
  const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

/**
 * Escape special regex characters
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Remove duplicates from an array
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * Group array items by a key function
 */
export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<K, T[]>);
}

/**
 * Sort array by multiple criteria
 */
export function sortBy<T>(array: T[], ...sortFns: Array<(item: T) => any>): T[] {
  return [...array].sort((a, b) => {
    for (const sortFn of sortFns) {
      const aVal = sortFn(a);
      const bVal = sortFn(b);
      
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
    }
    return 0;
  });
}

// ============================================================================
// Performance Utilities
// ============================================================================

/**
 * Simple debounce implementation
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
 * Simple throttle implementation
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
 * Create a simple cache with expiration
 */
export function createCache<K, V>(ttlMs: number = 60000) {
  const cache = new Map<K, { value: V; expires: number }>();
  
  return {
    get(key: K): V | undefined {
      const entry = cache.get(key);
      if (!entry) return undefined;
      
      if (Date.now() > entry.expires) {
        cache.delete(key);
        return undefined;
      }
      
      return entry.value;
    },
    
    set(key: K, value: V): void {
      cache.set(key, {
        value,
        expires: Date.now() + ttlMs
      });
    },
    
    delete(key: K): boolean {
      return cache.delete(key);
    },
    
    clear(): void {
      cache.clear();
    },
    
    size(): number {
      // Clean expired entries first
      const now = Date.now();
      for (const [key, entry] of cache.entries()) {
        if (now > entry.expires) {
          cache.delete(key);
        }
      }
      return cache.size;
    }
  };
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Create a standardized error object
 */
export function createError(
  code: string,
  message: string,
  details?: any
): { code: string; message: string; details?: any; timestamp: Date } {
  return {
    code,
    message,
    details,
    timestamp: new Date()
  };
}

/**
 * Safe async operation wrapper
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<{ success: true; data: T } | { success: false; error: Error; data?: T }> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      data: fallback
    };
  }
}