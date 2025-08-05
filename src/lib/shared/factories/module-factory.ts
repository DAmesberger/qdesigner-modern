/**
 * Module Factory
 * Creates questions, instructions, and analytics with proper default configurations
 */

import { nanoid } from 'nanoid';
import { moduleRegistry } from '$lib/modules/registry';
import type { ModuleCategory } from '$lib/modules/types';

export interface ModuleItem {
  id: string;
  type: string;
  category: ModuleCategory;
  order: number;
  config: any;
  conditions?: Array<{ formula: string; action: string }>;
  variables?: Array<{ id: string; name: string; source: string }>;
  validation?: Array<{ type: string; value: any; message?: string }>;
  layout?: {
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    opacity?: number;
    rotation?: number;
  };
  timing?: {
    fixationDuration?: number;
    preDelay?: number;
    stimulusDuration?: number;
    postDelay?: number;
    maxDuration?: number;
  };
  [key: string]: any; // For module-specific properties
}

/**
 * Generate a unique ID for modules and related entities
 */
function generateId(): string {
  return nanoid(12);
}

/**
 * Generate a variable name based on module type and ID
 */
function generateVariableName(type: string, id: string): string {
  const typePrefix = type.split('-')[0]; // Get first part of type
  return `${typePrefix}_${id.substring(0, 6)}`;
}

/**
 * Factory class for creating modules with proper defaults
 */
export class ModuleFactory {
  /**
   * Create a new module with default configuration
   */
  static create(type: string, category?: ModuleCategory): ModuleItem {
    const metadata = moduleRegistry.get(type);
    
    if (!metadata) {
      throw new Error(`Module type '${type}' not found in registry`);
    }
    
    // Use category from metadata if not provided
    const moduleCategory = category || metadata.category;
    
    const baseId = generateId();
    const baseModule: ModuleItem = {
      id: baseId,
      type,
      category: moduleCategory,
      order: 0,
      config: {}
    };
    
    // Apply default configuration from metadata
    if (metadata.defaultConfig) {
      baseModule.config = JSON.parse(JSON.stringify(metadata.defaultConfig));
    }
    
    // Add category-specific defaults
    switch (moduleCategory) {
      case 'question':
        return this.applyQuestionDefaults(baseModule, metadata);
        
      case 'instruction':
        return this.applyInstructionDefaults(baseModule, metadata);
        
      case 'analytics':
        return this.applyAnalyticsDefaults(baseModule, metadata);
        
      default:
        return baseModule;
    }
  }
  
  /**
   * Apply question-specific defaults
   */
  private static applyQuestionDefaults(module: ModuleItem, metadata: any): ModuleItem {
    // Questions typically need response configuration
    if (!module.config.response) {
      module.config.response = {
        saveAs: generateVariableName(module.type, module.id),
        trackTiming: true
      };
    }
    
    // Add validation if the module supports it
    if (metadata.capabilities?.supportsValidation && !module.validation) {
      module.validation = [{
        type: 'required',
        value: true,
        message: 'This question is required'
      }];
    }
    
    // Add text and instruction fields
    if (!module.text) {
      module.text = 'Enter your question text here';
    }
    
    if (!module.instruction && metadata.capabilities?.supportsInstructions) {
      module.instruction = 'Provide any additional instructions';
    }
    
    return module;
  }
  
  /**
   * Apply instruction-specific defaults
   */
  private static applyInstructionDefaults(module: ModuleItem, metadata: any): ModuleItem {
    // Instructions should use the new display structure
    if (!module.config) {
      module.config = {};
    }
    
    // Set up display config with content
    if (!module.config.display) {
      module.config.display = {
        content: metadata.defaultConfig?.display?.content || 
                 '## Instructions\n\nEnter your instruction text here. You can use **markdown** formatting.',
        enableMarkdown: metadata.defaultConfig?.display?.enableMarkdown ?? true,
        variables: metadata.defaultConfig?.display?.variables ?? true
      };
    }
    
    // Set up navigation config
    if (!module.config.navigation) {
      module.config.navigation = {
        showNext: metadata.defaultConfig?.navigation?.showNext ?? true,
        autoAdvance: metadata.defaultConfig?.navigation?.autoAdvance ?? false,
        advanceDelay: metadata.defaultConfig?.navigation?.advanceDelay ?? 5000
      };
    }
    
    return module;
  }
  
  /**
   * Apply analytics-specific defaults
   */
  private static applyAnalyticsDefaults(module: ModuleItem, metadata: any): ModuleItem {
    // Analytics need data configuration
    if (!module.config.data) {
      module.config.data = {
        source: 'variable',
        variableName: '',
        aggregation: 'none'
      };
    }
    
    // Visualization defaults
    if (!module.title) {
      module.title = 'Data Visualization';
    }
    
    // Display duration for analytics
    if (!module.displayDuration) {
      module.displayDuration = 5000; // 5 seconds default
    }
    
    if (module.autoAdvance === undefined) {
      module.autoAdvance = false; // Analytics typically don't auto-advance
    }
    
    // Chart configuration defaults
    if (!module.config.chart) {
      module.config.chart = {
        showLegend: true,
        showGrid: true,
        animated: true
      };
    }
    
    return module;
  }
  
  /**
   * Create multiple modules of the same type
   */
  static createMultiple(type: string, count: number, category?: ModuleCategory): ModuleItem[] {
    return Array.from({ length: count }, () => this.create(type, category));
  }
  
  /**
   * Clone a module with a new ID
   */
  static clone(module: ModuleItem): ModuleItem {
    const newId = generateId();
    const cloned = JSON.parse(JSON.stringify(module)) as ModuleItem;
    
    cloned.id = newId;
    
    // Update variable names if they contain the old ID
    if (cloned.config?.response?.saveAs) {
      const oldIdPart = module.id.substring(0, 6);
      const newIdPart = newId.substring(0, 6);
      cloned.config.response.saveAs = cloned.config.response.saveAs.replace(oldIdPart, newIdPart);
    }
    
    // Update any other IDs in the configuration
    if (cloned.config) {
      this.updateNestedIds(cloned.config);
    }
    
    return cloned;
  }
  
  /**
   * Recursively update nested IDs in configuration
   */
  private static updateNestedIds(obj: any): void {
    if (Array.isArray(obj)) {
      obj.forEach(item => {
        if (item && typeof item === 'object') {
          if ('id' in item) {
            item.id = generateId();
          }
          this.updateNestedIds(item);
        }
      });
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(value => {
        this.updateNestedIds(value);
      });
    }
  }
  
  /**
   * Get all available module types by category
   */
  static getAvailableTypes(category?: ModuleCategory): Array<{ type: string; name: string; description: string }> {
    const modules = category 
      ? Array.from(moduleRegistry.entries())
          .filter(([_, metadata]) => metadata.category === category)
      : Array.from(moduleRegistry.entries());
    
    return modules.map(([type, metadata]) => ({
      type,
      name: metadata.name,
      description: metadata.description
    }));
  }
  
  /**
   * Check if a module type exists
   */
  static typeExists(type: string): boolean {
    return moduleRegistry.has(type);
  }
  
  /**
   * Get metadata for a module type
   */
  static getMetadata(type: string) {
    return moduleRegistry.get(type);
  }
}

// Re-export as QuestionFactory for backward compatibility
export const QuestionFactory = ModuleFactory;