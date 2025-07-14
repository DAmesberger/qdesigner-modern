import type { Question } from '$lib/shared/types/questionnaire';

export interface PropertyEditorProps {
  question: Question;
  onUpdate: (updates: Partial<Question>) => void;
}

export interface PropertyEditorComponent {
  // Component type for Svelte
  new (options: any): any;
}