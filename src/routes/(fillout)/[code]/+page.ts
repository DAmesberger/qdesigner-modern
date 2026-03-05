import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { FilloutOfflineSyncService } from '$lib/fillout/services/FilloutOfflineSyncService';

export const ssr = false;

export const load: PageLoad = async ({ params, url, fetch }) => {
	const code = params.code.toUpperCase();

	// Validate code format
	if (!code || !/^[A-Z0-9]{6,12}$/.test(code)) {
		throw error(404, 'Invalid questionnaire code');
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let questionnaire: any = null;

	// Try online first
	if (navigator.onLine) {
		try {
			const response = await fetch(`/api/questionnaires/by-code/${code}`);
			if (response.ok) {
				questionnaire = await response.json();
				// Cache to IndexedDB for future offline use
				await FilloutOfflineSyncService.cacheQuestionnaire(questionnaire, code);
			} else if (response.status === 404) {
				throw error(404, 'Questionnaire not found');
			} else {
				throw error(response.status, 'Failed to load questionnaire');
			}
		} catch (err) {
			// If it's a SvelteKit error, rethrow
			if (err && typeof err === 'object' && 'status' in err) {
				throw err;
			}
			// Network error — fall through to offline
			console.warn('Network error, trying offline cache:', err);
		}
	}

	// Offline fallback: load from IndexedDB
	if (!questionnaire) {
		const cached = await FilloutOfflineSyncService.getOfflineQuestionnaire(code);
		if (!cached) {
			throw error(404, 'Questionnaire not available offline');
		}
		questionnaire = cached;
	}

	// Validate questionnaire is active
	if (!questionnaire.is_active) {
		throw error(403, 'This questionnaire is no longer active');
	}

	// Check date restrictions
	const now = new Date();
	if (questionnaire.start_date && new Date(questionnaire.start_date) > now) {
		throw error(403, 'This questionnaire is not yet available');
	}
	if (questionnaire.end_date && new Date(questionnaire.end_date) < now) {
		throw error(403, 'This questionnaire has ended');
	}

	// Extract all URL search params for distribution/variable mapping
	const urlParams: Record<string, string> = {};
	for (const [key, value] of url.searchParams.entries()) {
		urlParams[key] = value;
	}

	// Check for existing participant session via URL params
	const participantId = url.searchParams.get('pid');
	const sessionId = url.searchParams.get('sid');

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let existingSession: any = null;
	if (sessionId && navigator.onLine) {
		try {
			const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
			if (sessionResponse.ok) {
				const session = await sessionResponse.json();
				if (session.questionnaire_id === questionnaire.id && session.status !== 'completed') {
					existingSession = session;
				}
			}
		} catch {
			// Session not found — proceed without
		}
	}

	// Extract project name safely
	let projectName: string | undefined;
	if (questionnaire.project) {
		if (Array.isArray(questionnaire.project) && questionnaire.project.length > 0) {
			projectName = questionnaire.project[0]?.name;
		} else if (typeof questionnaire.project === 'object' && 'name' in questionnaire.project) {
			projectName = (questionnaire.project as Record<string, unknown>).name as string;
		}
	}

	return {
		questionnaire: {
			id: questionnaire.id,
			name: questionnaire.name,
			definition: questionnaire.definition,
			variables: questionnaire.variables || {},
			globalScripts: questionnaire.global_scripts || {},
			projectName,
			versionMajor: questionnaire.version_major ?? 1,
			versionMinor: questionnaire.version_minor ?? 0,
			versionPatch: questionnaire.version_patch ?? 0,
		},
		existingSession,
		code,
		participantId,
		urlParams,
		preview: url.searchParams.get('preview') === 'true',
		isOffline: !navigator.onLine,
	};
};
