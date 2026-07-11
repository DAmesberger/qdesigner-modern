use aws_config::Region;
use aws_sdk_s3::{
    config::{BehaviorVersion, Builder as S3ConfigBuilder, Credentials},
    presigning::PresigningConfig,
    primitives::ByteStream,
    Client,
};
use std::time::Duration;
use uuid::Uuid;

use crate::error::ApiError;

#[derive(Clone)]
pub struct S3StorageService {
    client: Client,
    bucket: String,
}

impl S3StorageService {
    pub async fn new(
        endpoint: &str,
        access_key: &str,
        secret_key: &str,
        bucket: &str,
    ) -> Result<Self, ApiError> {
        let creds = Credentials::new(access_key, secret_key, None, None, "static");

        let config = S3ConfigBuilder::new()
            .behavior_version(BehaviorVersion::latest())
            .endpoint_url(endpoint)
            .region(Region::new("us-east-1"))
            .credentials_provider(creds)
            .force_path_style(true) // required for MinIO
            .build();

        let client = Client::from_conf(config);

        // Ensure the bucket exists
        let exists = client.head_bucket().bucket(bucket).send().await;

        if exists.is_err() {
            client
                .create_bucket()
                .bucket(bucket)
                .send()
                .await
                .map_err(|e| ApiError::Internal(format!("Failed to create S3 bucket: {e}")))?;
            tracing::info!("Created S3 bucket: {bucket}");
        }

        Ok(Self {
            client,
            bucket: bucket.to_string(),
        })
    }

    /// Test-support: constructs the client without the network bucket probe.
    ///
    /// Mirrors [`new`](Self::new) up to `Client::from_conf`, but skips the
    /// `head_bucket`/`create_bucket` round-trip so an `S3StorageService` can be
    /// built with no reachable MinIO/S3 — the HTTP handler harness needs only
    /// Postgres up and never touches storage.
    pub fn new_unchecked(endpoint: &str, access_key: &str, secret_key: &str, bucket: &str) -> Self {
        let creds = Credentials::new(access_key, secret_key, None, None, "static");

        let config = S3ConfigBuilder::new()
            .behavior_version(BehaviorVersion::latest())
            .endpoint_url(endpoint)
            .region(Region::new("us-east-1"))
            .credentials_provider(creds)
            .force_path_style(true) // required for MinIO
            .build();

        let client = Client::from_conf(config);

        Self {
            client,
            bucket: bucket.to_string(),
        }
    }

    /// Upload a file and return the storage key.
    pub async fn upload(
        &self,
        key: &str,
        body: Vec<u8>,
        content_type: &str,
    ) -> Result<String, ApiError> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(body))
            .content_type(content_type)
            .send()
            .await
            .map_err(|e| ApiError::Internal(format!("S3 upload failed: {e}")))?;

        Ok(key.to_string())
    }

    /// Generate a presigned GET URL valid for the given duration.
    pub async fn presigned_url(&self, key: &str, expires_in: Duration) -> Result<String, ApiError> {
        let presign_config = PresigningConfig::builder()
            .expires_in(expires_in)
            .build()
            .map_err(|e| ApiError::Internal(format!("Presign config error: {e}")))?;

        let url = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .presigned(presign_config)
            .await
            .map_err(|e| ApiError::Internal(format!("Presigning failed: {e}")))?;

        Ok(url.uri().to_string())
    }

    /// Generate a presigned GET URL that forces a download rather than an
    /// inline render.
    ///
    /// Pins `response-content-disposition: attachment` (with a sanitized
    /// filename) into the presign so S3/MinIO echoes it as a response header.
    /// Session-media answers can now be documents (PDF/office/zip/text, issue
    /// #48); none of them may render inline from our origin, so every
    /// session-media URL is served as an attachment regardless of type.
    pub async fn presigned_download_url(
        &self,
        key: &str,
        expires_in: Duration,
        download_filename: &str,
    ) -> Result<String, ApiError> {
        let presign_config = PresigningConfig::builder()
            .expires_in(expires_in)
            .build()
            .map_err(|e| ApiError::Internal(format!("Presign config error: {e}")))?;

        let disposition = format!(
            "attachment; filename=\"{}\"",
            sanitize_download_filename(download_filename)
        );

        let url = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .response_content_disposition(disposition)
            .presigned(presign_config)
            .await
            .map_err(|e| ApiError::Internal(format!("Presigning failed: {e}")))?;

        Ok(url.uri().to_string())
    }

    /// Stream an object's bytes from S3, optionally a single byte range.
    ///
    /// `range` is passed straight through as an HTTP `Range` header value
    /// (e.g. `"bytes=0-1023"`); S3/MinIO performs the range selection and
    /// returns a partial body plus a `Content-Range`. The returned
    /// [`ObjectStream`] carries the raw [`ByteStream`] — the body is NOT
    /// buffered into memory, so large media (video) streams straight
    /// through the proxy. When a range was honored, `content_range` is
    /// populated and the caller should reply `206 Partial Content`.
    pub async fn get_object(
        &self,
        key: &str,
        range: Option<&str>,
    ) -> Result<ObjectStream, ApiError> {
        let mut req = self.client.get_object().bucket(&self.bucket).key(key);
        if let Some(r) = range {
            req = req.range(r);
        }

        let output = match req.send().await {
            Ok(o) => o,
            Err(e) => {
                // Missing object (e.g. an orphaned DB row) → 404 rather
                // than a 500. `as_service_error` never panics on transport
                // errors (unlike `into_service_error`).
                if e.as_service_error()
                    .map(|se| se.is_no_such_key())
                    .unwrap_or(false)
                {
                    return Err(ApiError::NotFound("Media object not found".into()));
                }
                return Err(ApiError::Internal(format!("S3 get failed: {e}")));
            }
        };

        Ok(ObjectStream {
            content_type: output.content_type().map(str::to_string),
            content_length: output.content_length(),
            content_range: output.content_range().map(str::to_string),
            body: output.body,
        })
    }

    /// Delete an object by key.
    pub async fn delete(&self, key: &str) -> Result<(), ApiError> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| ApiError::Internal(format!("S3 delete failed: {e}")))?;

        Ok(())
    }

    /// List objects with an optional prefix.
    #[allow(dead_code)]
    pub async fn list(&self, prefix: Option<&str>) -> Result<Vec<S3Object>, ApiError> {
        let mut builder = self.client.list_objects_v2().bucket(&self.bucket);
        if let Some(p) = prefix {
            builder = builder.prefix(p);
        }

        let output = builder
            .send()
            .await
            .map_err(|e| ApiError::Internal(format!("S3 list failed: {e}")))?;

        let objects = output
            .contents()
            .iter()
            .map(|obj| S3Object {
                key: obj.key().unwrap_or_default().to_string(),
                size: obj.size().unwrap_or(0),
                last_modified: obj
                    .last_modified()
                    .map(|t| t.to_string())
                    .unwrap_or_default(),
            })
            .collect();

        Ok(objects)
    }

    /// Generate a unique storage key for an upload.
    pub fn generate_key(org_id: Uuid, filename: &str) -> String {
        let id = Uuid::new_v4();
        let ext = std::path::Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        format!("{org_id}/{id}.{ext}")
    }

    /// Generate a unique, region-prefixed storage key for an upload
    /// (E-RBAC-9 data residency). New media lands under
    /// `{region}/{org_id}/{uuid}.{ext}` so a data-location commitment is
    /// encoded in the object namespace — the enforcement point for
    /// residency claims (and the seam a future bucket-per-region router
    /// keys off). `region` is sanitized to a safe path segment.
    pub fn generate_region_key(region: &str, org_id: Uuid, filename: &str) -> String {
        let region = sanitize_region(region);
        let id = Uuid::new_v4();
        let ext = std::path::Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        format!("{region}/{org_id}/{id}.{ext}")
    }

    /// Storage key for an org's GDPR export artifact (E-RBAC-9): a
    /// region-prefixed, deterministic path keyed by the export job id.
    pub fn export_key(region: &str, org_id: Uuid, job_id: Uuid) -> String {
        let region = sanitize_region(region);
        format!("{region}/exports/{org_id}/{job_id}.zip")
    }
}

/// Reduce an untrusted upload filename to a safe ASCII token for a
/// `Content-Disposition: attachment; filename="…"` header.
///
/// Keeps only the final path component, then restricts to characters that
/// cannot break out of the quoted filename token or inject a header
/// (alphanumerics plus a small safe punctuation set); everything else
/// becomes `_`. Falls back to `download` when nothing safe remains. The
/// result contains no `"`, `\`, `/`, or control bytes, so it is safe to
/// embed directly in the header value.
fn sanitize_download_filename(filename: &str) -> String {
    let base = filename.rsplit(['/', '\\']).next().unwrap_or(filename);
    let safe: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ' | '(' | ')' | '+') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let safe = safe.trim().trim_matches('.').trim().to_string();
    if safe.is_empty() {
        "download".to_string()
    } else {
        safe
    }
}

/// Reduce a residency region tag to a safe single path segment
/// (lowercase alphanumerics + `-`), falling back to `eu` when empty. Keeps
/// an operator-supplied region from injecting `/` or `..` into a key.
fn sanitize_region(region: &str) -> String {
    let cleaned: String = region
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let cleaned = cleaned.trim_matches('-').to_string();
    if cleaned.is_empty() {
        "eu".to_string()
    } else {
        cleaned
    }
}

#[derive(Debug, serde::Serialize)]
#[allow(dead_code)]
pub struct S3Object {
    pub key: String,
    pub size: i64,
    pub last_modified: String,
}

/// Streaming handle for a single object GET. Wraps the raw, un-buffered
/// [`ByteStream`] plus the response metadata the media proxy needs to
/// build its HTTP headers.
pub struct ObjectStream {
    /// The un-buffered object body straight from S3.
    pub body: ByteStream,
    /// S3-reported content type (the DB `content_type` is authoritative
    /// for the proxy response; this is exposed for completeness).
    pub content_type: Option<String>,
    /// Byte length of the (possibly partial) body S3 returned.
    pub content_length: Option<i64>,
    /// Present iff S3 honored a `Range` request — signals `206` semantics.
    pub content_range: Option<String>,
}
