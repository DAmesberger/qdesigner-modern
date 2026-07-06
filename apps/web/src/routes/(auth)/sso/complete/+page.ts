// SSO landing is purely client-side: it reads the access token from the URL
// fragment (never sent to the server) and/or mints a session from the httpOnly
// refresh cookie the backend set during the OIDC callback.
export const ssr = false;
export const prerender = false;
