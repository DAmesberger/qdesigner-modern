import { auth } from './auth';
import type {
	Organization,
	OrganizationMember,
	Invitation,
	Project,
	QuestionnaireDefinition,
	SessionData,
	ResponseSubmission,
	MediaAsset,
	MediaUploadResponse,
	DomainConfig,
	DomainAutoJoinCheck,
	VerificationResult,
	ApiError
} from '$lib/types/api';

const API_BASE = import.meta.env.VITE_API_URL || '';

class ApiClient {
	private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
		const token = auth.getAccessToken();
		const headers: Record<string, string> = {
			...(options.headers as Record<string, string>)
		};

		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		// Don't set Content-Type for FormData (browser sets it with boundary)
		if (!(options.body instanceof FormData)) {
			headers['Content-Type'] = 'application/json';
		}

		const res = await fetch(`${API_BASE}${path}`, {
			...options,
			headers
		});

		if (!res.ok) {
			if (res.status === 401) {
				// Try to refresh token
				const session = await auth.getSession();
				if (session) {
					// Retry with new token
					headers['Authorization'] = `Bearer ${session.accessToken}`;
					const retry = await fetch(`${API_BASE}${path}`, { ...options, headers });
					if (retry.ok) {
						return retry.status === 204 ? (undefined as T) : retry.json();
					}
				}
				// Still unauthorized - sign out
				await auth.signOut();
			}

			const error: ApiError = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
			throw new Error(error.error || `Request failed: ${res.status}`);
		}

		if (res.status === 204) return undefined as T;
		return res.json();
	}

	async get<T>(path: string): Promise<T> {
		return this.request<T>(path);
	}

	async post<T>(path: string, body?: unknown): Promise<T> {
		return this.request<T>(path, {
			method: 'POST',
			body: body instanceof FormData ? body : JSON.stringify(body)
		});
	}

	async patch<T>(path: string, body: unknown): Promise<T> {
		return this.request<T>(path, {
			method: 'PATCH',
			body: JSON.stringify(body)
		});
	}

	async delete(path: string): Promise<void> {
		await this.request<void>(path, { method: 'DELETE' });
	}

	// === Organizations ===
	organizations = {
		list: () => this.get<Organization[]>('/api/organizations'),
		get: (id: string) => this.get<Organization>(`/api/organizations/${id}`),
		create: (data: { name: string; slug?: string }) =>
			this.post<Organization>('/api/organizations', data),
		update: (id: string, data: Partial<Organization>) =>
			this.patch<Organization>(`/api/organizations/${id}`, data),
		delete: (id: string) => this.delete(`/api/organizations/${id}`),

		// Members
		members: {
			list: (orgId: string) =>
				this.get<OrganizationMember[]>(`/api/organizations/${orgId}/members`),
			add: (orgId: string, data: { userId: string; role: string }) =>
				this.post<OrganizationMember>(`/api/organizations/${orgId}/members`, data),
			remove: (orgId: string, userId: string) =>
				this.delete(`/api/organizations/${orgId}/members/${userId}`)
		},

		// Invitations
		invitations: {
			list: (orgId: string) =>
				this.get<Invitation[]>(`/api/organizations/${orgId}/invitations`),
			create: (
				orgId: string,
				data: { email: string; role: string; customMessage?: string }
			) => this.post<Invitation>(`/api/organizations/${orgId}/invitations`, data),
			getByToken: (token: string) => this.get<Invitation>(`/api/invitations/${token}`),
			accept: (token: string) =>
				this.post<{ success: boolean }>(`/api/invitations/${token}/accept`),
			decline: (token: string) =>
				this.post<{ success: boolean }>(`/api/invitations/${token}/decline`),
			revoke: (orgId: string, invitationId: string) =>
				this.delete(`/api/organizations/${orgId}/invitations/${invitationId}`),
			getPending: (email: string) =>
				this.get<Invitation[]>(
					`/api/invitations/pending?email=${encodeURIComponent(email)}`
				)
		},

		// Domains
		domains: {
			list: (orgId: string) =>
				this.get<DomainConfig[]>(`/api/organizations/${orgId}/domains`),
			add: (orgId: string, data: { domain: string }) =>
				this.post<DomainConfig>(`/api/organizations/${orgId}/domains`, data),
			verify: (orgId: string, domainId: string) =>
				this.post<{ success: boolean; method?: string }>(
					`/api/organizations/${orgId}/domains/${domainId}/verify`
				),
			update: (orgId: string, domainId: string, config: Partial<DomainConfig>) =>
				this.patch<DomainConfig>(
					`/api/organizations/${orgId}/domains/${domainId}`,
					config
				),
			remove: (orgId: string, domainId: string) =>
				this.delete(`/api/organizations/${orgId}/domains/${domainId}`),
			checkAutoJoin: (email: string) =>
				this.get<DomainAutoJoinCheck>(
					`/api/domains/auto-join?email=${encodeURIComponent(email)}`
				)
		}
	};

	// === Projects ===
	projects = {
		list: (orgId?: string) => {
			const params = orgId ? `?organization_id=${orgId}` : '';
			return this.get<Project[]>(`/api/projects${params}`);
		},
		get: (id: string) => this.get<Project>(`/api/projects/${id}`),
		create: (data: {
			organizationId: string;
			name: string;
			code: string;
			description?: string;
			isPublic?: boolean;
			maxParticipants?: number;
			irbNumber?: string;
			startDate?: string;
			endDate?: string;
		}) =>
			this.post<Project>('/api/projects', {
				organization_id: data.organizationId,
				name: data.name,
				code: data.code,
				description: data.description,
				is_public: data.isPublic,
				max_participants: data.maxParticipants,
				irb_number: data.irbNumber,
				start_date: data.startDate,
				end_date: data.endDate
			}),
		update: (id: string, data: Partial<Project>) =>
			this.patch<Project>(`/api/projects/${id}`, data),
		delete: (id: string) => this.delete(`/api/projects/${id}`)
	};

	// === Questionnaires ===
	questionnaires = {
		list: (projectId: string) =>
			this.get<QuestionnaireDefinition[]>(
				`/api/projects/${projectId}/questionnaires`
			),
		get: (projectId: string, id: string) =>
			this.get<QuestionnaireDefinition>(
				`/api/projects/${projectId}/questionnaires/${id}`
			),
		create: (
			projectId: string,
			data: {
				name: string;
				description?: string;
				content?: Record<string, unknown>;
				settings?: Record<string, unknown>;
			}
		) =>
			this.post<QuestionnaireDefinition>(
				`/api/projects/${projectId}/questionnaires`,
				data
			),
		update: (
			projectId: string,
			id: string,
			data: Partial<QuestionnaireDefinition>
		) =>
			this.patch<QuestionnaireDefinition>(
				`/api/projects/${projectId}/questionnaires/${id}`,
				data
			),
		delete: (projectId: string, id: string) =>
			this.delete(`/api/projects/${projectId}/questionnaires/${id}`),
		publish: (projectId: string, id: string) =>
			this.post<QuestionnaireDefinition>(
				`/api/projects/${projectId}/questionnaires/${id}/publish`
			)
	};

	// === Sessions ===
	sessions = {
		create: (data: {
			questionnaireId: string;
			participantId?: string;
			metadata?: Record<string, unknown>;
		}) =>
			this.post<SessionData>('/api/sessions', {
				questionnaire_id: data.questionnaireId,
				participant_id: data.participantId,
				metadata: data.metadata
			}),
		get: (id: string) => this.get<SessionData>(`/api/sessions/${id}`),
		update: (id: string, data: Partial<SessionData>) =>
			this.patch<SessionData>(`/api/sessions/${id}`, data),
		submitResponses: (sessionId: string, responses: ResponseSubmission[]) =>
			this.post<{ count: number }>(`/api/sessions/${sessionId}/responses`, {
				responses
			})
	};

	// === Media ===
	media = {
		list: (params?: { type?: string; search?: string }) => {
			const query = new URLSearchParams();
			if (params?.type) query.set('type', params.type);
			if (params?.search) query.set('search', params.search);
			const qs = query.toString();
			return this.get<MediaAsset[]>(`/api/media${qs ? `?${qs}` : ''}`);
		},
		upload: (
			file: File,
			options: {
				organizationId: string;
				accessLevel?: string;
				collectionId?: string;
			}
		): Promise<MediaUploadResponse> => {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('organization_id', options.organizationId);
			if (options.accessLevel) formData.append('access_level', options.accessLevel);
			if (options.collectionId)
				formData.append('collection_id', options.collectionId);
			return this.post<MediaUploadResponse>('/api/media', formData);
		},
		getUrl: (id: string) => this.get<{ url: string }>(`/api/media/${id}`),
		delete: (id: string) => this.delete(`/api/media/${id}`)
	};

	// === Email Verification ===
	emailVerification = {
		send: (email: string) =>
			this.post<VerificationResult>('/api/auth/verify-email/send', { email }),
		verify: (email: string, code: string) =>
			this.post<VerificationResult>('/api/auth/verify-email/verify', {
				email,
				code
			}),
		resend: (email: string) =>
			this.post<VerificationResult>('/api/auth/verify-email/resend', { email })
	};
}

export const api = new ApiClient();
