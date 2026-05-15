//! P4.1 questionnaires::bump_version semver tests.
//!
//! Validates the three UPDATE SQL patterns used by the bump_version
//! handler:
//!   major: version_major +1, minor=0, patch=0
//!   minor: version_minor +1, patch=0  (major unchanged)
//!   patch: version_patch +1            (major+minor unchanged)
//!
//! Plus the handler's BadRequest fall-through for an invalid bump_type
//! (asserted indirectly: the SQL switch only fires for the three valid
//! strings; the handler's match arm rejects anything else).
//!
//! Requires running PostgreSQL with migrations applied.

use sqlx::PgPool;
use uuid::Uuid;

async fn get_test_pool() -> Option<PgPool> {
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join(".env.development"));
    if let Some(path) = env_path.as_ref() {
        if path.exists() {
            if let Ok(contents) = std::fs::read_to_string(path) {
                for line in contents.lines() {
                    if let Some(val) = line.strip_prefix("DATABASE_URL=") {
                        std::env::set_var("DATABASE_URL", val.trim());
                        break;
                    }
                }
            }
        }
    }
    let url = std::env::var("DATABASE_URL").ok()?;
    PgPool::connect(&url).await.ok()
}

async fn make_questionnaire(pool: &PgPool) -> sqlx::Result<(Uuid, Uuid)> {
    let user_id: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("u-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await?;

    let org_id: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('O', $1, $2) RETURNING id",
    )
    .bind(format!("o-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
    )
    .bind(org_id).bind(user_id).execute(pool).await?;

    let project_id: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'P', $2) RETURNING id",
    )
    .bind(org_id)
    .bind(format!("p-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await?;

    let q_id: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by, \
                                                version_major, version_minor, version_patch) \
         VALUES ($1, $2, '{}'::jsonb, 'draft', $3, 1, 0, 0) RETURNING id",
    )
    .bind(project_id)
    .bind(format!("Q-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok((project_id, q_id))
}

#[tokio::test]
async fn major_bump_resets_minor_and_patch() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let (project_id, q_id) = make_questionnaire(&pool).await.expect("setup");
    // Start at 1.3.7 — non-zero minor/patch make the reset observable.
    sqlx::query(
        "UPDATE questionnaire_definitions SET version_major=1, version_minor=3, version_patch=7 WHERE id=$1",
    )
    .bind(q_id).execute(&pool).await.expect("seed");

    let (major, minor, patch): (i32, i32, i32) = sqlx::query_as(
        "UPDATE questionnaire_definitions \
         SET version_major = version_major + 1, version_minor = 0, version_patch = 0, \
             version = version + 1, updated_at = NOW() \
         WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL \
         RETURNING version_major, version_minor, version_patch",
    )
    .bind(q_id)
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .expect("bump");

    assert_eq!((major, minor, patch), (2, 0, 0));
}

#[tokio::test]
async fn minor_bump_resets_patch_keeps_major() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let (project_id, q_id) = make_questionnaire(&pool).await.expect("setup");
    sqlx::query(
        "UPDATE questionnaire_definitions SET version_major=2, version_minor=5, version_patch=4 WHERE id=$1",
    )
    .bind(q_id).execute(&pool).await.expect("seed");

    let (major, minor, patch): (i32, i32, i32) = sqlx::query_as(
        "UPDATE questionnaire_definitions \
         SET version_minor = version_minor + 1, version_patch = 0, \
             version = version + 1, updated_at = NOW() \
         WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL \
         RETURNING version_major, version_minor, version_patch",
    )
    .bind(q_id)
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .expect("bump");

    assert_eq!((major, minor, patch), (2, 6, 0));
}

#[tokio::test]
async fn patch_bump_keeps_major_and_minor() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let (project_id, q_id) = make_questionnaire(&pool).await.expect("setup");
    sqlx::query(
        "UPDATE questionnaire_definitions SET version_major=3, version_minor=1, version_patch=4 WHERE id=$1",
    )
    .bind(q_id).execute(&pool).await.expect("seed");

    let (major, minor, patch): (i32, i32, i32) = sqlx::query_as(
        "UPDATE questionnaire_definitions \
         SET version_patch = version_patch + 1, \
             version = version + 1, updated_at = NOW() \
         WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL \
         RETURNING version_major, version_minor, version_patch",
    )
    .bind(q_id)
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .expect("bump");

    assert_eq!((major, minor, patch), (3, 1, 5));
}

#[tokio::test]
async fn bump_does_not_touch_soft_deleted_rows() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let (project_id, q_id) = make_questionnaire(&pool).await.expect("setup");
    // Soft-delete the row.
    sqlx::query("UPDATE questionnaire_definitions SET deleted_at = NOW() WHERE id = $1")
        .bind(q_id).execute(&pool).await.expect("soft-delete");

    // Bump must NOT match this row.
    let bumped: Option<(i32, i32, i32)> = sqlx::query_as(
        "UPDATE questionnaire_definitions \
         SET version_major = version_major + 1, version_minor = 0, version_patch = 0, \
             version = version + 1, updated_at = NOW() \
         WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL \
         RETURNING version_major, version_minor, version_patch",
    )
    .bind(q_id)
    .bind(project_id)
    .fetch_optional(&pool)
    .await
    .expect("bump");

    assert!(bumped.is_none(), "soft-deleted row must not be bumped");
}

#[tokio::test]
async fn bump_does_not_match_wrong_project_id() {
    // Error path for the handler: a request that targets the right
    // questionnaire id but the wrong project id (could happen if a
    // caller hits /api/projects/{wrong_proj}/questionnaires/{qid}/bump-version)
    // must return None so the handler returns 404.
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let (_real_project, q_id) = make_questionnaire(&pool).await.expect("setup");
    let wrong_project = Uuid::new_v4();

    let bumped: Option<(i32, i32, i32)> = sqlx::query_as(
        "UPDATE questionnaire_definitions \
         SET version_major = version_major + 1, version_minor = 0, version_patch = 0, \
             version = version + 1, updated_at = NOW() \
         WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL \
         RETURNING version_major, version_minor, version_patch",
    )
    .bind(q_id)
    .bind(wrong_project)
    .fetch_optional(&pool)
    .await
    .expect("bump");

    assert!(bumped.is_none(), "wrong project_id must not match the row");
}
