// Module Registry System

import type { ComponentType } from 'svelte';
import type { ModuleMetadata, ModuleCategory, ModuleRegistry as IModuleRegistry } from './types';

class ModuleRegistryImpl implements IModuleRegistry {
  private modules = new Map<string, ModuleMetadata>();
  private componentCache = new Map<string, ComponentType>();
  
  /**
   * Register a new module
   */
  register(metadata: ModuleMetadata): void {
    if (this.modules.has(metadata.type)) {
      console.warn(`Module type "${metadata.type}" is already registered. Overwriting...`);
    }
    
    this.modules.set(metadata.type, metadata);
    console.log(`Registered module: ${metadata.type} (${metadata.category})`);
  }
  
  /**
   * Unregister a module
   */
  unregister(type: string): void {
    this.modules.delete(type);
    // Clear cached components
    ['runtime', 'designer'].forEach(variant => {
      this.componentCache.delete(`${type}:${variant}`);
    });
  }
  
  /**
   * Get module metadata by type
   */
  get(type: string): ModuleMetadata | undefined {
    return this.modules.get(type);
  }
  
  /**
   * Get all modules of a specific category
   */
  getByCategory(category: ModuleCategory): ModuleMetadata[] {
    return Array.from(this.modules.values()).filter(m => m.category === category);
  }
  
  /**
   * Get all registered module types
   */
  getAllTypes(): string[] {
    return Array.from(this.modules.keys());
  }
  
  /**
   * Load a component dynamically
   */
  async loadComponent(type: string, variant: 'runtime' | 'designer'): Promise<ComponentType> {
    const cacheKey = `${type}:${variant}`;
    
    // Check cache first
    if (this.componentCache.has(cacheKey)) {
      return this.componentCache.get(cacheKey)!;
    }
    
    const metadata = this.modules.get(type);
    if (!metadata) {
      throw new Error(`Module type "${type}" not found in registry`);
    }
    
    const loader = metadata.components[variant];
    if (!loader) {
      throw new Error(`Module "${type}" does not have a ${variant} component`);
    }
    
    try {
      const module = await loader();
      const component = module.default;
      
      // Cache the loaded component
      this.componentCache.set(cacheKey, component);
      
      return component;
    } catch (error) {
      console.error(`Error loading ${variant} component for ${type}:`, error);
      throw error;
    }
  }
  
  /**
   * Get module categories with counts
   */
  getCategorySummary(): Record<ModuleCategory, number> {
    const summary: Record<ModuleCategory, number> = {
      instruction: 0,
      question: 0,
      analytics: 0
    };
    
    this.modules.forEach(module => {
      summary[module.category]++;
    });
    
    return summary;
  }
  
  /**
   * Search modules by name or description
   */
  search(query: string): ModuleMetadata[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.modules.values()).filter(module => 
      module.name.toLowerCase().includes(lowerQuery) ||
      module.description.toLowerCase().includes(lowerQuery) ||
      module.type.toLowerCase().includes(lowerQuery)
    );
  }
  
  /**
   * Get modules with specific capabilities
   */
  getByCapabilities(capabilities: Partial<ModuleMetadata['capabilities']>): ModuleMetadata[] {
    return Array.from(this.modules.values()).filter(module => {
      return Object.entries(capabilities).every(([key, value]) => 
        module.capabilities[key as keyof typeof module.capabilities] === value
      );
    });
  }
  
  /**
   * Export registry data for debugging or persistence
   */
  export(): Record<string, ModuleMetadata> {
    const data: Record<string, ModuleMetadata> = {};
    this.modules.forEach((metadata, type) => {
      data[type] = { ...metadata };
    });
    return data;
  }
  
  /**
   * Import registry data
   */
  import(data: Record<string, ModuleMetadata>): void {
    Object.entries(data).forEach(([type, metadata]) => {
      this.modules.set(type, metadata);
    });
  }
  
  /**
   * Clear all registrations
   */
  clear(): void {
    this.modules.clear();
    this.componentCache.clear();
  }
}

// Create singleton instance
export const moduleRegistry = new ModuleRegistryImpl();

// Helper functions for easy access
export function registerModule(metadata: ModuleMetadata): void {
  moduleRegistry.register(metadata);
}

export function getModule(type: string): ModuleMetadata | undefined {
  return moduleRegistry.get(type);
}

export function getModulesByCategory(category: ModuleCategory): ModuleMetadata[] {
  return moduleRegistry.getByCategory(category);
}

export async function loadModuleComponent(type: string, variant: 'runtime' | 'designer'): Promise<ComponentType> {
  return moduleRegistry.loadComponent(type, variant);
}

// Auto-registration helper
export function createModuleRegistration(metadata: ModuleMetadata): void {
  // This can be called from module index files to auto-register
  if (typeof window !== 'undefined') {
    // Browser environment - register immediately
    registerModule(metadata);
  } else {
    // SSR environment - defer registration
    if (!globalThis.__moduleRegistrations) {
      globalThis.__moduleRegistrations = [];
    }
    globalThis.__moduleRegistrations.push(metadata);
  }
}

// Initialize deferred registrations (call this on client-side mount)
export function initializeDeferredRegistrations(): void {
  if (globalThis.__moduleRegistrations) {
    globalThis.__moduleRegistrations.forEach((metadata: ModuleMetadata) => {
      registerModule(metadata);
    });
    delete globalThis.__moduleRegistrations;
  }
}