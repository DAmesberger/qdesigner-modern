//! Storage-client integration tests against a real MinIO (P3-T3, resolves
//! F077).
//!
//! Closes the zero-coverage gap on `storage::s3::S3StorageService`. Every
//! test constructs the service through the production
//! [`S3StorageService::new`] entry point — which itself exercises the
//! create-if-missing bucket path — using a dedicated `qdesigner-media-test`
//! bucket so it never collides with the app's `qdesigner-media`.
//!
//! Reachability follows the shared T1 gate: with `REQUIRE_DB` set an
//! unreachable MinIO is a hard panic (no false green); without it the tests
//! skip cleanly so a bare `cargo test` on a machine with no object store
//! still passes.

mod common;

use std::time::Duration;

use qdesigner_server::error::ApiError;
use qdesigner_server::storage::s3::{ObjectStream, S3StorageService};

const TEST_BUCKET: &str = "qdesigner-media-test";

/// Build the service against env-configured MinIO, or apply the shared
/// reachability gate (panic under `REQUIRE_DB`, else skip).
async fn storage_or_skip() -> Option<S3StorageService> {
    let (endpoint, access, secret) = common::minio_params();
    match S3StorageService::new(&endpoint, &access, &secret, TEST_BUCKET).await {
        Ok(s) => Some(s),
        Err(e) => {
            if common::require_db() {
                panic!("REQUIRE_DB=1 but MinIO unreachable at {endpoint}: {e}");
            }
            None
        }
    }
}

/// Drain an [`ObjectStream`]'s (possibly partial) body into a `Vec<u8>`.
async fn drain(obj: ObjectStream) -> Vec<u8> {
    obj.body
        .collect()
        .await
        .expect("collect object body")
        .into_bytes()
        .to_vec()
}

#[tokio::test]
async fn upload_get_range_presign_delete_roundtrip() {
    let Some(storage) = storage_or_skip().await else {
        return;
    };

    // 16 known bytes: 0,1,2,…,15.
    let data: Vec<u8> = (0u8..16).collect();
    let key = format!("p3t3-storage/{}.bin", uuid::Uuid::new_v4());

    // ── upload ──────────────────────────────────────────────────────
    storage
        .upload(&key, data.clone(), "application/octet-stream")
        .await
        .expect("upload should succeed");

    // ── full get_object ─────────────────────────────────────────────
    let full = storage
        .get_object(&key, None)
        .await
        .expect("full get should succeed");
    assert!(
        full.content_range.is_none(),
        "a full (rangeless) get must not report a content_range"
    );
    assert_eq!(full.content_length, Some(16), "full length is 16 bytes");
    assert_eq!(drain(full).await, data, "full body must round-trip exactly");

    // ── ranged get_object: bytes=2-5 → exactly bytes 2,3,4,5 ─────────
    let ranged = storage
        .get_object(&key, Some("bytes=2-5"))
        .await
        .expect("ranged get should succeed");
    assert!(
        ranged.content_range.is_some(),
        "a served range must populate content_range (→ 206 semantics)"
    );
    assert_eq!(ranged.content_length, Some(4), "range 2-5 is 4 bytes");
    assert_eq!(
        drain(ranged).await,
        vec![2u8, 3, 4, 5],
        "ranged body must be exactly the requested slice"
    );

    // ── presigned_url ───────────────────────────────────────────────
    let url = storage
        .presigned_url(&key, Duration::from_secs(60))
        .await
        .expect("presign should succeed");
    assert!(
        url.starts_with("http"),
        "presigned url should be absolute: {url}"
    );
    assert!(
        url.contains("X-Amz-Signature"),
        "presigned url should carry a SigV4 signature: {url}"
    );

    // ── delete, then confirm the object is gone (404 mapping) ────────
    storage.delete(&key).await.expect("delete should succeed");

    let after = storage.get_object(&key, None).await;
    match after {
        Err(ApiError::NotFound(_)) => {}
        Err(other) => panic!("expected NotFound after delete, got {other:?}"),
        Ok(_) => panic!("object should not be readable after delete"),
    }
}
