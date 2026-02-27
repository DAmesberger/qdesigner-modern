import { api } from '$lib/services/api';
import type { Questionnaire } from '$lib/shared';
import type { Session } from '$lib/types/session';

export interface QuestionnaireAccess {
	questionnaire: Questionnaire;
	requiresAuth: boolean;
	requiresConsent: boolean;
	allowAnonymous: boolean;
	accessType: 'public' | 'authenticated' | 'token';
}

export interface AccessValidation {
	valid: boolean;
	error?: string;
	questionnaire?: QuestionnaireAccess;
}

export class QuestionnaireAccessService {
	/**
	 * Validate access code and retrieve questionnaire
	 */
	static async validateAccess(code: string): Promise<AccessValidation> {
		try {
			const questionnaire = await api.get<any>(`/api/questionnaires/by-code/${code.toUpperCase()}`);

			if (!questionnaire) {
				return {
					valid: false,
					error: 'Invalid or expired access code'
				};
			}

			// Check if questionnaire is active
			if (!questionnaire.is_active) {
				return {
					valid: false,
					error: 'This questionnaire is no longer active'
				};
			}

			// Check date restrictions
			const now = new Date();
			if (questionnaire.start_date && new Date(questionnaire.start_date) > now) {
				return {
					valid: false,
					error: 'This questionnaire is not yet available'
				};
			}

			if (questionnaire.end_date && new Date(questionnaire.end_date) < now) {
				return {
					valid: false,
					error: 'This questionnaire has ended'
				};
			}

			// Parse questionnaire definition
			const definition = questionnaire.definition as Questionnaire;

			return {
				valid: true,
				questionnaire: {
					questionnaire: definition,
					requiresAuth: definition.settings?.requireAuthentication || false,
					requiresConsent: definition.settings?.requireConsent || false,
					allowAnonymous: definition.settings?.allowAnonymous !== false,
					accessType: 'public'
				}
			};
		} catch (error) {
			console.error('Error validating questionnaire access:', error as Error);
			return {
				valid: false,
				error: 'Failed to validate access'
			};
		}
	}

	/**
	 * Create or resume a session for the questionnaire
	 */
	static async createOrResumeSession(
		questionnaireId: string,
		participantId?: string,
		sessionId?: string
	): Promise<{ session: Session; isNew: boolean }> {
		try {
			// If sessionId provided, try to resume
			if (sessionId) {
				try {
					const existingSession = await api.sessions.get(sessionId);
					if (existingSession && existingSession.status !== 'completed') {
						return { session: existingSession as unknown as Session, isNew: false };
					}
				} catch {
					// Session not found, create new
				}
			}

			// Create new session
			const newSession = await api.sessions.create({
				questionnaireId,
				participantId,
				metadata: {
					device_info: {
						userAgent: navigator.userAgent,
						screen: {
							width: window.screen.width,
							height: window.screen.height,
							pixelRatio: window.devicePixelRatio
						},
						platform: navigator.platform,
						language: navigator.language
					},
					browser_info: {
						name: getBrowserName(),
						version: getBrowserVersion()
					}
				}
			});

			return { session: newSession as unknown as Session, isNew: true };
		} catch (error) {
			console.error('Error creating/resuming session:', error as Error);
			throw new Error('Failed to initialize session');
		}
	}

	/**
	 * Check if participant has already completed the questionnaire
	 */
	static async checkPreviousCompletion(
		questionnaireId: string,
		participantId: string
	): Promise<boolean> {
		try {
			const sessions = await api.sessions.list({
				questionnaireId,
				participantId,
				status: 'completed',
				limit: 1
			});
			return sessions && sessions.length > 0;
		} catch (error) {
			console.error('Error checking previous completion:', error as Error);
			return false;
		}
	}

	/**
	 * Generate a shareable link for the questionnaire
	 */
	static generateShareableLink(code: string, baseUrl: string): string {
		return `${baseUrl}/q/${code}`;
	}
}

// Helper functions
function getBrowserName(): string {
	const userAgent = navigator.userAgent;
	if (userAgent.indexOf('Firefox') > -1) return 'Firefox';
	if (userAgent.indexOf('Chrome') > -1) return 'Chrome';
	if (userAgent.indexOf('Safari') > -1) return 'Safari';
	if (userAgent.indexOf('Edge') > -1) return 'Edge';
	return 'Unknown';
}

function getBrowserVersion(): string {
	const userAgent = navigator.userAgent;
	const match = userAgent.match(/(firefox|chrome|safari|edge)\/?\s*(\d+)/i);
	return match && match[2] ? match[2] : 'Unknown';
}
