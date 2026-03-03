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
import { VariableEngine } from '$lib/scripting-engine';
import { WebGLRenderer } from '$lib/renderer';
import { ResourceManager } from '../resources/ResourceManager';
import { MediaValidator } from '../validation/MediaValidator';
import { QuestionPresenter } from './QuestionPresenter';
import { ResponseCollector, type ResponseCaptureMetadata } from './ResponseCollector';
import { BlockRandomizer } from './BlockRandomizer';
import { ScriptExecutor } from './ScriptExecutor';
import { ConditionAssigner, getBlockOrder } from '../experimental';
import type { ExperimentalDesignConfig } from '$lib/shared';
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
  private readonly renderer: WebGLRenderer;
  private readonly resourceManager: ResourceManager;
  private readonly questionPresenter: QuestionPresenter;
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
    this.renderer = new WebGLRenderer({
      canvas: config.canvas,
      targetFPS: config.questionnaire.settings.webgl?.targetFPS || 60,
      antialias: config.questionnaire.settings.webgl?.antialias ?? false,
      vsync: true,
    });
    this.resourceManager = new ResourceManager();
    this.questionPresenter = new QuestionPresenter(this.renderer, this.resourceManager);
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

  public async preload(onProgress?: (progress: number) => void): Promise<void> {
    const validator = new MediaValidator();
    const validationResult = await validator.validateQuestionnaire(this.config.questionnaire);

    if (!validationResult.valid) {
      throw new Error(MediaValidator.formatErrors(validationResult));
    }

    await this.resourceManager.scanQuestionnaire(this.config.questionnaire);
    this.resourceManager.setWebGLContext(this.renderer.getContext());

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
    this.renderer.start();

    await this.navigateToPage(0);
  }

  public pause(): void {
    if (!this.isRunning || this.isPaused) return;

    this.isPaused = true;
    this.renderer.stop();
    this.responseCollector.pause();
  }

  public resume(): void {
    if (!this.isRunning || !this.isPaused) return;

    this.isPaused = false;
    this.renderer.start();
    this.responseCollector.resume();
  }

  public stop(): void {
    this.isRunning = false;
    this.isPaused = false;

    this.cancelCurrentExecution();

    if (this.session.status === 'in_progress') {
      this.session.status = 'abandoned';
      this.session.endTime = Date.now();
    }

    this.responseCollector.stop();
    this.renderer.stop();
    this.resourceManager.dispose();

    for (const runtime of this.questionRuntimeCache.values()) {
      runtime.teardown();
    }
    this.questionRuntimeCache.clear();
    this.scriptExecutor.clearCache();
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
      console.warn(`Unknown module type: ${item.type}`);
      this.currentItemIndex += 1;
      await this.showCurrentItem();
      return;
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

    await this.questionPresenter.present(question, this.variableEngine);

    const responseType = (question as DynamicValue).responseType;
    if (responseType?.type === 'none') {
      const delay = responseType.delay || 0;
      this.scheduleAutoAdvance(delay, async () => {
        await this.handleCollectedResponse(question, onsetTime, 'auto-advanced', {
          source: 'programmatic',
          timestamp: performance.now(),
          responseTimeMs: Math.max(0, performance.now() - onsetTime),
        });
      });
      return;
    }

    this.responseCollector.setup(question, {
      onResponse: (value, responseMetadata) => {
        void this.handleCollectedResponse(question, onsetTime, value, responseMetadata);
      },
      onTimeout: () => {
        void this.handleTimeout(question, onsetTime);
      },
      eventTarget: document,
      pointerTarget: this.config.canvas,
      isResponseAllowed: () => this.isRunning && !this.isPaused,
    });

    this.responseCollector.start();
  }

  private async presentNonInteractiveItem(
    question: Question,
    _metadata: ModuleMetadata
  ): Promise<void> {
    // Execute onMount hook for non-interactive items too (e.g. instructions with scripts)
    this.scriptExecutor.executeOnMount(question, this.variableEngine, this.getResponseMap());

    await this.questionPresenter.presentModular(question as DynamicValue, this.variableEngine);

    const timing = (question as DynamicValue).timing;
    const duration = timing?.duration || (question as DynamicValue).displayDuration || 2500;
    const autoAdvance = (question as DynamicValue).autoAdvance !== false;

    if (!autoAdvance) {
      return;
    }

    this.scheduleAutoAdvance(duration, async () => {
      await this.questionPresenter.clear();
      this.currentItemIndex += 1;
      await this.showCurrentItem();
    });
  }

  private createQuestionRuntimeContext(question: Question): QuestionRuntimeContext {
    this.currentAbortController = new AbortController();

    return {
      question,
      questionnaire: this.config.questionnaire,
      canvas: this.config.canvas,
      renderer: this.renderer,
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
    const reactionTime = runtimeResult.reactionTimeMs ?? Math.max(0, timestamp - onsetTime);

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

    await this.questionPresenter.clear();

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
    const reactionTime = responseMetadata?.responseTimeMs ?? Math.max(0, timestamp - onsetTime);

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
    await this.questionPresenter.clear();

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

    await this.questionPresenter.clear();

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

  private evaluateCustomCorrectness(question: Question, value: DynamicValue): boolean | null {
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
            const targetIndex = this.config.questionnaire.pages.findIndex(
              (page) => page.id === matchingRule.target
            );
            if (targetIndex >= 0) {
              await this.navigateToPage(targetIndex);
              return;
            }
          }
        }
      }

      if (matchingRule.type === 'skip' || matchingRule.type === 'branch') {
        if (matchingRule.target) {
          const targetIndex = this.config.questionnaire.pages.findIndex(
            (page) => page.id === matchingRule.target
          );
          if (targetIndex >= 0) {
            await this.navigateToPage(targetIndex);
            return;
          }
        }
      }
    }

    await this.navigateToPage(this.currentPageIndex + 1);
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
    this.renderer.stop();

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

    this.responseCollector.stop();
    this.renderer.clearRenderables();
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
