import type { Question } from '$lib/shared';

/**
 * Loose per-option shape carried by the designer's dual-schema questionnaire data.
 * The persisted option objects include `key` (keyboard key), `icon`, `color` and
 * `description` fields that are absent from the strict `ChoiceOption`/`ResponseOption`
 * types in questionnaire-core, so the designer's option updates are typed against this
 * widened shape rather than the union display config.
 */
export type DesignerChoiceOption = {
  id?: string;
  label: string;
  value: string | number;
  key?: string;
  description?: string;
  icon?: string;
  image?: string;
  color?: string;
};

/** Config payload the module designer components pass through `onUpdate`. */
export type DesignerConfigUpdate = {
  options?: DesignerChoiceOption[];
  prompt?: string;
  [key: string]: unknown;
};

/**
 * Legacy dual-schema display / response(-type) views the designer writes alongside the
 * typed union member. Display is only ever spread from / merged into the existing config
 * and passed straight to the store, so it stays an open record — it carries both the
 * strict `ChoiceOption` (image: MediaConfig) and the loose bulk-editor option shapes.
 */
export type DesignerDisplayUpdate = Record<string, unknown>;
export type DesignerResponseTypeUpdate = {
  type?: string;
  options?: DesignerChoiceOption[];
  [key: string]: unknown;
};

export type DesignerQuestionUpdate = Omit<
  Partial<Question>,
  'config' | 'display' | 'response' | 'responseType'
> & {
  config?: DesignerConfigUpdate;
  display?: DesignerDisplayUpdate;
  response?: Record<string, unknown>;
  responseType?: DesignerResponseTypeUpdate;
};
