export interface User {
	id: string;
	email: string;
	fullName: string | null;
	avatarUrl: string | null;
	emailConfirmedAt: string | null;
	lastSignInAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface Session {
	expiresAt: number; // Unix timestamp
	user: User;
	provider: string;
	mfaVerified: boolean;
	roles: string[];
	organizations: Array<{
		id: string;
		name: string;
		slug: string;
		role: string;
	}>;
	csrfToken: string;
}

export interface AuthResult {
	session: Session | null;
	user: User | null;
	error: string | null;
}

export interface LoginRequest {
	email: string;
	password: string;
}

export interface RegisterRequest {
	email: string;
	password: string;
	full_name: string;
}

export interface AuthChangeEvent {
	event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';
	session: Session | null;
}
