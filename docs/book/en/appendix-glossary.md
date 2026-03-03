# Appendix C: Glossary

Definitions of key terms used throughout this book and the QDesigner Modern platform.

---

### A

**Abandoned Session**
A session that was started but not completed within the allowed time window. The system automatically marks sessions as abandoned after a configurable timeout period.

**Access Control**
The system of permissions that determines which users can view, edit, or manage resources. QDesigner Modern implements role-based access control (RBAC) at both organization and project levels.

**Aggregation**
The process of combining multiple response values into summary statistics such as means, medians, percentiles, and standard deviations. Available through the session aggregation API endpoint.

**API (Application Programming Interface)**
A set of HTTP endpoints that allow programmatic interaction with the QDesigner Modern backend. All endpoints use JSON for request and response bodies and require JWT bearer token authentication for protected routes.

**Argon2id**
The password hashing algorithm used by QDesigner Modern. Argon2id is a memory-hard function that provides strong resistance against brute-force attacks and is the winner of the Password Hashing Competition.

---

### B

**Bearer Token**
An authentication credential sent in the `Authorization` HTTP header. QDesigner Modern issues JWT bearer tokens upon login, which must be included in all authenticated API requests.

**Block**
A logical grouping of questions within a page. Blocks enable randomization of question order within a page and allow applying shared settings to multiple questions.

**Branching**
In the version control context, creating an independent copy of a questionnaire definition that can be modified without affecting the original. Branches can later be merged back.

---

### C

**Carry-Forward**
A technique where responses from one question are used to populate options in a subsequent question. For example, selected items from a multiple-choice question might become the options for a follow-up ranking question.

**Collaboration**
The real-time multi-user editing capability that allows multiple team members to work on the same questionnaire simultaneously using Operational Transformation (OT) to resolve conflicts.

**Command Palette**
A searchable interface (opened with `Ctrl+K` / `Cmd+K`) that provides quick access to all designer commands, including adding questions, changing views, and executing actions.

**Completed Session**
A session where the participant has answered all required questions and submitted their responses. The session status transitions from "active" to "completed."

**Conflict (Merge)**
A situation during branch merging where the same element has been modified differently in both branches. Conflicts must be resolved manually by choosing which version to keep.

**Content (Questionnaire)**
The full structural definition of a questionnaire, stored as JSONB in the database. Includes all pages, blocks, questions, options, variables, flow control rules, and settings.

**CORS (Cross-Origin Resource Sharing)**
A security mechanism that controls which domains can make API requests to the backend. QDesigner Modern configures CORS to allow requests from the frontend development server.

**CSV (Comma-Separated Values)**
A tabular export format for response data. QDesigner Modern's CSV export properly escapes values containing commas, quotes, and newlines.

---

### D

**Dashboard**
The main application view that displays summary statistics, recent activity, and quick access to projects and questionnaires.

**Dependent Variable**
A variable whose value is computed from other variables or response data using a formula. When source values change, dependent variables are automatically recalculated.

**Designer**
The visual questionnaire editor interface that supports both WYSIWYG and structure views for building questionnaires.

**Diff**
A comparison between two versions of a questionnaire that shows what was added, modified, or removed. Used in the version control system to review changes before merging.

**Draft**
The initial status of a newly created questionnaire. Draft questionnaires can be freely edited but cannot accept participant responses until published.

---

### E

**Email Verification**
The process of confirming a user's email address by sending a 6-digit verification code. Required after registration before full account access is granted.

**Endpoint**
A specific URL path on the API server that handles a particular type of request. For example, `POST /api/auth/login` is the login endpoint.

**Event (Interaction)**
A timestamped record of a participant action during a session, such as a click, keystroke, focus change, or media interaction. Events include microsecond-precision timing data.

**Export**
The process of downloading response data from a questionnaire in CSV or JSON format for analysis in external tools.

---

### F

**Flow Control**
The system of rules that determines which questions or pages a participant sees based on their previous responses, variable values, or random assignment. Includes skip logic, conditional branching, and randomization.

**Formula**
An expression that computes a value using mathematical operations, built-in functions, and variable references. Formulas power the variable system and flow control conditions.

**Formula Engine**
The evaluation system (`packages/scripting-engine`) that parses and executes formula expressions. Supports 30+ built-in functions across mathematical, statistical, array, logical, text, and date/time categories.

---

### G

**Glossary Variable**
A variable type that maps numeric codes to human-readable labels, useful for coded response schemes.

---

### H

**Health Check**
API endpoints (`/health` and `/ready`) that report the operational status of the backend service and its dependencies (database, Redis).

---

### I

**Invitation**
A mechanism for adding members to an organization. Invitations are sent by email and expire after 7 days. Users can accept or decline invitations.

**Item**
A generic term for any element within a questionnaire, including questions, text blocks, media elements, and page breaks.

---

### J

**JSONB**
A PostgreSQL binary JSON storage format used for questionnaire content. JSONB allows efficient querying and indexing of the hierarchical questionnaire structure.

**JWT (JSON Web Token)**
A compact, URL-safe token format used for authentication. QDesigner Modern issues short-lived access tokens (15 minutes) and longer-lived refresh tokens for session continuity.

---

### K

**Kurtosis**
A statistical measure of the "tailedness" of a probability distribution. Available as a built-in formula function (`KURTOSIS`). Positive values indicate heavy tails (leptokurtic), negative values indicate light tails (platykurtic).

---

### L

**Liveness Check**
The `/health` endpoint that confirms the backend process is running and responsive, without checking downstream dependencies.

**Locale**
A user preference setting that determines the language and regional formatting for the interface. Stored in the user profile.

---

### M

**Media**
Files (images, audio, video) uploaded to the S3-compatible storage (MinIO) for use within questionnaires. Media files are served via presigned URLs that expire after one hour.

**Member**
A user who belongs to an organization or project. Members are assigned roles that determine their permissions.

**Merge**
The process of combining changes from one branch into another in the version control system. Merges can be automatic (no conflicts) or require manual conflict resolution.

**Microsecond Precision**
The timing accuracy used for reaction time measurements. QDesigner Modern stores timing data as BIGINT values representing microseconds (millionths of a second) for research-grade accuracy.

**Migration**
A SQL script that modifies the database schema. Migrations are applied automatically when the Rust backend starts, ensuring the database structure matches the application code.

**MinIO**
An S3-compatible object storage service used for storing uploaded media files in development. In production, any S3-compatible service can be used.

**Multi-Tenant**
An architecture where a single application instance serves multiple organizations, with strict data isolation between tenants.

**Multiple Choice**
A question type that presents a set of predefined options from which participants select one or more answers.

---

### N

**Normalization (Session Status)**
The process of converting various session state representations into a consistent set of status values (active, completed, abandoned, expired).

---

### O

**Operational Transformation (OT)**
An algorithm that enables real-time collaborative editing by transforming concurrent operations to maintain consistency across all connected clients. QDesigner Modern supports insert, delete, update, move, and reorder operations.

**Organization**
The top-level entity in the multi-tenant hierarchy. Organizations contain projects, which contain questionnaires. Each organization has its own members and roles.

**Owner**
The highest-level role in an organization or project. Owners have full administrative control, including the ability to manage members, billing, and settings. The last owner of an organization cannot be removed.

---

### P

**Page**
A structural unit in a questionnaire that groups related questions together. Pages are displayed one at a time during participant fillout, with navigation between pages.

**Participant**
A person who fills out a questionnaire. Participants may be anonymous or identified, depending on the questionnaire's access settings.

**Percentile**
A statistical measure indicating the value below which a given percentage of observations fall. The aggregation API computes p10, p25, p50 (median), p75, p90, p95, and p99.

**Piping**
The technique of inserting variable values or previous responses into question text using double curly brace syntax: `{{variableName}}`.

**Presigned URL**
A time-limited URL that grants temporary access to a private file in S3 storage. QDesigner Modern generates presigned URLs valid for one hour when serving media files.

**Preview**
A mode in the designer that shows how the questionnaire will appear to participants without creating actual sessions or recording responses.

**Project**
A container within an organization that groups related questionnaires together. Projects have their own member list and permission settings.

**Publish**
The action of making a questionnaire available for participant responses. Publishing changes the status from "draft" to "published" and generates a shareable short code.

---

### Q

**QR Code**
A two-dimensional barcode that encodes the questionnaire's fillout URL. Generated automatically for published questionnaires to enable easy mobile access.

**Questionnaire**
The primary content unit in QDesigner Modern. A questionnaire consists of pages, blocks, questions, variables, and flow control rules, stored as a JSONB definition.

**Questionnaire Definition**
The complete JSON structure that defines a questionnaire's content, settings, and behavior. Stored in the `questionnaire_definitions` table.

---

### R

**Rate Limiting**
A security measure that restricts the number of API requests a client can make within a time window. Implemented using Redis to prevent abuse.

**RBAC (Role-Based Access Control)**
A permission model where access rights are assigned to roles (owner, admin, editor, viewer) rather than individual users. Users inherit permissions from their assigned role.

**Reaction Time**
The measured duration between stimulus presentation and participant response, stored with microsecond precision. A key feature of QDesigner Modern for behavioral research.

**Readiness Check**
The `/ready` endpoint that verifies the backend and all its dependencies (database, Redis) are operational and ready to handle requests.

**Refresh Token**
A long-lived token used to obtain new access tokens without requiring re-authentication. Refresh tokens are rotated on each use for security.

**Response**
A participant's answer to a single question within a session. Responses include the answer value, timing data, and metadata such as the number of changes made.

**Role**
A named set of permissions assigned to organization or project members. Organization roles: owner, admin, editor, viewer. Project roles: owner, admin, editor.

**Runes**
Svelte 5's reactivity system using `$state`, `$derived`, and `$effect` for fine-grained state management. Used throughout the QDesigner Modern frontend.

---

### S

**Session**
A single instance of a participant filling out a questionnaire. Sessions track progress, store responses, and record interaction events. Each session has a unique ID and lifecycle status.

**Short Code**
An 8-character uppercase hexadecimal identifier derived from a questionnaire's UUID. Used in shareable fillout URLs for brevity and readability.

**Skip Logic**
A flow control mechanism that conditionally skips questions or pages based on previous responses or variable values.

**Skewness**
A statistical measure of the asymmetry of a probability distribution. Available as a built-in formula function (`SKEWNESS`). Positive values indicate a right-skewed distribution, negative values indicate left-skewed.

**Slug**
A URL-friendly identifier automatically generated from an organization's name. Used in URLs and API paths.

**Soft Delete**
A deletion pattern where records are marked with a `deleted_at` timestamp rather than being physically removed from the database. Allows potential recovery and maintains referential integrity.

**SSR (Server-Side Rendering)**
Rendering pages on the server before sending them to the browser. QDesigner Modern uses SSR only for public pages; the designer and fillout interfaces require client-side rendering for full interactivity.

**Stimulus**
The content presented to a participant before measuring their reaction time. Can include text, images, audio, or video.

**Structure View**
A designer view mode that shows the hierarchical organization of pages, blocks, and questions in a tree-like interface, as opposed to the WYSIWYG visual view.

---

### T

**t-Test**
A statistical test for comparing means between two groups. Available as a built-in formula function (`TTEST`) that returns the t-statistic, degrees of freedom, mean difference, standard error, and Cohen's d effect size.

**Text Input**
A question type that allows participants to enter free-form text responses. Supports single-line and multi-line variants.

**Timezone**
A user preference setting that determines how dates and times are displayed. Stored in the user profile.

**Token Rotation**
The security practice of issuing a new refresh token each time the current one is used. Prevents token reuse and limits the impact of token theft.

---

### U

**Undo/Redo**
The ability to reverse or re-apply editing actions in the designer. Implemented using an operation history stack. Keyboard shortcuts: `Ctrl+Z` (undo) and `Ctrl+Shift+Z` (redo).

**UUID (Universally Unique Identifier)**
A 128-bit identifier used as the primary key for most database records. Ensures global uniqueness without requiring centralized ID generation.

---

### V

**Variable**
A named value within a questionnaire that can be computed from formulas, derived from responses, or set by scripts. Variables power flow control, scoring, piping, and data analysis.

**Variable Interpolation**
The process of replacing `{{variableName}}` placeholders in text with the current value of the referenced variable at display time.

**Version**
A saved snapshot of a questionnaire's content at a specific point in time. Versions are created automatically during collaboration and can be manually saved for milestone tracking.

**Version Control**
The system for tracking changes to questionnaire content over time, including branching, diffing, and merging capabilities similar to Git.

**Viewer**
The lowest-level organization role. Viewers can see questionnaires and response data but cannot make changes.

---

### W

**WebGL 2.0**
A browser API for hardware-accelerated graphics rendering. QDesigner Modern uses WebGL 2.0 for its high-performance display renderer, achieving 120+ FPS for smooth visual presentation.

**WebSocket**
A persistent, bidirectional communication protocol used for real-time collaboration features. The QDesigner Modern WebSocket endpoint is at `/api/ws`.

**WYSIWYG (What You See Is What You Get)**
A designer view mode that shows the questionnaire exactly as participants will see it, allowing visual editing of layout and formatting.

---

### Z

**Z-Score**
A standardized score indicating how many standard deviations a value is from the mean. Available as a built-in formula function (`ZSCORE`) and used in participant comparison reports.

**Zoom**
The ability to scale the designer canvas view. Controlled via keyboard shortcuts (`Ctrl+=` to zoom in, `Ctrl+-` to zoom out, `Ctrl+0` to reset) or the command palette.
