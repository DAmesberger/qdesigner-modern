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
}

export interface OrganizationMember {
	organizationId: string;
	userId: string;
	role: 'owner' | 'admin' | 'member' | 'viewer';
	status: 'active' | 'invited' | 'suspended';
	joinedAt: string;
	user?: { id: string; email: string; fullName: string | null };
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
	invitedBy?: { id: string; email: string; fullName: string | null };
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
	content: Record<string, unknown>;
	status: 'draft' | 'published' | 'archived';
	settings: Record<string, unknown>;
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
	publishedAt: string | null;
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
