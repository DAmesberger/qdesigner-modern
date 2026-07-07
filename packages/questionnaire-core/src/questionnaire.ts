/**
 * Unified Question Type System
 * Comprehensive type-safe question system with proper configuration structure
 */

import type { QuestionnaireTranslations } from './translation';

// Per-questionnaire CONTENT translation (MOD-04, ADR 0022). Re-exported here so
// consumers that import from the `/questionnaire` subpath (e.g. the app's
// `$lib/shared`) get the translation helpers and types alongside the core model.
export * from './translation';

// ============================================================================
// Core Questionnaire Types
// ============================================================================

export interface Questionnaire {
  id: string;
  organizationId?: string;
  projectId?: string;
  name: string;
  description?: string;
  code?: string;
  version: string;
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
  created: Date;
  modified: Date;
  variables: Variable[];
  questions: Question[];
  pages: Page[];
  flow: FlowControl[];
  settings: QuestionnaireSettings;
  metadata?: Record<string, unknown>;
  /**
   * Optional per-locale participant-facing content translations (MOD-04,
   * ADR 0022). Additive and back-compatible — absent means single-language.
   * The designer persists the live copy under `settings.translations` so it
   * rides the existing settings round-trip; this top-level field is the
   * canonical shape for direct API / import authoring. Read both via
   * `getTranslations()`.
   */
  translations?: QuestionnaireTranslations;
}

export function formatSemver(q: Pick<Questionnaire, 'versionMajor' | 'versionMinor' | 'versionPatch'>): string {
  return `${q.versionMajor}.${q.versionMinor}.${q.versionPatch}`;
}

// Dynamic data surfaces on the extensible questionnaire schema. `unknown` (not
// `any`) forces every read site to narrow via type guards / `typeof` / concrete
// union-member config types before use — the compiler enumerates unguarded reads.
type DynamicValue = unknown;

export interface Variable {
  id: string;
  name: string;
  type: VariableType;
  scope: 'global' | 'local' | 'temporary';
  defaultValue?: DynamicValue;
  formula?: string;
  dependencies?: string[];
  validation?: ValidationRule[];
  description?: string;
  /**
   * Free-form metadata bag. `scoreOf` is a first-class hint (E-FEEDBACK-1): when a
   * variable is the persisted computed result of a {@link ScaleScoringDef}, it links
   * back to that scale's `id` so an import/round-trip can recognise it as a scale
   * score rather than a raw answer variable.
   */
  metadata?: Record<string, unknown> & { scoreOf?: string };
  /**
   * Server-computed variable declaration (server-computed-variable / E-FEEDBACK-3).
   * When present, the variable's VALUE is computed server-side across every
   * completed session's data (via the `fillout_dataset_stats` SECURITY DEFINER
   * function), fetched by the anonymous-safe `/server-variables` endpoint keyed to
   * the PUBLISHED definition, cached version-pinned on the client, and injected into
   * the one live VariableEngine at runtime construction — so it resolves OFFLINE
   * from the last synced value and falls back to {@link Variable.defaultValue} when
   * never synced. The client never sends filters; only these designer-published
   * declarations are ever evaluated by the server.
   */
  server?: ServerComputationDef;
}

/**
 * A single numeric statistic materialization for a server-computed variable.
 * Present on {@link ServerComputationDef.stat} ⇒ SCALAR materialization
 * (requires `variable.type === 'number'`). Absent ⇒ full stats OBJECT bundle
 * (requires `variable.type === 'object'`).
 */
export type ServerStat =
  | 'n'
  | 'mean'
  | 'sd'
  | 'min'
  | 'max'
  | 'p10'
  | 'p25'
  | 'median'
  | 'p75'
  | 'p90'
  | 'p95'
  | 'p99';

/**
 * Dataset scoping for a server-computed variable. The server evaluates ONLY the
 * predicates declared here — the anonymous client sends zero filter data, so this
 * IS the authorization model. `where`-clauses are restricted to session variables
 * in v1 (indexed via the `session_variable_index` projection from migration 00012).
 */
export interface DatasetFilter {
  /** Stable id; participates in {@link declHash} for cache keying. */
  id: string;
  label?: string;
  /**
   * Version scoping against the pinned definition's `major.minor.patch`:
   * - `any`       — every completed session, regardless of version.
   * - `sameMajor` — only sessions sharing the resolved major (default).
   * - `exact`     — only sessions at the exact resolved version.
   */
  versionScope?: 'any' | 'sameMajor' | 'exact';
  /** ISO-8601 lower bound on `sessions.completed_at`. */
  completedAfter?: string;
  /** ISO-8601 upper bound on `sessions.completed_at`. */
  completedBefore?: string;
  /** Per-clause predicates over session variables (AND-combined). */
  where?: Array<{
    var: string;
    op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in';
    value: string | number | Array<string | number>;
  }>;
}

/**
 * Server-computed variable declaration. Rides in the same
 * `questionnaire.variables[]` array as any other variable, so every existing
 * consumer (flow conditions, piping, quotas, scripting, statistical feedback)
 * resolves it with zero changes once the runtime injects its synced value.
 */
export interface ServerComputationDef {
  /** Where the aggregated value comes from. */
  source: 'variable' | 'response';
  /**
   * The session variable name (`source: 'variable'`, e.g. `score.anxiety.value`)
   * or the question id (`source: 'response'`) aggregated across the cohort.
   */
  key: string;
  /**
   * Present ⇒ SCALAR materialization of the single statistic (requires
   * `variable.type === 'number'`). Absent ⇒ full stats OBJECT bundle (requires
   * `variable.type === 'object'`).
   */
  stat?: ServerStat;
  /** Cohort scoping. Absent ⇒ every completed session at the same major. */
  dataset?: DatasetFilter;
  /**
   * Render-anyway-with-warning threshold: a synced row older than this is still
   * used (offline correctness beats freshness) but flagged stale for captions.
   * Default 30 days.
   */
  staleAfterMs?: number;
}

export type VariableType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'date'
  | 'time'
  | 'array'
  | 'object'
  | 'reaction_time'
  | 'stimulus_onset';

export interface Page {
  id: string;
  name?: string;
  questions?: string[]; // Question IDs
  blocks?: Block[];
  layout?: LayoutConfig;
  conditions?: DisplayCondition[];
  script?: string;
  /**
   * Per-page runtime settings, including the enforced {@link PageSettings.timeLimit}
   * (E-FLOW-5). Previously `PageSettings` was defined but never attached to a page;
   * the unified timer subsystem reads `page.settings.timeLimit` to arm the page timer.
   */
  settings?: PageSettings;
}

export interface Block {
  id: string;
  pageId: string;
  name?: string;
  type: 'standard' | 'randomized' | 'conditional' | 'loop' | 'adaptive';
  questions: string[]; // Question IDs
  layout?: LayoutConfig;
  randomization?: RandomizationConfig;
  loop?: LoopConfig;
  conditions?: DisplayCondition[];
  condition?: string; // Experimental condition this block belongs to
  /**
   * Adaptive (CAT/IRT) item-bank configuration (E-FLOW-1). Present only when
   * `type === 'adaptive'`. Turns this block's `questions` into an adaptively
   * administered item bank: at each step the runtime selects the maximum-Fisher-
   * information item at the running ability estimate, presents it, updates the
   * estimate from the scored response, and stops once the standard error reaches
   * {@link AdaptiveBlockConfig.seThreshold} or {@link AdaptiveBlockConfig.maxItems}
   * items have been administered.
   */
  adaptive?: AdaptiveBlockConfig;
}

// ============================================================================
// Adaptive Testing (CAT / IRT) Configuration (E-FLOW-1)
// ============================================================================

/**
 * IRT 3PL calibration for one item in an adaptive block's bank (E-FLOW-1). `id` is
 * the QUESTION id the calibration applies to; `a`/`b`/`c` are the discrimination /
 * difficulty / pseudo-guessing parameters. Structurally identical to the analytics
 * `CATSession` item shape, so the runtime hands it straight to the selector.
 */
export interface CATItem {
  /** Question id this calibration applies to (must be one of {@link Block.questions}). */
  id: string;
  /** Discrimination (a). */
  a: number;
  /** Difficulty (b), on the theta scale. */
  b: number;
  /** Pseudo-guessing lower asymptote (c). Defaults to 0. */
  c?: number;
}

/**
 * Item-exposure control strategy for adaptive selection (E-FLOW-1, step 10).
 * - `none`        — always administer the single maximum-information item (default).
 * - `randomesque` — pick uniformly at random among the top-k most informative items,
 *   spreading exposure across the bank so a handful of items are not over-exposed.
 */
export type AdaptiveExposureControl = 'none' | 'randomesque';

/**
 * Per-item scoring key mapping a raw questionnaire response to the boolean
 * correct/endorsed outcome the CAT update consumes (E-FLOW-1, step 5). Lets a
 * multiple-choice / scale item resolve to 0/1 without a bespoke custom-correctness
 * formula on the question.
 */
export interface AdaptiveItemScoring {
  /** Question id this rule scores (matches {@link CATItem.id}). */
  questionId: string;
  /**
   * The response value that scores CORRECT/endorsed. When the participant's answer
   * equals this (after light numeric/string/boolean coercion) the item scores 1.
   */
  correctValue?: string | number | boolean;
  /**
   * For numeric / scale items with no single `correctValue`: the answer scores 1 when
   * it is greater than or equal to this threshold (an endorsement cut).
   */
  threshold?: number;
}

/**
 * Adaptive (CAT/IRT) item-bank block configuration (E-FLOW-1). Rides in the
 * questionnaire-definition JSON on {@link Block.adaptive} (no DB migration). The
 * runtime builds a maximum-information 3PL selector from {@link items}, presents the
 * mapped questions one at a time, updates the ability estimate after each answer, and
 * stops when the standard error falls to {@link seThreshold} or {@link maxItems} is
 * reached — writing the running estimate to the `_theta` / `_thetaSE` session
 * variables (readable by feedback panels and flow conditions).
 */
export interface AdaptiveBlockConfig {
  /** Optional label/id for the calibrated bank this block draws from. */
  itemBankId?: string;
  /** Per-question 3PL calibration. Each `id` must be one of the block's `questions`. */
  items: CATItem[];
  /** Hard cap on administered items (default 30). */
  maxItems?: number;
  /** Stop once the ability standard error reaches this value (default 0.3). */
  seThreshold?: number;
  /** Optional session variable NAME to also receive the final theta estimate. */
  thetaReportVariable?: string;
  /** Item-exposure control strategy (default `none`). */
  exposureControl?: AdaptiveExposureControl;
  /** Top-k pool size for `randomesque` exposure control (default 3). */
  exposureTopK?: number;
  /** Optional per-item response→correctness scoring keys. */
  scoring?: AdaptiveItemScoring[];
}

export interface FlowControl {
  id: string;
  type: 'skip' | 'branch' | 'loop' | 'terminate';
  condition: string; // Formula
  target?: string; // Page/Question ID for skip/branch
  iterations?: number; // For loops
  /**
   * Position scoping (E-FLOW-8). The page (or question) id this rule fires FROM.
   * When set, the rule is only considered as control leaves that page/question;
   * when unset the rule is global (considered from every page, legacy behaviour).
   * A question-id source resolves to the page that contains the question.
   */
  source?: string;
  /**
   * Deterministic precedence among candidate rules at the same boundary
   * (E-FLOW-8). Higher fires first; defaults to 0. Ties break by declaration
   * order. Source-scoped rules always precede global (unset-source) rules.
   */
  priority?: number;
}

export interface ExperimentalCondition {
  name: string;
  weight: number;
}

export interface ExperimentalDesignConfig {
  conditions: ExperimentalCondition[];
  assignmentStrategy: 'random' | 'sequential' | 'balanced';
  counterbalancing: 'none' | 'latin-square' | 'balanced-latin-square' | 'full';
  seed?: number;
}

// ============================================================================
// Distribution Types
// ============================================================================

export interface DistributionSettings {
  anonymousAccess: boolean;
  urlParameters?: UrlParameterConfig[];
  completionRedirectUrl?: string;
  completionRedirectParams?: string[];
  completionMessage?: string;
  panelIntegration?: PanelIntegrationConfig;
  maxResponses?: number;
  allowMultipleResponses?: boolean;
  passwordProtection?: string;
}

export interface UrlParameterConfig {
  paramName: string;
  variableName: string;
  required?: boolean;
}

export interface PanelIntegrationConfig {
  provider: 'prolific' | 'mturk' | 'sona' | 'cloudresearch' | 'custom';
  completionCode?: string;
  completionUrl?: string;
  prolificStudyId?: string;
  mturkHitId?: string;
  sonaStudyId?: string;
}

export interface DataQualitySettings {
  /** Minimum time in ms a respondent should spend on a page (default: 2000) */
  minPageTimeMs?: number;
  /** Minimum total time in ms for the entire questionnaire */
  minTotalTimeMs?: number;
  /** Fraction of identical responses in a block to flag as flatline (0-1, default: 0.8) */
  flatlineThreshold?: number;
  /** Number of attention check failures before flagging (default: 1) */
  attentionFailureThreshold?: number;
}

export interface FraudPreventionSettings {
  preventDuplicates: boolean;
  duplicateDetectionMethod: 'fingerprint' | 'cookie' | 'ip' | 'combined';
  enableHoneypot: boolean;
  enableBehaviorAnalysis: boolean;
  allowedCountries?: string[];
  blockedCountries?: string[];
  enableSpeederDetection: boolean;
  speederThresholdMultiplier?: number;
  enableFlatlineDetection: boolean;
  flatlineThreshold?: number;
  fraudAction: 'flag' | 'terminate' | 'redirect';
  fraudRedirectUrl?: string;
  fraudMessage?: string;
}

// ============================================================================
// Quota Management Types
// ============================================================================

export interface QuotaDefinition {
  id: string;
  name: string;
  description?: string;
  target: number;
  current?: number;
  condition: string;
  overQuotaAction: 'terminate' | 'redirect' | 'skip-to-end' | 'continue';
  overQuotaRedirectUrl?: string;
  overQuotaMessage?: string;
  enabled: boolean;
}

/**
 * A single interlocking quota cell (E-FLOW-7). Unlike a flat {@link QuotaDefinition},
 * a cell is the intersection of one value per {@link QuotaGroup.variables} entry
 * (e.g. `age=25-34` × `gender=male`). The `values` map is keyed by variable name;
 * the missing/omitted key means "any value of that variable" (a marginal cell).
 * The serialized cell key ({@link quotaCellKey}) is the stable identity used by
 * the server per-cell counter (`quota_cells.cell_key`).
 */
export interface QuotaCell {
  /** Stable id (assigned by the designer builder). */
  id: string;
  /** One value per participating variable; keyed by variable name. */
  values: Record<string, string>;
  /** Per-cell target (completions cap). 0 / undefined ⇒ uncapped. */
  target: number;
  /** Last-known live count (populated at read time; not persisted in the definition). */
  current?: number;
}

export interface QuotaGroup {
  id: string;
  name: string;
  description?: string;
  quotas: QuotaDefinition[];
  logic: 'independent' | 'cross';
  variables: string[];
  /**
   * Interlocking cross-quota cells (E-FLOW-7). Only meaningful when
   * `logic === 'cross'`. Each cell is the intersection of one value per
   * {@link variables} entry; the participant is assigned to the single cell
   * whose `values` all match their live in-survey variables, and blocked only
   * when THAT cell is full (least-full / independent-cell semantics), not when
   * any sibling cell is full.
   */
  cells?: QuotaCell[];
}

// ============================================================================
// Screener / Eligibility Gating (E-FLOW-7)
// ============================================================================

/**
 * A structured pre-survey / in-survey eligibility screener (E-FLOW-7).
 * Distinct from a quota: a screen-out is a per-respondent eligibility decision
 * (out of the target population), whereas over-quota is a capacity decision
 * (population fine, cell full). The two route to different completion states.
 *
 * Rules are evaluated (in order) via the runtime `VariableEngine` against the
 * participant's live variables at the screener page; the first rule whose
 * `eligibleWhen` formula evaluates falsy screens the participant out with that
 * rule's structured reason/redirect.
 */
export interface ScreenerRule {
  id: string;
  /** Human label for the eligibility criterion (e.g. "Adults only"). */
  label?: string;
  /** Formula that must be TRUE to remain eligible (VariableEngine grammar). */
  eligibleWhen: string;
  /** Structured, machine-readable screen-out reason recorded to session metadata. */
  screenOutReason: string;
  /** Optional message shown to the screened-out participant. */
  screenOutMessage?: string;
  /** Optional redirect (e.g. panel screen-out URL) distinct from over-quota. */
  screenOutRedirectUrl?: string;
}

export interface ScreenerBlock {
  id: string;
  name?: string;
  /** Page id after which eligibility is (re-)evaluated. */
  pageId: string;
  /** Ordered eligibility rules; first failing rule screens the participant out. */
  rules: ScreenerRule[];
}

// ============================================================================
// Scale Scoring Configuration (E-FEEDBACK-1)
// ============================================================================

export type ScaleAggregation = 'sum' | 'mean';

/**
 * How a scale handles items the participant left unanswered.
 * - `listwise`     — any missing item drops the whole scale (score = null).
 * - `mean-impute`  — replace each missing item with the mean of the answered items (person-mean).
 * - `prorate`      — sum the answered items, then scale up: sum * itemsExpected / itemsAnswered.
 * - `available`    — aggregate only the answered items, no imputation or proration.
 */
export type ScaleMissingPolicy = 'listwise' | 'mean-impute' | 'prorate' | 'available';

/**
 * Normative reference for a scale. When present, the scale score is compared against
 * this population to yield z / T / stanine / percentile via the psychometric
 * NormativeScoreInterpreter.
 */
export interface ScaleNormData {
  mean: number;
  sd: number;
  /** Optional provenance label for the norm (e.g. "PHQ-9 general population, n=5000"). */
  source?: string;
  /**
   * When set, references a bundled norm from the shipped norm-table library
   * (E-FEEDBACK-2, `apps/web/src/lib/runtime/feedback/normTables.ts`) instead of
   * inline `mean`/`sd`. The runtime resolves the library entry and uses its
   * mean/sd; `mean`/`sd` here then act as a fallback if the id is unknown.
   */
  normTableId?: string;
}

/**
 * A first-class subscale definition (E-FEEDBACK-1). Rides in the existing
 * `questionnaire_definitions` JSON under `settings.scoring` — no DB migration — and is
 * computed deterministically at fillout `complete()` so the full normative/subscale
 * scoring is available OFFLINE. Computed scores persist through the session.variables
 * pipeline (namespaced `score.<id>`).
 */
export interface ScaleScoringDef {
  /** Stable id; the computed score is namespaced `score.<id>`. */
  id: string;
  /** Human-readable label shown in the designer / feedback. */
  name: string;
  /** Question ids whose numeric answers make up this scale. */
  itemIds: string[];
  /** Subset of `itemIds` scored in reverse via `(itemMin + itemMax - value)`. */
  reverseScoredItemIds?: string[];
  /** Per-item minimum (used for reverse scoring). */
  itemMin: number;
  /** Per-item maximum (used for reverse scoring). */
  itemMax: number;
  aggregation: ScaleAggregation;
  missingPolicy: ScaleMissingPolicy;
  norm?: ScaleNormData;
}

export interface ScoringConfig {
  scales: ScaleScoringDef[];
}

// ============================================================================
// Report Page Configuration (E-FEEDBACK-3)
// ============================================================================

/**
 * A single widget on the participant-facing report page (E-FEEDBACK-3). Rides in
 * the `questionnaire_definitions` JSON under `settings.report` (same precedent as
 * `settings.scoring`), so it needs no DB migration. The report page is a pure
 * CONSUMER of the completed session's variables — its cohort widgets bind
 * `comparison.serverVariable` to an object-typed server-computed variable and read
 * the bundle straight out of `session.variables`, with no network on the render
 * path.
 */
export interface ReportWidget {
  id: string;
  type:
    | 'score-tile'
    | 'bar'
    | 'box-cohort'
    | 'radar-profile'
    | 'distribution-with-marker'
    | 'gauge'
    | 'interpretive-text'
    | 'results-table'
    | 'completion-meta';
  /** 12-column grid placement (shape copied from the analytics dashboard-builder). */
  position: { x: number; y: number; w: number; h: number };
  binding: { source: 'variable' | 'score'; key: string; field?: string };
  comparison?: {
    source: 'none' | 'norm-table' | 'custom-norm' | 'self-baseline' | 'server-variable';
    /** NAME of an object-typed server-computed variable for the cohort band. */
    serverVariable?: string;
    normTableId?: string;
    fallback: 'hide' | 'norm-table' | 'message';
    fallbackNormTableId?: string;
  };
  interpretation?: string;
  text?: string;
}

/**
 * Participant-facing report page config (E-FEEDBACK-3). Absent ⇒ no report page.
 */
export interface ReportPageConfig {
  enabled: boolean;
  title?: string;
  layout: { columns: 12; rowHeight: number; gap: number };
  widgets: ReportWidget[];
  enablePdfDownload?: boolean;
  /** Fetch-skip window for the server-variable refresh; default 24h. */
  refreshMs?: number;
}

/**
 * What the runtime does when the whole-survey time budget
 * ({@link QuestionnaireSettings.wholeSurveyTimeLimitMs}) elapses (E-FLOW-5).
 * - `auto-submit` — complete the session with whatever has been answered (default).
 * - `terminate`   — end the session, surfacing {@link QuestionnaireSettings.surveyTimeoutMessage}.
 */
export type SurveyTimeoutAction = 'auto-submit' | 'terminate';

export interface QuestionnaireSettings {
  allowBackNavigation?: boolean;
  showProgressBar?: boolean;
  saveProgress?: boolean;
  randomizationSeed?: string;
  timeZone?: string;
  language?: string;
  /**
   * Whole-survey time budget in ms (E-FLOW-5). Armed once at `start()`; frozen while
   * the session is paused/backgrounded and (via ResumeState) preserved across a
   * save-and-continue resume. Absent ⇒ no whole-survey cap.
   */
  wholeSurveyTimeLimitMs?: number;
  /** Action when {@link wholeSurveyTimeLimitMs} elapses. Default `auto-submit`. */
  onSurveyTimeout?: SurveyTimeoutAction;
  /** Participant-facing message when the survey deadline terminates the session. */
  surveyTimeoutMessage?: string;
  webgl?: WebGLSettings;
  requireConsent?: boolean;
  requireAuthentication?: boolean;
  allowAnonymous?: boolean;
  distribution?: DistributionSettings;
  experimentalDesign?: ExperimentalDesignConfig;
  dataQuality?: DataQualitySettings;
  fraudPrevention?: FraudPreventionSettings;
  quotas?: QuotaGroup[];
  /**
   * Structured eligibility screeners (E-FLOW-7). Evaluated at their `pageId`
   * boundary; a screen-out routes to the `ineligible` completion state,
   * distinct from `over-quota`.
   */
  screeners?: ScreenerBlock[];
  /**
   * First-class subscale scoring config (E-FEEDBACK-1). Computed at fillout
   * `complete()` and persisted as namespaced `score.<scaleId>` session variables.
   */
  scoring?: ScoringConfig;
  /**
   * Participant-facing report page (E-FEEDBACK-3). Same definition-JSONB
   * precedent as {@link ScoringConfig}. Its cohort widgets bind object-typed
   * server-computed variables and render offline from the completed session.
   */
  report?: ReportPageConfig;
  metadata?: Record<string, DynamicValue>;
  /**
   * Live storage location for per-locale content translations (MOD-04, ADR 0022).
   * The designer writes here so translations round-trip through the existing
   * settings persistence + collaboration paths (mirrors how `settings.theme` is
   * stored). `getTranslations()` reads this first, then the top-level field.
   */
  translations?: QuestionnaireTranslations;
}

export interface QuestionSettings {
  required?: boolean;
  hidden?: boolean;
  readOnly?: boolean;
  showNumber?: boolean;
  randomize?: boolean;
}

/**
 * What the runtime does when a page's {@link PageSettings.timeLimit} elapses
 * (E-FLOW-5).
 * - `auto-advance` — leave the current page and continue to the next (default).
 * - `terminate`    — end the whole session (records a timeout outcome).
 */
export type PageTimeoutAction = 'auto-advance' | 'terminate';

export interface PageSettings {
  showTitle?: boolean;
  showProgressBar?: boolean;
  allowNavigation?: boolean;
  autoAdvance?: boolean;
  /** Maximum time in ms the participant may spend on this page (E-FLOW-5, enforced). */
  timeLimit?: number;
  /** Action when {@link timeLimit} elapses. Default `auto-advance`. */
  onTimeLimit?: PageTimeoutAction;
  /**
   * Cadence in ms for the page-script `onTimer` hook (E-FLOW-5). Replaces the
   * previously hardcoded 1000ms interval. Default 1000.
   */
  timerIntervalMs?: number;
}

// ============================================================================
// Question Types and Enums
// ============================================================================

export const QuestionTypes = {
  // Display-only questions
  TEXT_DISPLAY: 'text-display',
  INSTRUCTION: 'instruction',
  MEDIA_DISPLAY: 'media-display',
  WEBGL: 'webgl',
  BAR_CHART: 'bar-chart',

  // Input questions
  TEXT_INPUT: 'text-input',
  NUMBER_INPUT: 'number-input',

  // Choice questions
  SINGLE_CHOICE: 'single-choice',
  MULTIPLE_CHOICE: 'multiple-choice',

  // Scale questions
  SCALE: 'scale',
  RATING: 'rating',

  // Advanced questions
  MATRIX: 'matrix',
  RANKING: 'ranking',

  // Time-based questions
  REACTION_TIME: 'reaction-time',
  REACTION_EXPERIMENT: 'reaction-experiment',
  DATE_TIME: 'date-time',

  // File questions
  FILE_UPLOAD: 'file-upload',
  MEDIA_RESPONSE: 'media-response',

  // Drawing
  DRAWING: 'drawing',

  // Statistical
  STATISTICAL_FEEDBACK: 'statistical-feedback',
} as const;

export type QuestionType = (typeof QuestionTypes)[keyof typeof QuestionTypes];

// ============================================================================
// Common Configuration Types
// ============================================================================

/**
 * What the runtime does when a per-question response deadline
 * ({@link TimingConfig.deadlineMs}) elapses (E-FLOW-5).
 * - `auto-submit` — commit whatever value the participant has entered so far, flagged
 *   as timed out, and advance (default; the "speeded self-report" behaviour).
 * - `skip`        — record an empty, invalid, timed-out response and advance.
 * - `terminate`   — end the whole session.
 * - `warn`        — surface a warning but keep the question open (soft deadline).
 */
export type QuestionTimeoutAction = 'auto-submit' | 'skip' | 'terminate' | 'warn';

export interface TimingConfig {
  minTime?: number;
  maxTime?: number;
  showTimer?: boolean;
  warningTime?: number;
  /**
   * Per-question response deadline in ms (E-FLOW-5). When set, the form path arms a
   * countdown from stimulus onset; on expiry it runs {@link onTimeout}. Absent ⇒ the
   * question has no deadline (historical behaviour).
   */
  deadlineMs?: number;
  /** Action when {@link deadlineMs} elapses. Default `auto-submit`. */
  onTimeout?: QuestionTimeoutAction;
  /**
   * Optional pre-deadline warning point in ms from onset (E-FLOW-5). When the elapsed
   * time crosses this, the countdown enters its warning style before the hard deadline.
   */
  warnAtMs?: number;
}

export interface NavigationConfig {
  showPrevious?: boolean;
  showNext?: boolean;
  autoAdvance?: boolean;
  advanceDelay?: number;
}

export interface MediaConfig {
  // Media reference - either URL or media asset ID
  mediaId?: string; // Reference to media asset in media management system
  url?: string; // Direct URL (legacy support or external URLs)

  // How this media is referenced in markdown content
  // e.g., ![alt text](media:my-ref-id) would use refId: "my-ref-id"
  refId?: string;

  // Media metadata
  type?: 'image' | 'video' | 'audio';
  alt?: string;
  caption?: string;

  // Display options (can be overridden in markdown)
  width?: number;
  height?: number;
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
  size?: 'small' | 'medium' | 'large' | 'full';
}

export interface StimulusConfig {
  content: string | MediaConfig;
  duration?: number;
  position?: 'above' | 'below' | 'left' | 'right' | 'background';
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: DynamicValue;
  message?: string;
  condition?: string;
}

export interface ConditionalLogic {
  show?: string;
  enable?: string;
  require?: string;
}

export interface LayoutConfig {
  type: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
  spacing?: number;
  alignment?: 'left' | 'center' | 'right';
}

export interface DisplayCondition {
  formula: string;
  target?: 'show' | 'hide' | 'enable' | 'disable';
}

export interface RandomizationConfig {
  type: 'all' | 'subset' | 'latin-square';
  subset?: number;
  fixedPositions?: Record<string, number>;
}

export interface LoopConfig {
  variable: string;
  values: DynamicValue[];
  shuffle?: boolean;
  /**
   * Name of the per-iteration loop variable exposed to interpolation and scripting
   * (E-FLOW-4). The runtime sets this variable (and the fixed alias `loopValue`) to
   * the current iteration's value before presenting each pass, so authored prompts /
   * options can pipe `{{loopValue}}` or `{{<loopVariableName>}}`. Defaults to
   * `loopValue` when omitted.
   */
  loopVariableName?: string;
  /**
   * Where the iteration values come from (E-FLOW-4). Absent ⇒ the static `values`
   * list is used (backwards compatible).
   */
  source?: LoopSource;
  /**
   * Hard cap on the number of iterations. Guards against a runaway loop when the
   * source is a dynamic answer / variable array. Applied after resolution and before
   * expansion; a resolved list longer than this is truncated.
   */
  maxIterations?: number;
}

/**
 * Source of a loop block's iteration values (E-FLOW-4).
 * - `static`   — the block's own `LoopConfig.values` list (default).
 * - `answer`   — the (array-coerced) answer of a prior multi-select question.
 * - `variable` — an array-valued session variable.
 */
export interface LoopSource {
  type: 'static' | 'answer' | 'variable';
  /** For `answer`: the question id whose response supplies the roster/list. */
  questionId?: string;
  /** For `variable`: the variable name holding the array of iteration values. */
  variableId?: string;
}

export interface WebGLSettings {
  targetFPS?: number;
  antialias?: boolean;
  pixelRatio?: number;
}

// ============================================================================
// Carry-Forward Configuration
// ============================================================================

export type CarryForwardMode =
  | 'default-value'
  | 'selected-options'
  | 'unselected-options'
  | 'text-content';

export type CarryForwardTargetField = 'value' | 'options' | 'prompt';

export interface CarryForwardConfig {
  /** The question whose response is being carried forward */
  sourceQuestionId: string;
  /** How to interpret the source response */
  mode: CarryForwardMode;
  /** Where to apply the resolved data on the target question */
  targetField: CarryForwardTargetField;
}

// ============================================================================
// Display Configuration Types
// ============================================================================

// IMPORTANT: All text fields (prompt, content, instruction, etc.) in display configs
// support markdown by default. Media can be embedded using markdown syntax:
// - Standard URL: ![alt text](https://example.com/image.jpg)
// - Media reference: ![alt text](media:refId) where refId matches a MediaConfig.refId
// - Variables: {{variableName}} can be used in any text field

// Base display configuration with media support - ALL questions can have media
export interface BaseDisplayConfig {
  // Available media assets that can be referenced in markdown content
  media?: MediaConfig[];
  // Whether to process markdown in prompt/content fields (default: true)
  enableMarkdown?: boolean;
}

export interface TextDisplayConfig extends BaseDisplayConfig {
  content: string; // Supports markdown with embedded media references
  format: 'text' | 'markdown' | 'html';
  variables?: boolean; // Enable variable substitution in content
  styling?: {
    fontSize?: string;
    fontWeight?: string;
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
  };
}

export interface MediaDisplayConfig extends BaseDisplayConfig {
  media: MediaConfig[];
  caption?: string;
  showControls?: boolean;
  clickToEnlarge?: boolean;
}

export interface ChoiceOption {
  id: string;
  label: string;
  value: string | number;
  code?: string | number; // For statistical encoding
  image?: MediaConfig;
  hotkey?: string;
  exclusive?: boolean;
}

export interface SingleChoiceDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  options: ChoiceOption[];
  layout: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
  showOther?: boolean;
  otherLabel?: string;
  randomizeOptions?: boolean;
}

export interface MultipleChoiceDisplayConfig extends SingleChoiceDisplayConfig {
  minSelections?: number;
  maxSelections?: number;
  selectAllOption?: boolean;
}

export interface ScaleDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  min: number;
  max: number;
  step?: number;
  labels?: {
    min?: string;
    max?: string;
    midpoint?: string;
  };
  showValue?: boolean;
  orientation?: 'horizontal' | 'vertical';
  style?: 'slider' | 'buttons' | 'visual-analog';
}

export interface RatingDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  levels: number;
  style: 'stars' | 'hearts' | 'thumbs' | 'numeric';
  allowHalf?: boolean;
  labels?: string[];
}

export interface TextInputDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  showCharCount?: boolean;
}

export interface NumberInputDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  showSpinButtons?: boolean;
}

export interface MatrixDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  rows: Array<{ id: string; label: string }>;
  columns: Array<{ id: string; label: string; value?: DynamicValue }>;
  responseType: 'single' | 'multiple' | 'text' | 'number';
  required?: 'all' | 'any' | string[];
}

export type ReactionTaskType =
  | 'standard'
  | 'n-back'
  | 'stroop'
  | 'flanker'
  | 'iat'
  | 'dot-probe'
  | 'custom';

export interface ReactionStudyConfig {
  schemaVersion: number;
  blocks?: Array<{
    id: string;
    name: string;
    kind: 'practice' | 'test' | 'custom';
    randomizeOrder?: boolean;
    repetitions?: number;
    trials: Array<Record<string, DynamicValue>>;
  }>;
  task: {
    type: ReactionTaskType;
    [key: string]: DynamicValue;
  };
  stimulus?: {
    type?: 'text' | 'shape' | 'image' | 'video' | 'audio';
    content?: string;
    mediaRef?: {
      mediaId: string;
      mediaUrl?: string;
      filename?: string;
      mimeType?: string;
      width?: number;
      height?: number;
      durationSeconds?: number;
    };
    fixation?: {
      type?: 'cross' | 'dot';
      duration?: number;
    };
  };
  response?: {
    validKeys?: string[];
    timeout?: number;
    requireCorrect?: boolean;
  };
  correctKey?: string;
  feedback?: boolean;
  practice?: boolean;
  practiceTrials?: number;
  testTrials?: number;
  targetFPS?: number;
}

export interface ReactionTimeDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  stimulus: StimulusConfig;
  fixationDuration?: number;
  fixationSymbol?: string;
  keys: string[];
  correctKey?: string;
  showFeedback?: boolean;
  practice?: boolean;
  practiceTrials?: number;
  study?: ReactionStudyConfig;
}

export interface ReactionExperimentDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  summary?: string;
  template?: ReactionTaskType;
  targetFPS?: number;
}

export interface DateTimeDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  mode: 'date' | 'time' | 'datetime';
  minDate?: string;
  maxDate?: string;
  format?: string;
  showCalendar?: boolean;
}

export interface FileUploadDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  accept?: string[];
  maxSize?: number;
  maxFiles?: number;
  dragDrop?: boolean;
}

export interface MediaResponseDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  recordingMode?: 'audio' | 'video-audio' | 'video-only';
  maxDuration?: number;
  maxFileSize?: number;
  audioQuality?: 'low' | 'medium' | 'high';
  videoQuality?: 'low' | 'medium' | 'high';
  allowRerecord?: boolean;
  countdown?: number;
}

export interface MediaResponseResponseConfig extends BaseResponseConfig {
  storage: 'base64' | 'url' | 'reference';
  saveMetadata?: boolean;
}

export interface DrawingDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  canvas?: {
    width?: number;
    height?: number;
    background?: string;
  };
  tools?: Array<'pen' | 'eraser' | 'line' | 'shape'>;
  colors?: string[];
  defaultColor?: string;
  defaultTool?: 'pen' | 'eraser' | 'line' | 'shape';
}

export interface RankingDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  items: Array<{ id: string; label: string }>;
  allowPartial?: boolean;
  tieBreaking?: boolean;
}

export interface WebGLDisplayConfig extends BaseDisplayConfig {
  prompt?: string;
  sceneConfig: Record<string, DynamicValue>;
  interactionMode?: 'click' | 'drag' | 'keyboard' | 'custom';
}

export interface StatisticalFeedbackConfig extends BaseDisplayConfig {
  title: string;
  subtitle?: string;
  chartType: 'bar' | 'line';
  sourceMode?:
    | 'current-session'
    | 'cohort'
    | 'participant-vs-cohort'
    | 'participant-vs-participant';
  metric?: 'count' | 'mean' | 'median' | 'std_dev' | 'p90' | 'p95' | 'p99' | 'z_score';
  dataSource: {
    questionnaireId?: string;
    source?: 'variable' | 'response';
    key?: string;
    currentVariable?: string;
    participantId?: string;
    comparisonParticipantId?: string;
  };
  showPercentile?: boolean;
  showSummary?: boolean;
  refreshMs?: number;
  customization?: Record<string, DynamicValue>;
}

// ============================================================================
// Response Configuration Types
// ============================================================================

export interface BaseResponseConfig {
  saveAs: string;
  trackTiming?: boolean;
  trackChanges?: boolean;
}

export interface SingleChoiceResponseConfig extends BaseResponseConfig {
  valueType: 'value' | 'label' | 'index';
  allowDeselect?: boolean;
  saveOtherAs?: string;
}

export interface MultipleChoiceResponseConfig extends BaseResponseConfig {
  valueType: 'array' | 'object' | 'binary';
  saveOtherAs?: string;
}

export interface ScaleResponseConfig extends BaseResponseConfig {
  valueType: 'number' | 'string';
  savePositionAs?: string;
}

export interface TextInputResponseConfig extends BaseResponseConfig {
  transform?: 'none' | 'lowercase' | 'uppercase' | 'trim';
  saveMetadata?: boolean;
}

export interface MatrixResponseConfig extends BaseResponseConfig {
  saveFormat: 'nested' | 'flat' | 'separate';
  rowPrefix?: string;
}

export interface ReactionTimeResponseConfig extends BaseResponseConfig {
  saveAccuracy?: boolean;
  savePractice?: boolean;
  metrics?: ('rt' | 'accuracy' | 'anticipation')[];
}

export interface FileUploadResponseConfig extends BaseResponseConfig {
  storage: 'base64' | 'url' | 'reference';
  saveMetadata?: boolean;
}

export interface DrawingResponseConfig extends BaseResponseConfig {
  storage: 'base64' | 'url' | 'reference';
  saveMetadata?: boolean;
  analysis?: {
    extractFeatures?: boolean;
    detectShapes?: boolean;
    measurePressure?: boolean;
    trackTiming?: boolean;
  };
}

// ============================================================================
// Validation Configuration Types
// ============================================================================

export interface BaseValidation {
  required?: boolean;
  customRules?: ValidationRule[];
}

export interface TextValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  customRules?: ValidationRule[];
}

export interface NumberValidation {
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  customRules?: ValidationRule[];
}

export interface ChoiceValidation {
  required?: boolean;
  customRules?: ValidationRule[];
}

export interface FileValidation {
  required?: boolean;
  maxSize?: number;
  allowedTypes?: string[];
  customRules?: ValidationRule[];
}

// ============================================================================
// Base Question Interface
// ============================================================================

/**
 * Legacy dual-schema `responseType` object carried by live questionnaire data
 * (pre-union authoring path). Read by `moduleConfigAdapter` and `PropertiesPanel`
 * to derive the participant-facing input config when a question was persisted
 * under the old flat shape. The concrete `response`/`display` config on each
 * `Question` union member remains the authoritative typed source; this is only
 * the compatibility view for the base hole.
 */
export interface LegacyResponseTypeConfig {
  type?: string;
  options?: ResponseOption[];
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  minLength?: number;
  maxLength?: number;
  [key: string]: unknown;
}

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  order: number;
  required: boolean;

  // Optional common properties
  randomize?: boolean;
  timing?: TimingConfig;
  navigation?: NavigationConfig;
  conditions?: ConditionalLogic;

  // Metadata
  name?: string;
  tags?: string[];

  // Carry-forward: use responses from earlier questions as defaults, options, or prompt text
  carryForward?: CarryForwardConfig;

  // Data quality
  attentionCheck?: {
    enabled: boolean;
    correctAnswer: DynamicValue;
    type: 'instructed' | 'trap';
  };

  // Legacy/Common properties for type compatibility
  settings?: Record<string, DynamicValue>;
  response?: DynamicValue; // Loosely typed to allow access before narrowing
  validation?: DynamicValue;
  media?: MediaConfig[]; // Legacy access
  stimulus?: DynamicValue;
  responseOptions?: DynamicValue;

  /**
   * Legacy dual-schema field carried by live data authored before the typed
   * `Question` union. `moduleConfigAdapter` / `PropertiesPanel` read it to
   * reconstruct the input config; the union member's concrete `response`/
   * `display` stays authoritative. See {@link LegacyResponseTypeConfig}.
   */
  responseType?: LegacyResponseTypeConfig;

  /** Legacy non-interactive display: auto-dismiss delay in ms (statistical-feedback metadata). */
  displayDuration?: number;
  /** Legacy non-interactive display: advance without a participant action. */
  autoAdvance?: boolean;
}

// ============================================================================
// Common Types
// ============================================================================

export interface Position {
  x: number;
  y: number;
  z?: number;
  unit?: 'px' | '%' | 'vw' | 'vh';
}

export interface Size {
  width: number;
  height: number;
  unit?: 'px' | '%' | 'vw' | 'vh';
}

// ============================================================================
// Response Types
// ============================================================================

export interface ResponseType {
  type:
    | 'single'
    | 'multiple'
    | 'text'
    | 'number'
    | 'scale'
    | 'keypress'
    | 'click'
    | 'custom'
    | 'none'
    | 'webgl';
  config?: ResponseConfig;
}

export interface ResponseConfig {
  // For keypress
  allowedKeys?: string[];
  recordAllKeys?: boolean;

  // For scale
  min?: number;
  max?: number;
  step?: number;
  labels?: string[];

  // For text/number
  maxLength?: number;
  pattern?: string;

  // General
  timeout?: number; // Max response time in ms
  required?: boolean;
}

export interface ResponseOption {
  id: string;
  value: DynamicValue;
  label?: string;
  hotkey?: string;
  position?: Position;
}

// ============================================================================
// Question Type Definitions
// ============================================================================

// Display-only questions
export interface TextDisplayQuestion extends BaseQuestion {
  type: typeof QuestionTypes.TEXT_DISPLAY;
  display: TextDisplayConfig;
}

export interface InstructionQuestion extends BaseQuestion {
  type: typeof QuestionTypes.INSTRUCTION;
  display: TextDisplayConfig;
}

export interface MediaDisplayQuestion extends BaseQuestion {
  type: typeof QuestionTypes.MEDIA_DISPLAY;
  display: MediaDisplayConfig;
}

export interface WebGLQuestion extends BaseQuestion {
  type: typeof QuestionTypes.WEBGL;
  display: WebGLDisplayConfig;
  response?: BaseResponseConfig;
}

// Input questions
export interface TextInputQuestion extends BaseQuestion {
  type: typeof QuestionTypes.TEXT_INPUT;
  display: TextInputDisplayConfig;
  response: TextInputResponseConfig;
  validation?: TextValidation;
}

export interface NumberInputQuestion extends BaseQuestion {
  type: typeof QuestionTypes.NUMBER_INPUT;
  display: NumberInputDisplayConfig;
  response: BaseResponseConfig;
  validation?: NumberValidation;
}

// Choice questions
export interface SingleChoiceQuestion extends BaseQuestion {
  type: typeof QuestionTypes.SINGLE_CHOICE;
  display: SingleChoiceDisplayConfig;
  response: SingleChoiceResponseConfig;
  validation?: ChoiceValidation;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: typeof QuestionTypes.MULTIPLE_CHOICE;
  display: MultipleChoiceDisplayConfig;
  response: MultipleChoiceResponseConfig;
  validation?: ChoiceValidation;
}

// Scale questions
export interface ScaleQuestion extends BaseQuestion {
  type: typeof QuestionTypes.SCALE;
  display: ScaleDisplayConfig;
  response: ScaleResponseConfig;
  validation?: NumberValidation;
}

export interface RatingQuestion extends BaseQuestion {
  type: typeof QuestionTypes.RATING;
  display: RatingDisplayConfig;
  response: BaseResponseConfig;
  validation?: ChoiceValidation;
}

// Advanced questions
export interface MatrixQuestion extends BaseQuestion {
  type: typeof QuestionTypes.MATRIX;
  display: MatrixDisplayConfig;
  response: MatrixResponseConfig;
  validation?: ChoiceValidation;
}

export interface RankingQuestion extends BaseQuestion {
  type: typeof QuestionTypes.RANKING;
  display: RankingDisplayConfig;
  response: BaseResponseConfig;
  validation?: ChoiceValidation;
}

// Time-based questions
export interface ReactionTimeQuestion extends BaseQuestion {
  type: typeof QuestionTypes.REACTION_TIME;
  display: ReactionTimeDisplayConfig;
  response: ReactionTimeResponseConfig;
  validation?: ChoiceValidation;
}

export interface ReactionExperimentQuestion extends BaseQuestion {
  type: typeof QuestionTypes.REACTION_EXPERIMENT;
  display: ReactionExperimentDisplayConfig;
  response: ReactionTimeResponseConfig;
  config?: Record<string, DynamicValue>;
  validation?: ChoiceValidation;
}

export interface DateTimeQuestion extends BaseQuestion {
  type: typeof QuestionTypes.DATE_TIME;
  display: DateTimeDisplayConfig;
  response: BaseResponseConfig;
  validation?: TextValidation;
}

// File questions
export interface FileUploadQuestion extends BaseQuestion {
  type: typeof QuestionTypes.FILE_UPLOAD;
  display: FileUploadDisplayConfig;
  response: FileUploadResponseConfig;
  validation?: FileValidation;
}

export interface MediaResponseQuestion extends BaseQuestion {
  type: typeof QuestionTypes.MEDIA_RESPONSE;
  display: MediaResponseDisplayConfig;
  response: MediaResponseResponseConfig;
  validation?: FileValidation;
}

export interface DrawingQuestion extends BaseQuestion {
  type: typeof QuestionTypes.DRAWING;
  display: DrawingDisplayConfig;
  response: DrawingResponseConfig;
  validation?: BaseValidation;
}

export interface StatisticalFeedbackQuestion extends BaseQuestion {
  type: typeof QuestionTypes.STATISTICAL_FEEDBACK;
  display: StatisticalFeedbackConfig;
}

export interface BarChartQuestion extends BaseQuestion {
  type: typeof QuestionTypes.BAR_CHART;
  display: StatisticalFeedbackConfig; // Reusing config for now
}

// ============================================================================
// Union Type
// ============================================================================

export type Question =
  | TextDisplayQuestion
  | InstructionQuestion
  | MediaDisplayQuestion
  | WebGLQuestion
  | TextInputQuestion
  | NumberInputQuestion
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | ScaleQuestion
  | RatingQuestion
  | MatrixQuestion
  | RankingQuestion
  | ReactionTimeQuestion
  | ReactionExperimentQuestion
  | DateTimeQuestion
  | FileUploadQuestion
  | MediaResponseQuestion
  | DrawingQuestion
  | StatisticalFeedbackQuestion
  | BarChartQuestion;

// ============================================================================
// Type Guards
// ============================================================================

export function isTextDisplayQuestion(q: Question): q is TextDisplayQuestion {
  return q.type === QuestionTypes.TEXT_DISPLAY;
}

export function isInstructionQuestion(q: Question): q is InstructionQuestion {
  return q.type === QuestionTypes.INSTRUCTION;
}

export function isMediaDisplayQuestion(q: Question): q is MediaDisplayQuestion {
  return q.type === QuestionTypes.MEDIA_DISPLAY;
}

export function isWebGLQuestion(q: Question): q is WebGLQuestion {
  return q.type === QuestionTypes.WEBGL;
}

export function isTextInputQuestion(q: Question): q is TextInputQuestion {
  return q.type === QuestionTypes.TEXT_INPUT;
}

export function isNumberInputQuestion(q: Question): q is NumberInputQuestion {
  return q.type === QuestionTypes.NUMBER_INPUT;
}

export function isSingleChoiceQuestion(q: Question): q is SingleChoiceQuestion {
  return q.type === QuestionTypes.SINGLE_CHOICE;
}

export function isMultipleChoiceQuestion(q: Question): q is MultipleChoiceQuestion {
  return q.type === QuestionTypes.MULTIPLE_CHOICE;
}

export function isScaleQuestion(q: Question): q is ScaleQuestion {
  return q.type === QuestionTypes.SCALE;
}

export function isRatingQuestion(q: Question): q is RatingQuestion {
  return q.type === QuestionTypes.RATING;
}

export function isMatrixQuestion(q: Question): q is MatrixQuestion {
  return q.type === QuestionTypes.MATRIX;
}

export function isRankingQuestion(q: Question): q is RankingQuestion {
  return q.type === QuestionTypes.RANKING;
}

export function isReactionTimeQuestion(q: Question): q is ReactionTimeQuestion {
  return q.type === QuestionTypes.REACTION_TIME;
}

export function isReactionExperimentQuestion(q: Question): q is ReactionExperimentQuestion {
  return q.type === QuestionTypes.REACTION_EXPERIMENT;
}

export function isDateTimeQuestion(q: Question): q is DateTimeQuestion {
  return q.type === QuestionTypes.DATE_TIME;
}

export function isFileUploadQuestion(q: Question): q is FileUploadQuestion {
  return q.type === QuestionTypes.FILE_UPLOAD;
}

export function isMediaResponseQuestion(q: Question): q is MediaResponseQuestion {
  return q.type === QuestionTypes.MEDIA_RESPONSE;
}

export function isDrawingQuestion(q: Question): q is DrawingQuestion {
  return q.type === QuestionTypes.DRAWING;
}

export function isStatisticalFeedbackQuestion(q: Question): q is StatisticalFeedbackQuestion {
  return q.type === QuestionTypes.STATISTICAL_FEEDBACK;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function hasResponseConfig(q: Question): boolean {
  return 'response' in q && q.response !== undefined;
}

export function isDisplayOnlyQuestion(q: Question): boolean {
  const displayOnlyTypes: QuestionType[] = [
    QuestionTypes.TEXT_DISPLAY,
    QuestionTypes.INSTRUCTION,
    QuestionTypes.MEDIA_DISPLAY,
    QuestionTypes.STATISTICAL_FEEDBACK,
  ];
  return displayOnlyTypes.includes(q.type);
}

export function requiresUserInput(q: Question): boolean {
  return !isDisplayOnlyQuestion(q) && q.type !== QuestionTypes.WEBGL;
}

export function getQuestionVariable(q: Question): string | undefined {
  if (hasResponseConfig(q) && 'response' in q) {
    const response = q.response;
    if (response && typeof response === 'object' && 'saveAs' in response) {
      const saveAs = (response as { saveAs?: unknown }).saveAs;
      return typeof saveAs === 'string' ? saveAs : undefined;
    }
  }
  return undefined;
}

// ============================================================================
// Legacy Type Mapping (for migration)
// ============================================================================

export type LegacyQuestionType =
  | 'text'
  | 'instruction'
  | 'choice'
  | 'scale'
  | 'rating'
  | 'reaction'
  | 'multimedia'
  | 'statistical_feedback'
  | 'webgl';

export const LEGACY_TYPE_MAP: Record<LegacyQuestionType, QuestionType> = {
  text: QuestionTypes.TEXT_INPUT,
  instruction: QuestionTypes.INSTRUCTION,
  choice: QuestionTypes.SINGLE_CHOICE,
  scale: QuestionTypes.SCALE,
  rating: QuestionTypes.RATING,
  reaction: QuestionTypes.REACTION_TIME,
  multimedia: QuestionTypes.MEDIA_DISPLAY,
  statistical_feedback: QuestionTypes.STATISTICAL_FEEDBACK,
  webgl: QuestionTypes.WEBGL,
};
