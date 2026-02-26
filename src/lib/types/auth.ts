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
	accessToken: string;
	refreshToken: string;
	expiresAt: number; // Unix timestamp
	user: User;
}

export interface AuthResult {
	session: Session | null;
	user: User | null;
	error: string | null;
}

export interface TokenPair {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
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
