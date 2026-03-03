# Chapter 13: Distribution and Participant Management

Publishing, sharing, and monitoring questionnaire deployments in QDesigner Modern.

---

## 13.1 The Publication Lifecycle

Every questionnaire in QDesigner Modern follows a clear lifecycle from creation through data collection:

```
draft  -->  published  -->  data collection  -->  archived
```

A questionnaire begins as a **draft**, visible only to project team members. Once the design is finalized, a team member with editor permissions or higher can **publish** it, making it accessible to participants. During active data collection, researchers can monitor incoming responses in real time. When data collection is complete, the questionnaire can be archived for long-term storage.

### Draft Status

In draft status, the questionnaire is fully editable. You can add, remove, and reorder questions, modify flow control rules, and adjust variable definitions. No participants can access a draft questionnaire -- attempting to open one via a share link returns a "not found" error.

### Publishing

Publishing transitions a questionnaire from `draft` to `published`. This action requires write access to the project (editor, admin, or owner role at either the project or organization level).

There are two ways to publish:

1. **Designer UI**: Click the "Publish" button in the designer header, or use the keyboard shortcut `Ctrl+Shift+Enter`.
2. **API**: Send a `POST` request to `/api/projects/{projectId}/questionnaires/{questionnaireId}/publish`.

When published, the server sets the `published_at` timestamp and changes the status to `published`. The questionnaire content is frozen at the moment of publication -- subsequent edits create a new draft version rather than modifying the published version.

### Access Control for Published Questionnaires

A published questionnaire is accessible to anyone with the short code. The `create_session` endpoint allows anonymous access when the questionnaire status is `published`, so participants do not need an account. If the questionnaire is still in draft, only authenticated users with project access can create sessions.

---

## 13.2 Shareable Links and Short Codes

Each questionnaire receives a unique identifier (UUID v4) upon creation. QDesigner generates a human-readable **short code** from this UUID by taking the first 8 characters of the hex representation (with hyphens removed) and converting to uppercase.

For example, a questionnaire with UUID `a3f7b2c1-9d4e-4f8a-b6e2-1c3d5f7a9b0e` would have the short code `A3F7B2C1`.

### How Short Codes Work

The backend resolves short codes with the following logic (from `questionnaires.rs`):

1. Accept a 6-12 character alphanumeric string.
2. Convert to uppercase.
3. Query `questionnaire_definitions` where the first 8 hex characters of the UUID (hyphens removed) match the code.
4. Return the questionnaire only if its status is `published` and the parent project is `active` and not soft-deleted.

### Constructing the Participant URL

The participant-facing URL follows this pattern:

```
https://your-domain.com/q/{SHORT_CODE}
```

For example: `https://study.example.com/q/A3F7B2C1`

This URL loads the runtime environment, fetches the questionnaire definition via `GET /api/questionnaires/by-code/{code}`, and begins the fillout experience.

### QR Code Generation

QDesigner generates QR codes client-side from the participant URL. Researchers can download the QR code as a PNG image for inclusion in printed materials, posters, or recruitment emails. The QR code encodes the full participant URL, allowing participants to scan with a mobile device and immediately begin the questionnaire.

### Embed Code (iframe)

For embedding questionnaires in external websites, QDesigner generates an iframe snippet:

```html
<iframe
  src="https://your-domain.com/q/A3F7B2C1"
  width="100%"
  height="800"
  frameborder="0"
  allow="fullscreen"
  style="border: none; border-radius: 8px;">
</iframe>
```

Researchers can customize the width, height, and styling before copying the snippet.

---

## 13.3 Participant Fillout Experience

When a participant opens a questionnaire URL, the runtime environment loads.

### Consent Collection

If the questionnaire includes a consent page (typically the first page), the participant must agree to the study terms before proceeding. When the participant provides consent, the runtime persists the consent decision to the session metadata with an ISO 8601 timestamp:

```json
{
  "consent": {
    "given": true,
    "timestamp": "2026-03-03T14:22:31.000Z"
  }
}
```

This consent record is stored as part of the session's `metadata` field in the database, providing a durable, auditable record that the participant agreed to the study terms at a specific point in time. Researchers can query consent status through the session detail API and include it in data exports.

### Session Initialization

The runtime creates a new session via `POST /api/sessions` with the following data:

- **questionnaire_id**: The UUID of the questionnaire.
- **participant_id**: An optional identifier. If the participant is authenticated, their user ID is used. Otherwise, a random participant ID may be generated, or the field is left empty for fully anonymous participation.
- **browser_info**: Automatically captured metadata including user agent, screen resolution, and touch capability.
- **metadata**: Additional context such as recruitment source, condition assignment, and consent records.

The server verifies that the questionnaire is published (or that the user is authenticated with project access) before creating the session.

### Response Submission

As participants answer questions, responses are submitted to `POST /api/sessions/{sessionId}/responses`. Each response includes:

- **question_id**: Which question was answered.
- **value**: The participant's response (JSON, supporting any data type).
- **reaction_time_us**: Microsecond-precision reaction time measured via `performance.now()`, stored as a BIGINT.
- **presented_at**: When the question was first displayed to the participant.
- **answered_at**: When the participant submitted their answer.

Responses can be submitted individually or in batches using the `{ responses: [...] }` format.

### Interaction Events

For detailed behavioral analysis, the runtime records interaction events via `POST /api/sessions/{sessionId}/events`. Each event includes:

- **event_type**: The type of interaction (e.g., `keydown`, `click`, `focus_change`, `page_navigation`).
- **question_id**: Which question was in focus (optional).
- **timestamp_us**: Microsecond-precision timestamp.
- **metadata**: Additional event-specific data.

### Session Variables

Computed variables (scores, indices, running totals) are persisted to `POST /api/sessions/{sessionId}/variables` as name-value pairs, using upsert semantics (insert or update on conflict).

### Session Lifecycle

Sessions move through the following states:

| Status | Description |
|---|---|
| `active` | Participant is currently filling out the questionnaire. `not_started`, `in_progress`, and `paused` are all normalized to `active`. |
| `completed` | Participant finished all required questions. The `completed_at` timestamp is set. |
| `abandoned` | Session was started but not completed within the expected time window. |
| `expired` | Session exceeded its maximum allowed duration. |

To update a session's status, the runtime sends `PATCH /api/sessions/{sessionId}` with the new status. When set to `completed`, the server automatically records the `completed_at` timestamp.

---

## 13.4 Response Monitoring

### Dashboard Summary

The dashboard endpoint `GET /api/sessions/dashboard?organization_id={orgId}` provides an overview for researchers:

- **Questionnaire summaries**: For each questionnaire, the total number of responses, completed sessions, and average completion time in milliseconds.
- **Recent activity**: The last 20 sessions across all questionnaires, showing participant ID, questionnaire name, status, and timestamps.
- **Aggregate statistics**: Total questionnaires, total responses, active (published) questionnaires, and average completion rate.

### Session Listing and Filtering

The `GET /api/sessions` endpoint supports filtering by:

- `questionnaire_id`: Show sessions for a specific questionnaire.
- `participant_id`: Filter by participant.
- `status`: Filter by session status (`active`, `completed`, `abandoned`, `expired`).
- `limit` and `offset`: Pagination (default 50, max 500).

### Viewing Session Details

For a specific session, `GET /api/sessions/{id}` returns the full session record. Researchers can then drill into:

- `GET /api/sessions/{id}/responses`: All responses for the session, optionally filtered by `question_id`.
- `GET /api/sessions/{id}/events`: All interaction events, ordered by timestamp.
- `GET /api/sessions/{id}/variables`: All computed variable values for the session.

### Aggregate Statistics

The `GET /api/sessions/aggregate` endpoint computes descriptive statistics across sessions:

- **source**: Either `variable` (for computed variable values) or `response` (for raw question responses).
- **key**: The variable name or question ID to aggregate.
- **questionnaire_id**: Required scope.
- **participant_id**: Optional filter.

The response includes a full statistical summary: sample count, mean, median, standard deviation, min, max, and percentiles (p10, p25, p50, p75, p90, p95, p99).

### Participant Comparison

The `GET /api/sessions/compare` endpoint compares two participants on a specific metric:

- **left_participant_id** and **right_participant_id**: The two participants to compare.
- **key**: Variable name or question ID.
- **source**: `variable` or `response`.

The response includes individual statistics for each participant plus a delta object with mean difference, median difference, and z-score.

---

## 13.5 Data Export

### JSON Export

By default, `GET /api/projects/{projectId}/questionnaires/{questionnaireId}/export` returns response data in JSON format. Each row includes session ID, participant ID, session status, timestamps, question ID, response value, and reaction time.

### CSV Export

Appending `?format=csv` to the export URL returns the data as a downloadable CSV file with the following columns:

```
session_id, participant_id, session_status, started_at, completed_at,
question_id, value, reaction_time_us, presented_at, answered_at
```

CSV fields containing commas, quotes, or newlines are properly escaped per RFC 4180.

---

## 13.6 Access Settings and Security

### Anonymous vs. Authenticated Participation

QDesigner supports both modes:

- **Anonymous**: Published questionnaires accept session creation without authentication. No login is required, and participants can be identified only by optional participant IDs or browser metadata.
- **Authenticated**: For studies requiring verified identity, researchers can restrict access to authenticated users only. This is controlled at the project level through the `is_public` flag.

### Rate Limiting

The backend supports rate limiting (via Redis, when configured) to prevent abuse. Excessive requests from a single source are throttled with a `429 Too Many Requests` response.

### Data Isolation

All data is scoped to organizations and projects via the multi-tenant architecture. Sessions belong to questionnaires, which belong to projects, which belong to organizations. Access checks are enforced at every level of the hierarchy.

---

## Summary

QDesigner Modern's distribution system provides a complete workflow from publishing through data collection and monitoring. Short codes make questionnaires easy to share via links, QR codes, or embedded iframes. The session management system captures responses with microsecond precision, while the monitoring dashboard and aggregate statistics endpoints give researchers real-time visibility into their data collection progress.
