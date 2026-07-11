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

### Running a Published Questionnaire

On the project detail page, each published questionnaire carries a **Run** control — a play icon with the tooltip "Preview fillout (opens in new tab)". Clicking it opens the participant fillout URL (`/q/{code}`) in a new browser tab so the researcher can walk the live participant experience exactly as a respondent would. The control appears only for questionnaires whose status is `published`; a draft has no run link.

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

### The Welcome Screen

The first thing a participant sees is the welcome screen: the project name, the questionnaire title, a welcome message (the localized welcome text, falling back to the description), and an info row with the estimated duration ("About N minutes") and section count. The primary action is **Start Questionnaire**. If a compatible save-and-continue snapshot exists for the session, the single Start button is replaced by a **Continue where you left off** / **Start over** choice.

Three optional affordances appear here when relevant:

- A **language picker** (see *Localized Chrome* below), shown only when the study has more than one content locale.
- A photosensitivity advisory, when the study contains a reaction paradigm (which alternates high-contrast stimuli).
- A **Prepare offline** control (covered in Section 13.7), for field participants who want to download the whole study before going offline.

### Consent Collection

If the questionnaire requires consent (`settings.requireConsent`), the welcome screen shows a "Before you begin:" note and, on Start, the participant is taken to the consent screen before any questions.

As the participant sees it, the consent screen presents:

- A **title** — the author's heading, or the localized default "Informed Consent".
- A **body** — the author's consent text, rendered from sanitized HTML (headings, paragraphs, lists).
- Optional **checkboxes** — each with its own label; required checkboxes are marked with an asterisk and must all be ticked to proceed.
- An optional **Electronic Signature** field — labeled "Electronic Signature" with the placeholder "Type your full name" and the note "By typing your name above, you are providing an electronic signature."

The actions are **I Agree** and **Decline**. Agreeing is blocked (with an assertive validation message) until every required checkbox is ticked and, if required, the signature is filled. Declining opens a confirmation dialog ("Decline participation? … You will not be able to participate in this study.") before it takes effect. (See Chapter 5 for authoring the consent page.)

When the participant agrees, the runtime persists the consent decision to the session metadata with an ISO 8601 timestamp:

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
- **version_major**, **version_minor**, **version_patch**: The questionnaire's semver at the time of session creation. If not provided, the server looks up the current version from the questionnaire definition.
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

### Progress Indicator

During the runtime, the page chrome shows a progress indicator so the participant can see how far they are — a text readout and a bar. Because the welcome screen calls each page a "section", the readout matches that wording: **Section N of M** with a filled bar. When the flow length is indeterminate (an adaptive/CAT flow or a dynamic-length loop), it degrades to **Section N** with an indeterminate bar rather than a misleading fraction. The indicator honors the authored toggle `settings.showProgressBar`: it is shown by default and only an explicit `false` hides it (see Chapter 5 for the report/progress authoring settings). It is visible during reaction items too, since it lives in the page chrome rather than inside a form card.

### Screened-Out Screen

Eligibility (screener) rules can end a session early because the participant does not qualify — a distinct outcome from natural completion. When a rule fires, the participant sees the screened-out screen, not the completion screen: a neutral (non-success) icon, the title "You're not eligible for this study", and either the author-configured message or the default — "Thank you for your interest. Based on your answers, you do not qualify to take part in this study. Your responses have not been recorded as a completion." **No completion code is shown.** If the author configured a redirect URL, a five-second countdown returns the participant to the provider, with a fallback link. Analytics marks such a session with a **Screened out** badge and its screen-out reason (see Chapter 12).

### Cross-Device Sessions

Anonymous sessions cannot be moved between devices. If a participant opens a resume link carrying a `?sid=` for a session that was started on another device — so there is no server-side session to resume (the resume endpoints are authentication-gated) and no local snapshot on this device — the runtime falls back to a fresh run and says so on the welcome screen: "This link was for a session started on another device. Anonymous sessions can't be moved between devices — you'll start fresh here."

### Localized Chrome

The participant-facing chrome (welcome, consent, progress, sync, and screen-out strings) is localized through compile-time messages and follows the participant's language choice. QDesigner ships English, German, and Spanish (en/de/es); the welcome-screen language picker appears when the study offers more than one content locale, and switching it re-renders both the chrome and the localized content.

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

## 13.7 Offline Fillout Support

QDesigner Modern supports fully offline questionnaire fillout. Participants can complete questionnaires without an internet connection, and responses automatically sync to the server when connectivity returns.

### Architecture Overview

The offline fillout system uses a layered approach:

1. **IndexedDB (Dexie)**: Stores questionnaire definitions, sessions, responses, interaction events, and variables locally in the browser.
2. **Cache API**: Stores media assets (images, audio, video) referenced by questionnaires for offline playback.
3. **Service Worker**: Intercepts network requests and serves cached content when offline.
4. **Sync Engine**: Watches connectivity status and automatically uploads pending data when the network returns.

### Pre-Syncing Questionnaires

Before going offline, questionnaires can be pre-synced for offline availability:

1. The `FilloutOfflineSyncService` downloads the questionnaire definition via the API.
2. The definition is stored in the `filloutQuestionnaires` IndexedDB table.
3. All media URLs referenced in the questionnaire (images, audio, video) are extracted and cached in the `fillout-media-v1` Cache API store.
4. The Service Worker serves these cached assets when the device is offline.

The fillout route (`/q/{code}`) automatically caches questionnaires to IndexedDB on first online access, so returning participants can continue offline without explicit pre-sync.

For field studies where the participant will deliberately go offline, the welcome screen can also offer an explicit **Prepare offline** affordance — a secondary "Make available offline" control that prefetches the whole study up front and confirms when it is done. While preparing, it reads "Preparing for offline use… (N of M)"; on success it reads "Ready for offline use". If it only partially completes it offers "Retry offline download" ("N of M files saved"), and if the study is too large to store it says so ("This study is too large to store on this device for offline use. You can still take part while connected."). Media-bearing reaction studies must reach the Offline-complete state before any timed block starts; reaching it is automatic at load, so this control is a convenience, not a gate.

### Client-Side Session Creation

When offline, sessions are created entirely client-side:

- Session IDs are generated using `crypto.randomUUID()` -- no server round-trip required.
- The session record is stored in the `filloutSessions` IndexedDB table with the questionnaire's version information.
- Device metadata (browser, screen size, timezone) is captured locally.

### Response Persistence

Every response, interaction event, and variable update is immediately written to IndexedDB:

- **Responses** are stored in the `filloutResponses` table with a `clientId` (UUID) for server-side deduplication.
- **Events** are stored in the `filloutEvents` table, also with a `clientId`.
- **Variables** are stored in the `filloutVariables` table with a composite key of `[sessionId, variableName]`.

Each record has a `synced` flag that starts as `false` and is set to `true` after successful upload.

### Automatic Sync

The `FilloutSyncEngine` manages synchronization:

1. **Detection**: Listens for the browser `online` event and the `navigator.onLine` property.
2. **Trigger**: When connectivity returns, the engine queries IndexedDB for all records where `synced = false`.
3. **Upload**: For each unsynced session, sends a bulk payload to `POST /api/sessions/{id}/sync` containing all pending responses, events, and variables.
4. **Deduplication**: The server uses `INSERT ... ON CONFLICT (client_id) DO NOTHING` on responses and events, ensuring that retries or duplicate syncs never create duplicate records.
5. **Completion**: On success, marks all uploaded records as `synced = true` in IndexedDB.
6. **Retry**: On failure, uses exponential backoff (starting at 1 second, maximum 60 seconds) before retrying.

### Sync Status Panel

Rather than an auto-hiding badge, the fillout page shows a persistent, always-visible sync status panel so the participant has an honest readout of whether their answers have reached the server. It reports one primary status line:

| State | Text |
|---|---|
| **Saved** | "All saved" (with "last synced just now" / "last synced HH:MM") |
| **Syncing** | "Saving your answers…" |
| **Offline** | "Offline — your answers are saved on this device" |
| **Pending** | "N answers pending" |
| **Failed** | "N answers could not be submitted" |

A **Sync now** control triggers an immediate upload attempt (disabled while offline or already syncing, with the tooltip "You're offline — we'll sync automatically when you reconnect"). The pending and saved states are announced politely to assistive technology; the failure state is announced assertively.

### Sync Failure and the Dead-Letter Escape Hatch

Records the sync pipeline permanently rejects go to a dead-letter set. This is terminal by design — the ledger never re-queues it — so there is no "retry"; unaddressed, it would be silent data loss. The panel therefore flips into a non-dismissible destructive state reading "N answers could not be submitted", and the only recovery it offers is an export escape hatch: a **Download my answers** button that saves a JSON snapshot of the unsynced/failed records. The dead-letter surface is scoped per study.

On a shared or kiosk research device, the **Save & exit (clear this device)** control (`ShareDeviceExit`) gives the participant a safe hand-off: it forces a final sync and then wipes every local fillout store so no residual data lingers. If unsynced answers survive the final sync, it does not silently discard them — it warns ("N answers on this device haven't been saved to the server yet"), offers "Download my answers first", and requires an explicit "Clear anyway" before wiping. On success it confirms "This device has been cleared. It is safe to hand back."

### Data Flow Summary

```
Participant answers question
        |
        v
  Save to IndexedDB (immediate, never fails)
        |
        v
  Online? ----Yes----> POST /api/sessions/{id}/sync
        |                      |
        No                     v
        |              Mark synced = true
        v
  Queue for later sync
        |
  [Network returns]
        |
        v
  FilloutSyncEngine triggers sync
```

---

## Summary

QDesigner Modern's distribution system provides a complete workflow from publishing through data collection and monitoring. Short codes make questionnaires easy to share via links, QR codes, or embedded iframes. The session management system captures responses with microsecond precision, while the monitoring dashboard and aggregate statistics endpoints give researchers real-time visibility into their data collection progress.

The offline fillout capability ensures that data collection continues uninterrupted even without internet connectivity. Questionnaires and media are cached locally, sessions are created client-side, and responses automatically sync with deduplication when the network returns.
