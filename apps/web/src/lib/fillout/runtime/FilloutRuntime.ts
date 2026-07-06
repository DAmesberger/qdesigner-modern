import { ResponsePersistenceService } from '../services/ResponsePersistenceService';
import { SessionManagementService } from '../services/SessionManagementService';
import { OfflineResponsePersistence } from '../services/OfflineResponsePersistence';
import { OfflineSessionService } from '../services/OfflineSessionService';
import { QuestionnaireRuntime } from '$lib/runtime/core/QuestionnaireRuntime';
import type { ResumeState } from '$lib/runtime/core/ResumeState';
import type {
	ServerVariableSnapshot,
	QuestionPresentedEvent,
} from '$lib/runtime/core/QuestionnaireRuntime';
import { RuntimeEventBus } from './RuntimeEventBus';
import type { ResumeSnapshot } from './responseMapping';
import type { FormQuestionHost } from '$lib/runtime/core/FormQuestionHost';
import type { Questionnaire, Question, Response, Page, QuestionnaireSession } from '$lib/shared';

export interface FilloutRuntimeConfig {
	canvas: HTMLCanvasElement;
	questionnaire: Questionnaire;
	sessionId: string;
	participantId?: string;
	/**
	 * 0-based monotonic per-questionnaire participant index (E-FLOW-6),
	 * allocated server-side at create time and threaded into the wrapped
	 * {@link RuntimeConfig}. Seeds counterbalancing (`getBlockOrder`) so
	 * Latin-square rows rotate across participants instead of every
	 * participant getting row 0.
	 */
	participantNumber?: number;
	conditionGroupCounts?: number[];
	/**
	 * Server-authoritative between-subjects arm assignment (E-FLOW-6). Passed
	 * straight through so the runtime prefers it over the local ConditionAssigner.
	 */
	serverAssignment?: { condition: string; conditionIndex: number };
	formHost?: FormQuestionHost;
	enableOfflineSync?: boolean;
	syncInterval?: number;
	/**
	 * Last-synced SERVER-COMPUTED VARIABLE aggregates keyed by variable id
	 * (server-computed-variable / E-FEEDBACK-3). Passed straight through into the
	 * wrapped {@link RuntimeConfig} so the runtime injects them OFFLINE at
	 * construction. `complete()` snapshots the resolved values into
	 * `session.variables` with everything else, so synced server values persist.
	 */
	serverVariables?: Record<string, ServerVariableSnapshot>;
	/**
	 * Prior-session answers + variable state to rehydrate from (E-OFF-1). When present
	 * the runtime is hydrated before start() so it resumes at the first unanswered item.
	 */
	resumeSnapshot?: ResumeSnapshot;
	/** True when {@link resumeSnapshot} was fetched from the server (cross-device resume). */
	resumeFromDevice?: boolean;
	/**
	 * A true save-and-continue snapshot (E-FLOW-3) loaded from the local session row (or
	 * server `state_snapshot`) before construction. When present and version-compatible,
	 * the runtime restores the exact cursor / loop counters / variable context from it —
	 * complementary to {@link resumeSnapshot}, which seeds the response pipeline.
	 */
	resumeFrom?: ResumeState;
	onComplete?: (session: QuestionnaireSession) => void;
	onProgress?: (pageIndex: number, totalPages: number) => void;
	onSessionUpdate?: (progress: number) => void;
	/**
	 * Fired for EVERY presented item (including WebGL reaction stimuli) before the
	 * category switch in the wrapped runtime. Forwarded straight through via the
	 * `wrappedConfig` spread so the fillout page can drive the aria-live announcement.
	 */
	onQuestionPresented?: (event: QuestionPresentedEvent) => void;
}

export class FilloutRuntime {
	private persistenceService: ResponsePersistenceService;
	private sessionId: string;
	private totalQuestions: number;
	private completedQuestions: number = 0;
	private onSessionUpdate?: (progress: number) => void;

	private runtime: QuestionnaireRuntime;
	private responses: Response[] = [];
	private currentQuestion: Question | null = null;
	private currentPage: Page | null = null;

	private eventBus = new RuntimeEventBus();
	private unsubscribers: Array<() => void> = [];

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

		// Create wrapped config with our response handlers
		const wrappedConfig = {
			...config,
			onComplete: async (session: QuestionnaireSession) => {
				this.eventBus.emit('session:complete', undefined as never);
				await this.handleComplete(session);
			},
			onProgress: (pageIndex: number, totalPages: number) => {
				this.eventBus.emit('page:changed', { pageIndex, totalPages });
				if (config.onProgress) {
					config.onProgress(pageIndex, totalPages);
				}
				this.updatePageProgress(pageIndex, totalPages);
			},
			// True save-and-continue (E-FLOW-3): persist the full ResumeState offline-first
			// on every answer boundary so a reload / cross-device resume can restore the
			// exact cursor, loop counters, and variable context. Fire-and-forget: a failed
			// write must not interrupt the run (the E-OFF-1 answer cursor still covers resume).
			onResumeStateCaptured: (state: ResumeState) => {
				void OfflineSessionService.updateResumeState(this.sessionId, state).catch((error) => {
					console.error('Failed to persist resume state:', error as Error);
				});
			}
		};

		// Initialize the base runtime
		this.runtime = new QuestionnaireRuntime(wrappedConfig);

		// Resumable sessions (E-OFF-1): rehydrate BEFORE wrapping the response array in
		// the event proxy, so restored answers seed the runtime WITHOUT re-emitting
		// 'response:added' (which would re-persist them under fresh clientIds). New
		// answers during the resumed run still emit + persist normally.
		if (config.resumeSnapshot && config.resumeSnapshot.responses.length > 0) {
			this.runtime.hydrate(config.resumeSnapshot);
			// Seed the completed counter so progress % continues from the resume point.
			this.completedQuestions = config.resumeSnapshot.responses.length;
			// Audit trail (fire-and-forget): who resumed, from where, how much restored.
			void OfflineResponsePersistence.saveEvent(this.sessionId, {
				eventType: 'session_resumed',
				timestampUs: Math.floor(
					(typeof performance !== 'undefined' ? performance.now() : 0) * 1000
				),
				metadata: {
					fromDevice: config.resumeFromDevice === true,
					restoredCount: config.resumeSnapshot.responses.length,
				},
			}).catch(() => {});
		}

		// Hook into the runtime's response collection via array proxy
		this.setupResponseProxy();

		// Subscribe to our own events
		this.setupEventSubscriptions();

		// Start the session
		this.startSession();
	}

	/**
	 * Start the session in database
	 */
	private async startSession(): Promise<void> {
		// Redundant server round-trip: FilloutUploadSync materializes sessions
		// idempotently at sync time, so nothing is lost offline. Only ping the
		// server when online.
		if (!navigator.onLine) return;
		try {
			await SessionManagementService.startSession(this.sessionId);
		} catch (error) {
			console.error('Failed to start session:', error as Error);
		}
	}

	/**
	 * Replace the session's responses array with a Proxy that emits events
	 * when new responses are pushed, eliminating the need for polling.
	 */
	private setupResponseProxy(): void {
		const session =  
		(this.runtime as unknown as Record<string, unknown>).session as QuestionnaireSession | null;
		if (!session) return;

		const eventBus = this.eventBus;

		session.responses = new Proxy(session.responses, {
			get(target, prop, receiver) {
				if (prop === 'push') {
					return function (...items: Response[]) {
						const result = Array.prototype.push.apply(target, items);
						for (const response of items) {
							eventBus.emit('response:added', response);
						}
						return result;
					};
				}
				return Reflect.get(target, prop, receiver);
			}
		});
	}

	/**
	 * Subscribe to event bus events for response handling
	 */
	private setupEventSubscriptions(): void {
		this.unsubscribers.push(
			this.eventBus.on('response:added', (response) => {
				this.handleNewResponse(response);
			})
		);

		this.unsubscribers.push(
			this.eventBus.on('page:changed', ({ pageIndex, totalPages }) => {
				this.updatePageProgress(pageIndex, totalPages);
			})
		);
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
					// Forward the runtime-attached metadata (e.g. the C-PROVENANCE
					// `timingProvenance` aggregate) so it survives to persistence.
					...response.metadata,
					pageId: response.pageId,
					questionType: question.type,
					questionIndex: this.completedQuestions
				}
			});
		} catch (error) {
			console.error('Failed to persist response:', error as Error);
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

		// Update in database.
		// NOTE: deliberately do NOT re-assert `status: 'in_progress'` here. The
		// session is already marked active by startSession(); the backend session
		// update only reads `status`/`metadata`, so re-sending 'in_progress' on
		// every answer has no useful effect AND, on the final question, this
		// fire-and-forget update can land after completeSession()'s
		// `status: 'completed'` write and silently revert the session to
		// 'active' — which analytics then counts as abandoned. Progress is a
		// client-side/offline concern only.
		await this.persistenceService.updateSessionProgress({
			currentQuestionId: this.currentQuestion?.id,
			currentPageId: this.currentPage?.id,
			progressPercentage
		});

		// Durable resume cursor (E-OFF-1): write the authoritative progress pointer to
		// the LOCAL session row on every answer, so a reload / offline resume can position
		// itself even before any child record has synced to the server. answeredQuestionIds
		// is authoritative; lastItemIndex/lastPageId are display hints. No-op when the
		// session has no local row yet (updateProgress short-circuits on a missing row).
		try {
			const cursor = this.runtime.getResumeCursor();
			await OfflineSessionService.updateProgress(
				this.sessionId,
				{ progressPercentage },
				{
					lastItemIndex: cursor.itemIndex,
					lastPageId: cursor.pageId,
					answeredQuestionIds: cursor.answeredQuestionIds
				}
			);
		} catch (error) {
			console.error('Failed to persist resume cursor:', error as Error);
		}

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
	async trackInteraction(eventType: string, eventData: unknown): Promise<void> {
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
			// Persist the final computed variable snapshot offline-first. Entries
			// pushed by QuestionnaireRuntime.complete() are shaped
			// { variableId, value, timestamp } — variableId IS the variable name.
			for (const v of session.variables) {
				await OfflineResponsePersistence.saveVariable(this.sessionId, v.variableId, v.value);
			}

			// Merge the quality report (and any custom metadata) into the local
			// session row and re-arm synced:0 so FilloutUploadSync ships it. Must
			// run before config.onComplete (which may trigger a syncNow()).
			await OfflineSessionService.mergeMetadata(session.id, {
				qualityReport: session.metadata?.qualityReport,
				custom: session.metadata?.custom,
			});

			// Persist completion
			await this.persistenceService.completeSession();

			// Call original completion callback
			if (this.config.onComplete) {
				this.config.onComplete(session);
			}
		} catch (error) {
			console.error('Failed to complete session:', error as Error);
		}
	}

	// Public API methods that delegate to runtime

	async start(): Promise<void> {
		// Preload all media resources before starting
		await this.runtime.preload((progress) => {
			console.log(`Loading resources: ${progress}%`);
			// Optionally notify UI about loading progress
			if (this.onSessionUpdate) {
				this.onSessionUpdate(progress * 0.5); // Use first half of progress bar for loading
			}
		});

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

	/**
	 * Delegate a viewport resize to the underlying runtime's single owned WebGL renderer
	 * (Slice 4.6). No-op until that renderer is lazily created, so the fillout page can
	 * route window resizes here unconditionally without owning a renderer of its own.
	 */
	resize(width: number, height: number): void {
		this.runtime.resize(width, height);
	}

	handleKeyPress(event: KeyboardEvent): void {
		// The runtime doesn't have handleKeyPress, need to handle differently
		// For now, just log
		console.log('Key press:', event.key);
	}

	getSession(): QuestionnaireSession | null {
		 
		return (this.runtime as unknown as Record<string, unknown>).session as QuestionnaireSession | null;
	}

	getVariables(): Record<string, unknown> {
		return this.runtime.getVariableEngine().getAllVariables();
	}

	/**
	 * E-FLOW-7: publish a flow variable (e.g. `_quotaCell`, `_eligible`) into the
	 * runtime's VariableEngine so downstream branch rules / piping can read it.
	 * Used by the fillout page to expose the participant's interlocking quota
	 * cell and eligibility outcome.
	 */
	setFlowVariable(name: string, value: unknown): void {
		this.runtime.getVariableEngine().setValue(name, value as never);
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
		// Unsubscribe all event listeners
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		this.eventBus.clear();

		// Dispose persistence service
		this.persistenceService.dispose();

		// Dispose runtime if it has dispose method
		if ('dispose' in this.runtime && typeof this.runtime.dispose === 'function') {
			this.runtime.dispose();
		}
	}
}
