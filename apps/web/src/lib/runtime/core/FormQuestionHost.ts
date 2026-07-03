import type { ResponseCaptureMetadata } from './ResponseCollector';
import type { ModuleCategory } from '$lib/modules/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- form host bridges heterogeneous module payloads
type DynamicValue = any;

/**
 * A single item presented through the HTML overlay (form-style rendering path).
 *
 * The runtime hands the host a fully-resolved item plus the module `config` shape
 * the runtime Svelte component expects (built by {@link buildModuleRuntimeConfig}),
 * and callbacks to feed responses back into the runtime.
 */
export interface FormHostPresentation {
  /** The (carry-forward-resolved) question / instruction / display item. */
  item: DynamicValue;
  /** Registry type, e.g. `multiple-choice`, `matrix`, `instruction`. */
  type: string;
  /** Registry category, drives which runtime component props ModularRenderer supplies. */
  category: ModuleCategory;
  /** Flat module config the runtime component reads via `question.config` / `instruction`. */
  config: DynamicValue;
  /** Interpolation variables (name -> value). */
  variables: Record<string, DynamicValue>;
  /** True for interactive question categories; false for instruction / display. */
  interactive: boolean;
  /** Whether the participant must supply a value before advancing. */
  required: boolean;
  /** Carry-forward / resumed initial value, if any. */
  initialValue?: DynamicValue;
  /** Called when the participant confirms their answer (or advances a non-interactive item). */
  onSubmit: (value: DynamicValue, metadata?: ResponseCaptureMetadata) => void;
  /** Live validation feedback from the mounted component. */
  onValidation?: (result: { valid: boolean; errors: string[] }) => void;
  /** Raw interaction events from the mounted component. */
  onInteraction?: (event: DynamicValue) => void;
}

/**
 * Contract implemented by the fillout page overlay so the (non-DOM) runtime can
 * mount rich per-module Svelte components for form-style questions.
 *
 * See ADR 0018 (hybrid fillout rendering contract).
 */
export interface FormQuestionHost {
  present(presentation: FormHostPresentation): void;
  clear(): void;
}
