/**
 * Designer Question Components
 * Components for editing question configurations in the designer
 */

import type { ComponentType } from 'svelte';
import type { Question, QuestionType } from '$lib/shared/types/questions-v2';
import { QuestionTypes } from '$lib/shared/types/questions-v2';

// Import designer components
import TextDisplayDesigner from './TextDisplayDesigner.svelte';
import SingleChoiceDesigner from './SingleChoiceDesigner.svelte';
// TODO: Import additional designers as they are created

// Props interface for designer components
export interface DesignerComponentProps<T extends Question = Question> {
  question: T;
  onChange: (question: T) => void;
}

// Component registry
const componentRegistry: Partial<Record<QuestionType, ComponentType>> = {
  [QuestionTypes.TEXT_DISPLAY]: TextDisplayDesigner,
  [QuestionTypes.INSTRUCTION]: TextDisplayDesigner, // Reuse text display
  [QuestionTypes.SINGLE_CHOICE]: SingleChoiceDesigner,
  // TODO: Add more mappings as components are created
};

// Default fallback component
const FallbackDesigner = TextDisplayDesigner;

/**
 * Get the appropriate designer component for a question type
 */
export function getDesignerComponent(type: QuestionType): ComponentType {
  return componentRegistry[type] || FallbackDesigner;
}

/**
 * Check if a designer component exists for a question type
 */
export function hasDesignerComponent(type: QuestionType): boolean {
  return type in componentRegistry;
}

/**
 * Get all available designer component types
 */
export function getAvailableTypes(): QuestionType[] {
  return Object.keys(componentRegistry) as QuestionType[];
}

// Export individual components for direct use
export {
  TextDisplayDesigner,
  SingleChoiceDesigner
};