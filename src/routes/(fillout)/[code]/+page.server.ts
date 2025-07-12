import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';

export const load: PageServerLoad = async ({ params, cookies, url }) => {
	const { code } = params;

	// Create Supabase client
	const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:8000';
	const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
	
	const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	try {
		// Fetch questionnaire by access code
		const { data: questionnaire, error: fetchError } = await supabase
			.from('questionnaire_definitions')
			.select(`
				id,
				name,
				code,
				version,
				definition,
				variables,
				global_scripts,
				status,
				is_active,
				start_date,
				end_date,
				project_id,
				project:projects(id, name)
			`)
			.eq('access_code', code.toUpperCase())
			.eq('status', 'published')
			.single();

		if (fetchError || !questionnaire) {
			throw error(404, 'Questionnaire not found');
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

		// Check for existing participant session
		const participantId = url.searchParams.get('pid');
		const sessionId = url.searchParams.get('sid');
		
		let existingSession = null;
		if (sessionId) {
			const { data: session } = await supabase
				.from('sessions')
				.select('*')
				.eq('id', sessionId)
				.eq('questionnaire_id', questionnaire.id)
				.single();
			
			if (session && session.status !== 'completed') {
				existingSession = session;
			}
		}

		return {
			questionnaire: {
				id: questionnaire.id,
				name: questionnaire.name,
				definition: questionnaire.definition,
				variables: questionnaire.variables || {},
				globalScripts: questionnaire.global_scripts || {},
				projectName: questionnaire.project?.name
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