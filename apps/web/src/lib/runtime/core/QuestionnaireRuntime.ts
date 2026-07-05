import type {
  Questionnaire,
  Question,
  Page,
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
import { buildModuleRuntimeConfig } from './moduleConfigAdapter';
import { BlockRandomizer } from './BlockRandomizer';
import { computeReactionTimeMs } from './reactionTiming';
import { resolveFlowTargetPageIndex } from './flowTarget';
import { ScriptExecutor } from './ScriptExecutor';
import { ConditionAssigner, getBlockOrder } from '../experimental';
import { QualityReport } from '../quality/QualityReport';
import type { AttentionCheckConfig } from '../quality/AttentionCheck';
import { resolveCarryForward, applyCarryForward } from './CarryForward';
import type { CarryForwardConfig } from '$lib/shared';
import { nanoid } from 'nanoid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime state handles heterogeneous question data
type DynamicValue = any;

export interface RuntimeConfig {
  canvas: HTMLCanvasElement;
  questionnaire: Questionnaire;
  participantId?: string;
  participantNumber?: number;
  conditionGroupCounts?: number[];
  /**
   * Optional HTML-overlay host. When supplied, form-style questions (and
   * instruction/display items) are rendered by mounting their per-module runtime
   * Svelte component into the overlay rather than via WebGL text (ADR 0018).
   * Reaction-time paradigms always stay on the WebGL path.
   */
  formHost?: FormQuestionHost;
  onComplete?: (session: QuestionnaireSession) => void;
  onProgress?: (pageIndex: number, totalPages: number) => void;
  onQuestionPresented?: (event: QuestionPresentedEvent) => void;
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

  private currentPageIndex = 0;
  private currentItemIndex = 0;
  private currentPage: Page | null = null;
  private currentQuestion: Question | null = null;
  private currentPageItems: Question[] = [];

  private isRunning = false;
  private isPaused = false;
  private preloaded = false;

  private currentAbortController: AbortController | null = null;
  private autoAdvanceTimeoutId: number | null = null;
  private pageTimerIntervalId: ReturnType<typeof setInterval> | null = null;

  private readonly questionRuntimeCache = new Map<string, IQuestionRuntime>();
  private readonly loopIterations = new Map<string, number>();

  private assignedCondition: string | null = null;
  private conditionBlockOrder: number[] | null = null;

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
    });

    this.initializeVariables();
    this.initializeExperimentalDesign();
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

    await this.navigateToPage(0);
  }

  public pause(): void {
    if (!this.isRunning || this.isPaused) return;

    this.isPaused = true;
    this.renderer?.stop();
    this.responseCollector.pause();
  }

  public resume(): void {
    if (!this.isRunning || !this.isPaused) return;

    this.isPaused = false;
    this.renderer?.start();
    this.responseCollector.resume();
  }

  public stop(): void {
    this.isRunning = false;
    this.isPaused = false;

    this.cancelCurrentExecution();
    this.clearPageTimer();

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
  }

  private initializeExperimentalDesign(): void {
    const design = this.config.questionnaire.settings.experimentalDesign;
    if (!design || design.conditions.length === 0) return;

    const participantNumber = this.config.participantNumber ?? 0;

    // Assign condition
    const assigner = new ConditionAssigner(
      design.conditions,
      design.assignmentStrategy,
      design.seed
    );
    const assignment = assigner.assign(participantNumber, this.config.conditionGroupCounts);
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
    const base = question.id;
    const responseType = this.inferVariableType(question);

    this.registerVariableIfMissing({
      id: `${base}_value`,
      name: base,
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

    if (!responseTypeKind) {
      return 'object';
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

  private async navigateToPage(pageIndex: number): Promise<void> {
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
        const timerInterval = 1000; // Default: 1 second
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

    this.currentPageItems = this.getPageItems();

    this.config.onProgress?.(pageIndex + 1, this.config.questionnaire.pages.length);
    await this.showCurrentItem();
  }

  private getPageItems(): Question[] {
    if (!this.currentPage) return [];

    const page = this.applyExperimentalDesignToPage(this.currentPage);

    const questionMap = new Map(
      this.config.questionnaire.questions.map((question) => [question.id, question])
    );
    const orderedIds = this.blockRandomizer.randomizePage(page, questionMap);

    return orderedIds
      .map((id) => questionMap.get(id))
      .filter((question): question is Question => Boolean(question))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
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

    let item = this.currentPageItems[this.currentItemIndex];
    if (!item) {
      await this.handleFlowControl();
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
    const cfInitialValue = (question as DynamicValue)._carryForwardInitialValue;
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

    // Hybrid render (ADR 0018): mount the module's runtime Svelte component into the
    // HTML overlay so instruction / display / analytics items are actually visible.
    // Slice 5.1 extended this from the `instruction` category alone to also cover
    // `display` / `analytics` items (bar-chart, statistical-feedback) — previously the
    // WebGL presenter rasterized them into a texture nothing drew, so they were invisible.
    const item = question as DynamicValue;
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
    const timing = item.timing;
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

    const item = question as DynamicValue;
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
  }

  private clearPresentation(): void {
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

    const response: Response = {
      id: nanoid(),
      questionId: question.id,
      pageId: this.currentPage?.id,
      timestamp,
      value,
      reactionTime,
      stimulusOnsetTime: onsetTime,
      valid: validationResult.valid,
      metadata: responseMetadata ? { firstInteraction: responseMetadata.responseTimeMs } : undefined,
    };

    this.session.responses.push(response);

    const isCorrect = this.evaluateCustomCorrectness(question, value);
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
    };

    this.session.responses.push(response);
    this.updateQuestionVariables(question, response, false);

    await this.clearPresentation();

    this.currentItemIndex += 1;
    await this.showCurrentItem();
  }

  private updateQuestionVariables(
    question: Question,
    response: Response,
    isCorrect: boolean | null
  ): void {
    this.variableEngine.setVariable(`${question.id}_value`, response.value, 'response');
    this.variableEngine.setVariable(`${question.id}_time`, response.timestamp, 'response');
    this.variableEngine.setVariable(`${question.id}_rt`, response.reactionTime ?? null, 'response');
    this.variableEngine.setVariable(`${question.id}_correct`, isCorrect, 'response');
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
    const matchingRule = this.findMatchingFlowRule();

    if (matchingRule) {
      if (matchingRule.type === 'terminate') {
        this.complete();
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
              await this.navigateToPage(targetIndex);
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
            await this.navigateToPage(targetIndex);
            return;
          }
          this.warnUnresolvedFlowTarget(matchingRule);
        }
      }
    }

    await this.navigateToPage(this.currentPageIndex + 1);
  }

  private warnUnresolvedFlowTarget(rule: FlowControl): void {
    console.warn(
      '[flow] rule %s target %s matches no page or question — falling through to next page',
      rule.id,
      rule.target
    );
  }

  private findMatchingFlowRule(): FlowControl | null {
    for (const rule of this.config.questionnaire.flow || []) {
      const condition = rule.condition || 'true';
      const result = Boolean(this.variableEngine.evaluateFormula(condition).value);
      if (result) {
        return rule;
      }
    }

    return null;
  }

  private complete(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.session.status = 'completed';
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
        const blockValues = this.session.responses
          .filter((r) => blockQuestionIds.has(r.questionId))
          .map((r) => r.value);

        if (blockValues.length > 0) {
          this.qualityReport.flatliner.analyzeBlock(block.id, blockValues);
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
