import { supabase } from '$lib/services/supabase';
import type { Session } from '$lib/types/session';
import { browser } from '$app/environment';

export interface SessionConfig {
	questionnaireId: string;
	participantId?: string;
	resumeSessionId?: string;
	metadata?: Record<string, any>;
}

export interface SessionState {
	session: Session;
	isNew: boolean;
	canResume: boolean;
}

export class SessionManagementService {
	private static SESSION_KEY = 'qdesigner_active_session';
	
	/**
	 * Create or resume a session
	 */
	static async initializeSession(config: SessionConfig): Promise<SessionState> {
		try {
			// Try to resume existing session
			if (config.resumeSessionId) {
				const resumed = await this.resumeSession(config.resumeSessionId, config.questionnaireId);
				if (resumed) {
					return { session: resumed, isNew: false, canResume: true };
				}
			}

			// Check for active session in local storage
			const localSession = this.getLocalSession();
			if (localSession && localSession.questionnaire_id === config.questionnaireId) {
				const resumed = await this.resumeSession(localSession.id, config.questionnaireId);
				if (resumed) {
					return { session: resumed, isNew: false, canResume: true };
				}
			}

			// Create new session
			const newSession = await this.createSession(config);
			return { session: newSession, isNew: true, canResume: false };
		} catch (error) {
			console.error('Failed to initialize session:', error);
			throw new Error('Unable to start questionnaire session');
		}
	}

	/**
	 * Create a new session
	 */
	private static async createSession(config: SessionConfig): Promise<Session> {
		const deviceInfo = this.getDeviceInfo();
		const browserInfo = this.getBrowserInfo();

		const sessionData = {
			questionnaire_id: config.questionnaireId,
			participant_id: config.participantId || null,
			status: 'not_started',
			started_at: new Date().toISOString(),
			device_info: deviceInfo,
			browser_info: browserInfo,
			metadata: config.metadata || {},
			access_code: this.generateAccessCode()
		};

		const { data, error } = await supabase
			.from('sessions')
			.insert(sessionData)
			.select()
			.single();

		if (error || !data) {
			throw new Error('Failed to create session');
		}

		// Store in local storage
		this.saveLocalSession(data);

		return data;
	}

	/**
	 * Resume an existing session
	 */
	private static async resumeSession(
		sessionId: string, 
		questionnaireId: string
	): Promise<Session | null> {
		try {
			const { data, error } = await supabase
				.from('sessions')
				.select('*')
				.eq('id', sessionId)
				.eq('questionnaire_id', questionnaireId)
				.single();

			if (error || !data) {
				return null;
			}

			// Can't resume completed sessions
			if (data.status === 'completed') {
				return null;
			}

			// Update last activity
			await supabase
				.from('sessions')
				.update({ 
					last_activity_at: new Date().toISOString(),
					status: data.status === 'not_started' ? 'in_progress' : data.status
				})
				.eq('id', sessionId);

			// Update local storage
			this.saveLocalSession(data);

			return data;
		} catch (error) {
			console.error('Failed to resume session:', error);
			return null;
		}
	}

	/**
	 * Start a session (mark as in progress)
	 */
	static async startSession(sessionId: string): Promise<void> {
		await supabase
			.from('sessions')
			.update({
				status: 'in_progress',
				started_at: new Date().toISOString(),
				last_activity_at: new Date().toISOString()
			})
			.eq('id', sessionId);
	}

	/**
	 * Pause a session
	 */
	static async pauseSession(sessionId: string, currentState?: any): Promise<void> {
		await supabase
			.from('sessions')
			.update({
				status: 'paused',
				last_activity_at: new Date().toISOString(),
				state_snapshot: currentState || {}
			})
			.eq('id', sessionId);
	}

	/**
	 * Complete a session
	 */
	static async completeSession(sessionId: string): Promise<void> {
		await supabase
			.from('sessions')
			.update({
				status: 'completed',
				completed_at: new Date().toISOString(),
				progress_percentage: 100
			})
			.eq('id', sessionId);

		// Clear local storage
		this.clearLocalSession();
	}

	/**
	 * Abandon a session
	 */
	static async abandonSession(sessionId: string, reason?: string): Promise<void> {
		await supabase
			.from('sessions')
			.update({
				status: 'abandoned',
				last_activity_at: new Date().toISOString(),
				metadata: {
					abandon_reason: reason || 'user_exit'
				}
			})
			.eq('id', sessionId);

		// Clear local storage
		this.clearLocalSession();
	}

	/**
	 * Get session recovery URL
	 */
	static getRecoveryUrl(session: Session, baseUrl: string): string {
		const params = new URLSearchParams({
			sid: session.id,
			...(session.participant_id && { pid: session.participant_id })
		});
		
		return `${baseUrl}/q/${session.access_code}?${params.toString()}`;
	}

	/**
	 * Get device information
	 */
	private static getDeviceInfo(): Record<string, any> {
		if (!browser) return {};

		return {
			userAgent: navigator.userAgent,
			platform: navigator.platform,
			vendor: navigator.vendor,
			language: navigator.language,
			languages: navigator.languages,
			screen: {
				width: window.screen.width,
				height: window.screen.height,
				availWidth: window.screen.availWidth,
				availHeight: window.screen.availHeight,
				colorDepth: window.screen.colorDepth,
				pixelRatio: window.devicePixelRatio
			},
			viewport: {
				width: window.innerWidth,
				height: window.innerHeight
			},
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			touchSupport: 'ontouchstart' in window
		};
	}

	/**
	 * Get browser information
	 */
	private static getBrowserInfo(): Record<string, any> {
		if (!browser) return {};

		const ua = navigator.userAgent;
		let browserName = 'Unknown';
		let browserVersion = 'Unknown';

		// Detect browser
		if (ua.indexOf('Firefox') > -1) {
			browserName = 'Firefox';
			browserVersion = ua.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
		} else if (ua.indexOf('Chrome') > -1) {
			browserName = 'Chrome';
			browserVersion = ua.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
		} else if (ua.indexOf('Safari') > -1) {
			browserName = 'Safari';
			browserVersion = ua.match(/Version\/(\d+)/)?.[1] || 'Unknown';
		} else if (ua.indexOf('Edge') > -1) {
			browserName = 'Edge';
			browserVersion = ua.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
		}

		return {
			name: browserName,
			version: browserVersion,
			cookiesEnabled: navigator.cookieEnabled,
			onLine: navigator.onLine,
			doNotTrack: navigator.doNotTrack
		};
	}

	/**
	 * Generate a unique access code
	 */
	private static generateAccessCode(): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		let code = '';
		for (let i = 0; i < 8; i++) {
			code += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return code;
	}

	/**
	 * Local storage management
	 */
	private static saveLocalSession(session: Session): void {
		if (!browser) return;
		
		try {
			localStorage.setItem(this.SESSION_KEY, JSON.stringify({
				id: session.id,
				questionnaire_id: session.questionnaire_id,
				access_code: session.access_code,
				status: session.status,
				saved_at: Date.now()
			}));
		} catch (error) {
			console.error('Failed to save session to local storage:', error);
		}
	}

	private static getLocalSession(): any {
		if (!browser) return null;
		
		try {
			const stored = localStorage.getItem(this.SESSION_KEY);
			if (!stored) return null;
			
			const data = JSON.parse(stored);
			
			// Check if session is recent (within 24 hours)
			const age = Date.now() - data.saved_at;
			if (age > 24 * 60 * 60 * 1000) {
				this.clearLocalSession();
				return null;
			}
			
			return data;
		} catch (error) {
			console.error('Failed to read local session:', error);
			return null;
		}
	}

	private static clearLocalSession(): void {
		if (!browser) return;
		
		try {
			localStorage.removeItem(this.SESSION_KEY);
		} catch (error) {
			console.error('Failed to clear local session:', error);
		}
	}
}