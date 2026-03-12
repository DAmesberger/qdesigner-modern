use axum::{extract::State, Json};
use serde_json::json;
use uuid::Uuid;

use crate::auth::password;
use crate::error::ApiError;
use crate::state::AppState;

struct DevPersona {
    id: Uuid,
    label: &'static str,
    full_name: &'static str,
    email_env: &'static str,
    password_env: &'static str,
}

fn env_required_nonempty(key: &str) -> Result<String, ApiError> {
    let value =
        std::env::var(key).map_err(|_| ApiError::BadRequest(format!("Missing env var: {key}")))?;

    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(ApiError::BadRequest(format!("Empty env var: {key}")));
    }

    Ok(trimmed.to_string())
}

fn env_optional_string(key: &str, fallback: &str) -> String {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn env_optional_nullable(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn dev_helpers_enabled() -> bool {
    cfg!(debug_assertions)
        || matches!(
            std::env::var("DEV_HELPERS_ENABLED")
                .ok()
                .as_deref()
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("1" | "true" | "yes" | "on")
        )
}

/// POST /api/dev/bootstrap-personas
///
/// Dev-only bootstrap route that provisions quick-login personas so local
/// development works even if the database starts empty.
pub async fn bootstrap_personas(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if !dev_helpers_enabled() {
        return Err(ApiError::Forbidden("Dev helpers are disabled".into()));
    }

    let personas = vec![
        DevPersona {
            id: Uuid::parse_str("11111111-1111-1111-1111-111111111111").expect("valid admin UUID"),
            label: "admin",
            full_name: "Test Admin",
            email_env: "VITE_DEV_LOGIN_ADMIN_EMAIL",
            password_env: "VITE_DEV_LOGIN_ADMIN_PASSWORD",
        },
        DevPersona {
            id: Uuid::parse_str("22222222-2222-2222-2222-222222222222").expect("valid editor UUID"),
            label: "editor",
            full_name: "Test Editor",
            email_env: "VITE_DEV_LOGIN_EDITOR_EMAIL",
            password_env: "VITE_DEV_LOGIN_EDITOR_PASSWORD",
        },
        DevPersona {
            id: Uuid::parse_str("33333333-3333-3333-3333-333333333333").expect("valid viewer UUID"),
            label: "viewer",
            full_name: "Test Viewer",
            email_env: "VITE_DEV_LOGIN_VIEWER_EMAIL",
            password_env: "VITE_DEV_LOGIN_VIEWER_PASSWORD",
        },
        DevPersona {
            id: Uuid::parse_str("44444444-4444-4444-4444-444444444444")
                .expect("valid participant UUID"),
            label: "participant",
            full_name: "Test Participant",
            email_env: "VITE_DEV_LOGIN_PARTICIPANT_EMAIL",
            password_env: "VITE_DEV_LOGIN_PARTICIPANT_PASSWORD",
        },
    ];

    let mut provisioned = Vec::with_capacity(personas.len());

    for persona in personas {
        let email = env_required_nonempty(persona.email_env)?;
        let password = env_required_nonempty(persona.password_env)?;
        let hash = password::hash_password(&password)?;

        sqlx::query(
            r#"
            INSERT INTO users (id, email, full_name, password_hash, email_verified)
            VALUES ($1, $2, $3, $4, true)
            ON CONFLICT (email) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                password_hash = EXCLUDED.password_hash,
                email_verified = true,
                deleted_at = NULL,
                updated_at = NOW()
            "#,
        )
        .bind(persona.id)
        .bind(&email)
        .bind(persona.full_name)
        .bind(hash)
        .execute(&state.pool)
        .await?;

        provisioned.push(json!({
            "id": persona.id,
            "persona": persona.label,
            "email": email
        }));
    }

    let org_id =
        Uuid::parse_str("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").expect("valid organization UUID");
    let project_id =
        Uuid::parse_str("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb").expect("valid project UUID");

    let org_name = env_optional_string("DEV_PERSONA_ORG_NAME", "Test Research Lab");
    let org_slug = env_optional_string("DEV_PERSONA_ORG_SLUG", "test-research-lab");
    let org_domain = env_optional_nullable("DEV_PERSONA_ORG_DOMAIN");
    let project_name = env_optional_string("DEV_PERSONA_PROJECT_NAME", "Test Project 1");
    let project_code = env_optional_string("DEV_PERSONA_PROJECT_CODE", "test-project-1");

    let admin_user =
        Uuid::parse_str("11111111-1111-1111-1111-111111111111").expect("valid admin UUID");
    let editor_user =
        Uuid::parse_str("22222222-2222-2222-2222-222222222222").expect("valid editor UUID");
    let viewer_user =
        Uuid::parse_str("33333333-3333-3333-3333-333333333333").expect("valid viewer UUID");
    let participant_user =
        Uuid::parse_str("44444444-4444-4444-4444-444444444444").expect("valid participant UUID");

    sqlx::query(
        r#"
        INSERT INTO organizations (id, name, slug, domain, settings, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            domain = EXCLUDED.domain,
            settings = EXCLUDED.settings,
            created_by = EXCLUDED.created_by,
            deleted_at = NULL,
            updated_at = NOW()
        "#,
    )
    .bind(org_id)
    .bind(&org_name)
    .bind(&org_slug)
    .bind(org_domain)
    .bind(json!({ "devSeeded": true, "source": "quick-login" }))
    .bind(admin_user)
    .execute(&state.pool)
    .await?;

    for (user_id, role) in [
        (admin_user, "owner"),
        (editor_user, "member"),
        (viewer_user, "viewer"),
        (participant_user, "member"),
    ] {
        sqlx::query(
            r#"
            INSERT INTO organization_members (organization_id, user_id, role, status)
            VALUES ($1, $2, $3, 'active')
            ON CONFLICT (organization_id, user_id) DO UPDATE SET
                role = EXCLUDED.role,
                status = EXCLUDED.status
            "#,
        )
        .bind(org_id)
        .bind(user_id)
        .bind(role)
        .execute(&state.pool)
        .await?;
    }

    sqlx::query(
        r#"
        INSERT INTO projects (
            id, organization_id, name, code, description, status, settings, created_by
        )
        VALUES (
            $1, $2, $3, $4, 'Development quick-login seeded project', 'active', $5, $6
        )
        ON CONFLICT (id) DO UPDATE SET
            organization_id = EXCLUDED.organization_id,
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            description = EXCLUDED.description,
            status = EXCLUDED.status,
            settings = EXCLUDED.settings,
            created_by = EXCLUDED.created_by,
            deleted_at = NULL,
            updated_at = NOW()
        "#,
    )
    .bind(project_id)
    .bind(org_id)
    .bind(&project_name)
    .bind(&project_code)
    .bind(json!({ "devSeeded": true, "source": "quick-login" }))
    .bind(admin_user)
    .execute(&state.pool)
    .await?;

    for (user_id, role) in [
        (admin_user, "owner"),
        (editor_user, "editor"),
        (viewer_user, "viewer"),
        (participant_user, "viewer"),
    ] {
        sqlx::query(
            r#"
            INSERT INTO project_members (project_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, user_id) DO UPDATE SET
                role = EXCLUDED.role
            "#,
        )
        .bind(project_id)
        .bind(user_id)
        .bind(role)
        .execute(&state.pool)
        .await?;
    }

    Ok(Json(json!({
        "ok": true,
        "organization_id": org_id,
        "project_id": project_id,
        "personas": provisioned
    })))
}
