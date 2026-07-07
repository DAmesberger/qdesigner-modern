pub mod api_key;
pub mod auth;
pub mod cors;
pub mod csrf;
pub mod fillout_rls_context;
pub mod rate_limit;
pub mod rls_context;
pub mod series_rls_context;
pub mod tx;

// NOTE: For production, fillout routes (serving questionnaire completion pages)
// should include cross-origin isolation headers for full timer precision:
//   Cross-Origin-Opener-Policy: same-origin
//   Cross-Origin-Embedder-Policy: require-corp
// This enables ~5us precision for performance.now() and event.timeStamp,
// which is critical for reaction time measurement in psychological research.
// Without these headers, browsers reduce timer precision to ~100us (Spectre mitigation).
// Apply these headers only to fillout routes to avoid breaking cross-origin
// resources on other pages.
