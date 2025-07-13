// Utility functions for handling settings across different item types

import type { Question, Page, Variable, FlowControl, Block } from '$lib/shared/types/questionnaire';

type DesignerItem = Question | Page | Variable | FlowControl | Block;

export interface ItemSettings {
  [key: string]: any;
}

/**
 * Extract settings from any designer item type
 * Returns an empty object for items that don't have settings
 */
export function getItemSettings(item: DesignerItem | null): ItemSettings {
  if (!item) return {};
  
  // Only Question and Page types have settings
  if ('settings' in item && item.settings) {
    return item.settings;
  }
  
  // For other types, return empty settings
  return {};
}

/**
 * Check if an item type supports settings
 */
export function hasSettings(item: DesignerItem | null): boolean {
  if (!item) return false;
  
  // Check if the item has a type property and it's question or page
  if ('type' in item) {
    // Question has a 'type' property with QuestionType values
    // Check if it's a question by looking for question-specific properties
    return 'responseType' in item || 'text' in item;
  }
  
  // Page has 'blocks' or 'questions' property
  if ('blocks' in item || 'questions' in item) {
    return true;
  }
  
  return false;
}

/**
 * Create an updated item with new settings
 * Only updates items that support settings
 */
export function updateItemSettings<T extends DesignerItem>(
  item: T,
  newSettings: Partial<ItemSettings>
): T {
  // Only update if the item type supports settings
  if (hasSettings(item)) {
    return {
      ...item,
      settings: {
        ...getItemSettings(item),
        ...newSettings
      }
    };
  }
  
  // Return unchanged for types that don't support settings
  return item;
}

/**
 * Get the type name of a designer item for display purposes
 */
export function getItemTypeName(item: DesignerItem | null): string {
  if (!item) return 'Unknown';
  
  if ('responseType' in item) return 'Question';
  if ('blocks' in item || 'questions' in item) return 'Page';
  if ('formula' in item && 'scope' in item) return 'Variable';
  if ('type' in item && 'condition' in item) return 'Flow Control';
  if ('pageId' in item && 'questions' in item) return 'Block';
  
  return 'Unknown';
}