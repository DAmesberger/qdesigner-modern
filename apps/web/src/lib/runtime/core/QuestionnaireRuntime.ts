import type {
  Questionnaire,
  Question,
  Page,
  Block,
  FlowControl,
  QuestionnaireSession,
  Response,
  Variable,
  DisplayCondition,
  ConditionalLogic,
} from '$lib/shared';
import { moduleRegistry } from '$lib/modules/registry';
import type { ModuleMetadata } from '$lib/modules/types';
import type {
  IQuestionRuntime,
  QuestionRuntimeContext,
  QuestionRuntimeResult,
} from './question-runtime';
import { VariableEngine } from '@qdesigner/scripting-engine';
import { WebGLRenderer } from '$lib/renderer';
import { ResourceManager } from '../resources/ResourceManager';
import { MediaValidator } from '../validation/MediaValidator';
import { ResponseCollector, type ResponseCaptureMetadata } from './ResponseCollector';
import type { FormQuestionHost } from './FormQuestionHost';
import { TimerController, type TimerScope } from './TimerController';
import { buildModuleRuntimeConfig } from './moduleConfigAdapter';
import { BlockRandomizer } from './BlockRandomizer';
import { AdaptiveController, type CATEstimate } from './AdaptiveController';
import { iterationVarPrefix, DEFAULT_LOOP_VARIABLE_NAME } from './LoopExpansion';
import { computeReactionTimeMs } from './reactionTiming';
import { resolveFlowTargetPageIndex } from './flowTarget';
import { orderFlowCandidates } from './FlowGraph';
import { ScreenerController, type ScreenOutResult } from '$lib/fillout/services/ScreenerController';
import { ScriptExecutor } from './ScriptExecutor';
import { ConditionAssigner, getBlockOrder } from '../experimental';
import { QualityReport } from '../quality/QualityReport';
import type { AttentionCheckConfig } from '../quality/AttentionCheck';
import { resolveCarryForward, applyCarryForward } from './CarryForward';
import type { CarryForwardConfig } from '$lib/shared';
import { type ResumeState, RESUME_STATE_VERSION, isResumeStateCompatible } from './ResumeState';
import type {
  TimingConfig,
  QuestionTimeoutAction,
  PageTimeoutAction,
  SurveyTimeoutAction,
} from '$lib/shared';
import { scoreScales } from '../feedback/ScaleScorer';
import { parseNumeric } from '$lib/shared/utils/statistics';
import { nanoid } from 'nanoid';
import { materializeServerValue, type ServerVariableStats } from '@qdesigner/questionnaire-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime state handles heterogeneous question data
type DynamicValue = any;

/**
 * A question as presented through the overlay: the typed `Question` union plus the
 * runtime-attached carry-forward seed the engine parks on the item before handing it
 * to the {@link FormQuestionHost}. Typed (not `any`) so the present paths keep their
 * `item.type` / `item.timing` / `item.displayDuration` / `item.autoAdvance` /
 * `item.navigation` reads checked against the union base.
 */
type PresentedQuestion = Question & { _carryForwardInitialValue?: unknown };

/**
 * A resolved page item ready to present, carrying its loop iteration context
 * (E-FLOW-4). For a non-loop item `iterationIndex` is `null` and the loop fields are
 * absent, so it behaves exactly as a bare question did before loops existed.
 */
interface PresentedItem {
  question: Question;
  iterationIndex: number | null;
  loopValue?: unknown;
  loopVariableName?: string;
  iterationCount?: number;
  /**
   * Adaptive item-bank entry sentinel (E-FLOW-1). When set, this item is not presented
   * directly; reaching it in showCurrentItem hands control to the CAT loop for the block
   * with this id, which dynamically selects and presents items until its stopping rule
   * fires. `question` is a placeholder (the first resolvable bank item) never shown.
   */
  adaptiveBlockId?: string;
}

/** One administered step in an adaptive block's CAT trajectory (E-FLOW-1). */
interface AdaptiveStep {
  questionId: string;
  correct: boolean;
  theta: number;
  se: number;
}

/**
 * The persisted record of one adaptive block's administration (E-FLOW-1). Accumulated
 * live and snapshotted into `session.metadata.custom.adaptive` on every step so the
 * offline-first persistence path (P1-T1) carries the administered item ids and the
 * running theta / SE trajectory.
 */
interface AdaptiveRecord {
  blockId: string;
  itemBankId?: string;
  steps: AdaptiveStep[];
  theta: number;
  se: number;
  itemsAdministered: number;
  thetaReportVariable?: string;
  complete: boolean;
}

/**
 * The last-synced aggregate for one SERVER-COMPUTED VARIABLE
 * (server-computed-variable / E-FEEDBACK-3), read from the `filloutServerVariables`
 * Dexie table and injected into the one VariableEngine at construction. Carries the
 * raw aggregate ({@link materializeServerValue} turns it into the variable's value)
 * plus a `stale` flag surfaced in feedback captions. Structurally a
 * `ServerVariableRow`, so it feeds `materializeServerValue` directly.
 */
export interface ServerVariableSnapshot {
  /** Cohort size (populated even below the anonymity floor). */
  n: number;
  /** Full stats, or `null` when withheld below the server's n>=5 floor. */
  stats: ServerVariableStats | null;
  /** Server-clock ISO-8601 timestamp of the aggregation. */
  computedAt: string;
  /** True when the cached row is older than the declaration's `staleAfterMs`. */
  stale: boolean;
}

export interface RuntimeConfig {
  canvas: HTMLCanvasElement;
  questionnaire: Questionnaire;
  participantId?: string;
  participantNumber?: number;
  conditionGroupCounts?: number[];
  /**
   * Server-authoritative between-subjects arm assignment (E-FLOW-6), claimed
   * atomically at session-create time. When present it OVERRIDES the local
   * {@link ConditionAssigner} — the client no longer races over a fetched
   * count snapshot. Absent only offline (no create round-trip) or when the
   * design declares no conditions; the runtime then falls back to local
   * assignment seeded by the real {@link participantNumber}.
   */
  serverAssignment?: { condition: string; conditionIndex: number };
  /**
   * Longitudinal / EMA study-series context (E-FLOW-2) when this session
   * materializes a series wave opened from a reminder link. Exposed to
   * formulas / branching as the `_waveIndex` (0-based wave) and
   * `_seriesElapsedDays` (whole days since enrollment) flow variables, so a
   * questionnaire can differ across waves (e.g. baseline vs follow-up items).
   */
  seriesContext?: { waveIndex: number; seriesElapsedDays: number };
  /**
   * Last-synced SERVER-COMPUTED VARIABLE aggregates, keyed by variable id
   * (server-computed-variable / E-FEEDBACK-3). {@link initializeVariables} injects
   * each into the one VariableEngine as a `'server-sync'` value so server-computed
   * variables resolve OFFLINE — falling back to the variable's `defaultValue` when a
   * snapshot is absent (never synced) or below the anonymity floor.
   */
  serverVariables?: Record<string, ServerVariableSnapshot>;
  /**
   * Optional HTML-overlay host. When supplied, form-style questions (and
   * instruction/display items) are rendered by mounting their per-module runtime
   * Svelte component into the overlay rather than via WebGL text (ADR 0018).
   * Reaction-time paradigms always stay on the WebGL path.
   */
  formHost?: FormQuestionHost;
  /**
   * A true save-and-continue snapshot to restore from (E-FLOW-3). When present and
   * compatible with this definition's version, start() reconstructs the exact cursor,
   * loop counters, and variable state instead of beginning at page 0. Incompatible
   * (drift / stale-schema) states are discarded and logged to session metadata.
   */
  resumeFrom?: ResumeState;
  onComplete?: (session: QuestionnaireSession) => void;
  onProgress?: (pageIndex: number, totalPages: number) => void;
  onQuestionPresented?: (event: QuestionPresentedEvent) => void;
  /**
   * Fired after every committed response with a fresh {@link ResumeState} capture, so
   * the fillout layer can persist the save-and-continue cursor offline-first on each
   * answer boundary (E-FLOW-3, reusing P1-T1's write path).
   */
  onResumeStateCaptured?: (state: ResumeState) => void;
}

export interface QuestionPresentedEvent {
  questionId: string;
  questionType: string;
  pageId?: string;
  pageIndex: number;
  itemIndex: number;
  category: ModuleMetadata['category'];
  timestamp: number;
}

export class QuestionnaireRuntime {
  private readonly config: RuntimeConfig;
  private readonly session: QuestionnaireSession;
  private readonly variableEngine: VariableEngine;
  // CONTRACT-LAZY (Slice 4.6/4.7): the single owned WebGL renderer is created on first
  // need (ensureRenderer), never eagerly. A questionnaire with no v1 reaction/webgl item
  // keeps this null and never calls getContext('webgl2').
  private renderer: WebGLRenderer | null = null;
  private readonly resourceManager: ResourceManager;
  private readonly responseCollector: ResponseCollector;
  private readonly blockRandomizer: BlockRandomizer;
  private readonly scriptExecutor: ScriptExecutor;
  private readonly qualityReport: QualityReport;
  // Structured eligibility screener (E-FLOW-7 / F-20). Evaluates `settings.screeners`
  // against live variables at each page boundary; an ineligible verdict screens the
  // participant out into the distinct screened-out completion state. Also the home of
  // the shared ScreenOutResult vocabulary that the flow-`terminate` screen-out reuses.
  private readonly screener: ScreenerController;

  private currentPageIndex = 0;
  private currentItemIndex = 0;
  private currentPage: Page | null = null;
  private currentQuestion: Question | null = null;
  private currentPageItems: PresentedItem[] = [];
  /** Loop iteration context of the item currently being presented (E-FLOW-4). */
  private currentIteration: PresentedItem | null = null;

  private isRunning = false;
  private isPaused = false;
  private preloaded = false;

  private currentAbortController: AbortController | null = null;
  private autoAdvanceTimeoutId: number | null = null;
  private pageTimerIntervalId: ReturnType<typeof setInterval> | null = null;

  // Unified timer subsystem (E-FLOW-5): owns the survey / page / question deadline
  // scopes against one monotonic clock, frozen by pause() and restored on resume.
  private readonly timers: TimerController;
  // The active question's warn point (ms from onset), so a countdown tick can flag the
  // warning state before the hard deadline. Reset whenever a presentation is cleared.
  private activeQuestionWarnAtMs: number | undefined = undefined;
  // Set to a question id just before an auto-submit timeout requests its committed
  // value, so handleCollectedResponse can stamp the resulting Response as timedOut.
  private pendingTimeoutQuestionId: string | null = null;

  private readonly questionRuntimeCache = new Map<string, IQuestionRuntime>();
  private readonly loopIterations = new Map<string, number>();

  private assignedCondition: string | null = null;
  private conditionBlockOrder: number[] | null = null;

  // Adaptive item-bank block (CAT/IRT, E-FLOW-1). Non-null only while an adaptive block
  // is being administered: `adaptiveController` drives dynamic maximum-information item
  // selection, `adaptiveBlock` carries its config, and `adaptivePresentedId` guards the
  // response handler so the CAT update fires exactly for the item the controller just
  // selected (and never for an ordinary form question).
  private adaptiveController: AdaptiveController | null = null;
  private adaptiveBlock: Block | null = null;
  private adaptivePresentedId: string | null = null;
  // Per-block CAT trajectories, snapshotted into session.metadata.custom.adaptive so the
  // offline persistence path (P1-T1) carries the administered items + running theta/SE.
  private readonly adaptiveRecords: AdaptiveRecord[] = [];

  // Resumable sessions (E-OFF-1): the set of question ids already answered in a
  // prior session, seeded by hydrate(). While non-null, showCurrentItem
  // fast-forwards past these items so start() lands on the first UNANSWERED item
  // without re-presenting answered ones. Recomputed from the restored responses
  // (not a stored counter), so a partial progress write can never drop or
  // duplicate an item.
  private resumeAnsweredIds: Set<string> | null = null;

  // True save-and-continue (E-FLOW-3): a compatible ResumeState parked in the
  // constructor and consumed once by start(), which restores the cursor / loop map /
  // variable context from it instead of navigating from page 0. Null when there is
  // nothing to resume or the state was discarded for version drift.
  private pendingResume: ResumeState | null = null;
  // The item index start() must seed on the resume landing page. navigateToPage resets
  // currentItemIndex to 0 on every page entry; this re-applies the captured cursor to
  // the FIRST landing page only (consumed on apply), so a mid-page resume does not
  // re-present items shown before the participant left.
  private pendingResumeItemIndex: number | null = null;

  constructor(config: RuntimeConfig) {
    this.config = config;

    this.session = {
      id: nanoid(),
      questionnaireId: config.questionnaire.id,
      questionnaireVersion: config.questionnaire.version,
      participantId: config.participantId,
      startTime: Date.now(),
      status: 'in_progress',
      responses: [],
      variables: [],
      metadata: {
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`,
        refreshRate: (screen as DynamicValue).refreshRate || 60,
        webGLSupported: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: navigator.language,
      },
    };

    this.variableEngine = new VariableEngine();
    // The WebGL renderer is constructed lazily by ensureRenderer() the first time a v1
    // reaction/webgl item actually draws via WebGL (CONTRACT-LAZY, Slice 4.7).
    this.resourceManager = new ResourceManager();
    this.responseCollector = new ResponseCollector();
    this.blockRandomizer = new BlockRandomizer(
      config.questionnaire.settings.randomizationSeed || config.questionnaire.id
    );
    this.scriptExecutor = new ScriptExecutor();
    this.screener = new ScreenerController(
      config.questionnaire.settings?.screeners,
      this.variableEngine
    );

    // Unified timer subsystem (E-FLOW-5). Question-scope ticks are surfaced to the
    // overlay so participants see a live countdown; page/survey ticks are internal.
    this.timers = new TimerController({
      onTick: (scope, remainingMs, totalMs) => this.handleTimerTick(scope, remainingMs, totalMs),
    });

    const dq = config.questionnaire.settings.dataQuality;
    this.qualityReport = new QualityReport({
      speeder: {
        minPageTimeMs: dq?.minPageTimeMs,
        minTotalTimeMs: dq?.minTotalTimeMs,
      },
      flatliner: {
        threshold: dq?.flatlineThreshold,
      },
      attentionFailureThreshold: dq?.attentionFailureThreshold,
      timeoutThreshold: dq?.attentionFailureThreshold,
    });

    this.initializeVariables();
    this.initializeExperimentalDesign();

    this.acceptResumeState(config.resumeFrom);
  }

  /**
   * Validate an optional save-and-continue snapshot (E-FLOW-3, step 5). A state that
   * matches this definition's version + envelope schema is parked for start() to
   * restore. A drifted / stale-schema state is DISCARDED — restoring a cursor against a
   * definition whose question ids or page order moved would land on the wrong item — and
   * the discard is recorded in session metadata so the reason is auditable rather than
   * silent.
   */
  private acceptResumeState(resumeFrom: ResumeState | undefined): void {
    if (!resumeFrom) return;

    // Explicit boolean so the type-predicate does not narrow `resumeFrom` to `never`
    // in the else branch (we still read its captured version/schema there for the log).
    const compatible: boolean = isResumeStateCompatible(
      resumeFrom,
      this.config.questionnaire.version
    );
    if (compatible) {
      this.pendingResume = resumeFrom;
      return;
    }

    if (this.session.metadata) {
      this.session.metadata.custom = {
        ...this.session.metadata.custom,
        resumeDiscarded: {
          reason:
            resumeFrom.schemaVersion !== RESUME_STATE_VERSION
              ? 'schema_version_mismatch'
              : 'questionnaire_version_drift',
          capturedVersion: resumeFrom.questionnaireVersion,
          capturedSchema: resumeFrom.schemaVersion,
          currentVersion: this.config.questionnaire.version,
          currentSchema: RESUME_STATE_VERSION,
        },
      };
    }
  }

  /**
   * Rehydrate the runtime from a prior session's persisted answers + variable state
   * (E-OFF-1). MUST be called after construction and before start(): it seeds
   * `session.responses`, replays each answer into the response/variable pipeline so
   * carry-forward and {{var}} interpolation resolve exactly as they did live, restores
   * any user-declared/computed variables, and records which items are already answered
   * so start() fast-forwards to the first unanswered one.
   *
   * The answered-item skip is authoritative over the stored `itemIndex`/`pageId` cursor
   * (which is only a progress hint): the true resume position is recomputed from the
   * restored answers, so a torn/partial cursor write can never re-present an answered
   * item or drop an unanswered one.
   */
  public hydrate(snapshot: {
    responses: Response[];
    variables?: Record<string, unknown>;
    itemIndex?: number;
    pageId?: string;
  }): void {
    const answered = new Set<string>();

    for (const response of snapshot.responses) {
      this.session.responses.push(response);
      answered.add(response.questionId);

      // Replay the answer into the variable engine exactly as the live path does so
      // ${qid}_value / _time / _rt / _correct (and thus {{qid}} interpolation and any
      // dependent conditions) are correct on resume. Skip answers whose question is
      // gone from this (possibly newer/pinned-fallback) definition.
      const question = this.config.questionnaire.questions.find((q) => q.id === response.questionId);
      if (question) {
        const isCorrect = this.evaluateCustomCorrectness(question, response.value);
        this.updateQuestionVariables(question, response, isCorrect);
      }
    }

    // Restore user-declared / computed variables (best-effort). Answer variables are
    // already restored by the replay above (keyed by id); this covers globals whose
    // name is addressable as an id. Values that don't resolve to a registered variable
    // are ignored — interpolation of answers does not depend on them.
    if (snapshot.variables) {
      for (const [name, value] of Object.entries(snapshot.variables)) {
        try {
          this.variableEngine.setVariable(name, value, 'resume');
        } catch {
          // Not addressable by this name/id — safe to ignore (answer vars restored above).
        }
      }
    }

    this.resumeAnsweredIds = answered.size > 0 ? answered : null;

    // Non-authoritative cursor hints: keep getProgress() coherent before start()
    // re-drives navigation from page 0 (which the skip then fast-forwards).
    if (typeof snapshot.itemIndex === 'number' && snapshot.itemIndex >= 0) {
      this.currentItemIndex = snapshot.itemIndex;
    }
    if (snapshot.pageId) {
      const idx = this.config.questionnaire.pages.findIndex((p) => p.id === snapshot.pageId);
      if (idx >= 0) {
        this.currentPageIndex = idx;
        this.currentPage = this.config.questionnaire.pages[idx] || null;
      }
    }
  }

  /**
   * A durable progress cursor for the fillout layer to persist on every answer
   * (E-OFF-1). `answeredQuestionIds` is the authoritative resume driver; itemIndex/
   * pageId are display hints.
   */
  public getResumeCursor(): {
    itemIndex: number;
    pageId?: string;
    answeredQuestionIds: string[];
  } {
    return {
      itemIndex: this.currentItemIndex,
      pageId: this.currentPage?.id,
      answeredQuestionIds: this.session.responses.map((r) => r.questionId),
    };
  }

  /**
   * Capture a true save-and-continue snapshot of the live runtime (E-FLOW-3): the
   * current cursor, loop-iteration counters, the whole VariableEngine context (lossless
   * by id), and the set of already-presented item ids. Serializable — persisted to the
   * offline session row and, when online, mirrored to `sessions.state_snapshot`.
   */
  public captureResumeState(): ResumeState {
    return {
      schemaVersion: RESUME_STATE_VERSION,
      questionnaireVersion: this.config.questionnaire.version,
      currentPageIndex: this.currentPageIndex,
      currentItemIndex: this.currentItemIndex,
      loopIterationState: Object.fromEntries(this.loopIterations),
      variableSnapshot: this.variableEngine.exportState(),
      presentedItemIds: this.session.responses.map((r) => r.questionId),
      // Preserve the remaining whole-survey budget so resume respects the original cap
      // (E-FLOW-5, step 8). Undefined when no survey timer is armed.
      surveyRemainingMs: this.timers.getRemaining('survey') ?? undefined,
      capturedAt: Date.now(),
    };
  }

  /**
   * Fire the onResumeStateCaptured callback (if any) with a fresh capture. Called at
   * every response-commit boundary so the fillout layer persists the resume cursor
   * offline-first on each answer. Never throws into the response pipeline.
   */
  private emitResumeState(): void {
    const callback = this.config.onResumeStateCaptured;
    if (!callback) return;
    try {
      callback(this.captureResumeState());
    } catch (error) {
      console.error('[resume] onResumeStateCaptured failed:', error as Error);
    }
  }

  /**
   * Lazily construct the single owned WebGLRenderer (CONTRACT-LAZY, Slice 4.7). Called
   * the first time an item actually draws via WebGL — a v1 reaction/webgl question
   * runtime. A questionnaire with no v1 item never reaches here, so getContext('webgl2')
   * is never invoked on a device without WebGL 2.0.
   *
   * If WebGL 2.0 is required but unavailable, throws a participant-facing message so the
   * fillout page surfaces a specific "requires WebGL 2.0" error rather than the generic
   * "Failed to start questionnaire".
   */
  private ensureRenderer(): WebGLRenderer {
    if (this.renderer) return this.renderer;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas: this.config.canvas,
        targetFPS: this.config.questionnaire.settings.webgl?.targetFPS || 60,
        antialias: this.config.questionnaire.settings.webgl?.antialias ?? false,
        vsync: true,
      });
    } catch (err) {
      // The constructor throws "WebGL 2.0 is required but not supported" ONLY when
      // getContext('webgl2') returns null. Other messages (shader compile/link,
      // buffer/uniform creation) are genuine GPU/driver failures — do not mask
      // those as "no WebGL2", which would send a misleading participant message.
      const message = err instanceof Error ? err.message : '';
      if (message.includes('WebGL 2.0 is required')) {
        throw new Error(
          'This study requires WebGL 2.0, which your browser or device does not support.'
        );
      }
      throw err;
    }

    this.renderer = renderer;
    // Renderer created on first WebGL item mid-run (rather than during preload): start
    // its render loop now so the freshly-created context actually paints.
    if (this.isRunning) {
      renderer.start();
    }
    return renderer;
  }

  /**
   * Whether a given module draws via WebGL (CONTRACT-LAZY): a v1 reaction/webgl question
   * runtime, or — absent an HTML-overlay formHost — any item (the legacy all-WebGL path).
   * Since Slice 5.1, display / analytics items render in the overlay (not WebGL), so they
   * no longer force a WebGL context.
   */
  private itemNeedsWebGL(metadata: ModuleMetadata): boolean {
    if (metadata.questionRuntime?.contract === 'v1') return true;
    if (!this.config.formHost) return true;
    return false;
  }

  /**
   * Scan the definition up front for any item that draws via WebGL. Unknown module types
   * are treated as "no WebGL" here; they surface loudly later in showCurrentItem().
   */
  private questionnaireNeedsWebGL(): boolean {
    for (const question of this.config.questionnaire.questions) {
      const metadata = moduleRegistry.get(question.type);
      if (!metadata) continue;
      if (this.itemNeedsWebGL(metadata)) return true;
    }
    return false;
  }

  /**
   * Delegate a viewport resize to the owned renderer (Slice 4.6). No-op until the
   * renderer exists, so the fillout page can route window resizes here unconditionally.
   */
  public resize(width: number, height: number): void {
    this.renderer?.resize(width, height);
  }

  public async preload(onProgress?: (progress: number) => void): Promise<void> {
    const validator = new MediaValidator();
    const validationResult = await validator.validateQuestionnaire(this.config.questionnaire);

    if (!validationResult.valid) {
      throw new Error(MediaValidator.formatErrors(validationResult));
    }

    await this.resourceManager.scanQuestionnaire(this.config.questionnaire);

    // CONTRACT-LAZY: only stand up WebGL when the definition actually needs it (a v1
    // reaction/webgl item). A questionnaire of only form / display / analytics items
    // skips this entirely — no getContext('webgl2') call.
    if (this.questionnaireNeedsWebGL()) {
      this.ensureRenderer();
    }

    await this.resourceManager.preloadAll((progress) => {
      onProgress?.(progress.percentage);
    });

    this.preloaded = true;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    // Auto-preload if the caller did not explicitly call preload() first.
    // This ensures media assets are in cache before any trial starts,
    // eliminating 10-500ms network latency on first stimulus presentation.
    if (!this.preloaded) {
      await this.preload();
    }

    this.isRunning = true;
    this.renderer?.start();

    // True save-and-continue (E-FLOW-3): if a compatible ResumeState was supplied,
    // restore the variable context / loop counters / skip-set and jump straight to the
    // captured page + item instead of navigating from page 0. This avoids re-running
    // the onPageEnter side effects of every page before the resume point.
    const resume = this.pendingResume;
    if (resume) {
      this.pendingResume = null;
      this.restoreFromResumeState(resume);
      // Whole-survey budget carried over from the prior session (E-FLOW-5, step 8):
      // resume respects the original cap rather than restarting the clock.
      this.armSurveyTimer(resume.surveyRemainingMs);
      await this.navigateToPage(resume.currentPageIndex);
      return;
    }

    this.armSurveyTimer();
    await this.navigateToPage(0);
  }

  /**
   * Arm the whole-survey deadline (E-FLOW-5, step 2) from
   * `settings.wholeSurveyTimeLimitMs`. On expiry the configured `onSurveyTimeout`
   * action (default `auto-submit`) completes the session with a timeout flag. No-op
   * when no survey cap is declared. `initialRemainingMs` restores a carried-over budget.
   */
  private armSurveyTimer(initialRemainingMs?: number): void {
    const limit = this.config.questionnaire.settings.wholeSurveyTimeLimitMs;
    if (!limit || limit <= 0) return;
    this.timers.arm('survey', {
      deadlineMs: limit,
      initialRemainingMs,
      onExpire: () => this.handleSurveyTimeout(),
    });
  }

  /**
   * Restore live runtime state from a validated {@link ResumeState} (E-FLOW-3). Called
   * once by start() before navigating to the captured page. Importing the whole
   * VariableEngine context is lossless (answer vars + globals + computed), so {{var}}
   * interpolation, carry-forward and flow conditions resolve exactly as they did live.
   */
  private restoreFromResumeState(resume: ResumeState): void {
    this.variableEngine.importState(resume.variableSnapshot);

    this.loopIterations.clear();
    for (const [ruleId, count] of Object.entries(resume.loopIterationState)) {
      this.loopIterations.set(ruleId, count);
    }

    // Skip-set + cursor seed: already-presented items are fast-forwarded in
    // showCurrentItem, and the captured item index positions the landing page so
    // non-interactive items already shown (which leave no response) are not re-shown.
    this.resumeAnsweredIds =
      resume.presentedItemIds.length > 0 ? new Set(resume.presentedItemIds) : null;
    this.pendingResumeItemIndex = Math.max(0, resume.currentItemIndex);
  }

  public pause(): void {
    if (!this.isRunning || this.isPaused) return;

    this.isPaused = true;
    this.renderer?.stop();
    this.responseCollector.pause();
    // Freeze all deadline scopes (E-FLOW-5, step 7) so backgrounding the tab does not
    // consume the survey / page / question budgets.
    this.timers.pauseAll();
  }

  public resume(): void {
    if (!this.isRunning || !this.isPaused) return;

    this.isPaused = false;
    this.renderer?.start();
    this.responseCollector.resume();
    this.timers.resumeAll();
  }

  public stop(): void {
    this.isRunning = false;
    this.isPaused = false;

    this.cancelCurrentExecution();
    this.clearPageTimer();
    this.timers.clearAll();

    if (this.session.status === 'in_progress') {
      this.session.status = 'abandoned';
      this.session.endTime = Date.now();
    }

    this.responseCollector.stop();
    this.config.formHost?.clear();
    this.renderer?.stop();
    this.resourceManager.dispose();

    for (const runtime of this.questionRuntimeCache.values()) {
      runtime.teardown();
    }
    this.questionRuntimeCache.clear();
    this.scriptExecutor.clearCache();
  }

  /**
   * Full teardown for unmount: stop the run (which halts the render loop and
   * disposes resources) and then release the GL context itself. The runtime is
   * now the SOLE renderer owner (the page-level instance was removed), so this is
   * where the WebGL renderer must be destroyed — `stop()` alone only pauses it.
   */
  public dispose(): void {
    this.stop();
    this.renderer?.destroy();
    this.renderer = null;
  }

  public async navigateBack(): Promise<void> {
    if (!this.config.questionnaire.settings.allowBackNavigation) return;
    if (this.currentPageIndex <= 0) return;

    await this.navigateToPage(this.currentPageIndex - 1);
  }

  public getProgress(): { current: number; total: number; percentage: number } {
    const total = this.config.questionnaire.pages.length;
    const current = Math.min(total, this.currentPageIndex + 1);

    return {
      current,
      total,
      percentage: total > 0 ? (current / total) * 100 : 0,
    };
  }

  /**
   * The single VariableEngine the runtime computes into (populated by
   * initializeVariables and updateQuestionVariables). Exposed so the fillout
   * layer persists the values interpolation actually resolves against —
   * eliminating a second, never-fed engine that returned {} at persist time.
   */
  public getVariableEngine(): VariableEngine {
    return this.variableEngine;
  }

  private initializeVariables(): void {
    for (const variable of this.config.questionnaire.variables || []) {
      this.variableEngine.registerVariable(variable);
    }

    for (const question of this.config.questionnaire.questions) {
      this.registerQuestionVariables(question);
    }

    this.variableEngine.registerVariable({
      id: '_participantId',
      name: 'participantId',
      type: 'string',
      scope: 'global',
      defaultValue: this.config.participantId || '',
    });

    this.variableEngine.registerVariable({
      id: '_currentPage',
      name: 'currentPage',
      type: 'number',
      scope: 'global',
      defaultValue: 1,
    });

    this.variableEngine.registerVariable({
      id: '_totalPages',
      name: 'totalPages',
      type: 'number',
      scope: 'global',
      defaultValue: this.config.questionnaire.pages.length,
    });

    // Longitudinal / EMA study-series flow variables (E-FLOW-2). Registered
    // unconditionally (default 0) so branching that references {{waveIndex}}
    // resolves even for a non-series session; seeded from the resolved prompt
    // when the fillout entry carries a ?token= link.
    const series = this.config.seriesContext;
    this.variableEngine.registerVariable({
      id: '_waveIndex',
      name: 'waveIndex',
      type: 'number',
      scope: 'global',
      defaultValue: series?.waveIndex ?? 0,
    });
    this.variableEngine.registerVariable({
      id: '_seriesElapsedDays',
      name: 'seriesElapsedDays',
      type: 'number',
      scope: 'global',
      defaultValue: series?.seriesElapsedDays ?? 0,
    });
    if (series) {
      this.variableEngine.setVariable('_waveIndex', series.waveIndex, 'system');
      this.variableEngine.setVariable('_seriesElapsedDays', series.seriesElapsedDays, 'system');
    }

    // Quota/eligibility flow variables (E-FLOW-7). FilloutPageController sets these
    // unconditionally at session start, so they must be registered as built-ins here
    // even when the questionnaire declares no quota cells / screener.
    this.variableEngine.registerVariable({
      id: '_quotaCell',
      name: 'quotaCell',
      type: 'string',
      scope: 'global',
      defaultValue: '',
    });

    this.variableEngine.registerVariable({
      id: '_eligible',
      name: 'eligible',
      type: 'boolean',
      scope: 'global',
      defaultValue: true,
    });

    // Adaptive-testing ability-estimate variables (CAT/IRT, E-FLOW-1). Registered
    // unconditionally so downstream feedback panels and flow conditions can read
    // `theta` / `thetaSE` / `adaptiveItemsAdministered` even before (or without) any
    // adaptive block — and so `thetaSE` is a valid flow-condition variable (step 9),
    // letting a researcher branch on measurement precision. `thetaSE` defaults to a
    // large finite sentinel so `thetaSE <= 0.3` reads false until a CAT runs.
    this.variableEngine.registerVariable({
      id: '_theta',
      name: 'theta',
      type: 'number',
      scope: 'global',
      defaultValue: 0,
    });

    this.variableEngine.registerVariable({
      id: '_thetaSE',
      name: 'thetaSE',
      type: 'number',
      scope: 'global',
      defaultValue: 999,
    });

    this.variableEngine.registerVariable({
      id: '_adaptiveItemsAdministered',
      name: 'adaptiveItemsAdministered',
      type: 'number',
      scope: 'global',
      defaultValue: 0,
    });

    this.registerAdaptiveReportVariables();

    this.injectServerVariables();
  }

  /**
   * Register the per-block `thetaReportVariable` targets declared by any adaptive block
   * (E-FLOW-1, step 6) so a researcher-named ability variable exists up front for
   * feedback / branching, resolving to its default until the CAT writes the estimate.
   */
  private registerAdaptiveReportVariables(): void {
    for (const page of this.config.questionnaire.pages) {
      for (const block of page.blocks || []) {
        const reportVar = block.type === 'adaptive' ? block.adaptive?.thetaReportVariable : undefined;
        if (!reportVar) continue;
        this.registerVariableIfMissing({
          id: reportVar,
          name: reportVar,
          type: 'number',
          scope: 'global',
          defaultValue: 0,
        });
      }
    }
  }

  /**
   * Inject the last-synced SERVER-COMPUTED VARIABLE aggregates
   * (server-computed-variable / E-FEEDBACK-3) into the one VariableEngine as
   * `'server-sync'` values, so they resolve OFFLINE for every consumer alike — flow
   * conditions, piping, quotas, scripting, and the statistical-feedback engine. Runs
   * AFTER the registerVariable pass above so every target id already exists.
   *
   * Fallback semantics (deliberate, all lean on registerVariable's `defaultValue`
   * seeding): a variable with NO snapshot (never synced on this device) is left at its
   * defaultValue; a SCALAR stat withheld below the anonymity floor materializes to
   * `undefined` and is likewise skipped → defaultValue; an OBJECT bundle always injects
   * (carrying `n` + `computedAt`, numeric fields possibly undefined) so feedback widgets
   * can caption honestly even below the floor. Also registers a `_serverDataAsOf` global
   * (mirrors `_participantId`) carrying the OLDEST computedAt for "as of <date>" piping.
   */
  private injectServerVariables(): void {
    const snapshots = this.config.serverVariables;
    if (!snapshots) return;

    let oldestComputedAt: string | undefined;
    for (const variable of this.config.questionnaire.variables || []) {
      if (!variable.server) continue;
      const snapshot = snapshots[variable.id];
      if (!snapshot) continue;

      const value = materializeServerValue(variable, snapshot);
      if (value === undefined) continue;

      this.variableEngine.setVariable(variable.id, value, 'server-sync');
      if (!oldestComputedAt || snapshot.computedAt < oldestComputedAt) {
        oldestComputedAt = snapshot.computedAt;
      }
    }

    if (oldestComputedAt) {
      this.registerVariableIfMissing({
        id: '_serverDataAsOf',
        name: 'serverDataAsOf',
        type: 'string',
        scope: 'global',
        defaultValue: oldestComputedAt,
      });
      this.variableEngine.setVariable('_serverDataAsOf', oldestComputedAt, 'server-sync');
    }
  }

  private initializeExperimentalDesign(): void {
    const design = this.config.questionnaire.settings.experimentalDesign;
    if (!design || design.conditions.length === 0) return;

    const participantNumber = this.config.participantNumber ?? 0;

    // E-FLOW-6: prefer the server-authoritative arm assignment when present
    // (claimed atomically at create time, race-free). Fall back to the local
    // ConditionAssigner only offline / when no server assignment arrived —
    // now seeded with the REAL participantNumber rather than a hard-coded 0.
    const serverAssignment = this.config.serverAssignment;
    let assignment: { conditionName: string; conditionIndex: number };
    if (serverAssignment && serverAssignment.condition) {
      assignment = {
        conditionName: serverAssignment.condition,
        conditionIndex: serverAssignment.conditionIndex,
      };
    } else {
      const assigner = new ConditionAssigner(
        design.conditions,
        design.assignmentStrategy,
        design.seed
      );
      assignment = assigner.assign(participantNumber, this.config.conditionGroupCounts);
    }
    this.assignedCondition = assignment.conditionName;

    // Register condition as session variables accessible via {{condition}}
    this.registerVariableIfMissing({
      id: '_condition',
      name: 'condition',
      type: 'string',
      scope: 'global',
      defaultValue: this.assignedCondition,
    });
    this.variableEngine.setVariable('_condition', this.assignedCondition, 'system');

    this.registerVariableIfMissing({
      id: '_conditionIndex',
      name: 'conditionIndex',
      type: 'number',
      scope: 'global',
      defaultValue: assignment.conditionIndex,
    });
    this.variableEngine.setVariable('_conditionIndex', assignment.conditionIndex, 'system');

    // Store in session metadata via the custom field
    if (this.session.metadata) {
      this.session.metadata.custom = {
        ...this.session.metadata.custom,
        assignedCondition: this.assignedCondition,
        conditionIndex: assignment.conditionIndex,
      };
    }

    // Compute counterbalanced block order if applicable
    if (design.counterbalancing !== 'none') {
      this.conditionBlockOrder = getBlockOrder(
        participantNumber,
        design.conditions.length,
        design.counterbalancing
      );
    }
  }

  private registerQuestionVariables(question: Question): void {
    this.registerAnswerVariables(question.id, question.id, this.inferVariableType(question));
  }

  /**
   * Register the `_value` / `_time` / `_rt` / `_correct` / `_onset` answer variables
   * for a base id. Split out from {@link registerQuestionVariables} so loop iterations
   * (E-FLOW-4) can lazily register an ITERATION-NAMESPACED set
   * (`${questionId}__${iterationIndex}`) with a distinct interpolation name, keeping
   * every iteration's answer retained at `complete()`.
   */
  private registerAnswerVariables(
    base: string,
    valueName: string,
    responseType: Variable['type']
  ): void {
    this.registerVariableIfMissing({
      id: `${base}_value`,
      name: valueName,
      type: responseType,
      scope: 'global',
      defaultValue: null,
    });

    this.registerVariableIfMissing({
      id: `${base}_time`,
      name: `${base}_time`,
      type: 'time',
      scope: 'global',
      defaultValue: null,
    });

    this.registerVariableIfMissing({
      id: `${base}_rt`,
      name: `${base}_rt`,
      type: 'reaction_time',
      scope: 'global',
      defaultValue: null,
    });

    this.registerVariableIfMissing({
      id: `${base}_correct`,
      name: `${base}_correct`,
      type: 'boolean',
      scope: 'global',
      defaultValue: null,
    });

    this.registerVariableIfMissing({
      id: `${base}_onset`,
      name: `${base}_onset`,
      type: 'stimulus_onset',
      scope: 'local',
      defaultValue: null,
    });
  }

  /**
   * Publish the loop variables (E-FLOW-4) for the item about to be presented, and
   * (for a looped item) lazily register its iteration-namespaced answer variables so
   * the subsequent per-iteration writes never throw on an unregistered id.
   *
   * The loop variable is exposed under BOTH its configured name (default `loopValue`)
   * and the fixed alias `loopValue`, plus `_iterationIndex` / `_iterationCount` flow
   * variables so branching can act on loop position. For a non-loop item every one of
   * these is reset to null so a stale value from an earlier loop can't leak into a
   * later prompt.
   */
  private applyLoopContext(item: PresentedItem): void {
    const looped = item.iterationIndex !== null && item.iterationIndex !== undefined;

    if (looped) {
      const prefix = iterationVarPrefix(item.question.id, item.iterationIndex);
      this.registerAnswerVariables(prefix, prefix, this.inferVariableType(item.question));

      const loopVarName = item.loopVariableName || DEFAULT_LOOP_VARIABLE_NAME;
      this.setLoopVariable(loopVarName, item.loopValue);
      if (loopVarName !== DEFAULT_LOOP_VARIABLE_NAME) {
        this.setLoopVariable(DEFAULT_LOOP_VARIABLE_NAME, item.loopValue);
      }
      this.setLoopVariable('_iterationIndex', item.iterationIndex);
      this.setLoopVariable('_iterationCount', item.iterationCount ?? null);
    } else {
      this.setLoopVariable(DEFAULT_LOOP_VARIABLE_NAME, null);
      this.setLoopVariable('_iterationIndex', null);
      this.setLoopVariable('_iterationCount', null);
    }
  }

  /**
   * Set a loop variable, (re)registering it with a type inferred from the current
   * value so heterogeneous roster entries (string, number, object) all round-trip
   * through VariableEngine.validateType without throwing. Never blocks navigation:
   * a validation failure is swallowed (the prior value simply persists).
   */
  private setLoopVariable(name: string, value: unknown): void {
    let type: Variable['type'];
    if (Array.isArray(value)) type = 'array';
    else if (value !== null && typeof value === 'object') type = 'object';
    else if (typeof value === 'number') type = 'number';
    else if (typeof value === 'boolean') type = 'boolean';
    else type = 'string';

    // registerVariable overwrites the type on the Map entry, so a later iteration
    // whose value has a different shape re-types the variable cleanly.
    this.variableEngine.registerVariable({ id: name, name, type, scope: 'global' });
    try {
      this.variableEngine.setVariable(name, value, 'loop');
    } catch {
      // Type mismatch on a heterogeneous source — keep prior value, don't halt.
    }
  }

  private registerVariableIfMissing(variable: Variable): void {
    try {
      this.variableEngine.registerVariable(variable);
    } catch {
      // Variable registration collisions are expected during repeated runtime setup.
    }
  }

  private inferVariableType(question: Question): Variable['type'] {
    const responseType = (question as DynamicValue).responseType;
    const responseTypeKind = responseType?.type;

    // Modern questions (designer- or API-created) carry no legacy `responseType`; the
    // union base only has the concrete `type`/`response`/`display`. Infer from the module
    // `type` instead of defaulting to 'object' — a scalar answer written into an
    // 'object'-typed variable throws in VariableEngine.validateType, and because that write
    // happens inside the fire-and-forget response handler the throw becomes a silent
    // unhandled rejection that freezes the fillout on the first question (FIX-fillout-freeze).
    if (!responseTypeKind) {
      return this.inferModernVariableType(question);
    }

    if (responseTypeKind === 'number' || responseTypeKind === 'scale') return 'number';
    if (responseTypeKind === 'multiple') return 'array';

    if (responseTypeKind === 'single') {
      const optionValues = Array.isArray(responseType.options)
        ? responseType.options
            .map((option: DynamicValue) => option?.value)
            .filter((value: unknown) => value !== null && value !== undefined)
        : [];

      if (optionValues.length > 0 && optionValues.every((value: unknown) => typeof value === 'number')) {
        return 'number';
      }

      if (optionValues.length > 0 && optionValues.every((value: unknown) => typeof value === 'boolean')) {
        return 'boolean';
      }

      return 'string';
    }

    if (responseTypeKind === 'text' || responseTypeKind === 'keypress') return 'string';
    if (responseTypeKind === 'none') return 'string';
    if (responseTypeKind === 'click') return 'object';

    return 'object';
  }

  /**
   * Infer the `${id}_value` variable type for a modern question that has no legacy
   * `responseType`, keyed on its module `type`. The overriding constraint: NEVER return
   * a type that can throw on the answer write. VariableEngine.validateType coerces 'string'
   * via `String(value)` (never throws) and 'number' via `Number(value)`; 'array'/'object'
   * throw on a shape mismatch. So numeric widgets map to 'number', collection widgets to
   * their real container type, and everything else to the always-safe 'string' default —
   * no modern question's value variable can be typed 'object' by accident (FIX-fillout-freeze).
   */
  private inferModernVariableType(question: Question): Variable['type'] {
    switch (question.type) {
      case 'number-input':
      case 'rating':
      case 'scale':
        // (scale covers slider-style widgets; its value is the numeric position)
        return 'number';
      case 'ranking':
        return 'array';
      case 'multiple-choice':
        return this.isMultiSelectQuestion(question) ? 'array' : 'string';
      case 'matrix':
        return 'object';
      default:
        // text-input, single-choice, date-time, media-response, drawing, file-upload,
        // webgl and every other form widget record a scalar answer -> safe 'string'.
        return 'string';
    }
  }

  /**
   * Whether a modern multiple-choice question emits an array (multi-select) rather than a
   * scalar. Mirrors moduleConfigAdapter's `isMultiple` detection so the variable container
   * type matches the value the mounted component actually produces.
   */
  private isMultiSelectQuestion(question: Question): boolean {
    const q = question as DynamicValue;
    const legacyResponse = q.responseType ?? q.response;
    return (
      legacyResponse?.type === 'multiple' ||
      q.config?.responseType?.type === 'multiple' ||
      q.display?.responseType === 'multiple'
    );
  }

  private async navigateToPage(pageIndex: number, anchorQuestionId?: string): Promise<void> {
    if (!this.isRunning) return;

    if (pageIndex < 0 || pageIndex >= this.config.questionnaire.pages.length) {
      this.complete();
      return;
    }

    // Execute onNavigate hook on the current question before leaving
    if (this.currentQuestion) {
      const direction = pageIndex > this.currentPageIndex ? 'forward' : 'back';
      const allowed = this.scriptExecutor.executeOnNavigate(
        this.currentQuestion,
        direction,
        this.variableEngine,
        this.getResponseMap()
      );
      if (!allowed) {
        return;
      }
    }

    // Execute onPageExit for the outgoing page before cancelling execution
    if (this.currentPage?.script) {
      this.scriptExecutor.executeOnPageExit(
        this.currentPage.id,
        this.currentPage.name,
        this.currentPageIndex,
        this.currentPage.script,
        this.variableEngine,
        this.getResponseMap()
      );
    }

    this.cancelCurrentExecution();

    // Track page timing for speeder detection
    this.qualityReport.speeder.leavePage();

    this.currentPageIndex = pageIndex;
    this.currentPage = this.config.questionnaire.pages[pageIndex] || null;
    this.currentItemIndex = 0;

    // Save-and-continue (E-FLOW-3): seed the captured item index on the FIRST landing
    // page of a resumed run only. Consumed here so subsequent page entries reset to 0.
    if (this.pendingResumeItemIndex !== null) {
      this.currentItemIndex = this.pendingResumeItemIndex;
      this.pendingResumeItemIndex = null;
    }

    this.variableEngine.setVariable('_currentPage', pageIndex + 1, 'system');

    if (this.currentPage && !this.evaluateVisibility(this.currentPage.conditions)) {
      await this.navigateToPage(pageIndex + 1);
      return;
    }

    // Record entering this page
    if (this.currentPage) {
      this.qualityReport.speeder.enterPage(this.currentPage.id);
    }

    // Execute onPageEnter for the incoming page and set up timer if configured
    if (this.currentPage?.script) {
      this.scriptExecutor.executeOnPageEnter(
        this.currentPage.id,
        this.currentPage.name,
        this.currentPageIndex,
        this.currentPage.script,
        this.variableEngine,
        this.getResponseMap()
      );

      // Set up onTimer interval if the page script defines an onTimer hook
      const pageHooks = this.scriptExecutor.getPageHooks(
        this.currentPage.id,
        this.currentPage.script
      );
      if (pageHooks.onTimer) {
        const page = this.currentPage;
        const pageIdx = this.currentPageIndex;
        // E-FLOW-5, step 3: cadence is configurable per page (was a hardcoded 1000ms).
        const timerInterval = page.settings?.timerIntervalMs ?? 1000;
        this.pageTimerIntervalId = setInterval(() => {
          this.scriptExecutor.executeOnTimer(
            page.id,
            page.name,
            pageIdx,
            page.script!,
            this.variableEngine,
            this.getResponseMap()
          );
        }, timerInterval);
      }
    }

    // Arm the page time limit (E-FLOW-5, step 3) now that the visible landing page is
    // settled. No-op when the page declares no limit (also clears any prior page timer).
    this.armPageTimer();

    this.currentPageItems = this.getPageItems();

    // Question-target anchoring (E-FLOW-8, step 6): when a flow rule targets a
    // specific question rather than a whole page, land ON that question within the
    // page instead of at its top. Robust against loop/randomization reordering
    // because it searches the ACTUAL presented items. Only honoured on a fresh
    // landing (no pending resume cursor already claimed currentItemIndex).
    if (anchorQuestionId && this.currentItemIndex === 0) {
      const anchorIdx = this.currentPageItems.findIndex(
        (it) => it.question.id === anchorQuestionId
      );
      if (anchorIdx > 0) this.currentItemIndex = anchorIdx;
    }

    this.config.onProgress?.(pageIndex + 1, this.config.questionnaire.pages.length);
    await this.showCurrentItem();
  }

  /**
   * Arm the current page's time limit (E-FLOW-5) from `page.settings.timeLimit`. On
   * expiry it runs the configured `onTimeLimit` action (default `auto-advance`).
   * Always (re)sets the `page` scope: a page with no limit clears any prior timer.
   */
  private armPageTimer(): void {
    const page = this.currentPage;
    const pageIndex = this.currentPageIndex;
    const limit = page?.settings?.timeLimit;
    if (!page || !limit || limit <= 0) {
      this.timers.clear('page');
      return;
    }
    const action: PageTimeoutAction = page.settings?.onTimeLimit ?? 'auto-advance';
    this.timers.arm('page', {
      deadlineMs: limit,
      onExpire: () => {
        void this.handlePageTimeout(pageIndex, action);
      },
    });
  }

  /**
   * Handle a page time-limit expiry (E-FLOW-5): record it in the QualityReport timeout
   * dimension, then either advance to the next page or terminate the session per config.
   * Guarded against a stale fire from a page we already left.
   */
  private async handlePageTimeout(pageIndex: number, action: PageTimeoutAction): Promise<void> {
    if (!this.isRunning || this.currentPageIndex !== pageIndex) return;
    const page = this.config.questionnaire.pages[pageIndex];
    this.qualityReport.timeout.record({ scope: 'page', action, pageId: page?.id });
    if (action === 'terminate') {
      this.completeWithTimeout({ scope: 'page', action });
      return;
    }
    await this.navigateToPage(pageIndex + 1);
  }

  private getPageItems(): PresentedItem[] {
    if (!this.currentPage) return [];

    const page = this.applyExperimentalDesignToPage(this.currentPage);

    const questionMap = new Map(
      this.config.questionnaire.questions.map((question) => [question.id, question])
    );

    // Adaptive item-bank blocks (E-FLOW-1) are administered DYNAMICALLY, not statically
    // expanded: their `questions` are the calibrated bank, and the CAT selector — not the
    // page order — decides which and how many are shown. Strip them from the static
    // expansion and append one entry sentinel per adaptive block after the page's static
    // items; showCurrentItem hands control to the CAT loop when it reaches the sentinel.
    const adaptiveBlocks = (page.blocks || []).filter(
      (block) => block.type === 'adaptive' && block.adaptive && block.adaptive.items?.length
    );
    const staticPage: Page =
      adaptiveBlocks.length > 0
        ? { ...page, blocks: (page.blocks || []).filter((block) => block.type !== 'adaptive') }
        : page;

    // Loop-aware expansion (E-FLOW-4): a `loop` block yields one ref per
    // (question, iteration) instead of a deduped id — so the battery presents once
    // per iteration value rather than collapsing to a single presentation.
    const refs = this.blockRandomizer.expandPage(staticPage, questionMap, {
      responses: this.getResponseMap(),
      variables: this.variableEngine.getAllVariables(),
    });

    const items: PresentedItem[] = [];
    for (const ref of refs) {
      const question = questionMap.get(ref.questionId);
      if (!question) continue;
      items.push({
        question,
        iterationIndex: ref.iterationIndex,
        loopValue: ref.loopValue,
        loopVariableName: ref.loopVariableName,
        iterationCount: ref.iterationCount,
      });
    }

    // Stable order-sort by `question.order` WITHIN each contiguous same-iteration run.
    // Sorting the whole flattened list (the pre-loop behaviour) would interleave loop
    // iterations; restricting the sort to a run preserves iteration grouping while
    // keeping the historical intra-page ordering for non-loop pages.
    const ordered = this.sortWithinIterationRuns(items);

    // Append the adaptive-block sentinels after the static items (E-FLOW-1). The
    // sentinel's `question` is a placeholder (never presented) that only satisfies the
    // PresentedItem type; the adaptive branch in showCurrentItem keys off adaptiveBlockId.
    for (const block of adaptiveBlocks) {
      const anchor = this.resolveAdaptiveAnchorQuestion(block, questionMap);
      if (!anchor) continue; // bank items reference no known question — nothing to administer
      ordered.push({ question: anchor, iterationIndex: null, adaptiveBlockId: block.id });
    }

    return ordered;
  }

  /**
   * The placeholder question parked on an adaptive-block sentinel: the first bank item
   * that resolves to a real question. Never presented — it only satisfies the
   * PresentedItem type until the CAT loop selects the actual items to administer.
   */
  private resolveAdaptiveAnchorQuestion(
    block: Block,
    questionMap: Map<string, Question>
  ): Question | null {
    for (const item of block.adaptive?.items || []) {
      const question = questionMap.get(item.id);
      if (question) return question;
    }
    return null;
  }

  /**
   * Stable-sort each contiguous run of items that share the same `iterationIndex` by
   * `question.order`, leaving the run boundaries (and thus loop-iteration grouping)
   * intact. Array.prototype.sort is stable, so items with equal order keep expansion
   * order.
   */
  private sortWithinIterationRuns(items: PresentedItem[]): PresentedItem[] {
    const result: PresentedItem[] = [];
    let runStart = 0;
    const flushRun = (endExclusive: number) => {
      const run = items.slice(runStart, endExclusive);
      run.sort((a, b) => (a.question.order || 0) - (b.question.order || 0));
      result.push(...run);
    };
    for (let i = 1; i <= items.length; i++) {
      if (i === items.length || items[i]!.iterationIndex !== items[runStart]!.iterationIndex) {
        flushRun(i);
        runStart = i;
      }
    }
    return result;
  }

  private applyExperimentalDesignToPage(page: Page): Page {
    if (!this.assignedCondition || !page.blocks || page.blocks.length === 0) {
      return page;
    }

    const design = this.config.questionnaire.settings.experimentalDesign;
    if (!design) return page;

    const unconditionalBlocks: typeof page.blocks = [];
    const conditionBlocks: typeof page.blocks = [];

    for (const block of page.blocks) {
      if (!block.condition) {
        unconditionalBlocks.push(block);
      } else if (block.condition === this.assignedCondition) {
        conditionBlocks.push(block);
      }
    }

    let orderedConditionBlocks = conditionBlocks;
    if (this.conditionBlockOrder && conditionBlocks.length > 1) {
      const reordered: typeof page.blocks = [];
      const maxIdx = Math.min(this.conditionBlockOrder.length, conditionBlocks.length);
      for (let i = 0; i < maxIdx; i++) {
        const sourceIdx = this.conditionBlockOrder[i]!;
        if (sourceIdx < conditionBlocks.length) {
          reordered.push(conditionBlocks[sourceIdx]!);
        }
      }
      for (const block of conditionBlocks) {
        if (!reordered.includes(block)) {
          reordered.push(block);
        }
      }
      orderedConditionBlocks = reordered;
    }

    return {
      ...page,
      blocks: [...unconditionalBlocks, ...orderedConditionBlocks],
    };
  }

  private async showCurrentItem(): Promise<void> {
    if (!this.isRunning || this.isPaused) return;

    const itemRef = this.currentPageItems[this.currentItemIndex];
    if (!itemRef) {
      this.currentIteration = null;
      await this.handleFlowControl();
      return;
    }

    // Adaptive item-bank entry (E-FLOW-1): the sentinel hands control to the CAT loop,
    // which dynamically selects and presents items until its stopping rule fires and then
    // advances past the sentinel. Handled before loop/visibility/resume logic below —
    // the sentinel is not an ordinary presented item.
    if (itemRef.adaptiveBlockId) {
      this.currentIteration = null;
      await this.enterAdaptiveBlock(itemRef.adaptiveBlockId);
      return;
    }

    // Loop context (E-FLOW-4): stash the iteration for the response/variable pipeline
    // and publish the loop variable BEFORE anything reads variables — so visibility
    // conditions, carry-forward and prompt interpolation all see `{{loopValue}}` /
    // `_iterationIndex` / `_iterationCount` for THIS iteration.
    this.currentIteration = itemRef;
    this.applyLoopContext(itemRef);

    let item = itemRef.question;

    // Resume fast-forward (E-OFF-1): silently advance past items answered in a prior
    // session so a rehydrated run lands on the first unanswered item without
    // re-presenting (which would create a duplicate response). Driven by the restored
    // answer set, so it is robust to a partial progress-cursor write. (Loop caveat:
    // resume keys on question id, so a partially-answered loop resumes at its first
    // question — acceptable until per-iteration resume cursors land.)
    if (this.resumeAnsweredIds?.has(item.id)) {
      this.currentItemIndex += 1;
      await this.showCurrentItem();
      return;
    }

    if (!this.evaluateVisibility((item as DynamicValue).conditions)) {
      this.currentItemIndex += 1;
      await this.showCurrentItem();
      return;
    }

    // Resolve carry-forward before presenting the question
    item = this.resolveCarryForwardForQuestion(item);

    const metadata = moduleRegistry.get(item.type);
    if (!metadata) {
      // Fail loud instead of silently skipping the item. A missing module type is
      // almost always the module registry not being populated before the runtime
      // started (Slice 1.8 race on resumed sessions — callers must first await
      // ensureModulesRegistered()). Silently dropping the question corrupts the
      // dataset with no signal, so surface it: this rejection propagates through
      // navigateToPage -> start() to the fillout page's catch, which renders a
      // visible error rather than continuing past a dropped question.
      throw new Error(
        `Unknown module type "${item.type}" for question "${item.id}" — the module ` +
          `registry is not populated. Ensure ensureModulesRegistered() has resolved ` +
          `before starting the runtime.`
      );
    }

    this.currentQuestion = item;
    this.config.onQuestionPresented?.({
      questionId: item.id,
      questionType: item.type,
      pageId: this.currentPage?.id,
      pageIndex: this.currentPageIndex,
      itemIndex: this.currentItemIndex,
      category: metadata.category,
      timestamp: performance.now(),
    });

    switch (metadata.category) {
      case 'question':
        await this.presentQuestion(item, metadata);
        break;
      case 'instruction':
      case 'display':
      case 'analytics':
        await this.presentNonInteractiveItem(item, metadata);
        break;
      default:
        this.currentItemIndex += 1;
        await this.showCurrentItem();
        break;
    }
  }

  /**
   * Present a question to the participant.
   *
   * Timing: Uses performance.now() for onset/response timestamps (~5μs precision
   * with COOP/COEP cross-origin isolation). This is sufficient for standard survey
   * questions where response times are measured in seconds.
   *
   * For sub-millisecond frame-exact timing (needed for reaction time paradigms like
   * Stroop, IAT, Flanker), use the ReactionEngine path which captures stimulus onset
   * via requestAnimationFrame callbacks and input via event.timeStamp.
   */
  private async presentQuestion(question: Question, metadata: ModuleMetadata): Promise<void> {
    const onsetTime = performance.now();
    this.variableEngine.setVariable(`${question.id}_onset`, onsetTime, 'system');

    // Apply carry-forward default value if resolved
    const cfInitialValue = (question as PresentedQuestion)._carryForwardInitialValue;
    if (cfInitialValue !== undefined) {
      this.variableEngine.setVariable(`${question.id}_value`, cfInitialValue, 'carry-forward');
    }

    // Execute onMount hook when question becomes active
    this.scriptExecutor.executeOnMount(question, this.variableEngine, this.getResponseMap());

    const runtime = await this.resolveQuestionRuntime(metadata);
    if (runtime) {
      const context = this.createQuestionRuntimeContext(question);
      try {
        const result = await runtime.run(context);
        await this.handleQuestionRuntimeResult(question, onsetTime, result);
      } catch (error) {
        if (!this.isAbortError(error)) {
          throw error;
        }
      }
      return;
    }

    // Hybrid render (ADR 0018): mount the module's runtime Svelte component into
    // the HTML overlay for form-style questions instead of WebGL text.
    if (this.config.formHost && this.isFormStyle(metadata)) {
      this.presentFormQuestion(question, metadata, onsetTime);
      return;
    }

    // No WebGL question-presenter path remains (Slice 5.2). In fillout this is
    // unreachable: the page always supplies a formHost, v1 reaction/webgl questions
    // are handled by the runtime branch above, and every other `question`-category
    // module is form-style and mounts in the overlay. Reaching here means the runtime
    // was constructed without a formHost for a non-v1 question — fail loud rather than
    // silently dropping it.
    throw new Error(
      `Cannot present question "${question.id}" (${question.type}): no formHost is ` +
        `configured and the legacy WebGL question presenter was removed. Supply a ` +
        `formHost, or use a reaction/webgl (v1) module for WebGL presentation.`
    );
  }

  private async presentNonInteractiveItem(
    question: Question,
    metadata: ModuleMetadata
  ): Promise<void> {
    // Execute onMount hook for non-interactive items too (e.g. instructions with scripts)
    this.scriptExecutor.executeOnMount(question, this.variableEngine, this.getResponseMap());

    const advance = async () => {
      await this.clearPresentation();
      this.currentItemIndex += 1;
      await this.showCurrentItem();
    };

    const formHost = this.config.formHost;
    if (!formHost) {
      // The legacy all-WebGL presenter (QuestionPresenter.presentModular) was removed
      // in Slice 5.2. A non-interactive item (instruction / display / analytics) has
      // nowhere to render without an HTML-overlay formHost — fail loud rather than
      // silently skipping it.
      throw new Error(
        `Cannot present non-interactive item "${question.id}" (${metadata.category}): ` +
          `no formHost is configured and the WebGL presenter path was removed.`
      );
    }

    // Refresh subscale / normative scores (E-FEEDBACK-1) before rendering so a
    // statistical-feedback panel bound to `score.<scaleId>.<field>` resolves against the
    // participant's own just-computed values. No-op unless `settings.scoring` is declared.
    this.applyScaleScores();

    // Hybrid render (ADR 0018): mount the module's runtime Svelte component into the
    // HTML overlay so instruction / display / analytics items are actually visible.
    // Slice 5.1 extended this from the `instruction` category alone to also cover
    // `display` / `analytics` items (bar-chart, statistical-feedback) — previously the
    // WebGL presenter rasterized them into a texture nothing drew, so they were invisible.
    const item = question as PresentedQuestion;
    formHost.present({
      item,
      type: item.type,
      category: metadata.category,
      config: buildModuleRuntimeConfig(item),
      variables: this.variableEngine.getAllVariables(),
      interactive: false,
      required: false,
      onSubmit: () => {
        void advance();
      },
    });

    // Auto-advance / timing. Instruction items opt IN to auto-advance; display /
    // analytics items auto-advance by default — preserving the prior WebGL presenter
    // semantics (autoAdvance !== false, with a 2500ms fallback duration).
    // `timing.duration` is a legacy off-contract field (TimingConfig models
    // min/max/warning, not a single auto-advance duration); read it through the
    // module's DynamicValue escape hatch alongside the typed `displayDuration`.
    const timing = item.timing as DynamicValue;
    if (metadata.category === 'instruction') {
      const duration = timing?.duration || item.displayDuration;
      const autoAdvance = item.autoAdvance === true || item.navigation?.autoAdvance === true;
      if (autoAdvance && duration) {
        this.scheduleAutoAdvance(duration, advance);
      }
    } else {
      const duration = timing?.duration || item.displayDuration || 2500;
      // Statistical-feedback panels require an explicit opt-in to auto-dismiss
      // (F062): participants otherwise lose the chart, interpretation and report
      // button mid-read. New panels have no top-level `autoAdvance`, so they wait
      // for the overlay Continue button until a designer turns auto-dismiss on
      // (StatisticalFeedbackDesigner writes item-level `autoAdvance: true`). Other
      // display / analytics items keep the historical auto-advance-by-default
      // semantics (`autoAdvance !== false`).
      const shouldAutoAdvance =
        item.type === 'statistical-feedback'
          ? item.autoAdvance === true
          : item.autoAdvance !== false;
      if (shouldAutoAdvance) {
        this.scheduleAutoAdvance(duration, advance);
      }
    }
  }

  /**
   * A form-style question renders through the HTML overlay: category `question`
   * without a registered reaction-time (v1) runtime.
   */
  private isFormStyle(metadata: ModuleMetadata): boolean {
    if (metadata.category !== 'question') return false;
    if (metadata.questionRuntime?.contract === 'v1') return false;
    return true;
  }

  /**
   * Present a form-style question by mounting its runtime component in the overlay
   * and routing the confirmed answer back through the normal response pipeline.
   */
  private presentFormQuestion(
    question: Question,
    metadata: ModuleMetadata,
    onsetTime: number
  ): void {
    if (!this.config.formHost) return;

    const item = question as PresentedQuestion;
    const cfInitialValue = item._carryForwardInitialValue;

    this.config.formHost.present({
      item,
      type: item.type,
      category: metadata.category,
      config: buildModuleRuntimeConfig(item),
      variables: this.variableEngine.getAllVariables(),
      interactive: true,
      required: Boolean(item.required),
      initialValue: cfInitialValue,
      onSubmit: (value, responseMetadata) => {
        void this.handleCollectedResponse(
          question,
          onsetTime,
          value,
          responseMetadata ?? {
            source: 'programmatic',
            timestamp: performance.now(),
            responseTimeMs: Math.max(0, performance.now() - onsetTime),
          }
        );
      },
    });

    // Per-question response deadline (E-FLOW-5, step 4). No-op unless the item declares
    // `timing.deadlineMs`; drives the overlay countdown and, on expiry, the configured action.
    this.armQuestionDeadline(question, onsetTime);
  }

  /**
   * Arm the active question's response deadline (E-FLOW-5) from `timing.deadlineMs`.
   * The countdown surfaces to the overlay via {@link handleTimerTick}; on expiry the
   * configured {@link QuestionTimeoutAction} (default `auto-submit`) runs.
   */
  private armQuestionDeadline(question: Question, onsetTime: number): void {
    const timing = (question as { timing?: TimingConfig }).timing;
    const deadlineMs = timing?.deadlineMs;
    if (!deadlineMs || deadlineMs <= 0) return;

    const action: QuestionTimeoutAction = timing?.onTimeout ?? 'auto-submit';
    this.activeQuestionWarnAtMs = timing?.warnAtMs;
    this.timers.arm('question', {
      deadlineMs,
      warnAtMs: timing?.warnAtMs,
      onExpire: () => {
        void this.handleQuestionDeadline(question, onsetTime, action);
      },
    });
  }

  /**
   * Resolve a per-question deadline expiry (E-FLOW-5, step 4) per its configured action:
   * `auto-submit` commits the partial value the participant entered (flagged timedOut),
   * `skip` records an empty timed-out response, `terminate` ends the session, and `warn`
   * leaves the question open (the participant was already warned). Every non-`warn`
   * outcome is folded into the QualityReport timeout dimension.
   */
  private async handleQuestionDeadline(
    question: Question,
    onsetTime: number,
    action: QuestionTimeoutAction
  ): Promise<void> {
    if (!this.isRunning || this.currentQuestion?.id !== question.id) return;

    if (action === 'warn') {
      // Soft deadline: the warning already surfaced via the countdown; keep waiting.
      this.qualityReport.timeout.record({
        scope: 'question',
        action,
        questionId: question.id,
        pageId: this.currentPage?.id,
        iterationIndex: this.currentIteration?.iterationIndex ?? undefined,
      });
      return;
    }

    this.qualityReport.timeout.record({
      scope: 'question',
      action,
      questionId: question.id,
      pageId: this.currentPage?.id,
      iterationIndex: this.currentIteration?.iterationIndex ?? undefined,
    });

    if (action === 'terminate') {
      this.completeWithTimeout({ scope: 'question', action, questionId: question.id });
      return;
    }

    if (action === 'skip') {
      await this.handleTimeout(question, onsetTime);
      return;
    }

    // auto-submit: commit whatever the participant has entered so far, stamped timedOut.
    const value = this.config.formHost?.getCurrentValue?.() ?? null;
    this.pendingTimeoutQuestionId = question.id;
    await this.handleCollectedResponse(question, onsetTime, value, {
      source: 'timeout',
      timestamp: performance.now(),
      responseTimeMs: Math.max(0, performance.now() - onsetTime),
    });
  }

  /** Surface a question-scope countdown tick to the overlay (E-FLOW-5, step 5). */
  private handleTimerTick(scope: TimerScope, remainingMs: number, totalMs: number): void {
    if (scope !== 'question') return;
    const warnAt = this.activeQuestionWarnAtMs;
    const warning = warnAt !== undefined && totalMs - remainingMs >= warnAt;
    this.config.formHost?.updateTimer?.({ scope, remainingMs, totalMs, warning });
  }

  /**
   * Complete the session as a timeout outcome (E-FLOW-5). A `terminate` action sets the
   * session status to `timed_out` and records the reason (incl. any survey timeout
   * message) into metadata; an `auto-submit` survey timeout completes normally but still
   * records the timeout provenance so the dataset is honest about how it ended.
   */
  private completeWithTimeout(info: {
    scope: TimerScope;
    action: string;
    questionId?: string;
  }): void {
    if (!this.session.metadata) this.session.metadata = {};
    this.session.metadata.custom = {
      ...this.session.metadata.custom,
      timeoutTermination: {
        scope: info.scope,
        action: info.action,
        questionId: info.questionId,
        pageId: this.currentPage?.id,
        message:
          info.scope === 'survey'
            ? this.config.questionnaire.settings.surveyTimeoutMessage
            : undefined,
        at: Date.now(),
      },
    };
    this.complete(info.action === 'terminate' ? 'timed_out' : 'completed');
  }

  /**
   * Whole-survey deadline expiry (E-FLOW-5, step 2): record it and end the session per
   * `onSurveyTimeout` (default `auto-submit`).
   */
  private handleSurveyTimeout(): void {
    const action: SurveyTimeoutAction =
      this.config.questionnaire.settings.onSurveyTimeout ?? 'auto-submit';
    this.qualityReport.timeout.record({ scope: 'survey', action });
    this.completeWithTimeout({ scope: 'survey', action });
  }

  private clearPresentation(): void {
    // Leaving the current question presentation: disarm its deadline and clear the
    // overlay countdown (E-FLOW-5). Survey / page scopes persist.
    this.timers.clear('question');
    this.activeQuestionWarnAtMs = undefined;
    this.config.formHost?.updateTimer?.(null);
    this.config.formHost?.clear();
    // Parity with the removed QuestionPresenter.clear() (Slice 5.2): drop any leftover
    // WebGL renderables so a form/display item after a reaction trial starts clean.
    // No-op when no WebGL renderer exists (form/display/analytics-only run).
    this.renderer?.clearRenderables();
  }

  private createQuestionRuntimeContext(question: Question): QuestionRuntimeContext {
    this.currentAbortController = new AbortController();

    return {
      question,
      questionnaire: this.config.questionnaire,
      canvas: this.config.canvas,
      // v1 reaction/webgl runtimes draw via WebGL — spin up (or reuse) the single owned
      // renderer here. Throws the participant-facing "requires WebGL 2.0" error if the
      // device lacks WebGL 2.0 (CONTRACT-LAZY).
      renderer: this.ensureRenderer(),
      variableEngine: this.variableEngine,
      resourceManager: this.resourceManager,
      responseCollector: this.responseCollector,
      abortSignal: this.currentAbortController.signal,
      // E-REACT-6: seed per-session counterbalancing + within-block shuffles.
      sessionId: this.session.id,
      participantNumber: this.config.participantNumber,
    };
  }

  private async resolveQuestionRuntime(metadata: ModuleMetadata): Promise<IQuestionRuntime | null> {
    if (!metadata.questionRuntime || metadata.questionRuntime.contract !== 'v1') {
      return null;
    }

    if (this.questionRuntimeCache.has(metadata.type)) {
      return this.questionRuntimeCache.get(metadata.type)!;
    }

    const runtime = await metadata.questionRuntime.create();
    const context = this.createQuestionRuntimeContext(this.currentQuestion!);
    await runtime.prepare(context);
    this.questionRuntimeCache.set(metadata.type, runtime);
    return runtime;
  }

  private async handleQuestionRuntimeResult(
    question: Question,
    onsetTime: number,
    runtimeResult: QuestionRuntimeResult
  ): Promise<void> {
    // Execute onValidate hook for runtime-collected responses
    const validationResult = this.scriptExecutor.executeOnValidate(
      question,
      runtimeResult.value,
      this.variableEngine,
      this.getResponseMap()
    );

    const timestamp = performance.now();
    const reactionTime = runtimeResult.reactionTimeMs ?? computeReactionTimeMs(onsetTime, timestamp);

    const response: Response = {
      id: nanoid(),
      questionId: question.id,
      pageId: this.currentPage?.id,
      timestamp,
      value: runtimeResult.value,
      reactionTime,
      stimulusOnsetTime: onsetTime,
      valid: !runtimeResult.timedOut && validationResult.valid,
      ...this.iterationFields(),
      metadata: runtimeResult.metadata,
    };

    this.session.responses.push(response);
    this.updateQuestionVariables(question, response, runtimeResult.isCorrect ?? null);

    // Validate attention check if configured
    this.qualityReport.attention.validate(
      question.id,
      runtimeResult.value,
      question.attentionCheck as AttentionCheckConfig | undefined
    );

    // Execute onResponse hook after the response is recorded
    this.scriptExecutor.executeOnResponse(
      question,
      runtimeResult.value,
      this.variableEngine,
      this.getResponseMap()
    );

    await this.clearPresentation();

    // Save-and-continue boundary (E-FLOW-3): persist the resume cursor now that the
    // response is committed but before advancing, so a crash mid-advance still resumes here.
    this.emitResumeState();

    this.currentItemIndex += 1;
    await this.showCurrentItem();
  }

  private async handleCollectedResponse(
    question: Question,
    onsetTime: number,
    value: DynamicValue,
    responseMetadata?: ResponseCaptureMetadata
  ): Promise<void> {
    // Execute onValidate hook before accepting the response
    const validationResult = this.scriptExecutor.executeOnValidate(
      question,
      value,
      this.variableEngine,
      this.getResponseMap()
    );
    if (!validationResult.valid) {
      // Validation failed -- log warning but don't block (response collector already stopped)
      console.warn(
        `[ScriptExecutor] Validation blocked response for ${question.name || question.id}: ${validationResult.error}`
      );
    }

    const timestamp = responseMetadata?.timestamp ?? performance.now();
    const reactionTime = responseMetadata?.responseTimeMs ?? computeReactionTimeMs(onsetTime, timestamp);

    // Deadline auto-submit (E-FLOW-5): this commit was forced by the question timer, so
    // stamp the Response timedOut and mark it invalid regardless of validation state.
    const timedOut = this.pendingTimeoutQuestionId === question.id;
    this.pendingTimeoutQuestionId = null;

    const response: Response = {
      id: nanoid(),
      questionId: question.id,
      pageId: this.currentPage?.id,
      timestamp,
      value,
      reactionTime,
      stimulusOnsetTime: onsetTime,
      valid: validationResult.valid && !timedOut,
      timedOut: timedOut || undefined,
      ...this.iterationFields(),
      metadata: responseMetadata ? { firstInteraction: responseMetadata.responseTimeMs } : undefined,
    };

    this.session.responses.push(response);

    // Adaptive item-bank items (E-FLOW-1) score correctness via the CAT scoring keys
    // (step 5); everything else uses the shared custom-correctness path. Computing it
    // once here keeps `${id}_correct` and the CAT update in agreement.
    const inAdaptive =
      this.adaptiveController !== null && this.adaptivePresentedId === question.id;
    const isCorrect = inAdaptive
      ? this.evaluateAdaptiveCorrectness(question, value)
      : this.evaluateCustomCorrectness(question, value);
    this.updateQuestionVariables(question, response, isCorrect);

    // Validate attention check if configured
    this.qualityReport.attention.validate(
      question.id,
      value,
      question.attentionCheck as AttentionCheckConfig | undefined
    );

    // Execute onResponse hook after the response is recorded
    this.scriptExecutor.executeOnResponse(
      question,
      value,
      this.variableEngine,
      this.getResponseMap()
    );

    this.responseCollector.stop();
    await this.clearPresentation();

    // Save-and-continue boundary (E-FLOW-3): persist the resume cursor before advancing.
    this.emitResumeState();

    // Adaptive administration (E-FLOW-1): feed the scored response back to the CAT and let
    // it select the next item (or finalize the block) instead of the linear item advance.
    if (inAdaptive) {
      await this.handleAdaptiveResponse(question, isCorrect === true);
      return;
    }

    this.currentItemIndex += 1;
    await this.showCurrentItem();
  }

  private async handleTimeout(question: Question, onsetTime: number): Promise<void> {
    const timestamp = performance.now();

    const response: Response = {
      id: nanoid(),
      questionId: question.id,
      pageId: this.currentPage?.id,
      timestamp,
      value: null,
      reactionTime: -1,
      stimulusOnsetTime: onsetTime,
      valid: false,
      timedOut: true,
      ...this.iterationFields(),
    };

    this.session.responses.push(response);
    this.updateQuestionVariables(question, response, false);

    await this.clearPresentation();

    // Save-and-continue boundary (E-FLOW-3): a timeout is a committed outcome too.
    this.emitResumeState();

    this.currentItemIndex += 1;
    await this.showCurrentItem();
  }

  /**
   * Iteration provenance to stamp onto a Response being recorded (E-FLOW-4). Empty
   * for a non-loop item, so its Response shape is unchanged. Read from the item
   * currently being presented — one item is active at a time.
   */
  private iterationFields(): { iterationIndex?: number; loopValue?: unknown } {
    const it = this.currentIteration;
    if (!it || it.iterationIndex === null || it.iterationIndex === undefined) return {};
    return { iterationIndex: it.iterationIndex, loopValue: it.loopValue };
  }

  private updateQuestionVariables(
    question: Question,
    response: Response,
    isCorrect: boolean | null
  ): void {
    // Defense-in-depth (FIX-fillout-freeze): a variable-type mismatch on the answer value
    // must NEVER prevent the response from being recorded or the runtime from advancing.
    // inferVariableType now types `${id}_value` so a scalar answer coerces safely, but a
    // mis-typed value variable (e.g. an 'array'/'object' var receiving a scalar) would throw
    // in VariableEngine.validateType and — since this runs inside the fire-and-forget response
    // handler — surface as a silent unhandled rejection that halts navigation. Swallow only the
    // value write; timing/correctness variables below are always numeric/boolean and safe.
    // Loop namespacing (E-FLOW-4): a looped answer is stored under an
    // iteration-scoped prefix (`${id}__${iterationIndex}`) so every pass survives to
    // complete(); for a non-loop item the prefix is the bare id (historical scheme).
    const prefix = iterationVarPrefix(question.id, response.iterationIndex);
    if (prefix !== question.id) {
      // Ensure the iteration-namespaced variables exist before writing — covers the
      // hydrate() replay path, which reaches updateQuestionVariables without having
      // run applyLoopContext (idempotent when already registered on the live path).
      this.registerAnswerVariables(prefix, prefix, this.inferVariableType(question));
    }
    this.writeAnswerVariables(prefix, response, isCorrect);

    // For a looped item ALSO refresh the plain, un-namespaced answer variables
    // (last-iteration wins) so scripts / carry-forward / conditions that key on the
    // bare question id keep resolving to the most recent iteration's answer.
    if (prefix !== question.id) {
      this.writeAnswerVariables(question.id, response, isCorrect);
    }
  }

  /** Write the five answer variables for a (possibly iteration-namespaced) base id. */
  private writeAnswerVariables(base: string, response: Response, isCorrect: boolean | null): void {
    try {
      this.variableEngine.setVariable(`${base}_value`, response.value, 'response');
    } catch (error) {
      console.warn(
        `[runtime] value variable write failed for ${base}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    this.variableEngine.setVariable(`${base}_time`, response.timestamp, 'response');
    this.variableEngine.setVariable(`${base}_rt`, response.reactionTime ?? null, 'response');
    this.variableEngine.setVariable(`${base}_correct`, isCorrect, 'response');
  }

  // ==========================================================================
  // Adaptive item-bank administration (CAT/IRT, E-FLOW-1)
  // ==========================================================================

  /**
   * Enter an adaptive block: build the CAT controller from its calibrated bank, seed a
   * trajectory record (so partial progress is captured even before completion), and hand
   * off to the presentation loop. A misconfigured block (missing / empty bank) is skipped
   * rather than stalling the run.
   */
  private async enterAdaptiveBlock(blockId: string): Promise<void> {
    const block = this.findBlockById(blockId);
    const config = block?.adaptive;
    if (!block || !config || !config.items?.length) {
      this.currentItemIndex += 1;
      await this.showCurrentItem();
      return;
    }

    this.adaptiveBlock = block;
    this.adaptiveController = new AdaptiveController(config.items, {
      maxItems: config.maxItems,
      seThreshold: config.seThreshold,
      exposureControl: config.exposureControl,
      exposureTopK: config.exposureTopK,
    });
    this.adaptivePresentedId = null;

    // Fresh record for this administration (drop any stale one from a prior re-entry).
    const existing = this.adaptiveRecords.findIndex((record) => record.blockId === blockId);
    if (existing >= 0) this.adaptiveRecords.splice(existing, 1);
    this.adaptiveRecords.push({
      blockId,
      itemBankId: config.itemBankId,
      steps: [],
      theta: 0,
      se: this.finiteSE(this.adaptiveController.getEstimate().se),
      itemsAdministered: 0,
      thetaReportVariable: config.thetaReportVariable,
      complete: false,
    });
    this.writeAdaptiveSnapshot();

    await this.presentNextAdaptiveItem();
  }

  /**
   * Present the next CAT-selected item, or finalize the block when the controller's
   * stopping rule has fired / the bank is exhausted / the selected item resolves to no
   * known form question. Adaptive bank items MUST be form-style questions (they route
   * through the overlay + handleCollectedResponse, where the CAT update is wired).
   */
  private async presentNextAdaptiveItem(): Promise<void> {
    const controller = this.adaptiveController;
    if (!controller) return;

    const nextId = controller.isComplete() ? null : controller.nextQuestionId();
    const question = nextId
      ? this.config.questionnaire.questions.find((q) => q.id === nextId)
      : undefined;

    if (!nextId || !question) {
      await this.exitAdaptiveBlock();
      return;
    }

    const metadata = moduleRegistry.get(question.type);
    if (!metadata) {
      console.warn(
        `[adaptive] bank item "${question.id}" has unknown module type "${question.type}" — ending adaptive block`
      );
      await this.exitAdaptiveBlock();
      return;
    }

    this.adaptivePresentedId = question.id;
    this.currentQuestion = question;
    this.currentIteration = null;
    // Reset loop context so a stale {{loopValue}} from an earlier block can't leak in.
    this.applyLoopContext({ question, iterationIndex: null });

    this.config.onQuestionPresented?.({
      questionId: question.id,
      questionType: question.type,
      pageId: this.currentPage?.id,
      pageIndex: this.currentPageIndex,
      itemIndex: this.currentItemIndex,
      category: metadata.category,
      timestamp: performance.now(),
    });

    await this.presentQuestion(question, metadata);
  }

  /**
   * Feed one scored response back into the CAT (E-FLOW-1, step 4c–d): update the ability
   * estimate, mirror it to the `_theta` / `_thetaSE` session variables, append it to the
   * trajectory, then select and present the next item.
   */
  private async handleAdaptiveResponse(question: Question, correct: boolean): Promise<void> {
    const controller = this.adaptiveController;
    if (!controller) {
      this.currentItemIndex += 1;
      await this.showCurrentItem();
      return;
    }

    const estimate = controller.submit(question.id, correct);
    this.writeAdaptiveVariables(estimate);

    const record = this.currentAdaptiveRecord();
    if (record) {
      record.steps.push({
        questionId: question.id,
        correct,
        theta: estimate.theta,
        se: this.finiteSE(estimate.se),
      });
      record.theta = estimate.theta;
      record.se = this.finiteSE(estimate.se);
      record.itemsAdministered = estimate.responsesCount;
    }
    this.writeAdaptiveSnapshot();

    this.adaptivePresentedId = null;
    await this.presentNextAdaptiveItem();
  }

  /**
   * Finalize the active adaptive block: write the final estimate, mark the trajectory
   * record complete, tear down the controller, and advance past the sentinel to the next
   * page item (E-FLOW-1, step 4e).
   */
  private async exitAdaptiveBlock(): Promise<void> {
    const controller = this.adaptiveController;
    if (controller) {
      const estimate = controller.getEstimate();
      this.writeAdaptiveVariables(estimate);
      const record = this.currentAdaptiveRecord();
      if (record) {
        record.theta = estimate.theta;
        record.se = this.finiteSE(estimate.se);
        record.itemsAdministered = estimate.responsesCount;
        record.complete = true;
      }
      this.writeAdaptiveSnapshot();
    }

    this.adaptiveController = null;
    this.adaptiveBlock = null;
    this.adaptivePresentedId = null;

    await this.clearPresentation();
    this.currentItemIndex += 1;
    await this.showCurrentItem();
  }

  /**
   * Mirror the running ability estimate into session variables (E-FLOW-1, step 4d/6):
   * the built-in `_theta` / `_thetaSE` / `_adaptiveItemsAdministered` and, when the block
   * declares one, the researcher-named `thetaReportVariable`. SE is written as a finite
   * value so it round-trips through JSON and the number validator.
   */
  private writeAdaptiveVariables(estimate: CATEstimate): void {
    this.variableEngine.setVariable('_theta', estimate.theta, 'adaptive');
    this.variableEngine.setVariable('_thetaSE', this.finiteSE(estimate.se), 'adaptive');
    this.variableEngine.setVariable(
      '_adaptiveItemsAdministered',
      estimate.responsesCount,
      'adaptive'
    );

    const reportVar = this.adaptiveBlock?.adaptive?.thetaReportVariable;
    if (reportVar) {
      this.registerVariableIfMissing({
        id: reportVar,
        name: reportVar,
        type: 'number',
        scope: 'global',
        defaultValue: 0,
      });
      try {
        this.variableEngine.setVariable(reportVar, estimate.theta, 'adaptive');
      } catch {
        // Non-numeric target with the same name — ignore rather than halt the CAT loop.
      }
    }
  }

  /**
   * Resolve an adaptive item's raw response to the boolean correctness the CAT consumes
   * (E-FLOW-1, step 5). Prefers an explicit per-item scoring key (correctValue /
   * threshold) from the block config, then falls back to the shared custom-correctness
   * formula path so an item that already carries a custom validation rule Just Works.
   */
  private evaluateAdaptiveCorrectness(question: Question, value: DynamicValue): boolean | null {
    const scoring = this.adaptiveBlock?.adaptive?.scoring?.find(
      (rule) => rule.questionId === question.id
    );
    if (scoring) {
      if (scoring.correctValue !== undefined) {
        return this.answersMatch(value, scoring.correctValue);
      }
      if (typeof scoring.threshold === 'number') {
        const numeric = parseNumeric(value);
        return numeric !== null && numeric >= scoring.threshold;
      }
    }
    return this.evaluateCustomCorrectness(question, value);
  }

  /** Loose equality for an adaptive scoring key, coercing by the key's primitive type. */
  private answersMatch(value: unknown, key: string | number | boolean): boolean {
    if (value === key) return true;
    if (typeof key === 'number') {
      const numeric = parseNumeric(value);
      return numeric !== null && numeric === key;
    }
    if (typeof key === 'boolean') {
      return Boolean(value) === key;
    }
    return String(value) === String(key);
  }

  /** The trajectory record for the block currently being administered (last-wins). */
  private currentAdaptiveRecord(): AdaptiveRecord | undefined {
    const id = this.adaptiveBlock?.id;
    if (!id) return undefined;
    for (let i = this.adaptiveRecords.length - 1; i >= 0; i--) {
      if (this.adaptiveRecords[i]!.blockId === id) return this.adaptiveRecords[i];
    }
    return undefined;
  }

  private findBlockById(blockId: string): Block | null {
    for (const page of this.config.questionnaire.pages) {
      for (const block of page.blocks || []) {
        if (block.id === blockId) return block;
      }
    }
    return null;
  }

  /** Clamp a possibly-infinite SE to a finite sentinel for persistence / branching. */
  private finiteSE(se: number): number {
    return Number.isFinite(se) ? se : 999;
  }

  /**
   * Snapshot every adaptive block's trajectory into `session.metadata.custom.adaptive`
   * (E-FLOW-1, step 7) so the offline-first persistence path carries the administered
   * item ids + running theta/SE. Called on every step and at completion; idempotent.
   */
  private writeAdaptiveSnapshot(): void {
    if (this.adaptiveRecords.length === 0) return;
    if (!this.session.metadata) this.session.metadata = {};
    this.session.metadata.custom = {
      ...this.session.metadata.custom,
      adaptive: this.adaptiveRecords.map((record) => ({
        blockId: record.blockId,
        itemBankId: record.itemBankId,
        itemsAdministered: record.itemsAdministered,
        theta: record.theta,
        se: record.se,
        complete: record.complete,
        thetaReportVariable: record.thetaReportVariable,
        administeredItemIds: record.steps.map((step) => step.questionId),
        trajectory: record.steps,
      })),
    };
  }

  private evaluateCustomCorrectness(question: Question, _value: DynamicValue): boolean | null {
    const validation = (question as DynamicValue).validation;
    const customRule = Array.isArray(validation)
      ? validation.find((rule: DynamicValue) => rule.type === 'custom')
      : undefined;

    if (!customRule?.value) {
      return null;
    }

    try {
      const result = this.variableEngine.evaluateFormula(customRule.value);
      return Boolean(result.value);
    } catch {
      return null;
    }
  }

  private evaluateVisibility(
    conditions?: DisplayCondition[] | ConditionalLogic | Array<{ formula: string; target?: string }>
  ): boolean {
    if (!conditions) return true;

    if (!Array.isArray(conditions)) {
      const showFormula = (conditions as ConditionalLogic).show;
      if (!showFormula) return true;
      const result = this.variableEngine.evaluateFormula(showFormula);
      return Boolean(result.value);
    }

    for (const condition of conditions) {
      const formula = (condition as DynamicValue).formula || (condition as DynamicValue).expression;
      if (!formula) continue;

      const target = (condition as DynamicValue).target || 'show';
      const result = Boolean(this.variableEngine.evaluateFormula(formula).value);

      if (target === 'show' && !result) return false;
      if (target === 'hide' && result) return false;
    }

    return true;
  }

  private async handleFlowControl(): Promise<void> {
    const fromPageId = this.currentPage?.id;

    // Structured eligibility screener (E-FLOW-7 / F-20): evaluate the screener attached
    // to the page we are leaving BEFORE any flow rule. A screen-out ends the session in
    // the distinct screened-out state so an ineligible respondent never sees the
    // thank-you screen.
    if (fromPageId && this.screener.hasScreeners) {
      const verdict = this.screener.evaluateAtPage(fromPageId);
      if (!verdict.eligible) {
        this.completeScreenedOut(verdict);
        return;
      }
    }

    const matchingRule = this.findMatchingFlowRule();

    if (matchingRule) {
      if (matchingRule.type === 'terminate') {
        this.recordFlowPath(fromPageId, matchingRule, 'terminate');
        // A `terminate` rule carrying screen-out fields (F-20) is an eligibility
        // screen-out, not a plain early completion — route it to the screened-out
        // state. A bare terminate (no screen-out fields) still completes normally.
        const screenOut = this.screenOutForTerminate(matchingRule);
        if (screenOut) {
          this.completeScreenedOut(screenOut);
        } else {
          this.complete();
        }
        return;
      }

      if (matchingRule.type === 'loop') {
        const executed = this.loopIterations.get(matchingRule.id) || 0;
        const allowed = matchingRule.iterations || 1;

        if (executed < allowed) {
          this.loopIterations.set(matchingRule.id, executed + 1);
          if (matchingRule.target) {
            const targetIndex = resolveFlowTargetPageIndex(
              this.config.questionnaire.pages,
              matchingRule.target
            );
            if (targetIndex >= 0) {
              this.recordFlowPath(fromPageId, matchingRule, targetIndex);
              await this.navigateToPage(targetIndex, this.flowTargetAnchor(matchingRule.target));
              return;
            }
            this.warnUnresolvedFlowTarget(matchingRule);
          }
        }
      }

      if (matchingRule.type === 'skip' || matchingRule.type === 'branch') {
        if (matchingRule.target) {
          const targetIndex = resolveFlowTargetPageIndex(
            this.config.questionnaire.pages,
            matchingRule.target
          );
          if (targetIndex >= 0) {
            this.recordFlowPath(fromPageId, matchingRule, targetIndex);
            await this.navigateToPage(targetIndex, this.flowTargetAnchor(matchingRule.target));
            return;
          }
          this.warnUnresolvedFlowTarget(matchingRule);
        }
      }
    }

    await this.navigateToPage(this.currentPageIndex + 1);
  }

  /**
   * Append the resolved flow transition to `session.metadata.custom.flowPath`
   * (E-FLOW-8, step 9) so the branch a participant actually took is auditable
   * from the persisted session — not just inferable from answers.
   */
  private recordFlowPath(
    fromPageId: string | undefined,
    rule: FlowControl,
    to: number | 'terminate'
  ): void {
    if (!this.session.metadata) this.session.metadata = {};
    const pages = this.config.questionnaire.pages;
    const toPageId = to === 'terminate' ? null : pages[to]?.id ?? null;
    const prior = (this.session.metadata.custom?.flowPath as unknown[]) ?? [];
    this.session.metadata.custom = {
      ...this.session.metadata.custom,
      flowPath: [
        ...prior,
        {
          ruleId: rule.id,
          type: rule.type,
          fromPageId: fromPageId ?? null,
          toPageId,
          terminated: to === 'terminate',
          at: Date.now(),
        },
      ],
    };
  }

  /**
   * When a flow target is a QUESTION id (not a page id), return it so
   * {@link navigateToPage} can anchor the landing on that question within its
   * page (E-FLOW-8, step 6). A page-id target returns `undefined` (land at top).
   */
  private flowTargetAnchor(target: string): string | undefined {
    const isPage = this.config.questionnaire.pages.some((p) => p.id === target);
    return isPage ? undefined : target;
  }

  private warnUnresolvedFlowTarget(rule: FlowControl): void {
    console.warn(
      '[flow] rule %s target %s matches no page or question — falling through to next page',
      rule.id,
      rule.target
    );
  }

  /**
   * Find the flow rule that fires as control leaves the current page (E-FLOW-8).
   *
   * Only rules whose `source` scopes them to the current page are considered,
   * plus global (unset-source) rules — so `from page 3 go to 7` and
   * `from page 5 go to 9` can share a condition yet fire only from their own
   * page. Candidates are ordered exactly as {@link buildFlowGraph} predicts —
   * source-scoped before global, then priority descending, then declaration
   * order — and the first whose condition evaluates truthy wins.
   *
   * A rule's `source` may be a page id or a question id (resolved to its page).
   */
  private findMatchingFlowRule(): FlowControl | null {
    const flow = this.config.questionnaire.flow || [];
    if (flow.length === 0) return null;

    const pages = this.config.questionnaire.pages;
    const currentPageIndex = this.currentPageIndex;

    const candidates: Array<{ rule: FlowControl; scoped: boolean; index: number }> = [];
    flow.forEach((rule, index) => {
      if (!rule.source) {
        candidates.push({ rule, scoped: false, index });
        return;
      }
      // Source-scoped: keep only when it resolves to the page we are leaving.
      const srcIdx = resolveFlowTargetPageIndex(pages, rule.source);
      if (srcIdx === currentPageIndex) {
        candidates.push({ rule, scoped: true, index });
      }
    });

    for (const rule of orderFlowCandidates(candidates)) {
      const condition = rule.condition || 'true';
      const result = Boolean(this.variableEngine.evaluateFormula(condition).value);
      if (result) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Compute the questionnaire's declared subscale scores (E-FEEDBACK-1) and write each
   * one back into the VariableEngine under a namespaced `score.<scaleId>` id. Being in
   * the VariableEngine means the value flows through BOTH consumers with no extra plumbing:
   *   - the statistical-feedback overlay reads `getAllVariables()` at present time, so a
   *     feedback widget can bind a metric to `score.<scaleId>.tScore` / `.percentile`;
   *   - `complete()`'s variable snapshot pushes it into `session.variables`, which the
   *     fillout layer persists offline-first via `OfflineResponsePersistence.saveVariable`.
   *
   * Pure + deterministic (delegates to `scoreScales`), so it is idempotent — safe to call
   * before each feedback panel and again at completion. No-op when no scoring is declared.
   */
  private applyScaleScores(): void {
    const scoring = this.config.questionnaire.settings.scoring;
    if (!scoring || !Array.isArray(scoring.scales) || scoring.scales.length === 0) return;

    // Answer values are addressable by question id: registerQuestionVariables names the
    // `${id}_value` variable `id`, so getAllVariables()[itemId] is that question's answer.
    const allVars = this.variableEngine.getAllVariables();
    const responses: Record<string, number | null> = {};
    for (const scale of scoring.scales) {
      for (const itemId of scale.itemIds) {
        if (!(itemId in responses)) {
          responses[itemId] = parseNumeric(allVars[itemId]);
        }
      }
    }

    for (const result of scoreScales(responses, scoring)) {
      const variableId = `score.${result.scaleId}`;
      // Register lazily (no defaultValue — 'object' can't validate null) then set the value.
      this.registerVariableIfMissing({
        id: variableId,
        name: variableId,
        type: 'object',
        scope: 'global',
      });
      try {
        this.variableEngine.setVariable(
          variableId,
          {
            value: result.value,
            z: result.z,
            tScore: result.tScore,
            stanine: result.stanine,
            percentile: result.percentile,
            band: result.band,
            itemsAnswered: result.itemsAnswered,
            itemsExpected: result.itemsExpected,
          },
          'scoring'
        );
      } catch (error) {
        console.warn(
          `[scoring] failed to set ${variableId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  /**
   * Build a screen-out result from a `terminate` flow rule (F-20) when the author
   * configured any screen-out field, else `undefined` (a plain early-completion
   * terminate). The reason falls back to a machine-readable default so a screen-out
   * flagged by message/redirect alone is still recorded as one.
   */
  private screenOutForTerminate(rule: FlowControl): ScreenOutResult | undefined {
    const reason = rule.screenOutReason?.trim();
    const message = rule.screenOutMessage?.trim();
    const redirectUrl = rule.screenOutRedirectUrl?.trim();
    if (!reason && !message && !redirectUrl) return undefined;
    return {
      eligible: false,
      ruleId: rule.id,
      reason: reason || 'ineligible',
      message: message || undefined,
      redirectUrl: redirectUrl || undefined,
    };
  }

  /**
   * End the session as an eligibility SCREEN-OUT (F-20) rather than a normal
   * completion: the structured outcome is stamped onto `session.metadata.screenOut`
   * (via {@link complete}) so the fillout page routes to the screened-out screen.
   */
  private completeScreenedOut(result: ScreenOutResult): void {
    this.complete('completed', result);
  }

  private complete(
    status: 'completed' | 'timed_out' = 'completed',
    screenOut?: ScreenOutResult
  ): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    // Deadline scopes are all resolved once the session ends (E-FLOW-5).
    this.timers.clearAll();
    this.session.status = status;
    this.session.endTime = Date.now();

    // Finalize speeder timing for the last page
    this.qualityReport.speeder.leavePage();

    // Run flatline detection across blocks
    this.runFlatlineDetection();

    // Store quality report in session metadata
    if (!this.session.metadata) {
      this.session.metadata = {};
    }
    this.session.metadata.qualityReport = this.qualityReport.generate() as unknown as Record<string, unknown>;

    // Eligibility screen-out (F-20): the presence of this blob is what distinguishes a
    // screened-out session from a natural completion downstream (fillout page + analytics).
    if (screenOut) {
      this.session.metadata.screenOut = ScreenerController.metadataFor(screenOut).screenOut;
    }

    // Compute subscale / normative scores (E-FEEDBACK-1) BEFORE the snapshot so the
    // namespaced `score.<scaleId>` values are captured into session.variables and persisted.
    this.applyScaleScores();

    // Finalize the adaptive-block trajectory snapshot (E-FLOW-1, step 7) so a session that
    // ends mid-CAT (e.g. survey timeout) still carries the administered items + theta/SE.
    this.writeAdaptiveSnapshot();

    const allVariables = this.variableEngine.getAllVariables();
    for (const [variableId, value] of Object.entries(allVariables)) {
      this.session.variables.push({
        variableId,
        value,
        timestamp: Date.now(),
      });
    }

    this.responseCollector.stop();
    this.renderer?.stop();

    this.config.onComplete?.(this.session);
  }

  private runFlatlineDetection(): void {
    for (const page of this.config.questionnaire.pages) {
      for (const block of page.blocks || []) {
        const blockQuestionIds = new Set(block.questions || []);
        const blockResponses = this.session.responses.filter((r) =>
          blockQuestionIds.has(r.questionId)
        );

        // Loop reconciliation (E-FLOW-4): analyze each iteration as its own block
        // instance so a straight-lined pass is flagged per-iteration rather than
        // diluted by mixing iterations (and so a legitimate roster where every pass
        // shares an answer isn't flagged as one giant flatline). Non-loop responses
        // (iterationIndex undefined) group under the bare block id, unchanged.
        const byIteration = new Map<number | 'none', unknown[]>();
        for (const r of blockResponses) {
          const key = r.iterationIndex ?? 'none';
          const bucket = byIteration.get(key) ?? [];
          bucket.push(r.value);
          byIteration.set(key, bucket);
        }

        for (const [key, values] of byIteration) {
          if (values.length === 0) continue;
          const blockId = key === 'none' ? block.id : `${block.id}__${key}`;
          this.qualityReport.flatliner.analyzeBlock(blockId, values);
        }
      }
    }
  }

  private scheduleAutoAdvance(delayMs: number, callback: () => Promise<void>): void {
    if (this.autoAdvanceTimeoutId !== null) {
      clearTimeout(this.autoAdvanceTimeoutId);
      this.autoAdvanceTimeoutId = null;
    }

    this.autoAdvanceTimeoutId = window.setTimeout(
      () => {
        this.autoAdvanceTimeoutId = null;
        void callback();
      },
      Math.max(0, delayMs)
    );
  }

  private cancelCurrentExecution(): void {
    if (this.autoAdvanceTimeoutId !== null) {
      clearTimeout(this.autoAdvanceTimeoutId);
      this.autoAdvanceTimeoutId = null;
    }

    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    this.clearPageTimer();
    // Guard against a question deadline firing after the item was torn down (E-FLOW-5,
    // step 10). The survey / page scopes are managed by their own arm/clear paths.
    this.timers.clear('question');
    this.activeQuestionWarnAtMs = undefined;
    this.config.formHost?.updateTimer?.(null);
    this.responseCollector.stop();
    this.config.formHost?.clear();
    this.renderer?.clearRenderables();
  }

  private clearPageTimer(): void {
    if (this.pageTimerIntervalId !== null) {
      clearInterval(this.pageTimerIntervalId);
      this.pageTimerIntervalId = null;
    }
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  /**
   * Resolve carry-forward configuration for a question, returning a modified
   * clone if carry-forward is configured, or the original question if not.
   */
  private resolveCarryForwardForQuestion(question: Question): Question {
    const cfConfig = (question as DynamicValue).carryForward as CarryForwardConfig | undefined;
    if (!cfConfig?.sourceQuestionId || !cfConfig.mode) {
      return question;
    }

    const responseMap = this.getResponseMap();
    const result = resolveCarryForward(
      cfConfig,
      responseMap,
      this.config.questionnaire.questions
    );

    // Nothing resolved (source not yet answered)
    if (
      result.defaultValue === undefined &&
      result.options === undefined &&
      result.textContent === undefined
    ) {
      return question;
    }

    return applyCarryForward(question, result, cfConfig);
  }

  /**
   * Build a map of questionId -> response value from all collected session responses.
   */
  private getResponseMap(): Record<string, DynamicValue> {
    const map: Record<string, DynamicValue> = {};
    for (const response of this.session.responses) {
      map[response.questionId] = response.value;
    }
    return map;
  }
}
