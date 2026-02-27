// Organization types
export interface Organization {
	id: string;
	name: string;
	slug: string;
	domain: string | null;
	logoUrl: string | null;
	settings: Record<string, unknown>;
	subscriptionTier: string;
	subscriptionStatus: string;
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
	organization_id?: string;
	created_at?: string;
	updated_at?: string;
}

export interface OrganizationMember {
	organizationId: string;
	userId: string;
	role: 'owner' | 'admin' | 'member' | 'viewer';
	status: 'active' | 'invited' | 'suspended';
	joinedAt: string;
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
	organization_id?: string;
	created_at?: string;
	updated_at?: string;
	questionnaire_count?: number;
}

// Questionnaire types
export interface QuestionnaireDefinition {
	id: string;
	projectId: string;
	name: string;
	description: string | null;
	version: number;
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

// API Error
export interface ApiError {
	error: string;
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
