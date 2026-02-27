// Session types for fillout

export interface Session {
  id: string;
  questionnaire_id: string;
  participant_id?: string;
  project_id?: string;
  status:
    | 'not_started'
    | 'in_progress'
    | 'active'
    | 'completed'
    | 'abandoned'
    | 'paused'
    | 'expired';
  started_at?: string;
  completed_at?: string;
  last_activity_at?: string;
  current_question_id?: string;
  current_page_id?: string;
  progress_percentage?: number;
  device_info?: Record<string, unknown>;
  browser_info?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  access_code?: string;
  state_snapshot?: unknown;
  offline_start?: boolean;
  sync_status?: 'synced' | 'pending' | 'conflict';
  last_sync_at?: string;
}
