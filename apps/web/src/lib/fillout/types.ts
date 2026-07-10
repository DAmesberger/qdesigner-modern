import type { Questionnaire } from '$lib/shared';

/**
 * Shared types for the participant-facing fillout entry (route `(fillout)/q/[code]`).
 *
 * The runtime consumes a core {@link Questionnaire}, but the participant chrome the
 * fillout page renders around it reads two app-specific fields that do NOT live on the
 * core type: a top-level `consent` block and a top-level `completionMessage` fallback.
 * {@link FilloutDefinition} is that exact intersection — the concrete shape the page
 * types against instead of `any`.
 */

/** A single consent gate the participant must tick before proceeding. */
export interface ConsentCheckbox {
  id: string;
  label: string;
  required: boolean;
}

/** The consent decision captured at the consent screen and stored in session metadata. */
export interface ConsentData {
  accepted: boolean;
  timestamp: string;
  checkboxes: Record<string, boolean>;
  signature?: string;
}

/** The consent chrome carried on a fillout definition (top-level, not on the core type). */
export interface FilloutConsentConfig {
  /** Consent screen heading; absent ⇒ the localized default chrome label. */
  title?: string;
  content?: string;
  checkboxes?: ConsentCheckbox[];
  requireSignature?: boolean;
}

/**
 * A core {@link Questionnaire} plus the two participant-chrome fields the fillout entry
 * reads at the screen boundary. `requireConsent` / `fraudPrevention` / `quotas` /
 * `distribution` already live on `settings` (QuestionnaireSettings); only `consent` and
 * `completionMessage` are additive here.
 */
export type FilloutDefinition = Questionnaire & {
  consent?: FilloutConsentConfig;
  completionMessage?: string;
};

/**
 * The runtime-facing questionnaire payload the loader normalizes the by-code / cached
 * JSON into (see `+page.ts` `shapeQuestionnaire`).
 */
export interface FilloutQuestionnairePayload {
  id: string;
  name: string;
  definition: FilloutDefinition;
  variables: Record<string, unknown>;
  globalScripts: Record<string, unknown>;
  projectName?: string;
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
}
