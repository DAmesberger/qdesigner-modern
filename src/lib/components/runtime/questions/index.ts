/**
 * Runtime Question Components
 * Optimized for performance and 120+ FPS rendering
 */

import type { ComponentType } from 'svelte';
import type { Question, QuestionType } from '$lib/shared/types/questions-v2';
import { QuestionTypes } from '$lib/shared/types/questions-v2';

// Import runtime components
import TextDisplayRenderer from './TextDisplayRenderer.svelte';
import SingleChoiceRenderer from './SingleChoiceRenderer.svelte';
import MultipleChoiceRenderer from './MultipleChoiceRenderer.svelte';
import ScaleRenderer from './ScaleRenderer.svelte';
import TextInputRenderer from './TextInputRenderer.svelte';
import NumberInputRenderer from './NumberInputRenderer.svelte';
import RatingRenderer from './RatingRenderer.svelte';
import MatrixRenderer from './MatrixRenderer.svelte';
// TODO: Import additional renderers as they are created

// Component registry
const componentRegistry: Partial<Record<QuestionType, ComponentType>> = {
  [QuestionTypes.TEXT_DISPLAY]: TextDisplayRenderer,
  [QuestionTypes.INSTRUCTION]: TextDisplayRenderer, // Reuse text display
  [QuestionTypes.SINGLE_CHOICE]: SingleChoiceRenderer,
  [QuestionTypes.MULTIPLE_CHOICE]: MultipleChoiceRenderer,
  [QuestionTypes.SCALE]: ScaleRenderer,
  [QuestionTypes.TEXT_INPUT]: TextInputRenderer,
  [QuestionTypes.NUMBER_INPUT]: NumberInputRenderer,
  [QuestionTypes.RATING]: RatingRenderer,
  [QuestionTypes.MATRIX]: MatrixRenderer,
  // TODO: Add more mappings as components are created
};

// Default fallback component
const FallbackRenderer = TextDisplayRenderer;

/**
 * Get the appropriate runtime component for a question type
 */
export function getRuntimeComponent(type: QuestionType): ComponentType {
  return componentRegistry[type] || FallbackRenderer;
}

/**
 * Check if a runtime component exists for a question type
 */
export function hasRuntimeComponent(type: QuestionType): boolean {
  return type in componentRegistry;
}

/**
 * Get all available runtime component types
 */
export function getAvailableTypes(): QuestionType[] {
  return Object.keys(componentRegistry) as QuestionType[];
}

// Export individual components for direct use
export {
  TextDisplayRenderer,
  SingleChoiceRenderer,
  MultipleChoiceRenderer,
  ScaleRenderer,
  TextInputRenderer,
  NumberInputRenderer,
  RatingRenderer,
  MatrixRenderer
};