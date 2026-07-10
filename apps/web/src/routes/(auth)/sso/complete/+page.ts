// SSO landing is purely client-side: the backend callback has already set the
// httpOnly qd_session cookie, so the page only resolves /api/auth/session.
export const ssr = false;
export const prerender = false;
