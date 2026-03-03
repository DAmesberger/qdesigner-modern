# RBAC Permission Matrix

This document provides a complete reference for the Role-Based Access Control (RBAC) system in QDesigner Modern. It covers every API endpoint, the role hierarchy, and the authorization checks enforced at both the application and database levels.

## Role Hierarchy

### Organization Roles

Roles are ranked by privilege level. A higher role inherits all permissions of lower roles.

| Level | Role     | Description                                      |
|-------|----------|--------------------------------------------------|
| 4     | `owner`  | Full control. Can delete the organization.       |
| 3     | `admin`  | Manage members, invitations, settings. Cannot delete org. |
| 2     | `member` | Create projects, questionnaires. Read/write data.|
| 1     | `viewer` | Read-only access to org resources.               |

### Project Roles

| Level | Role     | Description                                      |
|-------|----------|--------------------------------------------------|
| 4     | `owner`  | Full control over the project.                   |
| 3     | `admin`  | Manage project members. Cannot delete project.   |
| 2     | `editor` | Edit questionnaires, view data.                  |
| 1     | `viewer` | Read-only access to project resources.           |

### Role Inheritance

Organization roles cascade to projects:
- Org `owner`/`admin` have implicit admin-level access to all projects in the org.
- Org `member`/`viewer` can view projects but need explicit project-level roles for write access.
- Project-level roles are checked first; if insufficient, the system falls back to org-level roles.

## API Endpoint Permission Matrix

### Legend

| Symbol | Meaning |
|--------|---------|
| Y      | Allowed |
| --     | Denied  |
| Pub    | Public (no auth required) |
| Opt    | Optional auth (anonymous participants allowed for published questionnaires) |

---

### Authentication Endpoints (`/api/auth/*`)

| Endpoint                          | Method | Unauth | Any User |
|-----------------------------------|--------|--------|----------|
| `/api/auth/register`              | POST   | Pub    | Pub      |
| `/api/auth/login`                 | POST   | Pub    | Pub      |
| `/api/auth/refresh`               | POST   | Pub    | Pub      |
| `/api/auth/logout`                | POST   | --     | Y        |
| `/api/auth/me`                    | GET    | --     | Y        |
| `/api/auth/verify-email`          | POST   | Pub    | Pub      |
| `/api/auth/verify-email/send`     | POST   | Pub    | Pub      |
| `/api/auth/verify-email/verify`   | POST   | Pub    | Pub      |
| `/api/auth/verify-email/resend`   | POST   | Pub    | Pub      |
| `/api/auth/password-reset`        | POST   | Pub    | Pub      |

### User Profile (`/api/users/*`)

| Endpoint         | Method | Unauth | Viewer | Member | Editor | Admin | Owner |
|------------------|--------|--------|--------|--------|--------|-------|-------|
| `/api/users/me`  | GET    | --     | Y      | Y      | Y      | Y     | Y     |
| `/api/users/me`  | PATCH  | --     | Y      | Y      | Y      | Y     | Y     |

Users can only read/update their own profile.

### Organizations (`/api/organizations/*`)

| Endpoint                                         | Method | Unauth | Viewer | Member | Admin | Owner |
|--------------------------------------------------|--------|--------|--------|--------|-------|-------|
| `/api/organizations`                             | GET    | --     | Y      | Y      | Y     | Y     |
| `/api/organizations`                             | POST   | --     | Y      | Y      | Y     | Y     |
| `/api/organizations/{id}`                        | GET    | --     | Y      | Y      | Y     | Y     |
| `/api/organizations/{id}`                        | PATCH  | --     | --     | --     | Y     | Y     |
| `/api/organizations/{id}`                        | DELETE | --     | --     | --     | --    | Y     |
| `/api/organizations/{id}/members`                | GET    | --     | Y      | Y      | Y     | Y     |
| `/api/organizations/{id}/members`                | POST   | --     | --     | --     | Y     | Y     |
| `/api/organizations/{id}/members/{user_id}`      | DELETE | --     | --     | --     | Y     | Y     |
| `/api/organizations/{id}/invitations`            | GET    | --     | --     | --     | Y     | Y     |
| `/api/organizations/{id}/invitations`            | POST   | --     | --     | --     | Y     | Y     |
| `/api/organizations/{id}/invitations/{inv_id}`   | DELETE | --     | --     | --     | Y     | Y     |

Notes:
- `GET /api/organizations` returns only orgs where the user is an active member.
- `GET /api/organizations/{id}` requires active membership in the org.
- Creating an org makes the creator the `owner`.
- Only `owner` can assign the `owner` role to other members.
- Cannot remove the last owner of an organization.
- Role values are validated: must be `owner`, `admin`, `member`, or `viewer`.

### Invitations (`/api/invitations/*`)

| Endpoint                          | Method | Unauth | Any User (own email) |
|-----------------------------------|--------|--------|----------------------|
| `/api/invitations/pending`        | GET    | --     | Y                    |
| `/api/invitations/{id}/accept`    | POST   | --     | Y                    |
| `/api/invitations/{id}/decline`   | POST   | --     | Y                    |

Notes:
- Users can only see/accept/decline invitations sent to their own email.
- Invitations are verified against the authenticated user's email.

### Projects (`/api/projects/*`)

| Endpoint                                  | Method | Unauth | Org Viewer | Org Member | Org Admin | Org Owner |
|-------------------------------------------|--------|--------|------------|------------|-----------|-----------|
| `/api/projects`                           | GET    | --     | Y          | Y          | Y         | Y         |
| `/api/projects`                           | POST   | --     | --         | Y          | Y         | Y         |
| `/api/projects/{id}`                      | GET    | --     | Y          | Y          | Y         | Y         |
| `/api/projects/{id}`                      | PATCH  | --     | --         | --*        | Y         | Y         |
| `/api/projects/{id}`                      | DELETE | --     | --         | --         | Y         | Y         |
| `/api/projects/{id}/members`              | GET    | --     | Y          | Y          | Y         | Y         |
| `/api/projects/{id}/members`              | POST   | --     | --         | --*        | Y         | Y         |
| `/api/projects/{id}/members/{uid}`        | PATCH  | --     | --         | --*        | Y         | Y         |
| `/api/projects/{id}/members/{uid}`        | DELETE | --     | --         | --*        | Y         | Y         |

*Project-level roles also apply: project `editor`+ can PATCH, project `admin`+ can manage members, project `owner` or org `admin`+ can delete.

Notes:
- `GET /api/projects` only returns projects in orgs where the user is an active member.
- Creating a project requires `member`+ role in the target org.
- The project creator becomes the project `owner`.
- Role values validated: must be `owner`, `admin`, `editor`, or `viewer`.

### Questionnaires (`/api/projects/{id}/questionnaires/*`)

| Endpoint                                                   | Method | Unauth | Org Viewer | Proj Editor | Org Admin | Proj/Org Owner |
|------------------------------------------------------------|--------|--------|------------|-------------|-----------|----------------|
| `/api/projects/{id}/questionnaires`                        | GET    | --     | Y          | Y           | Y         | Y              |
| `/api/projects/{id}/questionnaires`                        | POST   | --     | --         | Y           | Y         | Y              |
| `/api/projects/{id}/questionnaires/{qid}`                  | GET    | --     | Y          | Y           | Y         | Y              |
| `/api/projects/{id}/questionnaires/{qid}`                  | PATCH  | --     | --         | Y           | Y         | Y              |
| `/api/projects/{id}/questionnaires/{qid}`                  | DELETE | --     | --         | Y           | Y         | Y              |
| `/api/projects/{id}/questionnaires/{qid}/publish`          | POST   | --     | --         | Y           | Y         | Y              |
| `/api/projects/{id}/questionnaires/{qid}/export`           | GET    | --     | Y          | Y           | Y         | Y              |

Notes:
- Read access requires org membership (via `verify_project_access`).
- Write access requires project-level `editor`+ role OR org-level `admin`+ role (via `verify_project_write_access`).
- Questionnaires are scoped by `project_id` in queries, preventing cross-project access.

### Public Questionnaire Access

| Endpoint                              | Method | Unauth | Any User |
|---------------------------------------|--------|--------|----------|
| `/api/questionnaires/by-code/{code}`  | GET    | Pub    | Pub      |

Notes:
- Only returns published questionnaires.
- The code is derived from the first 8 hex chars of the questionnaire UUID.
- Returns 404 for unpublished or deleted questionnaires.

### Sessions (`/api/sessions/*`)

| Endpoint                              | Method | Unauth | Participant (Published Q) | Org Member |
|---------------------------------------|--------|--------|---------------------------|------------|
| `/api/sessions`                       | POST   | Opt    | Y                         | Y          |
| `/api/sessions`                       | GET    | --     | --                        | Y          |
| `/api/sessions/aggregate`             | GET    | --     | --                        | Y          |
| `/api/sessions/compare`               | GET    | --     | --                        | Y          |
| `/api/sessions/dashboard`             | GET    | --     | --                        | Y          |
| `/api/sessions/{id}`                  | GET    | --     | --                        | Y          |
| `/api/sessions/{id}`                  | PATCH  | Opt    | Y                         | Y          |
| `/api/sessions/{id}/responses`        | GET    | --     | --                        | Y          |
| `/api/sessions/{id}/responses`        | POST   | Opt    | Y                         | Y          |
| `/api/sessions/{id}/events`           | GET    | --     | --                        | Y          |
| `/api/sessions/{id}/events`           | POST   | Opt    | Y                         | Y          |
| `/api/sessions/{id}/variables`        | GET    | --     | --                        | Y          |
| `/api/sessions/{id}/variables`        | POST   | Opt    | Y                         | Y          |

Notes:
- `POST /api/sessions` (create): Published questionnaires allow anonymous session creation. Unpublished require authentication.
- `GET /api/sessions` requires auth + `questionnaire_id` param. Verifies org membership through the questionnaire -> project -> org chain.
- Read endpoints (`GET` on sessions, responses, events, variables) require authentication and org membership verification.
- Write endpoints (`PATCH` session, `POST` responses/events/variables) allow anonymous access only for published questionnaires.
- `GET /api/sessions/dashboard` requires org membership for the specified `organization_id`.
- Aggregate and compare endpoints require auth and verify questionnaire access.

### Media (`/api/media/*`)

| Endpoint            | Method | Unauth | Org Viewer | Org Member | Org Admin | Org Owner | Uploader |
|---------------------|--------|--------|------------|------------|-----------|-----------|----------|
| `/api/media`        | GET    | --     | Y          | Y          | Y         | Y         | Y        |
| `/api/media`        | POST   | --     | --         | Y          | Y         | Y         | --       |
| `/api/media/{id}`   | GET    | --     | Y          | Y          | Y         | Y         | Y        |
| `/api/media/{id}`   | DELETE | --     | --         | --         | Y         | Y         | Y        |

Notes:
- List and get require org `viewer`+ role.
- Upload requires org `member`+ role.
- Delete requires org `admin`+ role OR being the original uploader.
- Media is scoped to organizations via `organization_id`.

### WebSocket (`/api/ws`)

| Endpoint      | Method | Unauth | Any User |
|---------------|--------|--------|----------|
| `/api/ws`     | GET    | --     | Y        |

Notes:
- JWT token is passed via `?token=` query parameter.
- Token is validated before WebSocket upgrade.
- Users can subscribe to channels and publish messages.
- Channel-level authorization is not enforced beyond authentication.

### Health Checks

| Endpoint     | Method | Unauth | Any User |
|--------------|--------|--------|----------|
| `/health`    | GET    | Pub    | Pub      |
| `/ready`     | GET    | Pub    | Pub      |

### Dev Helpers (debug mode only)

| Endpoint                         | Method | Unauth | Any User |
|----------------------------------|--------|--------|----------|
| `/api/dev/bootstrap-personas`    | POST   | Pub    | Pub      |

Notes:
- Only available when `cfg!(debug_assertions)` or `DEV_HELPERS_ENABLED=true`.
- Disabled in release builds.

## Data Isolation Architecture

### Foreign Key Chain

```
Organization
  |-- organization_members (user_id, role, status)
  |-- Project (organization_id FK)
        |-- project_members (user_id, role)
        |-- Questionnaire (project_id FK)
              |-- Session (questionnaire_id FK)
                    |-- Response (session_id FK)
                    |-- InteractionEvent (session_id FK)
                    |-- SessionVariable (session_id FK)
  |-- MediaAsset (organization_id FK)
```

All foreign keys use `ON DELETE CASCADE`, ensuring that deleting a parent entity removes all child data.

### Access Verification Pattern

For most endpoints, access is verified through the ownership chain:

1. **Org endpoints**: Direct `organization_members` lookup.
2. **Project endpoints**: `JOIN organization_members ON projects.organization_id`.
3. **Questionnaire endpoints**: `JOIN projects → JOIN organization_members`.
4. **Session read endpoints**: `JOIN questionnaire_definitions → JOIN projects → JOIN organization_members`.
5. **Session write endpoints**: Published questionnaires allow anonymous access; unpublished require the org membership chain.

### Database-Level Security (RLS)

Row-Level Security policies are defined in `server/db/migrations/010_rls_policies.sql` and mirror the application-level checks:

- Users can only see themselves or co-org-members.
- Organizations visible only to active members.
- Projects visible to org members; writable by project editors+ or org admins+.
- Questionnaires follow project access rules.
- Sessions/responses/events/variables: readable by org members; insertable/updatable by anyone (for participant endpoints).
- Media scoped to organization membership.

RLS context is set via `set_config('app.user_id', ...)` using parameterized queries (no SQL injection risk).

## Security Audit Findings (Fixed)

The following issues were identified and fixed:

### Critical (Fixed)
1. **`GET /api/sessions`**: Was completely unauthenticated. Now requires auth + `questionnaire_id` with org membership verification.
2. **`GET /api/sessions/aggregate`**: Was unauthenticated. Now requires auth + questionnaire access verification.
3. **`GET /api/sessions/compare`**: Was unauthenticated. Now requires auth + questionnaire access verification.
4. **`PATCH /api/sessions/{id}`**: Was unauthenticated. Now requires published-questionnaire check or org membership.
5. **`POST /api/sessions/{id}/responses`**: Was unauthenticated. Now verifies participant or org member access.
6. **`POST /api/sessions/{id}/events`**: Was unauthenticated. Now verifies participant or org member access.
7. **`POST /api/sessions/{id}/variables`**: Was unauthenticated. Now verifies participant or org member access.

### High (Fixed)
8. **`GET /api/sessions/{id}`**: Had auth but no ownership check. Now verifies questionnaire access through org chain.
9. **`GET /api/sessions/{id}/responses`**: Had auth but no ownership check. Now verifies questionnaire access.
10. **`GET /api/sessions/{id}/events`**: Had auth but no ownership check. Now verifies questionnaire access.
11. **`GET /api/sessions/{id}/variables`**: Had auth but no ownership check. Now verifies questionnaire access.

### Medium (Fixed)
12. **RLS context SQL injection**: `set_rls_context` middleware used `format!` string interpolation for SQL. Now uses parameterized `$1` binds.
13. **Role string validation**: Org member, invitation, and project member role fields now validate against allowed enum values instead of accepting arbitrary strings.
14. **Owner role escalation**: Only org owners can assign the `owner` role to prevent privilege escalation by admins.

### Acceptable Design Decisions
- **WebSocket channel authorization**: Currently any authenticated user can publish to any channel. This is acceptable for the current real-time collaboration feature set (all changes are via REST APIs with proper auth). Future enhancement: add channel-level org/project authorization.
- **Session creation for published questionnaires**: Intentionally allows anonymous access. This is the core participant flow for public questionnaires.
- **Email verification endpoints**: Intentionally public to support the onboarding flow before a user has a session.
