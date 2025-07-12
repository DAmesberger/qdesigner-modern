// Session types for fillout

export interface Session {
	id: string;
	questionnaire_id: string;
	participant_id?: string;
	project_id?: string;
	status: 'not_started' | 'in_progress' | 'completed' | 'abandoned' | 'paused';
	started_at?: string;
	completed_at?: string;
	last_activity_at?: string;
	current_question_id?: string;
	current_page_id?: string;
	progress_percentage?: number;
	device_info?: Record<string, any>;
	browser_info?: Record<string, any>;
	metadata?: Record<string, any>;
	access_code?: string;
	state_snapshot?: any;
	offline_start?: boolean;
	sync_status?: 'synced' | 'pending' | 'conflict';
	last_sync_at?: string;
}