import catalogue from './module-catalogue.json';

/** Serializable module contract; component loaders belong to the browser. */
export interface PortableModuleDefinition {
  type: string;
  category: 'display' | 'question' | 'instruction' | 'analytics';
  name: string;
  icon: string;
  description: string;
  capabilities: {
    supportsScripting?: boolean;
    supportsConditionals?: boolean;
    supportsValidation?: boolean;
    supportsAnalytics?: boolean;
    supportsTiming?: boolean;
    supportsMedia?: boolean;
    supportsVariables?: boolean;
  };
  defaultConfig?: Record<string, unknown>;
  options?: Record<string, unknown>;
  answerType?: {
    type: string;
    dataType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date';
    aggregations: string[];
    transformations: string[];
    schema: unknown;
  };
  questionSchema: Record<string, unknown>;
  effectiveConfigSchema?: Record<string, unknown>;
  orderedBounds?: Array<{
    lower: string[];
    upper: string[];
    lowerDefault?: number;
    upperDefault?: number;
    date?: boolean;
  }>;
  dateValues?: string[];
  uniqueItemKeys?: Array<{ path: string; key: string }>;
}

export function getModuleDefinition(type: string): PortableModuleDefinition {
  const definitions = catalogue.modules as Record<string, PortableModuleDefinition>;
  const definition = definitions[type];
  if (!definition) throw new Error(`Unknown portable module type: ${type}`);
  // Registry consumers can customize their local metadata without mutating the
  // shared source or the defaults for subsequently created questionnaires.
  return structuredClone({
    ...definition,
    questionSchema: { ...definition.questionSchema, $defs: catalogue.$defs },
  });
}

export function getPortableModuleTypes(): string[] {
  return Object.keys(catalogue.modules);
}
