// Organization types
export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logoUrl: string | null;
  settings: Record<string, unknown>;
  /** Data-residency region tag (E-RBAC-9), e.g. `eu`/`us`. */
  dataRegion: string;
  /** When true, destructive tenant erasure is blocked (E-RBAC-9). */
  legalHold: boolean;
  subscriptionTier: string;
  subscriptionStatus: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'invited' | 'suspended';
  joinedAt: string;
  /** Assigned custom role (E-RBAC-3); overrides the tier defaults when set. */
  customRoleId?: string | null;
  customRoleName?: string | null;
  user?: { id: string; email: string; fullName: string | null; full_name?: string | null };
}

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  token: string;
  status: 'pending' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  customMessage: string | null;
  organization?: { id: string; name: string; slug: string };
  invitedBy?: { id: string; email: string; fullName: string | null; full_name?: string | null };
  created_at?: string;
  accepted_at?: string | null;
  expires_at?: string;
}

// Project types
export interface Project {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description: string | null;
  isPublic: boolean;
  status: 'active' | 'archived' | 'deleted';
  maxParticipants: number | null;
  irbNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  settings: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  questionnaireCount?: number;
}

// Questionnaire types
export interface QuestionnaireDefinition {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  version: number;
  version_major?: number;
  version_minor?: number;
  version_patch?: number;
  content: Record<string, unknown>;
  status: 'draft' | 'published' | 'archived';
  settings: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  project_id?: string;
  created_at?: string;
  updated_at?: string;
  response_count?: number;
  definition?: Record<string, unknown>;
}

// Session types
export interface SessionData {
  id: string;
  questionnaireId: string;
  participantId: string | null;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown>;
  /** Last recorded activity (used for duration on abandoned sessions). */
  lastActivityAt?: string | null;
  /** The exact questionnaire version this session was pinned to, if recorded. */
  questionnaireVersionMajor?: number | null;
  questionnaireVersionMinor?: number | null;
  questionnaireVersionPatch?: number | null;
}

export interface ResponseSubmission {
  questionId: string;
  value: unknown;
  reactionTimeUs?: number;
  presentedAt?: string;
  answeredAt?: string;
}

export interface SessionStatsSummary {
  sampleCount: number;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  min: number | null;
  max: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
}

export interface SessionAggregateData {
  questionnaireId: string;
  source: 'variable' | 'response';
  key: string;
  participantCount: number;
  stats: SessionStatsSummary;
}

export interface ParticipantStatsData {
  participantId: string;
  stats: SessionStatsSummary;
}

export interface SessionCompareData {
  questionnaireId: string;
  source: 'variable' | 'response';
  key: string;
  left: ParticipantStatsData;
  right: ParticipantStatsData;
  delta: {
    meanDelta: number | null;
    medianDelta: number | null;
    zScore: number | null;
  };
}

// Session response record (from GET /sessions/:id/responses)
export interface SessionResponseRecord {
  id: string;
  session_id: string;
  question_id: string;
  value: unknown;
  reaction_time_us: number | null;
  presented_at: string | null;
  answered_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
}

// Session event record (from GET /sessions/:id/events)
export interface InteractionEventRecord {
  id: string;
  session_id: string;
  event_type: string;
  question_id: string | null;
  timestamp_us: number;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

// Session variable record (from GET /sessions/:id/variables)
export interface SessionVariableRecord {
  id: string;
  session_id: string;
  variable_name: string;
  variable_value: unknown;
  updated_at: string | null;
}

// Dashboard types
export interface QuestionnaireSummary {
  id: string;
  name: string;
  project_id: string;
  status: string;
  /** Response ROWS — one per answered question. Never a completion denominator. */
  total_responses: number;
  /** Sessions started. This is the completion-rate denominator. */
  total_sessions: number;
  completed_sessions: number;
  avg_completion_time_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityRecord {
  session_id: string;
  participant_id: string | null;
  questionnaire_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface DashboardStats {
  total_questionnaires: number;
  total_responses: number;
  active_questionnaires: number;
  avg_completion_rate: number;
}

export interface DashboardSummary {
  questionnaires: QuestionnaireSummary[];
  recent_activity: ActivityRecord[];
  stats: DashboardStats;
}

// Export row (from GET /projects/:id/questionnaires/:qid/export?format=json)
export interface ExportRow {
  session_id: string;
  participant_id: string | null;
  session_status: string;
  started_at: string | null;
  completed_at: string | null;
  question_id: string;
  value: unknown;
  reaction_time_us: number | null;
  presented_at: string | null;
  answered_at: string | null;
  /**
   * The exact questionnaire semver the session was filled out against. Optional
   * because the server's export SELECT only began carrying the pin alongside
   * this field; a row without it exports an empty version cell rather than a
   * fabricated one.
   */
  questionnaire_version_major?: number | null;
  questionnaire_version_minor?: number | null;
  questionnaire_version_patch?: number | null;
  /**
   * Per-response timing provenance (which clock, what latencies, frame health).
   * The basis of the platform's sub-millisecond timing claim, so it belongs in
   * any export a reviewer is expected to trust. Optional for the same reason as
   * the version pin.
   */
  timing_provenance?: unknown;
}

// Media types
export interface MediaAsset {
  id: string;
  organizationId: string;
  uploadedBy: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  thumbnailPath: string | null;
  metadata: Record<string, unknown>;
  accessLevel: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaUploadResponse {
  asset: MediaAsset;
  url: string;
}

// Question Template types
export interface QuestionTemplate {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  questionType: string;
  questionConfig: Record<string, unknown>;
  isShared: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// Session media upload response
export interface SessionMediaUploadResponse {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

// Condition group counts (for balanced between-subjects assignment)
export interface ConditionGroupCounts {
  [conditionGroup: string]: number;
}

// API Error
export interface ApiError {
  error: string | { message?: string; status?: number };
  message?: string;
  details?: Record<string, unknown>;
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}

// Domain types
export interface DomainConfig {
  id: string;
  organizationId: string;
  domain: string;
  verificationToken: string;
  verificationMethod: string | null;
  verifiedAt: string | null;
  autoJoinEnabled: boolean;
  includeSubdomains: boolean;
  defaultRole: string;
  emailWhitelist: string[];
  emailBlacklist: string[];
  welcomeMessage: string | null;
  createdAt: string;
  created_at?: string;
}

export interface DomainAutoJoinCheck {
  canAutoJoin: boolean;
  organizationId?: string;
  organizationName?: string;
  defaultRole?: string;
  welcomeMessage?: string;
}

// Email verification
export interface VerificationResult {
  success: boolean;
  message?: string;
  error?: string;
}

// Cross-project analytics types
export interface QuestionnaireAnalytics {
  questionnaireId: string;
  name: string;
  /** Response ROWS. Not a session count. */
  responseCount: number;
  /** Sessions started — the completion-rate denominator. */
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  timingStats: SessionStatsSummary | null;
  variableStats: SessionStatsSummary | null;
}

export interface AggregateOverview {
  totalResponses: number;
  /** Sessions started across the compared questionnaires. */
  totalSessions: number;
  totalCompletedSessions: number;
  overallCompletionRate: number;
  overallTimingStats: SessionStatsSummary | null;
  overallVariableStats: SessionStatsSummary | null;
}

export interface CrossComparison {
  questionnaireA: string;
  questionnaireB: string;
  /** Arm-level differences — these need no participant pairing. */
  meanDelta: number | null;
  medianDelta: number | null;
  /** Participants observed in BOTH questionnaires. */
  pairedN: number;
  /**
   * Pearson r over those paired participants only. `null` means "not
   * computable" (fewer than 5 pairs, or no variance) — it does NOT mean zero,
   * and must never be rendered as `0`.
   */
  correlation: number | null;
}

export interface CrossProjectAnalyticsData {
  questionnaires: QuestionnaireAnalytics[];
  aggregate: AggregateOverview;
  crossComparisons: CrossComparison[] | null;
}

// Time-series analytics
export interface TimeSeriesBucket {
  timestamp: string;
  sessions_started: number;
  sessions_completed: number;
  avg_completion_ms: number | null;
}

// Filter endpoint types
export interface FilteredSession {
  id: string;
  participant_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
}

export interface FilterResponse {
  sessions: FilteredSession[];
  total: number;
  stats: SessionStatsSummary | null;
}
