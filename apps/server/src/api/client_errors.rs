//! Client-side error ingest sink.
//!
//! `POST /api/client-errors` is a **write-only** endpoint for browser crash
//! reports, so production client errors stop being invisible. It is:
//!
//!   * **Anonymous** — fillout participants have no auth — but **rate-limited
//!     per IP** by [`client_error_rate_limit_middleware`] (a dedicated bucket,
//!     never the auth limiter), so a looping or hostile client cannot flood the
//!     server log.
//!   * **Bounded** — the route caps the request body, and every field is
//!     length-clipped and control-char-scrubbed before it reaches the log, so a
//!     report cannot forge log lines or dump megabytes of attacker text.
//!   * **Silent** — the report is emitted via `tracing` (there is no query
//!     surface and no table); the response is an empty `204` that never reflects
//!     the submitted content back.
//!
//! [`client_error_rate_limit_middleware`]:
//! crate::middleware::rate_limit::client_error_rate_limit_middleware

use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use utoipa::ToSchema;

/// Per-field truncation caps. A crash report is diagnostic, not a document: a
/// message and a stack are useful; unbounded attacker-chosen text in the log is
/// not.
const MAX_MESSAGE: usize = 2_000;
const MAX_STACK: usize = 8_000;
const MAX_URL: usize = 2_000;
const MAX_USER_AGENT: usize = 512;
const MAX_KIND: usize = 64;
const MAX_AT: usize = 40;

/// A client-side crash report. Matches the frontend contract exactly; every
/// field except `message` is optional.
#[derive(Debug, Deserialize, ToSchema)]
pub struct ClientErrorReport {
    /// Human-readable error message.
    pub message: String,
    /// Optional stack trace.
    #[serde(default)]
    pub stack: Option<String>,
    /// The document URL where the error occurred.
    #[serde(default)]
    pub url: Option<String>,
    /// The reporting browser's user-agent string.
    #[serde(default, rename = "userAgent")]
    pub user_agent: Option<String>,
    /// Error category (e.g. "error", "unhandledrejection", "runtime").
    #[serde(default)]
    pub kind: Option<String>,
    /// Client-side ISO8601 timestamp of the error.
    #[serde(default)]
    pub at: Option<String>,
}

/// Clip to at most `max` characters and replace every control character
/// (newlines included) with a space, so one report is always one log line and
/// cannot forge additional ones.
fn clip(s: &str, max: usize) -> String {
    s.chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(max)
        .collect()
}

fn clip_opt(s: Option<&str>, max: usize) -> String {
    s.map(|v| clip(v, max)).unwrap_or_default()
}

/// POST /api/client-errors — accept a client crash report.
#[utoipa::path(
    post,
    path = "/api/client-errors",
    request_body = ClientErrorReport,
    responses(
        (status = 204, description = "Report accepted (write-only sink; the body is never echoed back)")
    ),
    tag = "client-errors"
)]
pub async fn report_client_error(Json(report): Json<ClientErrorReport>) -> StatusCode {
    let message = clip(&report.message, MAX_MESSAGE);
    let stack = clip_opt(report.stack.as_deref(), MAX_STACK);
    let url = clip_opt(report.url.as_deref(), MAX_URL);
    let user_agent = clip_opt(report.user_agent.as_deref(), MAX_USER_AGENT);
    let kind = clip_opt(report.kind.as_deref(), MAX_KIND);
    let at = clip_opt(report.at.as_deref(), MAX_AT);

    tracing::warn!(
        target: "client_error",
        kind = %kind,
        url = %url,
        at = %at,
        user_agent = %user_agent,
        stack = %stack,
        "client error report: {message}"
    );

    StatusCode::NO_CONTENT
}

#[cfg(test)]
mod tests {
    use super::clip;

    #[test]
    fn clip_scrubs_control_chars_and_truncates() {
        // Newlines (a log-forging vector) and other control chars collapse to
        // spaces; length is bounded.
        assert_eq!(clip("a\nb\rc\td", 100), "a b c d");
        assert_eq!(clip("abcdef", 3), "abc");
        // Truncation is char-boundary safe on multi-byte input.
        assert_eq!(clip("héllo", 2), "hé");
    }
}
