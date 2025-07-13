import { supabase } from '$lib/services/supabase';
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
			// Fetch questionnaire by access code
			const { data: questionnaire, error } = await supabase
				.from('questionnaire_definitions')
				.select('*')
				.eq('code', code.toUpperCase())
				.eq('status', 'published')
				.single();

			if (error || !questionnaire) {
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
			console.error('Error validating questionnaire access:', error);
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
				const { data: existingSession, error } = await supabase
					.from('sessions')
					.select('*')
					.eq('id', sessionId)
					.eq('questionnaire_id', questionnaireId)
					.single();

				if (!error && existingSession && existingSession.status !== 'completed') {
					return { session: existingSession, isNew: false };
				}
			}

			// Create new session
			const sessionData = {
				questionnaire_id: questionnaireId,
				participant_id: participantId,
				status: 'not_started',
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
			};

			const { data: newSession, error } = await supabase
				.from('sessions')
				.insert(sessionData)
				.select()
				.single();

			if (error) {
				throw error;
			}

			return { session: newSession, isNew: true };
		} catch (error) {
			console.error('Error creating/resuming session:', error);
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
			const { data, error } = await supabase
				.from('sessions')
				.select('id')
				.eq('questionnaire_id', questionnaireId)
				.eq('participant_id', participantId)
				.eq('status', 'completed')
				.limit(1);

			return !error && data && data.length > 0;
		} catch (error) {
			console.error('Error checking previous completion:', error);
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