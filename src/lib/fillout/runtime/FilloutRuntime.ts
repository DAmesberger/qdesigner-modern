import { ResponsePersistenceService } from '../services/ResponsePersistenceService';
import { SessionManagementService } from '../services/SessionManagementService';
import { QuestionnaireRuntime } from '$lib/runtime/core/QuestionnaireRuntime';
import { WebGLRenderer } from '$lib/renderer';
import { VariableEngine } from '$lib/scripting-engine';
import type { Questionnaire, Question, Response, Page, QuestionnaireSession } from '$lib/shared';
import { nanoid } from 'nanoid';

export interface FilloutRuntimeConfig {
	canvas: HTMLCanvasElement;
	questionnaire: Questionnaire;
	sessionId: string;
	participantId?: string;
	enableOfflineSync?: boolean;
	syncInterval?: number;
	onComplete?: (session: QuestionnaireSession) => void;
	onProgress?: (pageIndex: number, totalPages: number) => void;
	onSessionUpdate?: (progress: number) => void;
}

export class FilloutRuntime {
	private persistenceService: ResponsePersistenceService;
	private sessionId: string;
	private totalQuestions: number;
	private completedQuestions: number = 0;
	private onSessionUpdate?: (progress: number) => void;

	private runtime: QuestionnaireRuntime;
	private variableEngine: VariableEngine;
	private responses: Response[] = [];
	private currentQuestion: Question | null = null;
	private currentPage: Page | null = null;
	
	constructor(private config: FilloutRuntimeConfig) {
		this.sessionId = config.sessionId;
		this.onSessionUpdate = config.onSessionUpdate;
		
		// Calculate total questions
		this.totalQuestions = config.questionnaire.questions.length;
		
		// Initialize persistence service
		this.persistenceService = new ResponsePersistenceService({
			sessionId: config.sessionId,
			enableOffline: config.enableOfflineSync !== false,
			syncInterval: config.syncInterval || 5000
		});
		
		// Initialize variable engine
		this.variableEngine = new VariableEngine();
		
		// Create wrapped config with our response handlers
		const wrappedConfig = {
			...config,
			onComplete: async (session: QuestionnaireSession) => {
				await this.handleComplete(session);
			},
			onProgress: (pageIndex: number, totalPages: number) => {
				if (config.onProgress) {
					config.onProgress(pageIndex, totalPages);
				}
				this.updatePageProgress(pageIndex, totalPages);
			}
		};
		
		// Initialize the base runtime
		this.runtime = new QuestionnaireRuntime(wrappedConfig);
		
		// Hook into the runtime's response collection
		this.setupResponseInterception();
		
		// Start the session
		this.startSession();
	}

	/**
	 * Start the session in database
	 */
	private async startSession(): Promise<void> {
		try {
			await SessionManagementService.startSession(this.sessionId);
		} catch (error) {
			console.error('Failed to start session:', error);
		}
	}

	/**
	 * Set up interception of response collection
	 */
	private setupResponseInterception(): void {
		// We'll intercept responses after they're collected
		// by monitoring the session responses array
		let lastResponseCount = 0;
		
		setInterval(() => {
			const currentSession = this.getSession();
			if (currentSession && currentSession.responses.length > lastResponseCount) {
				// New response(s) added
				const newResponses = currentSession.responses.slice(lastResponseCount);
				newResponses.forEach(response => {
					this.handleNewResponse(response);
				});
				lastResponseCount = currentSession.responses.length;
			}
		}, 100); // Check every 100ms
	}
	
	/**
	 * Handle a new response being added
	 */
	private async handleNewResponse(response: Response): Promise<void> {
		// Find the question
		const question = this.config.questionnaire.questions.find(q => q.id === response.questionId);
		if (!question) return;
		
		// Update current question reference
		this.currentQuestion = question;
		
		// Persist to database
		await this.persistResponse(response, question);
		
		// Update progress
		this.updateProgress();
		
		// Track interaction event
		await this.persistenceService.saveInteractionEvent({
			questionId: question.id,
			eventType: response.valid ? 'response_submitted' : 'response_timeout',
			eventData: { value: response.value, valid: response.valid },
			timestamp: response.timestamp,
			relativeTime: response.reactionTime
		});
	}

	/**
	 * Persist a response to database
	 */
	private async persistResponse(response: Response, question: Question): Promise<void> {
		try {
			await this.persistenceService.saveResponse({
				questionId: response.questionId,
				value: response.value,
				stimulusOnset: response.stimulusOnsetTime,
				responseTime: response.timestamp,
				reactionTime: response.reactionTime,
				timeOnQuestion: this.getTimeOnQuestion(question.id),
				valid: response.valid,
				metadata: {
					pageId: response.pageId,
					questionType: question.type,
					questionIndex: this.completedQuestions
				}
			});
		} catch (error) {
			console.error('Failed to persist response:', error);
		}
	}

	/**
	 * Update page progress
	 */
	private async updatePageProgress(pageIndex: number, totalPages: number): Promise<void> {
		// Track navigation event
		await this.persistenceService.saveInteractionEvent({
			questionId: null,
			eventType: 'page_navigation',
			eventData: {
				pageIndex,
				totalPages
			},
			timestamp: performance.now()
		});
	}

	/**
	 * Update session progress
	 */
	private async updateProgress(): Promise<void> {
		this.completedQuestions++;
		const progressPercentage = Math.round((this.completedQuestions / this.totalQuestions) * 100);
		
		// Update in database
		await this.persistenceService.updateSessionProgress({
			currentQuestionId: this.currentQuestion?.id,
			currentPageId: this.currentPage?.id,
			progressPercentage,
			status: 'in_progress'
		});
		
		// Notify UI
		if (this.onSessionUpdate) {
			this.onSessionUpdate(progressPercentage);
		}
		
		// Save current variable state
		const variables = this.getVariables();
		for (const [name, value] of Object.entries(variables)) {
			await this.persistenceService.saveVariable(name, value, typeof value);
		}
	}

	/**
	 * Track interactions
	 */
	async trackInteraction(eventType: string, eventData: any): Promise<void> {
		await this.persistenceService.saveInteractionEvent({
			questionId: this.currentQuestion?.id || null,
			eventType,
			eventData,
			timestamp: performance.now()
		});
	}

	/**
	 * Handle questionnaire completion
	 */
	private async handleComplete(session: QuestionnaireSession): Promise<void> {
		try {
			// Persist completion
			await this.persistenceService.completeSession();
			
			// Call original completion callback
			if (this.config.onComplete) {
				this.config.onComplete(session);
			}
		} catch (error) {
			console.error('Failed to complete session:', error);
		}
	}

	// Public API methods that delegate to runtime
	
	async start(): Promise<void> {
		return this.runtime.start();
	}
	
	async pause(): Promise<void> {
		this.runtime.pause();
		
		// Save current state
		const currentState = {
			variables: this.getVariables(),
			responses: this.getSession()?.responses.length || 0
		};
		
		await SessionManagementService.pauseSession(this.sessionId, currentState);
	}
	
	resume(): void {
		this.runtime.resume();
	}
	
	handleKeyPress(event: KeyboardEvent): void {
		// The runtime doesn't have handleKeyPress, need to handle differently
		// For now, just log
		console.log('Key press:', event.key);
	}
	
	getSession(): QuestionnaireSession | null {
		return (this.runtime as any).session || null;
	}
	
	getVariables(): Record<string, any> {
		return this.variableEngine.getAllVariables();
	}

	/**
	 * Handle exit/abandon
	 */
	async abandon(reason?: string): Promise<void> {
		await SessionManagementService.abandonSession(this.sessionId, reason);
		this.dispose();
	}

	/**
	 * Get time spent on current question
	 */
	private getTimeOnQuestion(questionId: string): number {
		// Find when question was shown
		const session = this.getSession();
		if (!session) return 0;
		
		const questionEvents = session.responses.filter(r => r.questionId === questionId);
		if (questionEvents.length === 0) return 0;
		
		const firstEvent = questionEvents[0];
		if (!firstEvent || !firstEvent.stimulusOnsetTime) return 0;
		return performance.now() - firstEvent.stimulusOnsetTime;
	}

	/**
	 * Cleanup
	 */
	dispose(): void {
		// Dispose persistence service
		this.persistenceService.dispose();
		
		// Dispose runtime if it has dispose method
		if ('dispose' in this.runtime && typeof this.runtime.dispose === 'function') {
			this.runtime.dispose();
		}
	}
}