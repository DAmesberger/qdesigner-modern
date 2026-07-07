//! Longitudinal / EMA study-series scheduling + reminder delivery
//! (E-FLOW-2).
//!
//! - [`schedule`] — pure wave-time computation (fixed / random-interval /
//!   event), unit-tested in isolation.
//! - This module — the background scheduler tick: scan due prompts, send
//!   the reminder, mark delivered.
//!
//! The scheduler runs on the app pool (`qdesigner_app`, non-BYPASSRLS), so
//! it can only see the cross-tenant due set through the SECURITY DEFINER
//! functions from `00042_study_series.sql`
//! (`series_due_prompts` / `series_mark_delivered`).
//!
//! Delivery ordering is **claim-before-send**: a prompt is transitioned
//! `pending → delivered` atomically *first* (via `series_mark_delivered`,
//! which returns `true` only for the one caller that won the row) and the
//! email is sent only on the winning claim. This makes the loop safe under
//! multiple scheduler instances without a distributed lock, at the cost of
//! at-most-once delivery (a send that fails after the claim is logged, not
//! retried — acceptable for reminders; a hard-lost reminder is far less bad
//! than spamming a participant on every tick).

pub mod schedule;

use std::time::Duration;

use lettre::message::header::ContentType;
use lettre::transport::smtp::client::Tls;
use lettre::{Message, SmtpTransport, Transport};

use crate::state::AppState;

/// How often the scheduler wakes to scan for due prompts.
const TICK_INTERVAL: Duration = Duration::from_secs(60);

/// Max prompts processed per tick (bounds the per-tick work / email burst).
const BATCH_LIMIT: i32 = 100;

/// One due prompt row returned by `series_due_prompts`, carrying everything
/// the reminder send needs.
#[derive(Debug, sqlx::FromRow)]
struct DuePrompt {
    prompt_id: uuid::Uuid,
    #[allow(dead_code)]
    enrollment_id: uuid::Uuid,
    #[allow(dead_code)]
    series_id: uuid::Uuid,
    wave_index: i32,
    resume_token: uuid::Uuid,
    contact_channel: String,
    channel_kind: String,
    reminder_subject: String,
    reminder_body: String,
    #[allow(dead_code)]
    questionnaire_id: uuid::Uuid,
    questionnaire_code: String,
}

/// Spawn the background scheduler. Fire-and-forget; the handle is dropped
/// (the task runs for the process lifetime, mirroring the revoked-token
/// purger in `main.rs`).
pub fn spawn_scheduler(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(TICK_INTERVAL);
        // Skip missed ticks rather than bursting to catch up after a stall.
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            match run_tick(&state).await {
                Ok(0) => {}
                Ok(n) => tracing::info!(delivered = n, "series scheduler delivered reminders"),
                Err(e) => tracing::warn!("series scheduler tick failed: {e}"),
            }
        }
    });
}

/// Run a single scheduler tick. Returns the number of reminders delivered.
/// Public so the integration test can drive one tick deterministically
/// after advancing the clock, instead of waiting on the interval.
pub async fn run_tick(state: &AppState) -> Result<usize, sqlx::Error> {
    let due: Vec<DuePrompt> = sqlx::query_as(
        r#"
        SELECT prompt_id, enrollment_id, series_id, wave_index, resume_token,
               contact_channel, channel_kind, reminder_subject, reminder_body,
               questionnaire_id, questionnaire_code
        FROM public.series_due_prompts($1)
        "#,
    )
    .bind(BATCH_LIMIT)
    .fetch_all(&state.pool)
    .await?;

    let mut delivered = 0usize;
    for prompt in due {
        // Claim first: only the winner of the atomic pending→delivered
        // transition sends. A no-op claim (already delivered by another
        // worker / a prior tick) is skipped.
        let claimed: bool = sqlx::query_scalar("SELECT public.series_mark_delivered($1)")
            .bind(prompt.prompt_id)
            .fetch_one(&state.pool)
            .await?;
        if !claimed {
            continue;
        }
        send_reminder(state, &prompt).await;
        delivered += 1;
    }

    Ok(delivered)
}

/// Build the participant resume link for a prompt.
/// `{public_app_origin}/q/{CODE}?token={resume_token}`.
fn resume_link(origin: &str, code: &str, token: uuid::Uuid) -> String {
    format!(
        "{}/q/{}?token={}",
        origin.trim_end_matches('/'),
        code,
        token
    )
}

/// Unsubscribe/opt-out link. Points at the same fillout entry with an
/// `unsubscribe=1` flag; the participant client calls the POST unsubscribe
/// endpoint (keeps CSRF intact). A no-JS one-click GET unsubscribe is a
/// future enhancement.
fn unsubscribe_link(origin: &str, code: &str, token: uuid::Uuid) -> String {
    format!(
        "{}/q/{}?token={}&unsubscribe=1",
        origin.trim_end_matches('/'),
        code,
        token
    )
}

/// Render the reminder body template, substituting `{{link}}` /
/// `{{unsubscribe}}` and normalizing any literal `\n` escapes (the SQL
/// default stores them literally) to real newlines.
fn render_body(template: &str, link: &str, unsubscribe: &str) -> String {
    template
        .replace("\\n", "\n")
        .replace("{{link}}", link)
        .replace("{{unsubscribe}}", unsubscribe)
}

/// Send one reminder. Currently only the `email` channel is implemented;
/// other channel kinds are logged and skipped. Failures are logged, never
/// propagated (claim-before-send is at-most-once).
async fn send_reminder(state: &AppState, prompt: &DuePrompt) {
    if prompt.channel_kind != "email" {
        tracing::warn!(
            channel = %prompt.channel_kind,
            "series reminder channel not supported; skipping"
        );
        return;
    }

    let origin = &state.config.public_app_origin;
    let link = resume_link(origin, &prompt.questionnaire_code, prompt.resume_token);
    let unsubscribe = unsubscribe_link(origin, &prompt.questionnaire_code, prompt.resume_token);
    let body = render_body(&prompt.reminder_body, &link, &unsubscribe);
    let subject = prompt.reminder_subject.clone();

    let from = state
        .config
        .smtp_from
        .parse()
        .unwrap_or_else(|_| "noreply@qdesigner.local".parse().unwrap());
    let to = match prompt.contact_channel.parse() {
        Ok(addr) => addr,
        Err(e) => {
            tracing::warn!(
                to = %prompt.contact_channel,
                "series reminder: invalid recipient address: {e}"
            );
            return;
        }
    };

    let email_msg = match Message::builder()
        .from(from)
        .to(to)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body)
    {
        Ok(m) => m,
        Err(e) => {
            tracing::error!("series reminder: failed to build email: {e}");
            return;
        }
    };

    let smtp_host = state.config.smtp_host.clone();
    let smtp_port = state.config.smtp_port;
    let recipient = prompt.contact_channel.clone();
    let wave = prompt.wave_index;

    tokio::task::spawn_blocking(move || {
        let mailer = SmtpTransport::builder_dangerous(&smtp_host)
            .port(smtp_port)
            .tls(Tls::None)
            .build();
        match mailer.send(&email_msg) {
            Ok(_) => tracing::info!(to = %recipient, wave, "series reminder sent"),
            Err(e) => tracing::error!(to = %recipient, wave, "series reminder send failed: {e}"),
        }
    })
    .await
    .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_resume_and_unsubscribe_links() {
        let token = uuid::Uuid::parse_str("11111111-2222-3333-4444-555555555555").unwrap();
        assert_eq!(
            resume_link("http://localhost:4173/", "ABCD1234", token),
            "http://localhost:4173/q/ABCD1234?token=11111111-2222-3333-4444-555555555555"
        );
        assert_eq!(
            unsubscribe_link("http://localhost:4173", "ABCD1234", token),
            "http://localhost:4173/q/ABCD1234?token=11111111-2222-3333-4444-555555555555&unsubscribe=1"
        );
    }

    #[test]
    fn renders_body_template() {
        let out = render_body(
            "Time for wave!\\n\\nOpen: {{link}}\\n\\nStop: {{unsubscribe}}",
            "L",
            "U",
        );
        assert_eq!(out, "Time for wave!\n\nOpen: L\n\nStop: U");
    }
}
