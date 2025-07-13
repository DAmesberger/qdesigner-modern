import type { 
  Questionnaire, 
  Question, 
  Page,
  Variable,
  FlowControl,
  QuestionVariable,
  QuestionnaireSession, 
  Response,
  VariableState 
} from '$lib/shared';
import { VariableEngine } from '$lib/scripting-engine';
import { WebGLRenderer } from '$lib/renderer';
import { ResourceManager } from '../resources/ResourceManager';
import { MediaValidator } from '../validation/MediaValidator';
import { QuestionPresenter } from './QuestionPresenter';
import { ResponseCollector } from './ResponseCollector';
import { nanoid } from 'nanoid';

export interface RuntimeConfig {
  canvas: HTMLCanvasElement;
  questionnaire: Questionnaire;
  participantId?: string;
  onComplete?: (session: QuestionnaireSession) => void;
  onProgress?: (pageIndex: number, totalPages: number) => void;
}

export class QuestionnaireRuntime {
  private config: RuntimeConfig;
  private session: QuestionnaireSession;
  private variableEngine: VariableEngine;
  private renderer: WebGLRenderer;
  private resourceManager: ResourceManager;
  private questionPresenter: QuestionPresenter;
  private responseCollector: ResponseCollector;
  
  private currentPageIndex: number = 0;
  private currentQuestionIndex: number = 0;
  private currentPage: Page | null = null;
  private currentQuestion: Question | null = null;
  
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  
  constructor(config: RuntimeConfig) {
    this.config = config;
    
    // Initialize session
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
        refreshRate: (screen as any).refreshRate || 60,
        webGLSupported: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: navigator.language
      }
    };
    
    // Initialize components
    this.variableEngine = new VariableEngine();
    this.renderer = new WebGLRenderer({
      canvas: config.canvas,
      targetFPS: config.questionnaire.settings.webgl?.targetFPS || 60
    });
    this.resourceManager = new ResourceManager();
    this.questionPresenter = new QuestionPresenter(this.renderer, this.resourceManager);
    this.responseCollector = new ResponseCollector();
    
    // Initialize variables
    this.initializeVariables();
  }
  
  /**
   * Initialize all questionnaire variables
   */
  private initializeVariables(): void {
    // Register questionnaire variables
    for (const variable of this.config.questionnaire.variables) {
      this.variableEngine.registerVariable(variable);
    }
    
    // Create automatic variables for each question
    for (const question of this.config.questionnaire.questions) {
      this.createQuestionVariables(question);
    }
    
    // System variables
    this.variableEngine.registerVariable({
      id: '_participantId',
      name: 'participantId',
      type: 'string',
      scope: 'global',
      defaultValue: this.config.participantId || ''
    });
    
    this.variableEngine.registerVariable({
      id: '_currentPage',
      name: 'currentPage',
      type: 'number',
      scope: 'global',
      defaultValue: 1
    });
    
    this.variableEngine.registerVariable({
      id: '_totalPages',
      name: 'totalPages',
      type: 'number',
      scope: 'global',
      defaultValue: this.config.questionnaire.pages.length
    });
  }
  
  /**
   * Create automatic variables for a question
   */
  private createQuestionVariables(question: Question): void {
    const baseName = question.id;
    
    // Main response variable
    this.variableEngine.registerVariable({
      id: `${baseName}_value`,
      name: baseName,
      type: this.getVariableTypeForQuestion(question),
      scope: 'global',
      defaultValue: null
    });
    
    // Time variable (when answered)
    this.variableEngine.registerVariable({
      id: `${baseName}_time`,
      name: `${baseName}_time`,
      type: 'time',
      scope: 'global',
      defaultValue: null
    });
    
    // Delta variable (reaction time)
    this.variableEngine.registerVariable({
      id: `${baseName}_delta`,
      name: `${baseName}_delta`,
      type: 'reaction_time',
      scope: 'global',
      defaultValue: null
    });
    
    // Correct variable
    this.variableEngine.registerVariable({
      id: `${baseName}_correct`,
      name: `${baseName}_correct`,
      type: 'boolean',
      scope: 'global',
      defaultValue: null
    });
    
    // Stimulus onset time (internal)
    this.variableEngine.registerVariable({
      id: `${baseName}_onset`,
      name: `${baseName}_onset`,
      type: 'stimulus_onset',
      scope: 'local',
      defaultValue: null
    });
  }
  
  /**
   * Get appropriate variable type for question response
   */
  private getVariableTypeForQuestion(question: Question): Variable['type'] {
    switch (question.responseType.type) {
      case 'number':
      case 'scale':
        return 'number';
      case 'text':
      case 'single':
      case 'keypress':
        return 'string';
      case 'multiple':
        return 'array';
      default:
        return 'string';
    }
  }
  
  /**
   * Preload all resources
   */
  public async preload(onProgress?: (progress: number) => void): Promise<void> {
    // First, validate all media URLs are accessible
    const validator = new MediaValidator();
    const validationResult = await validator.validateQuestionnaire(this.config.questionnaire);
    
    if (!validationResult.valid) {
      // Throw error with detailed information about what failed
      throw new Error(MediaValidator.formatErrors(validationResult));
    }
    
    // If validation passes, proceed with resource loading
    // Scan questionnaire for resources
    await this.resourceManager.scanQuestionnaire(this.config.questionnaire);
    
    // Set WebGL context
    const gl = this.renderer.getContext();
    this.resourceManager.setWebGLContext(gl);
    
    // Preload all resources (this will throw if any fail to load)
    await this.resourceManager.preloadAll((progress) => {
      onProgress?.(progress.percentage);
    });
  }
  
  /**
   * Start questionnaire execution
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.renderer.start();
    
    // Navigate to first page
    await this.navigateToPage(0);
  }
  
  /**
   * Navigate to a specific page
   */
  private async navigateToPage(pageIndex: number): Promise<void> {
    if (pageIndex < 0 || pageIndex >= this.config.questionnaire.pages.length) {
      this.complete();
      return;
    }
    
    this.currentPageIndex = pageIndex;
    this.currentPage = this.config.questionnaire.pages[pageIndex] || null;
    this.currentQuestionIndex = 0;
    
    // Update page variable
    this.variableEngine.setVariable('_currentPage', pageIndex + 1, 'system');
    
    // Check page conditions
    if (this.currentPage && !this.evaluateConditions(this.currentPage.conditions)) {
      // Skip this page
      await this.navigateToPage(pageIndex + 1);
      return;
    }
    
    // Progress callback
    this.config.onProgress?.(pageIndex, this.config.questionnaire.pages.length);
    
    // Show first question on page
    await this.showNextQuestion();
  }
  
  /**
   * Show next question on current page
   */
  private async showNextQuestion(): Promise<void> {
    if (!this.currentPage) return;
    
    const questionIds = this.currentPage?.questions ?? [];
    if (this.currentQuestionIndex >= questionIds.length) {
      // Page complete, check flow control
      await this.handleFlowControl();
      return;
    }
    
    // Get question
    const questionId = questionIds[this.currentQuestionIndex];
    if (!questionId) {
      this.currentQuestionIndex++;
      await this.showNextQuestion();
      return;
    }
    this.currentQuestion = this.config.questionnaire.questions.find(q => q.id === questionId) || null;
    
    if (!this.currentQuestion) {
      this.currentQuestionIndex++;
      await this.showNextQuestion();
      return;
    }
    
    // Check question conditions
    if (!this.evaluateConditions(this.currentQuestion.conditions)) {
      this.currentQuestionIndex++;
      await this.showNextQuestion();
      return;
    }
    
    // Present question
    await this.presentQuestion(this.currentQuestion);
  }
  
  /**
   * Present a question and collect response
   */
  private async presentQuestion(question: Question): Promise<void> {
    // Record stimulus onset time
    const onsetTime = performance.now();
    this.variableEngine.setVariable(`${question.id}_onset`, onsetTime, 'system');
    
    // Present question using WebGL renderer
    await this.questionPresenter.present(question, this.variableEngine);
    
    // Check if this is a 'none' response type (instruction/display only)
    if (question.responseType.type === 'none') {
      // Auto-advance after delay if specified
      const delay = question.responseType.delay || 0;
      if (question.responseType.autoAdvance !== false) {
        setTimeout(() => {
          this.handleResponse(question, 'auto-advanced', onsetTime);
        }, delay);
      }
      return;
    }
    
    // Set up response collection for questions that expect responses
    this.responseCollector.setup(question, {
      onResponse: (value: any) => this.handleResponse(question, value, onsetTime),
      onTimeout: () => this.handleTimeout(question, onsetTime)
    });
    
    // Start response collection
    this.responseCollector.start();
  }
  
  /**
   * Handle question response
   */
  private async handleResponse(question: Question, value: any, onsetTime: number): Promise<void> {
    const responseTime = performance.now();
    const reactionTime = responseTime - onsetTime;
    
    // Create response record
    const response: Response = {
      id: nanoid(),
      questionId: question.id,
      pageId: this.currentPage?.id,
      timestamp: responseTime,
      value: value,
      reactionTime: reactionTime,
      stimulusOnsetTime: onsetTime,
      valid: true
    };
    
    // Add to session only if not a 'none' response type
    if (question.responseType.type !== 'none') {
      this.session.responses.push(response);
    }
    
    // Update question variables
    this.variableEngine.setVariable(`${question.id}_value`, value, 'response');
    this.variableEngine.setVariable(`${question.id}_time`, responseTime, 'response');
    this.variableEngine.setVariable(`${question.id}_delta`, reactionTime, 'response');
    
    // Evaluate correctness if formula provided
    if (question.validation?.find(v => v.type === 'custom')) {
      const correctFormula = question.validation.find(v => v.type === 'custom')?.value;
      if (correctFormula) {
        const result = this.variableEngine.evaluateFormula(correctFormula);
        this.variableEngine.setVariable(`${question.id}_correct`, result.value || false, 'response');
      }
    }
    
    // Update any custom variables defined for this question
    if (question.variables) {
      for (const qVar of question.variables) {
        this.updateQuestionVariable(qVar, response);
      }
    }
    
    // Stop response collection
    this.responseCollector.stop();
    
    // Clear presentation
    await this.questionPresenter.clear();
    
    // Move to next question
    this.currentQuestionIndex++;
    await this.showNextQuestion();
  }
  
  /**
   * Handle response timeout
   */
  private async handleTimeout(question: Question, onsetTime: number): Promise<void> {
    // Record as missing response
    const response: Response = {
      id: nanoid(),
      questionId: question.id,
      pageId: this.currentPage?.id,
      timestamp: performance.now(),
      value: null,
      reactionTime: -1,
      stimulusOnsetTime: onsetTime,
      valid: false
    };
    
    this.session.responses.push(response);
    
    // Update variables with null/missing
    this.variableEngine.setVariable(`${question.id}_value`, null, 'timeout');
    this.variableEngine.setVariable(`${question.id}_time`, null, 'timeout');
    this.variableEngine.setVariable(`${question.id}_delta`, null, 'timeout');
    this.variableEngine.setVariable(`${question.id}_correct`, false, 'timeout');
    
    // Move to next question
    this.currentQuestionIndex++;
    await this.showNextQuestion();
  }
  
  /**
   * Update custom question variables
   */
  private updateQuestionVariable(qVar: QuestionVariable, response: Response): void {
    let value: any;
    
    switch (qVar.source) {
      case 'response':
        value = response.value;
        break;
      case 'reaction_time':
        value = response.reactionTime;
        break;
      case 'stimulus_onset':
        value = response.stimulusOnsetTime;
        break;
      case 'custom':
        if (qVar.transform) {
          const result = this.variableEngine.evaluateFormula(qVar.transform);
          value = result.value;
        }
        break;
    }
    
    if (value !== undefined) {
      this.variableEngine.setVariable(qVar.variableId, value, 'question');
    }
  }
  
  /**
   * Evaluate display conditions
   */
  private evaluateConditions(conditions?: Array<{formula: string, action: string}>): boolean {
    if (!conditions || conditions.length === 0) return true;
    
    for (const condition of conditions) {
      const result = this.variableEngine.evaluateFormula(condition.formula);
      const conditionMet = !!result.value;
      
      if (condition.action === 'show' && !conditionMet) return false;
      if (condition.action === 'hide' && conditionMet) return false;
    }
    
    return true;
  }
  
  /**
   * Handle flow control after page completion
   */
  private async handleFlowControl(): Promise<void> {
    // Check for flow control rules
    const flowRules = this.config.questionnaire.flow.filter(f => 
      f.type === 'branch' && this.evaluateConditions([{formula: f.condition || 'true', action: 'show'}])
    );
    
    if (flowRules.length > 0 && flowRules[0]) {
      // Follow first matching branch
      const targetPageId = flowRules[0].target;
      const targetIndex = this.config.questionnaire.pages.findIndex(p => p.id === targetPageId);
      
      if (targetIndex !== -1) {
        await this.navigateToPage(targetIndex);
        return;
      }
    }
    
    // Default: next page
    await this.navigateToPage(this.currentPageIndex + 1);
  }
  
  /**
   * Complete questionnaire
   */
  private complete(): void {
    this.isRunning = false;
    this.session.endTime = Date.now();
    this.session.status = 'completed';
    
    // Save final variable states
    const allVars = this.variableEngine.getAllVariables();
    for (const [name, value] of Object.entries(allVars)) {
      this.session.variables.push({
        variableId: name,
        value: value,
        timestamp: Date.now()
      });
    }
    
    // Stop components
    this.renderer.stop();
    this.responseCollector.stop();
    
    // Callback
    this.config.onComplete?.(this.session);
  }
  
  /**
   * Pause execution
   */
  public pause(): void {
    this.isPaused = true;
    this.renderer.stop();
    this.responseCollector.pause();
  }
  
  /**
   * Resume execution
   */
  public resume(): void {
    this.isPaused = false;
    this.renderer.start();
    this.responseCollector.resume();
  }
  
  /**
   * Stop execution
   */
  public stop(): void {
    this.isRunning = false;
    this.session.status = 'abandoned';
    this.session.endTime = Date.now();
    
    this.renderer.stop();
    this.responseCollector.stop();
    this.resourceManager.dispose();
  }
  
  /**
   * Navigate back
   */
  public async navigateBack(): Promise<void> {
    if (this.config.questionnaire.settings.allowBackNavigation && this.currentPageIndex > 0) {
      await this.navigateToPage(this.currentPageIndex - 1);
    }
  }
  
  /**
   * Get current progress
   */
  public getProgress(): { current: number; total: number; percentage: number } {
    const total = this.config.questionnaire.pages.length;
    const current = this.currentPageIndex + 1;
    
    return {
      current,
      total,
      percentage: (current / total) * 100
    };
  }
}