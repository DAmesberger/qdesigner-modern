//! Harness-driven media-proxy and email-verification round-trips (P3-T3,
//! resolves F077).
//!
//! Unlike the pure-storage `storage_minio.rs`, these drive the real Axum
//! router (via the P3-T2 `common` harness) so the full extractor →
//! middleware → handler → RLS-tx stack is exercised:
//!
//!  - **media**: an authenticated multipart `POST /api/media` uploads a real
//!    PNG through actual MinIO, then `GET /api/media/{id}/content` asserts
//!    the ADR-0023 D1 contract (Accept-Ranges, immutable Cache-Control,
//!    stable ETag) and that a `Range` request yields `206` + a correct
//!    `Content-Range` and byte slice. Needs both Postgres and MinIO up.
//!
//!  - **email**: `POST /api/auth/verify-email/send` drives the real lettre
//!    SMTP path to MailPit, the code row lands in `email_verification_codes`,
//!    `POST /api/auth/verify-email/verify` flips `users.email_verified`, and
//!    MailPit's HTTP API confirms the message actually arrived carrying the
//!    code. Needs Postgres + MailPit up (storage is stubbed here).

mod common;

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use uuid::Uuid;

const MEDIA_TEST_BUCKET: &str = "qdesigner-media-test";

/// Minimal but real PNG: the 8-byte signature + an IHDR chunk header, padded
/// so `infer` classifies it as `image/png`. 48 bytes total — long enough for
/// a `bytes=0-3` range slice.
fn png_bytes() -> Vec<u8> {
    let mut b = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    b.extend_from_slice(&[0x00, 0x00, 0x00, 0x0D, b'I', b'H', b'D', b'R']);
    b.extend_from_slice(&[0u8; 32]);
    b
}

/// Build a `multipart/form-data` body carrying `organization_id` + a `file`
/// part, by hand (binary-safe). Returns `(content_type_header, body)`.
fn multipart_upload(org_id: Uuid, filename: &str, ctype: &str, file: &[u8]) -> (String, Vec<u8>) {
    let boundary = format!("----p3t3boundary{}", Uuid::new_v4().simple());
    let mut body = Vec::new();
    body.extend_from_slice(
        format!(
            "--{boundary}\r\n\
             Content-Disposition: form-data; name=\"organization_id\"\r\n\r\n\
             {org_id}\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(
        format!(
            "--{boundary}\r\n\
             Content-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n\
             Content-Type: {ctype}\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(file);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    (format!("multipart/form-data; boundary={boundary}"), body)
}

// ── media proxy: upload → stream (full + range) ──────────────────────

#[tokio::test]
async fn media_upload_then_stream_content_full_and_range() {
    // Real MinIO storage; skips (or panics under REQUIRE_DB) if unreachable.
    let Some(state) = common::build_media_test_state(MEDIA_TEST_BUCKET).await else {
        return;
    };
    let app = common::test_app(state);

    let user = common::register_user(&app).await;
    let tenant = common::provision_tenant(&app, &user.token).await;

    // Human auth now rides the `qd_session` cookie (with the CSRF token on
    // state-changing methods); `user.token` is the `session|csrf` combo.
    let (session_cookie, csrf_token) = user
        .token
        .split_once('|')
        .expect("register_user yields a session|csrf token");

    // ── authenticated multipart upload ──────────────────────────────
    let png = png_bytes();
    let (ctype, body) = multipart_upload(tenant.org_id, "stimulus.png", "image/png", &png);
    let req = Request::builder()
        .method("POST")
        .uri("/api/media")
        .header("x-requested-with", "XMLHttpRequest")
        .header("cookie", format!("qd_session={session_cookie}"))
        .header("x-csrf-token", csrf_token)
        .header("content-type", ctype)
        .body(Body::from(body))
        .expect("build multipart request");

    let (status, _headers, json) = common::send_full(&app, req).await;
    assert_eq!(status, StatusCode::CREATED, "upload should 201: {json:?}");
    let media_id = json["id"]
        .as_str()
        .expect("media id in upload response")
        .to_string();

    // ── GET /content, no Range → 200 full body + D1 headers ──────────
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/media/{media_id}/content"))
        .header("cookie", format!("qd_session={session_cookie}"))
        .body(Body::empty())
        .expect("build content request");
    let (status, headers, bytes) = common::send_raw(&app, req).await;

    assert_eq!(status, StatusCode::OK, "full content GET should 200");
    assert_eq!(
        headers
            .get(header::ACCEPT_RANGES)
            .and_then(|v| v.to_str().ok()),
        Some("bytes"),
        "must advertise Accept-Ranges: bytes"
    );
    assert_eq!(
        headers
            .get(header::CACHE_CONTROL)
            .and_then(|v| v.to_str().ok()),
        Some("public, max-age=31536000, immutable"),
        "must carry the immutable Cache-Control (stable cache key)"
    );
    assert!(
        headers.get(header::ETAG).is_some(),
        "must carry a stable ETag validator"
    );
    assert_eq!(bytes, png, "full body must be the uploaded PNG verbatim");

    // ── GET /content, Range: bytes=0-3 → 206 + Content-Range + slice ──
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/media/{media_id}/content"))
        .header("cookie", format!("qd_session={session_cookie}"))
        .header(header::RANGE, "bytes=0-3")
        .body(Body::empty())
        .expect("build ranged content request");
    let (status, headers, bytes) = common::send_raw(&app, req).await;

    assert_eq!(
        status,
        StatusCode::PARTIAL_CONTENT,
        "a Range request should 206"
    );
    let content_range = headers
        .get(header::CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
        .expect("206 must carry Content-Range");
    assert!(
        content_range.starts_with("bytes 0-3/"),
        "Content-Range should describe the served slice: {content_range}"
    );
    assert_eq!(
        bytes,
        png[0..4].to_vec(),
        "ranged body must be exactly the first 4 bytes"
    );
}

// ── email verification: send → verify → MailPit confirms ─────────────

#[tokio::test]
async fn email_verification_send_verify_and_mailpit_delivery() {
    // Storage is stubbed (new_unchecked) — this path never touches S3.
    let Some(state) = common::build_test_state().await else {
        return;
    };
    let app = common::test_app(state);

    // A registered user is required: send_verification_code no-ops (still
    // 200) for unknown emails to prevent enumeration.
    let user = common::register_user(&app).await;

    // ── POST /verify-email/send ──────────────────────────────────────
    let send_body = serde_json::json!({ "email": user.email });
    let (status, json) = common::json_request(
        &app,
        "POST",
        "/api/auth/verify-email/send",
        None,
        Some(&send_body),
    )
    .await;
    // The handler awaits the blocking SMTP send but discards its result, so
    // it returns 200 with a success envelope regardless of SMTP outcome —
    // pinning that documented behaviour.
    assert_eq!(status, StatusCode::OK, "send should 200: {json:?}");
    assert_eq!(json["success"], serde_json::json!(true));

    // ── the code row landed in email_verification_codes ──────────────
    let pool = common::fixture_pool()
        .await
        .expect("fixture pool for reading the issued code");
    let code: String =
        sqlx::query_scalar("SELECT code FROM email_verification_codes WHERE email = $1")
            .bind(&user.email)
            .fetch_one(&pool)
            .await
            .expect("a verification code row should exist after send");
    assert_eq!(code.len(), 6, "code should be the 6-digit format: {code}");

    // ── POST /verify-email/verify flips users.email_verified ─────────
    let verify_body = serde_json::json!({ "email": user.email, "code": code });
    let (status, json) = common::json_request(
        &app,
        "POST",
        "/api/auth/verify-email/verify",
        None,
        Some(&verify_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "verify should 200: {json:?}");
    assert_eq!(json["success"], serde_json::json!(true), "verify: {json:?}");

    let verified: bool = sqlx::query_scalar("SELECT email_verified FROM users WHERE email = $1")
        .bind(&user.email)
        .fetch_one(&pool)
        .await
        .expect("user row should exist");
    assert!(verified, "users.email_verified must be true after verify");

    // ── MailPit HTTP API confirms the message actually arrived ───────
    // Reachability gate: if MailPit's API is unreachable, panic under
    // REQUIRE_DB (no false green) else skip the delivery assertion.
    let mailpit = common::mailpit_http();
    let client = reqwest::Client::new();

    // The SMTP send is synchronous relative to the 200 response, but MailPit
    // ingest/index can lag a beat — retry the search briefly.
    let mut found: Option<serde_json::Value> = None;
    for attempt in 0..15 {
        let resp = client
            .get(format!("{mailpit}/api/v1/search"))
            .query(&[("query", format!("to:{}", user.email))])
            .send()
            .await;
        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                if common::require_db() {
                    panic!("REQUIRE_DB=1 but MailPit API unreachable at {mailpit}: {e}");
                }
                return; // skip delivery assertion when MailPit is down
            }
        };
        let body: serde_json::Value = resp.json().await.expect("MailPit search JSON");
        let count = body["messages_count"].as_i64().unwrap_or(0);
        if count >= 1 {
            found = Some(body);
            break;
        }
        if attempt < 14 {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    }

    let search =
        found.unwrap_or_else(|| panic!("MailPit received no message addressed to {}", user.email));
    let msg_id = search["messages"][0]["ID"]
        .as_str()
        .expect("MailPit message ID");

    // Fetch the full message and assert the body carries the exact code.
    let detail: serde_json::Value = client
        .get(format!("{mailpit}/api/v1/message/{msg_id}"))
        .send()
        .await
        .expect("MailPit message fetch")
        .json()
        .await
        .expect("MailPit message JSON");
    let text = detail["Text"].as_str().unwrap_or("");
    assert!(
        text.contains(&code),
        "delivered email body should contain the verification code {code}"
    );
}
