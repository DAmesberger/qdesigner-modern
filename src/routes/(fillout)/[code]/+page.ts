import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, url }) => {
	const { code } = params;
	
	// Validate code format (alphanumeric, 6-12 characters)
	if (!code || !/^[A-Za-z0-9]{6,12}$/.test(code)) {
		throw error(404, 'Invalid questionnaire code');
	}

	// Extract any query parameters (e.g., participant ID, session resume)
	const participantId = url.searchParams.get('pid');
	const sessionId = url.searchParams.get('sid');
	const preview = url.searchParams.get('preview') === 'true';

	return {
		code,
		participantId,
		sessionId,
		preview,
		timestamp: Date.now()
	};
};