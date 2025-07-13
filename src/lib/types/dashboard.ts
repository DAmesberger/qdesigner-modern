// Dashboard-specific types

export interface DashboardStats {
  totalQuestionnaires: number;
  totalResponses: number;
  activeQuestionnaires: number;
  avgCompletionRate: number;
}

/**
 * Statistics overview for the dashboard
 */
export interface QuestionnaireStats {
  activeQuestionnaires: number;
  totalResponses: number;
  averageCompletionRate: number;
  activeParticipants: number;
}

export interface DashboardQuestionnaire {
  questionnaire_id: string;
  name: string;
  description?: string;
  status: 'draft' | 'published' | 'archived';
  total_responses: number;
  completed_responses: number;
  avg_completion_time?: number; // in milliseconds
  response_rate_7d: number; // responses in last 7 days
  created_at: string;
  updated_at: string;
}

export interface DashboardActivity {
  id: string;
  questionnaire_id: string;
  questionnaire_name: string;
  participant_id?: string;
  participant_email: string;
  status: 'completed' | 'in_progress' | 'abandoned';
  started_at: string;
  completed_at?: string;
  response_time_ms?: number; // total time in milliseconds
}

export interface DashboardData {
  user: any; // Use proper user type from auth
  questionnaires: DashboardQuestionnaire[];
  recentActivity: DashboardActivity[];
  stats: DashboardStats;
}

/**
 * Individual questionnaire item for the dashboard list
 */
export interface QuestionnaireListItem {
  questionnaire_id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
  total_responses: number;
  completed_responses: number;
  avg_completion_time?: number;
  response_rate_7d: number;
}