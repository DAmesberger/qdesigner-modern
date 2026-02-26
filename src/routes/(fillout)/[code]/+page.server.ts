import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const load: PageServerLoad = async ({ params, url, fetch }) => {
	const { code } = params;

	try {
		// Fetch questionnaire by access code from the Rust backend
		const response = await fetch(`${API_URL}/api/questionnaires/by-code/${code.toUpperCase()}`);

		if (!response.ok) {
			if (response.status === 404) {
				throw error(404, 'Questionnaire not found');
			}
			throw error(response.status, 'Failed to load questionnaire');
		}

		const questionnaire = await response.json();

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

		// Check for existing participant session
		const participantId = url.searchParams.get('pid');
		const sessionId = url.searchParams.get('sid');

		let existingSession = null;
		if (sessionId) {
			try {
				const sessionResponse = await fetch(`${API_URL}/api/sessions/${sessionId}`);
				if (sessionResponse.ok) {
					const session = await sessionResponse.json();
					if (session.questionnaire_id === questionnaire.id && session.status !== 'completed') {
						existingSession = session;
					}
				}
			} catch {
				// Session not found or error - proceed without existing session
			}
		}

		// Extract project name safely
		let projectName: string | undefined;
		if (questionnaire.project) {
			if (Array.isArray(questionnaire.project) && questionnaire.project.length > 0) {
				projectName = questionnaire.project[0]?.name;
			} else if (typeof questionnaire.project === 'object' && 'name' in questionnaire.project) {
				projectName = (questionnaire.project as any).name;
			}
		}

		return {
			questionnaire: {
				id: questionnaire.id,
				name: questionnaire.name,
				definition: questionnaire.definition,
				variables: questionnaire.variables || {},
				globalScripts: questionnaire.global_scripts || {},
				projectName
			},
			existingSession,
			code: code.toUpperCase(),
			participantId,
			preview: url.searchParams.get('preview') === 'true'
		};
	} catch (err) {
		console.error('Error loading questionnaire:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to load questionnaire');
	}
};
