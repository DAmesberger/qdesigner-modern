use aws_config::Region;
use aws_sdk_s3::{
    config::{Builder as S3ConfigBuilder, Credentials},
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
            .endpoint_url(endpoint)
            .region(Region::new("us-east-1"))
            .credentials_provider(creds)
            .force_path_style(true) // required for MinIO
            .build();

        let client = Client::from_conf(config);

        // Ensure the bucket exists
        let exists = client
            .head_bucket()
            .bucket(bucket)
            .send()
            .await;

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
    pub async fn presigned_url(
        &self,
        key: &str,
        expires_in: Duration,
    ) -> Result<String, ApiError> {
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
}

#[derive(Debug, serde::Serialize)]
pub struct S3Object {
    pub key: String,
    pub size: i64,
    pub last_modified: String,
}
