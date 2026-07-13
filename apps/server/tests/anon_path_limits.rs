//! Anonymous / participant-path abuse limits, driven through the real Axum
//! router (the `common` HTTP harness).
//!
//! Four CONFIRMED-HIGH findings on the public, unauthenticated surface:
//!
//!  1. **Reverse-proxy blindness** — the limiter keyed on the raw socket IP and
//!     ignored `X-Forwarded-For`, so behind a proxy every client collapsed into
//!     ONE bucket. Fixed with a config-driven trusted-proxy mode. The hop
//!     SEMANTICS (count from the RIGHT, never the left) are unit-tested in
//!     `middleware::rate_limit`; here we assert the end-to-end bucketing.
//!
//!  2. **Unmetered `POST /api/sessions`** — every create burns a participant
//!     number and claims an experiment arm, so a flood corrupts experiment
//!     BALANCE, not just row counts. Now bounded per-IP (route layer) and
//!     per-questionnaire (in the handler, where the body's questionnaire id is
//!     available).
//!
//!  3. **`POST /api/media` capped at 2 MiB** — the route had no
//!     `DefaultBodyLimit` override, so axum's implicit 2 MiB default 413'd every
//!     designer upload above ~2 MiB and the documented 25 MiB cap was
//!     unreachable.
//!
//!  4. **Unmetered `POST /api/sessions/{id}/media`** — no per-session quota, so
//!     an anonymous caller could push unlimited ~25 MiB blobs into S3.
//!
//! The budgets under test are lowered on the harness state (the production
//! defaults are deliberately generous — a NAT'd classroom must not be locked
//! out — and driving 60+ real creates per assertion would be gratuitous).

mod common;

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use std::net::SocketAddr;
use uuid::Uuid;

use qdesigner_server::middleware::rate_limit::RateLimiter;

const MEDIA_TEST_BUCKET: &str = "qdesigner-media-test";

/// A real PNG (signature + IHDR header) padded out to `size` bytes, so `infer`
/// classifies it as `image/png` at any size we like.
fn png_of_size(size: usize) -> Vec<u8> {
    let mut b = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    b.extend_from_slice(&[0x00, 0x00, 0x00, 0x0D, b'I', b'H', b'D', b'R']);
    b.extend_from_slice(&[0u8; 32]);
    b.resize(size.max(b.len()), 0);
    b
}

/// `multipart/form-data` with an `organization_id` + `file` part (designer
/// upload shape). Returns `(content_type_header, body)`.
fn multipart_org_upload(
    org_id: Uuid,
    filename: &str,
    ctype: &str,
    file: &[u8],
) -> (String, Vec<u8>) {
    let boundary = format!("----anonlimits{}", Uuid::new_v4().simple());
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

/// `multipart/form-data` with just a `file` part (session-media shape).
fn multipart_file_only(filename: &str, ctype: &str, file: &[u8]) -> (String, Vec<u8>) {
    let boundary = format!("----anonlimits{}", Uuid::new_v4().simple());
    let mut body = Vec::new();
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

/// An anonymous `POST /api/sessions` arriving from a specific socket peer.
/// `ConnectInfo` is what `into_make_service_with_connect_info` installs in
/// production; injecting it here is how the harness models distinct clients.
fn create_session_req(qid: Uuid, peer: &str, xff: Option<&str>) -> Request<Body> {
    let addr: SocketAddr = format!("{peer}:54321").parse().expect("peer addr");
    let mut builder = Request::builder()
        .method("POST")
        .uri("/api/sessions")
        .header("x-requested-with", "XMLHttpRequest")
        .header("content-type", "application/json")
        .extension(ConnectInfo(addr));
    if let Some(xff) = xff {
        builder = builder.header("x-forwarded-for", xff);
    }
    let body = serde_json::json!({ "questionnaire_id": qid });
    builder
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .expect("build create-session request")
}

/// Provision a published questionnaire under a fresh owner; return its id.
async fn published_questionnaire(app: &axum::Router) -> Uuid {
    let owner = common::register_user(app).await;
    let t = common::provision_tenant(app, &owner.token).await;
    let (status, pubd) = common::json_request(
        app,
        "POST",
        &format!(
            "/api/projects/{}/questionnaires/{}/publish",
            t.project_id, t.questionnaire_id
        ),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "publish questionnaire: {pubd:?}");
    t.questionnaire_id
}

// ── Fix 2: anonymous session-create is metered ───────────────────────

/// The per-IP budget on `POST /api/sessions` blocks a flood from one source
/// while leaving a second, legitimate participant behind a DIFFERENT address
/// completely unaffected (the whole point of keying per client, not globally).
#[tokio::test]
async fn anon_session_create_is_bounded_per_ip() {
    let Some(mut state) = common::build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    // Production default is 60/60s (a NAT'd classroom must not be locked out);
    // 3 keeps the assertion cheap without changing the mechanism under test.
    state.session_create_limiter = RateLimiter::new(3, 60, None);
    let app = common::test_app(state);

    let qid = published_questionnaire(&app).await;

    // Within budget: the legitimate cohort is NOT broken.
    for i in 0..3 {
        let (status, json) =
            common::send(&app, create_session_req(qid, "203.0.113.10", None)).await;
        assert_eq!(
            status,
            StatusCode::CREATED,
            "create {i} is within budget and must succeed: {json:?}"
        );
    }

    // Over budget: the 4th from the same IP is refused.
    let (status, _json) = common::send(&app, create_session_req(qid, "203.0.113.10", None)).await;
    assert_eq!(
        status,
        StatusCode::TOO_MANY_REQUESTS,
        "the 4th create from one IP must be rate-limited"
    );

    // A different participant (different IP) still gets through — the limit is
    // per-client, not a global kill switch on the study.
    let (status, json) = common::send(&app, create_session_req(qid, "198.51.100.44", None)).await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "another IP has its own bucket and must still be able to start: {json:?}"
    );
}

/// A spoofed `X-Forwarded-For` must NOT let a flooder rotate out of its bucket
/// when no trusted proxy is configured (`trusted_proxy_hops: None`, the harness
/// default and the default posture): the socket IP governs, so all four
/// requests land in one bucket and the 4th is refused.
#[tokio::test]
async fn spoofed_forwarded_for_does_not_evade_the_create_budget() {
    let Some(mut state) = common::build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    state.session_create_limiter = RateLimiter::new(3, 60, None);
    let app = common::test_app(state);

    let qid = published_questionnaire(&app).await;

    // Same socket, a fresh forged XFF each time.
    for (i, forged) in ["1.2.3.4", "5.6.7.8", "9.9.9.9"].iter().enumerate() {
        let (status, json) =
            common::send(&app, create_session_req(qid, "203.0.113.20", Some(forged))).await;
        assert_eq!(
            status,
            StatusCode::CREATED,
            "create {i} is within budget: {json:?}"
        );
    }

    let (status, _json) = common::send(
        &app,
        create_session_req(qid, "203.0.113.20", Some("77.77.77.77")),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::TOO_MANY_REQUESTS,
        "rotating X-Forwarded-For must NOT create a fresh bucket — the header is \
         ignored entirely when no trusted proxy is configured"
    );
}

/// The per-QUESTIONNAIRE budget bites even when the flood is spread across many
/// source IPs (which is exactly what defeats a per-IP-only defence). It is
/// scoped to the study: a second questionnaire is untouched.
#[tokio::test]
async fn per_questionnaire_create_budget_triggers_across_different_ips() {
    let Some(mut state) = common::build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    // Per-IP budget left wide open so ONLY the per-questionnaire ceiling can
    // be what refuses the request.
    state.session_create_limiter = RateLimiter::new(10_000, 60, None);
    state.questionnaire_create_limiter = RateLimiter::new(2, 60, None);
    let app = common::test_app(state);

    let qid = published_questionnaire(&app).await;
    let other_qid = published_questionnaire(&app).await;

    // Two creates, each from its own address.
    for (i, ip) in ["203.0.113.31", "203.0.113.32"].iter().enumerate() {
        let (status, json) = common::send(&app, create_session_req(qid, ip, None)).await;
        assert_eq!(
            status,
            StatusCode::CREATED,
            "create {i} from {ip} is within the study budget: {json:?}"
        );
    }

    // A third, from a THIRD address — the per-IP budget is untouched, so only
    // the per-questionnaire ceiling can refuse this.
    let (status, _json) = common::send(&app, create_session_req(qid, "203.0.113.33", None)).await;
    assert_eq!(
        status,
        StatusCode::TOO_MANY_REQUESTS,
        "a distributed flood must still hit the per-questionnaire ceiling"
    );

    // The budget is keyed on the questionnaire: a DIFFERENT study is unaffected
    // (one flooded study must not take the whole platform down with it).
    let (status, json) =
        common::send(&app, create_session_req(other_qid, "203.0.113.33", None)).await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "a different questionnaire has its own budget: {json:?}"
    );
}

// ── Fix 3: designer media upload is no longer capped at 2 MiB ────────

/// A 5 MiB designer upload — well over axum's implicit 2 MiB default body limit,
/// well under the documented 25 MiB `MAX_UPLOAD_BYTES` — must now SUCCEED. It
/// 413'd before, which made audio/video stimuli unuploadable. A file over the
/// 25 MiB cap is still rejected.
#[tokio::test]
async fn designer_media_upload_admits_5mib_and_still_rejects_oversize() {
    let Some(state) = common::build_media_test_state(MEDIA_TEST_BUCKET).await else {
        eprintln!("skipping: no DB/MinIO reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = common::test_app(state);

    let user = common::register_user(&app).await;
    let tenant = common::provision_tenant(&app, &user.token).await;
    let (session_cookie, csrf_token) = user
        .token
        .split_once('|')
        .expect("register_user yields a session|csrf token");

    let upload = |ctype: String, body: Vec<u8>| {
        Request::builder()
            .method("POST")
            .uri("/api/media")
            .header("x-requested-with", "XMLHttpRequest")
            .header("cookie", format!("qd_session={session_cookie}"))
            .header("x-csrf-token", csrf_token)
            .header("content-type", ctype)
            .body(Body::from(body))
            .expect("build multipart request")
    };

    // ── 5 MiB: over the implicit 2 MiB default, under the 25 MiB cap ──
    let png = png_of_size(5 * 1024 * 1024);
    let (ctype, body) = multipart_org_upload(tenant.org_id, "stimulus.png", "image/png", &png);
    let (status, _headers, json) = common::send_full(&app, upload(ctype, body)).await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "a 5 MiB upload must succeed — axum's implicit 2 MiB default 413'd it \
         before the DefaultBodyLimit override: {json:?}"
    );
    assert_eq!(
        json["size_bytes"].as_i64(),
        Some(5 * 1024 * 1024),
        "the whole 5 MiB body must have been stored: {json:?}"
    );

    // ── just over 25 MiB: still rejected (the real cap is unchanged) ──
    let png = png_of_size(25 * 1024 * 1024 + 1024);
    let (ctype, body) = multipart_org_upload(tenant.org_id, "huge.png", "image/png", &png);
    let (status, _headers, _json) = common::send_full(&app, upload(ctype, body)).await;
    assert!(
        status == StatusCode::BAD_REQUEST || status == StatusCode::PAYLOAD_TOO_LARGE,
        "an upload over MAX_UPLOAD_BYTES must still be rejected, got {status}"
    );
}

// ── Fix 4: anonymous session-media upload is quota'd ─────────────────

/// Drive an anonymous session-media upload of `size` bytes for `sid`.
fn session_media_req(sid: &str, name: &str, size: usize) -> Request<Body> {
    let (ctype, body) = multipart_file_only(name, "image/png", &png_of_size(size));
    let addr: SocketAddr = "203.0.113.90:54321".parse().unwrap();
    Request::builder()
        .method("POST")
        .uri(format!("/api/sessions/{sid}/media"))
        .header("x-requested-with", "XMLHttpRequest")
        .header("content-type", ctype)
        .extension(ConnectInfo(addr))
        .body(Body::from(body))
        .expect("build session-media request")
}

/// The per-session FILE-COUNT budget is enforced before the S3 write: uploads
/// past the cap are refused and leave no `session_media` row (and therefore no
/// object) behind.
#[tokio::test]
async fn session_media_file_count_quota_is_enforced() {
    let Some(mut state) = common::build_media_test_state(MEDIA_TEST_BUCKET).await else {
        eprintln!("skipping: no DB/MinIO reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    // Production default is 20 files / 100 MiB; 2 files keeps the test cheap.
    let mut cfg = (*state.config).clone();
    cfg.session_media_max_files = 2;
    state.config = std::sync::Arc::new(cfg);
    let app = common::test_app(state);

    let qid = published_questionnaire(&app).await;
    let (status, session) = common::send(&app, create_session_req(qid, "203.0.113.90", None)).await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "anon create session: {session:?}"
    );
    let sid = session["id"].as_str().expect("session id").to_string();

    // Two uploads fit the quota.
    for i in 0..2 {
        let (status, json) = common::send(&app, session_media_req(&sid, "answer.png", 1024)).await;
        assert_eq!(
            status,
            StatusCode::CREATED,
            "upload {i} is within the file quota: {json:?}"
        );
    }

    // The third is refused.
    let (status, json) = common::send(&app, session_media_req(&sid, "answer.png", 1024)).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "the 3rd upload must be refused by the per-session file-count quota: {json:?}"
    );

    // And nothing was written past the cap — no row, hence no S3 object (the
    // quota check runs BEFORE `storage.upload`).
    let pool = common::fixture_pool().await.expect("fixture pool");
    let stored: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM session_media WHERE session_id = $1")
            .bind(Uuid::parse_str(&sid).unwrap())
            .fetch_one(&pool)
            .await
            .expect("count session_media rows");
    assert_eq!(
        stored, 2,
        "exactly the quota's worth of rows may exist — the rejected upload must \
         not have created a session_media row or an S3 object"
    );
}

/// The per-session TOTAL-BYTES budget is enforced independently of the file
/// count: a session under the file cap still cannot exceed its storage budget.
#[tokio::test]
async fn session_media_byte_quota_is_enforced() {
    let Some(mut state) = common::build_media_test_state(MEDIA_TEST_BUCKET).await else {
        eprintln!("skipping: no DB/MinIO reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let mut cfg = (*state.config).clone();
    cfg.session_media_max_files = 100; // file count deliberately NOT the binding cap
    cfg.session_media_max_total_bytes = 3 * 1024;
    state.config = std::sync::Arc::new(cfg);
    let app = common::test_app(state);

    let qid = published_questionnaire(&app).await;
    let (status, session) = common::send(&app, create_session_req(qid, "203.0.113.90", None)).await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "anon create session: {session:?}"
    );
    let sid = session["id"].as_str().expect("session id").to_string();

    // 2 KiB fits inside the 3 KiB budget.
    let (status, json) = common::send(&app, session_media_req(&sid, "a.png", 2048)).await;
    assert_eq!(status, StatusCode::CREATED, "first upload fits: {json:?}");

    // Another 2 KiB would take the session to 4 KiB > 3 KiB — refused, even
    // though the file count (2) is nowhere near its cap (100).
    let (status, json) = common::send(&app, session_media_req(&sid, "b.png", 2048)).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "the byte budget must refuse this upload independently of the file count: {json:?}"
    );

    let pool = common::fixture_pool().await.expect("fixture pool");
    let (rows, bytes): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*)::bigint, COALESCE(SUM(size_bytes), 0)::bigint \
         FROM session_media WHERE session_id = $1",
    )
    .bind(Uuid::parse_str(&sid).unwrap())
    .fetch_one(&pool)
    .await
    .expect("sum session_media");
    assert_eq!(rows, 1, "only the admitted upload may have a row");
    assert_eq!(bytes, 2048, "stored bytes must stay inside the budget");
}

/// The route's per-IP rate limit is armed: a burst of session-media uploads from
/// one source is refused with 429 before it can touch storage at all.
#[tokio::test]
async fn session_media_upload_is_rate_limited_per_ip() {
    let Some(mut state) = common::build_media_test_state(MEDIA_TEST_BUCKET).await else {
        eprintln!("skipping: no DB/MinIO reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    // Production default is 120/60s per IP; 2 keeps the burst small.
    state.session_media_limiter = RateLimiter::new(2, 60, None);
    let app = common::test_app(state);

    let qid = published_questionnaire(&app).await;
    let (status, session) = common::send(&app, create_session_req(qid, "203.0.113.90", None)).await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "anon create session: {session:?}"
    );
    let sid = session["id"].as_str().expect("session id").to_string();

    for i in 0..2 {
        let (status, json) = common::send(&app, session_media_req(&sid, "answer.png", 1024)).await;
        assert_eq!(
            status,
            StatusCode::CREATED,
            "upload {i} is within the rate budget: {json:?}"
        );
    }

    let (status, _json) = common::send(&app, session_media_req(&sid, "answer.png", 1024)).await;
    assert_eq!(
        status,
        StatusCode::TOO_MANY_REQUESTS,
        "the anonymous upload route must be rate-limited"
    );
}
