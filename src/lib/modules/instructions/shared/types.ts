// Instruction-specific types

import type { InstructionConfig, ModuleCapabilities } from '$lib/modules/types';

// Extended instruction configuration
export interface InstructionModuleConfig extends InstructionConfig {
  // Base properties inherited from InstructionConfig
  
  // Instruction-specific properties
  interactive?: boolean; // Whether user needs to interact (e.g., click continue)
  markdown?: boolean; // Support markdown in content
  variables?: boolean; // Support variable interpolation
}

// Instruction module metadata extension
export interface InstructionMetadata {
  supportsMarkdown?: boolean;
  supportsVariables?: boolean;
  supportsMedia?: boolean;
  requiresInteraction?: boolean;
}