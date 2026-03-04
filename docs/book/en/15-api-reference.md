# Chapter 15: API Reference

Complete reference for the QDesigner Modern REST API.

---

## Overview

The QDesigner Modern API is a RESTful JSON API served by a Rust/Axum backend. All endpoints use JSON request and response bodies unless otherwise noted. Authentication uses Bearer tokens in the `Authorization` header.

**Base URL**: `http://localhost:4000/api` (development)

### Error Format

All errors follow a consistent format:

```json
{
  "error": {
    "status": 400,
    "message": "Description of what went wrong"
  }
}
```

### Error Codes

| HTTP Status | Name | Description |
|---|---|---|
| 400 | Bad Request | Invalid input or missing required fields |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Authenticated but insufficient permissions |
| 404 | Not Found | Resource does not exist or has been deleted |
| 409 | Conflict | Resource already exists (e.g., duplicate email) |
| 422 | Unprocessable Entity | Validation error on input fields |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server-side error |

---

## Health

### GET /health

Liveness probe. Returns immediately without checking dependencies.

**Auth**: None

**Response** `200 OK`:
```json
{ "status": "ok" }
```

---

### GET /ready

Readiness probe. Checks database and Redis connectivity.

**Auth**: None

**Response** `200 OK`:
```json
{
  "status": "ready",
  "checks": {
    "database": true,
    "redis": true
  }
}
```

**Response** `503 Service Unavailable`:
```json
{
  "status": "degraded",
  "checks": {
    "database": true,
    "redis": false
  }
}
```

---

## Auth

### POST /api/auth/register

Create a new user account.

**Auth**: None

**Request Body**:
```json
{
  "email": "researcher@example.com",
  "password": "securePassword123",
  "full_name": "Dr. Jane Smith"
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| email | string | Yes | Valid email format |
| password | string | Yes | Minimum 8 characters |
| full_name | string | No | Defaults to email prefix |

**Response** `200 OK`:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "researcher@example.com",
    "full_name": "Dr. Jane Smith",
    "avatar_url": null,
    "roles": ["user"]
  }
}
```

**Errors**: `409 Conflict` if email already registered, `422` for validation errors.

---

### POST /api/auth/login

Authenticate and receive tokens.

**Auth**: None

**Request Body**:
```json
{
  "email": "researcher@example.com",
  "password": "securePassword123"
}
```

**Response** `200 OK`: Same format as register response.

**Errors**: `401 Unauthorized` for invalid credentials.

---

### POST /api/auth/refresh

Exchange a refresh token for a new token pair. The old refresh token is revoked (rotation).

**Auth**: None

**Request Body**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** `200 OK`: Same format as login response.

**Errors**: `401 Unauthorized` if refresh token is invalid or revoked.

---

### POST /api/auth/logout

Revoke the current access token and all refresh tokens for the user.

**Auth**: Required (Bearer token)

**Response** `200 OK`:
```json
{ "message": "Logged out" }
```

---

### GET /api/auth/me

Get the authenticated user's info.

**Auth**: Required

**Response** `200 OK`:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "researcher@example.com",
  "full_name": "Dr. Jane Smith",
  "avatar_url": null,
  "roles": ["owner"]
}
```

---

### POST /api/auth/verify-email

Verify email using a token (link-based verification).

**Auth**: None

**Request Body**:
```json
{
  "token": "abc123def456"
}
```

**Response** `200 OK`:
```json
{ "message": "Email verified" }
```

---

### POST /api/auth/verify-email/send

Send a 6-digit verification code to an email address. The code expires after 10 minutes.

**Auth**: None

**Request Body**:
```json
{
  "email": "researcher@example.com"
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "message": "Verification code sent"
}
```

---

### POST /api/auth/verify-email/verify

Verify email using a 6-digit code.

**Auth**: None

**Request Body**:
```json
{
  "email": "researcher@example.com",
  "code": "123456"
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

Or if invalid:
```json
{
  "success": false,
  "error": "Invalid or expired verification code"
}
```

---

### POST /api/auth/verify-email/resend

Alias for `/api/auth/verify-email/send`. Same behavior.

---

### POST /api/auth/password-reset

Request a password reset. Always returns success to prevent email enumeration.

**Auth**: None

**Request Body**:
```json
{
  "email": "researcher@example.com"
}
```

**Response** `200 OK`:
```json
{ "message": "If the email exists, a reset link has been sent" }
```

---

## Users

### GET /api/users/me

Get the authenticated user's full profile.

**Auth**: Required

**Response** `200 OK`:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "researcher@example.com",
  "full_name": "Dr. Jane Smith",
  "avatar_url": null,
  "timezone": "Europe/Berlin",
  "locale": "de-DE",
  "email_verified": true,
  "created_at": "2025-01-15T10:30:00Z"
}
```

---

### PATCH /api/users/me

Update the authenticated user's profile.

**Auth**: Required

**Request Body** (all fields optional):
```json
{
  "full_name": "Prof. Jane Smith",
  "avatar_url": "https://example.com/avatar.jpg",
  "timezone": "Europe/Berlin",
  "locale": "de-DE"
}
```

| Field | Type | Validation |
|---|---|---|
| full_name | string | 1-255 characters |
| avatar_url | string | Valid URL |
| timezone | string | IANA timezone identifier |
| locale | string | BCP 47 language tag |

**Response** `200 OK`: Same format as GET response with updated values.

---

## Organizations

### GET /api/organizations

List organizations where the user is an active member.

**Auth**: Required

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| limit | integer | 50 | Max results (capped at 100) |
| offset | integer | 0 | Pagination offset |

**Response** `200 OK`:
```json
[
  {
    "id": "org-uuid",
    "name": "Research Lab",
    "slug": "research-lab",
    "domain": "lab.university.edu",
    "logo_url": null,
    "settings": {},
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z"
  }
]
```

---

### POST /api/organizations

Create a new organization. The creator becomes the owner.

**Auth**: Required

**Request Body**:
```json
{
  "name": "Research Lab",
  "slug": "research-lab",
  "domain": "lab.university.edu",
  "logo_url": "https://example.com/logo.png"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| name | string | Yes | 1-255 characters |
| slug | string | No | Auto-generated from name if omitted |
| domain | string | No | Organization domain |
| logo_url | string | No | Logo URL |

**Response** `201 Created`: Organization object.

**Errors**: `409 Conflict` if slug is taken.

---

### GET /api/organizations/{id}

Get a single organization. Requires active membership.

**Auth**: Required (member)

**Response** `200 OK`: Organization object.

---

### PATCH /api/organizations/{id}

Update organization details.

**Auth**: Required (admin or owner)

**Request Body** (all fields optional):
```json
{
  "name": "Updated Lab Name",
  "domain": "newdomain.edu",
  "logo_url": "https://new-logo.png",
  "settings": { "theme": "dark" }
}
```

**Response** `200 OK`: Updated organization object.

---

### DELETE /api/organizations/{id}

Soft-delete an organization.

**Auth**: Required (owner only)

**Response** `200 OK`:
```json
{ "message": "Organization deleted" }
```

---

### GET /api/organizations/{id}/members

List all members of an organization.

**Auth**: Required (member)

**Response** `200 OK`:
```json
[
  {
    "user_id": "user-uuid",
    "email": "member@example.com",
    "full_name": "John Doe",
    "role": "editor",
    "status": "active",
    "joined_at": "2025-01-15T10:30:00Z"
  }
]
```

---

### POST /api/organizations/{id}/members

Add a member to the organization by email.

**Auth**: Required (admin or owner)

**Request Body**:
```json
{
  "email": "newmember@example.com",
  "role": "editor"
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| email | string | Yes | Valid email of existing user |
| role | string | Yes | `owner`, `admin`, `editor`, `viewer` |

**Response** `201 Created`:
```json
{ "message": "Member added" }
```

---

### DELETE /api/organizations/{id}/members/{user_id}

Remove a member. Cannot remove the last owner.

**Auth**: Required (admin or owner)

**Response** `200 OK`:
```json
{ "message": "Member removed" }
```

---

### GET /api/organizations/{id}/invitations

List pending invitations for an organization.

**Auth**: Required (admin or owner)

**Response** `200 OK`:
```json
[
  {
    "id": "inv-uuid",
    "email": "invited@example.com",
    "role": "editor",
    "invited_by": "user-uuid",
    "created_at": "2025-01-15T10:30:00Z",
    "expires_at": "2025-01-22T10:30:00Z"
  }
]
```

---

### POST /api/organizations/{id}/invitations

Create an invitation. Expires after 7 days.

**Auth**: Required (admin or owner)

**Request Body**:
```json
{
  "email": "invited@example.com",
  "role": "editor"
}
```

**Response** `201 Created`: Invitation object.

---

### DELETE /api/organizations/{id}/invitations/{inv_id}

Revoke a pending invitation.

**Auth**: Required (admin or owner)

**Response** `200 OK`:
```json
{ "message": "Invitation revoked" }
```

---

## Invitations

### GET /api/invitations/pending

List all pending invitations for the authenticated user's email.

**Auth**: Required

**Response** `200 OK`:
```json
[
  {
    "id": "inv-uuid",
    "organization_id": "org-uuid",
    "organization_name": "Research Lab",
    "email": "researcher@example.com",
    "role": "editor",
    "invited_by": "user-uuid",
    "created_at": "2025-01-15T10:30:00Z",
    "expires_at": "2025-01-22T10:30:00Z"
  }
]
```

---

### POST /api/invitations/{id}/accept

Accept an invitation. The user is added to the organization with the specified role.

**Auth**: Required

**Response** `200 OK`:
```json
{ "message": "Invitation accepted" }
```

---

### POST /api/invitations/{id}/decline

Decline an invitation.

**Auth**: Required

**Response** `200 OK`:
```json
{ "message": "Invitation declined" }
```

---

## Projects

### GET /api/projects

List projects accessible to the user.

**Auth**: Required

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| organization_id | UUID | None | Filter by organization |
| limit | integer | 50 | Max results (capped at 100) |
| offset | integer | 0 | Pagination offset |

**Response** `200 OK`:
```json
[
  {
    "id": "proj-uuid",
    "organization_id": "org-uuid",
    "name": "Reaction Time Study",
    "code": "RTS-001",
    "description": "Measuring cognitive load effects",
    "is_public": false,
    "status": "active",
    "max_participants": 200,
    "irb_number": "IRB-2025-042",
    "start_date": "2025-03-01",
    "end_date": "2025-06-30",
    "settings": {},
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-02-01T14:00:00Z"
  }
]
```

---

### POST /api/projects

Create a new project. Creator becomes project owner.

**Auth**: Required (organization member)

**Request Body**:
```json
{
  "organization_id": "org-uuid",
  "name": "Reaction Time Study",
  "code": "RTS-001",
  "description": "Measuring cognitive load effects",
  "is_public": false,
  "max_participants": 200,
  "irb_number": "IRB-2025-042",
  "start_date": "2025-03-01",
  "end_date": "2025-06-30"
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| organization_id | UUID | Yes | Must be member of org |
| name | string | Yes | 1-255 characters |
| code | string | Yes | 1-50 characters, unique identifier |
| description | string | No | Project description |
| is_public | boolean | No | Default: false |
| max_participants | integer | No | Participant cap |
| irb_number | string | No | IRB/ethics approval number |
| start_date | date | No | Format: YYYY-MM-DD |
| end_date | date | No | Format: YYYY-MM-DD |

**Response** `201 Created`: Project object.

---

### GET /api/projects/{id}

Get a single project.

**Auth**: Required (organization member)

**Response** `200 OK`: Project object.

---

### PATCH /api/projects/{id}

Update project details.

**Auth**: Required (project editor+ or org admin+)

**Request Body**: Any subset of project fields (except `organization_id` and `code`).

**Response** `200 OK`: Updated project object.

---

### DELETE /api/projects/{id}

Soft-delete a project.

**Auth**: Required (project owner or org admin)

**Response** `200 OK`:
```json
{ "message": "Project deleted" }
```

---

### GET /api/projects/{id}/members

List project members.

**Auth**: Required (organization member)

**Response** `200 OK`:
```json
[
  {
    "user_id": "user-uuid",
    "email": "member@example.com",
    "full_name": "John Doe",
    "role": "editor",
    "joined_at": "2025-01-15T10:30:00Z"
  }
]
```

---

### POST /api/projects/{id}/members

Add a member to the project.

**Auth**: Required (project admin+ or org admin+)

**Request Body**:
```json
{
  "email": "researcher@example.com",
  "role": "editor"
}
```

**Response** `201 Created`:
```json
{ "message": "Member added" }
```

---

### PATCH /api/projects/{id}/members/{uid}

Update a project member's role.

**Auth**: Required (project admin+ or org admin+)

**Request Body**:
```json
{
  "role": "admin"
}
```

**Response** `200 OK`:
```json
{ "message": "Member updated" }
```

---

### DELETE /api/projects/{id}/members/{uid}

Remove a project member. Cannot remove the last owner.

**Auth**: Required (project admin+ or org admin+)

**Response** `200 OK`:
```json
{ "message": "Member removed" }
```

---

## Questionnaires

### GET /api/questionnaires/by-code/{code}

Look up a published questionnaire by its short code. This is the public-facing endpoint used by participants.

**Auth**: None

**Path Parameters**:

| Param | Type | Description |
|---|---|---|
| code | string | 6-12 character alphanumeric short code |

**Response** `200 OK`:
```json
{
  "id": "q-uuid",
  "name": "Cognitive Load Survey",
  "definition": { "questions": [...], "pages": [...] },
  "is_active": true,
  "start_date": "2025-03-01",
  "end_date": "2025-06-30",
  "project": { "id": "proj-uuid", "name": "Reaction Time Study" },
  "variables": {},
  "global_scripts": {}
}
```

**Errors**: `404` if not found, not published, or project is inactive.

---

### GET /api/projects/{id}/questionnaires

List questionnaires in a project.

**Auth**: Required (organization member)

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| status | string | None | Filter by status (`draft`, `published`) |
| limit | integer | 50 | Max results (capped at 100) |
| offset | integer | 0 | Pagination offset |

**Response** `200 OK`:
```json
[
  {
    "id": "q-uuid",
    "project_id": "proj-uuid",
    "name": "Cognitive Load Survey",
    "description": "Pre/post measures",
    "version": 3,
    "content": { ... },
    "status": "draft",
    "settings": {},
    "created_by": "user-uuid",
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-02-01T14:00:00Z",
    "published_at": null
  }
]
```

---

### POST /api/projects/{id}/questionnaires

Create a new questionnaire.

**Auth**: Required (project editor+ or org admin+)

**Request Body**:
```json
{
  "name": "Cognitive Load Survey",
  "description": "Pre/post measures of cognitive load",
  "content": { "questions": [], "pages": [] },
  "settings": { "showProgressBar": true }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| name | string | Yes | 1-255 characters |
| description | string | No | Description |
| content | object | No | JSONB content (default: `{}`) |
| settings | object | No | JSONB settings (default: `{}`) |

**Response** `201 Created`: Questionnaire object.

---

### GET /api/projects/{id}/questionnaires/{qid}

Get a single questionnaire.

**Auth**: Required (organization member)

**Response** `200 OK`: Questionnaire object.

---

### PATCH /api/projects/{id}/questionnaires/{qid}

Update a questionnaire. Setting `status` to `published` triggers publication.

**Auth**: Required (project editor+ or org admin+)

**Request Body** (all fields optional):
```json
{
  "name": "Updated Name",
  "description": "New description",
  "content": { ... },
  "status": "published",
  "settings": { ... }
}
```

**Response** `200 OK`: Updated questionnaire object.

---

### POST /api/projects/{id}/questionnaires/{qid}/publish

Publish a questionnaire. Creates a version snapshot, sets status to `published`, and records `published_at`.

**Auth**: Required (project editor+ or org admin+)

**Response** `200 OK`: Published questionnaire object (includes `version_major`, `version_minor`, `version_patch`).

---

### POST /api/projects/{id}/questionnaires/{qid}/bump-version

Bump the questionnaire's semantic version.

**Auth**: Required (project editor+ or org admin+)

**Request Body**:
```json
{
  "bump_type": "minor"
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| bump_type | string | Yes | `major`, `minor`, `patch` |

Version bump rules:
- **major**: Increments major, resets minor and patch to 0 (e.g., `1.2.3` -> `2.0.0`)
- **minor**: Increments minor, resets patch to 0 (e.g., `1.2.3` -> `1.3.0`)
- **patch**: Increments patch (e.g., `1.2.3` -> `1.2.4`)

Creates a version snapshot before incrementing.

**Response** `200 OK`: Updated questionnaire object with new version fields.

---

### DELETE /api/projects/{id}/questionnaires/{qid}

Soft-delete a questionnaire.

**Auth**: Required (project editor+ or org admin+)

**Response** `200 OK`:
```json
{ "message": "Questionnaire deleted" }
```

---

### GET /api/projects/{id}/questionnaires/{qid}/export

Export response data for a questionnaire.

**Auth**: Required (organization member)

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| format | string | `json` | `json` or `csv` |

**Response** `200 OK` (JSON):
```json
[
  {
    "session_id": "sess-uuid",
    "participant_id": "P001",
    "session_status": "completed",
    "started_at": "2025-03-01T09:00:00Z",
    "completed_at": "2025-03-01T09:15:00Z",
    "question_id": "q1",
    "value": 4,
    "reaction_time_us": 1234567,
    "presented_at": "2025-03-01T09:01:00Z",
    "answered_at": "2025-03-01T09:01:01Z"
  }
]
```

**Response** `200 OK` (CSV): `Content-Type: text/csv`, `Content-Disposition: attachment; filename="export.csv"`.

---

## Sessions

### POST /api/sessions

Create a new participant session. Allows anonymous access for published questionnaires.

**Auth**: Optional (required if questionnaire is not published)

**Request Body**:
```json
{
  "questionnaire_id": "q-uuid",
  "participant_id": "P001",
  "version_major": 1,
  "version_minor": 2,
  "version_patch": 0,
  "browser_info": {
    "userAgent": "Mozilla/5.0...",
    "screenWidth": 1920,
    "screenHeight": 1080
  },
  "metadata": { "source": "email_campaign" }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| questionnaire_id | UUID | Yes | Must exist |
| participant_id | string | No | Auto-set to user ID if authenticated |
| version_major | integer | No | Questionnaire major version (auto-detected if omitted) |
| version_minor | integer | No | Questionnaire minor version (auto-detected if omitted) |
| version_patch | integer | No | Questionnaire patch version (auto-detected if omitted) |
| browser_info | object | No | Client environment metadata |
| metadata | object | No | Additional context |

If version fields are omitted, the server looks up the current version from the questionnaire definition.

**Response** `201 Created`: Session object (includes `questionnaire_version_major`, `questionnaire_version_minor`, `questionnaire_version_patch`).

---

### GET /api/sessions

List sessions with optional filters.

**Auth**: Required

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| questionnaire_id | UUID | None | Filter by questionnaire |
| participant_id | string | None | Filter by participant |
| status | string | None | `active`, `completed`, `abandoned`, `expired` |
| limit | integer | 50 | Max results (1-500) |
| offset | integer | 0 | Pagination offset |

**Response** `200 OK`: Array of session objects.

---

### GET /api/sessions/aggregate

Compute aggregate statistics across sessions.

**Auth**: Required

**Query Parameters**:

| Param | Type | Required | Description |
|---|---|---|---|
| questionnaire_id | UUID | Yes | Scope |
| key | string | Yes | Variable name or question ID |
| source | string | No | `variable` (default) or `response` |
| participant_id | string | No | Filter to one participant |

**Response** `200 OK`:
```json
{
  "questionnaire_id": "q-uuid",
  "source": "variable",
  "key": "total_score",
  "participant_count": 45,
  "stats": {
    "sample_count": 45,
    "mean": 72.3,
    "median": 74.0,
    "std_dev": 12.5,
    "min": 38.0,
    "max": 98.0,
    "p10": 55.0,
    "p25": 64.0,
    "p50": 74.0,
    "p75": 82.0,
    "p90": 88.0,
    "p95": 93.0,
    "p99": 97.0
  }
}
```

---

### GET /api/sessions/compare

Compare two participants on a specific metric.

**Auth**: Required

**Query Parameters**:

| Param | Type | Required | Description |
|---|---|---|---|
| questionnaire_id | UUID | Yes | Scope |
| key | string | Yes | Variable name or question ID |
| source | string | No | `variable` (default) or `response` |
| left_participant_id | string | Yes | First participant |
| right_participant_id | string | Yes | Second participant |

**Response** `200 OK`:
```json
{
  "questionnaire_id": "q-uuid",
  "source": "variable",
  "key": "reaction_time_avg",
  "left": {
    "participant_id": "P001",
    "stats": { "sample_count": 10, "mean": 450.2, ... }
  },
  "right": {
    "participant_id": "P002",
    "stats": { "sample_count": 10, "mean": 520.8, ... }
  },
  "delta": {
    "mean_delta": -70.6,
    "median_delta": -65.0,
    "z_score": -1.42
  }
}
```

---

### GET /api/sessions/dashboard

Get dashboard summary for an organization.

**Auth**: Required (organization member)

**Query Parameters**:

| Param | Type | Required |
|---|---|---|
| organization_id | UUID | Yes |

**Response** `200 OK`:
```json
{
  "questionnaires": [
    {
      "id": "q-uuid",
      "name": "Survey A",
      "project_id": "proj-uuid",
      "status": "published",
      "total_responses": 150,
      "completed_sessions": 42,
      "avg_completion_time_ms": 845000.0
    }
  ],
  "recent_activity": [
    {
      "session_id": "sess-uuid",
      "participant_id": "P001",
      "questionnaire_name": "Survey A",
      "status": "completed",
      "started_at": "2025-03-01T09:00:00Z",
      "completed_at": "2025-03-01T09:14:05Z"
    }
  ],
  "stats": {
    "total_questionnaires": 5,
    "total_responses": 380,
    "active_questionnaires": 3,
    "avg_completion_rate": 0.78
  }
}
```

---

### GET /api/sessions/{id}

Get a single session.

**Auth**: Required

**Response** `200 OK`: Session object.

---

### PATCH /api/sessions/{id}

Update session status or metadata.

**Auth**: None (session owner implied)

**Request Body** (all fields optional):
```json
{
  "status": "completed",
  "metadata": { "final_score": 85 }
}
```

Accepted status values: `active`, `not_started`, `in_progress`, `paused` (all normalized to `active`), `completed`, `abandoned`, `expired`.

Setting status to `completed` automatically sets `completed_at = NOW()`.

**Response** `200 OK`: Updated session object.

---

### GET /api/sessions/{id}/responses

Get responses for a session.

**Auth**: Required

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| question_id | string | None | Filter by question |
| limit | integer | 500 | Max results (1-5000) |
| offset | integer | 0 | Pagination offset |

**Response** `200 OK`:
```json
[
  {
    "id": "resp-uuid",
    "session_id": "sess-uuid",
    "question_id": "q1",
    "value": 4,
    "reaction_time_us": 1234567,
    "presented_at": "2025-03-01T09:01:00Z",
    "answered_at": "2025-03-01T09:01:01Z",
    "metadata": {},
    "created_at": "2025-03-01T09:01:01Z"
  }
]
```

---

### POST /api/sessions/{id}/responses

Submit one or more responses. Session must be active.

**Auth**: None (session owner implied)

**Request Body** (single):
```json
{
  "question_id": "q1",
  "value": 4,
  "reaction_time_us": 1234567,
  "presented_at": "2025-03-01T09:01:00Z",
  "answered_at": "2025-03-01T09:01:01Z",
  "metadata": { "attempt": 1 }
}
```

**Request Body** (batch):
```json
{
  "responses": [
    { "question_id": "q1", "value": 4, "reaction_time_us": 1234567 },
    { "question_id": "q2", "value": "Some text", "reaction_time_us": 2345678 }
  ]
}
```

**Response** `201 Created`:
```json
{ "count": 2 }
```

---

### GET /api/sessions/{id}/events

Get interaction events for a session.

**Auth**: Required

**Response** `200 OK`:
```json
[
  {
    "id": "event-uuid",
    "session_id": "sess-uuid",
    "event_type": "keydown",
    "question_id": "q1",
    "timestamp_us": 1709312400000000,
    "metadata": { "key": "Enter" },
    "created_at": "2025-03-01T09:01:00Z"
  }
]
```

---

### POST /api/sessions/{id}/events

Submit interaction events.

**Auth**: None (session owner implied)

**Request Body**:
```json
[
  {
    "event_type": "click",
    "question_id": "q1",
    "timestamp_us": 1709312400000000,
    "metadata": { "target": "option-3" }
  }
]
```

Supports both `timestamp_us` (microseconds) and `timestamp` (milliseconds as float). If both are provided, `timestamp_us` takes precedence. Also accepts `eventType`, `questionId`, `timestampUs`, and `eventData` as camelCase aliases.

**Response** `201 Created`:
```json
{ "count": 1 }
```

---

### GET /api/sessions/{id}/variables

Get computed variables for a session.

**Auth**: Required

**Response** `200 OK`:
```json
[
  {
    "id": "var-uuid",
    "session_id": "sess-uuid",
    "variable_name": "total_score",
    "variable_value": 85,
    "updated_at": "2025-03-01T09:14:00Z"
  }
]
```

---

### POST /api/sessions/{id}/variables

Create or update a session variable (upsert).

**Auth**: None (session owner implied)

**Request Body**:
```json
{
  "name": "total_score",
  "value": 85
}
```

**Response** `201 Created`:
```json
{ "success": true }
```

---

### POST /api/sessions/{id}/sync

Bulk sync offline session data. Accepts responses, events, and variables in a single request. Uses `client_id` for deduplication -- duplicate records are silently ignored.

**Auth**: None (session owner implied)

**Request Body**:
```json
{
  "responses": [
    {
      "client_id": "550e8400-e29b-41d4-a716-446655440001",
      "question_id": "q1",
      "value": 4,
      "reaction_time_us": 1234567,
      "presented_at": "2025-03-01T09:01:00Z",
      "answered_at": "2025-03-01T09:01:01Z"
    }
  ],
  "events": [
    {
      "client_id": "550e8400-e29b-41d4-a716-446655440002",
      "event_type": "click",
      "question_id": "q1",
      "timestamp_us": 1709312400000000,
      "metadata": { "target": "option-3" }
    }
  ],
  "variables": [
    {
      "name": "total_score",
      "value": 85
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| responses | array | No | Response records with `client_id` for dedup |
| events | array | No | Interaction events with `client_id` for dedup |
| variables | array | No | Variable upserts (keyed by name) |

Each response and event **must** include a `client_id` (UUID). The server uses `INSERT ... ON CONFLICT (client_id) DO NOTHING` to prevent duplicates from retried syncs. Variables use upsert semantics on `(session_id, variable_name)`.

**Response** `200 OK`:
```json
{
  "responses_synced": 5,
  "events_synced": 12,
  "variables_synced": 3
}
```

---

## Media

### GET /api/media

List media assets for an organization.

**Auth**: Required (organization viewer+)

**Query Parameters**:

| Param | Type | Required | Description |
|---|---|---|---|
| organization_id | UUID | Yes | Organization scope |
| limit | integer | No | Default: 50, max: 100 |
| offset | integer | No | Default: 0 |

**Response** `200 OK`:
```json
[
  {
    "id": "media-uuid",
    "organization_id": "org-uuid",
    "filename": "stimulus-image.png",
    "content_type": "image/png",
    "size_bytes": 245760,
    "storage_key": "org-uuid/2025/03/01/abc123_stimulus-image.png",
    "uploaded_by": "user-uuid",
    "created_at": "2025-03-01T10:00:00Z"
  }
]
```

---

### POST /api/media

Upload a media file. Uses multipart form data.

**Auth**: Required (organization member+)

**Request Body** (`multipart/form-data`):

| Field | Type | Required | Description |
|---|---|---|---|
| organization_id | string (UUID) | Yes | Target organization |
| file | file | Yes | The file to upload |

**Response** `201 Created`:
```json
{
  "id": "media-uuid",
  "organization_id": "org-uuid",
  "filename": "stimulus-image.png",
  "content_type": "image/png",
  "size_bytes": 245760,
  "storage_key": "org-uuid/...",
  "uploaded_by": "user-uuid",
  "created_at": "2025-03-01T10:00:00Z",
  "url": "https://minio:9003/bucket/org-uuid/...?X-Amz-Signature=..."
}
```

---

### GET /api/media/{id}

Get a media asset with a presigned download URL (valid for 1 hour).

**Auth**: Required (organization viewer+)

**Response** `200 OK`: Media asset object with `url` field containing presigned URL.

---

### DELETE /api/media/{id}

Delete a media asset from storage and database.

**Auth**: Required (original uploader or org admin)

**Response** `200 OK`:
```json
{ "message": "Media deleted" }
```

---

## WebSocket

### GET /api/ws

Upgrade HTTP connection to WebSocket for real-time collaboration.

**Auth**: Via token in connection parameters

See Chapter 14 (Collaboration) for the complete WebSocket message protocol.

---

## Dev Helpers

These endpoints are only available when `DEV_HELPERS_ENABLED=true` or in debug builds.

### POST /api/dev/bootstrap-personas

Bootstrap test personas for development and testing.

**Auth**: None

**Response**: Varies based on implementation.
