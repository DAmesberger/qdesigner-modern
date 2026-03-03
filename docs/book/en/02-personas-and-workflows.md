# Chapter 2: Personas and Workflows

This chapter defines five representative user personas for QDesigner and maps their complete workflows through the application. Each persona section includes a detailed profile, a step-by-step UX flow mapped to actual application routes, and an analysis of UX gaps discovered during the audit.

---

## 2.1 Persona Overview

| Persona | Role | Organization Role | Primary Goal |
|---|---|---|---|
| Prof. Dr. Sarah Weber | Principal Investigator | Owner | Design experiments, manage lab, analyze data |
| Max Berger | Research Assistant (PhD) | Editor | Build questionnaires, monitor data collection |
| Lisa Hoffmann | Study Participant | None (anonymous) | Complete questionnaire accurately |
| Dr. Thomas Mueller | Department Head | Admin | Manage access, oversee projects, ensure compliance |
| Anna Schmidt | Student Researcher (M.Sc.) | Owner (solo) | Thesis survey: design, collect, export |

---

## 2.2 Prof. Dr. Sarah Weber -- Principal Investigator

### Profile

- **Age**: 42
- **Position**: W2 Professor of Behavioral Psychology, University of Heidelberg
- **Technical Comfort**: Moderate. Uses SPSS and R daily, comfortable with web applications, prefers clear interfaces over command-line tools.
- **Background**: Runs a research lab with 8 members (3 PhD students, 2 postdocs, 3 master's students). Publishes 4--6 papers per year. Has used LimeSurvey and Qualtrics extensively but finds them lacking for reaction-time research.
- **Goals**:
  - Design complex within-subjects experiments with counterbalanced conditions
  - Achieve microsecond-accurate reaction time measurement
  - Export data in formats compatible with R and SPSS
  - Manage her entire lab's questionnaire projects in one place
  - Ensure data quality through attention checks and timing validation
- **Pain Points**:
  - Previous tools cannot measure reaction time at sub-millisecond accuracy
  - Managing access for rotating team members is tedious
  - No integrated experimental design features in standard survey tools
  - Data export requires manual reformatting for statistical software

### Complete UX Flow

#### Phase 1: Account Setup

1. **Landing Page** (`/(public)/+page.svelte` at `/`)
   - Sarah sees the marketing page with hero section, feature showcase, performance metrics, interactive demo, testimonials, and pricing.
   - Clicks "Get Started" or "Sign Up" CTA button.

2. **Sign Up** (`/(auth)/signup/+page.svelte` at `/signup`)
   - Enters full name: "Prof. Dr. Sarah Weber"
   - Enters university email: `sarah.weber@uni-heidelberg.de`
   - Creates password (strength indicator shows "Very Strong")
   - Checks domain auto-join detection (email triggers `checkDomainAutoJoin`)
   - Agrees to Terms of Service
   - Clicks "Create Account"
   - System sends 6-digit verification code via email

3. **Email Verification** (same page, verification step)
   - Opens university email (or MailPit in development at `localhost:18026`)
   - Enters 6-digit code
   - System verifies, signs her in, redirects to `/dashboard`

4. **Organization Onboarding** (`/(auth)/onboarding/organization/+page.svelte` at `/onboarding/organization`)
   - Since she has no organizations, login redirects here
   - Enters organization name: "Weber Lab - Behavioral Psychology"
   - Clicks "Create Organization"
   - Sees "What happens next?" steps: Create project, Invite team, Build questionnaire
   - Redirected to `/dashboard`

#### Phase 2: Team Setup

5. **Dashboard** (`/(app)/dashboard/+page.svelte` at `/dashboard`)
   - Sees welcome message: "Welcome back, Prof. Dr. Sarah Weber"
   - Stats cards show: 0 Questionnaires, 0 Responses, 0 Active, 0% Avg. Completion
   - Empty state: "No questionnaires yet" with "Get started" guidance
   - Navigates to Admin via top navigation bar

6. **Admin Dashboard** (`/(app)/admin/+page.svelte` at `/admin`)
   - Sees organization stats (hardcoded placeholder values)
   - Quick Actions: Manage Users, Manage Invitations, Domain Auto-Join, View All Questionnaires, View Analytics, System Settings
   - Clicks "Manage Invitations"

7. **Invitation Management** (`/(app)/admin/invitations/+page.svelte` at `/admin/invitations`)
   - Clicks "Send Invitation"
   - Invitation form appears with fields: Email, Role (Viewer/Member/Admin), Custom Message
   - Sends invitations to her team:
     - `max.berger@uni-heidelberg.de` -- role: Member
     - `anna.schmidt@uni-heidelberg.de` -- role: Member
   - Each invitation generates a unique token URL: `/invite/{token}`
   - Can copy invitation links, revoke pending invitations
   - Views invitation status badges: Pending, Viewed, Accepted, Declined, Expired, Revoked

8. **Domain Auto-Join** (`/(app)/admin/domains/+page.svelte` at `/admin/domains`)
   - Clicks "Add Domain"
   - Enters `uni-heidelberg.de`
   - System provides DNS TXT record or file-based verification instructions
   - After verification: configures auto-join (enable/disable), subdomain inclusion, default role (Viewer/Member), welcome message

#### Phase 3: Project and Experiment Design

9. **Projects List** (`/(app)/projects/+page.svelte` at `/projects`)
   - Empty state: "No projects" with "New Project" button
   - Clicks "New Project"
   - Modal: enters name "Implicit Association Study 2026", code "IAS2026", description
   - Project created, navigates to project detail

10. **Project Detail** (`/(app)/projects/[projectId]/+page.svelte` at `/projects/{id}`)
    - Breadcrumb: Projects > Implicit Association Study 2026
    - Shows project name, code, description
    - "New Questionnaire" and "Analytics" buttons
    - Empty state: "No questionnaires" with CTA
    - Clicks "New Questionnaire"
    - Modal: name "IAT Block 1 - Practice", description
    - Clicks "Create & Edit" -- navigates to designer

11. **Questionnaire Designer** (`/(app)/projects/[projectId]/designer/[[questionnaireId]]/+page.svelte`)
    - Full-screen layout with:
      - **Header**: breadcrumb (Projects > IAS2026 > IAT Block 1), editable title, save indicator, Design/Quality/Share/Preview/Publish buttons
      - **Left Sidebar**: Question palette (drag to add), block manager, flow control, variable manager
      - **Canvas**: WYSIWYG or Structural view (togglable)
      - **Right Sidebar**: Properties panel for selected question
    - Keyboard shortcuts: Ctrl+S (save), Ctrl+P (preview), Ctrl+K (command palette), Ctrl+Z/Ctrl+Shift+Z (undo/redo), Ctrl+D (duplicate), Delete (remove), Alt+Arrow (reorder)
    - Adds questions by dragging from palette or using Ctrl+Shift+A
    - Configures variables and scripting via Variable Manager
    - Opens Script Editor overlay for advanced logic
    - Experimental Design panel (flask icon): configures between/within-subjects design
    - Data Quality panel (shield icon): attention checks, timing validation
    - Auto-save runs continuously; manual save with Ctrl+S

12. **Preview** (modal overlay via `PreviewModal.svelte`)
    - Ctrl+P or "Preview" button
    - Full simulation of the questionnaire runtime
    - Escape to close

13. **Distribution / Share** (panel overlay via `DistributionPanel.svelte`)
    - Shows publish status (Draft/Published)
    - If draft: "Publish Now" button
    - After publish: displays fillout URL (`/{shareCode}`), copy button, QR code, embed code (`<iframe>`)
    - Summary: question count, page count, access settings

#### Phase 4: Data Collection and Analysis

14. **Publish** (via header "Publish" button or Ctrl+Shift+Enter)
    - Validates questionnaire (no errors required)
    - Saves, then publishes
    - Questionnaire becomes accessible via share code

15. **Monitoring** (back to Dashboard at `/dashboard`)
    - Questionnaire cards now show: response count, completed count, average completion time, weekly response rate trend
    - Recent Activity sidebar shows participant completions

16. **Analytics** (`/(app)/projects/[projectId]/analytics/+page.svelte` at `/projects/{id}/analytics`)
    - Breadcrumb: Projects > IAS2026 > Analytics
    - Questionnaire selector dropdown
    - Summary cards: Total Sessions, Completion Rate, Abandoned, Status
    - Sessions table: Session ID, Participant, Status, Started, Completed
    - Export buttons: CSV and JSON download
    - Statistics card component for visual data display

#### Phase 5: Export and Analysis

17. **Data Export** (from Analytics page)
    - Selects questionnaire from dropdown
    - Clicks CSV or JSON export button
    - Downloads file: `IAT_Block_1_Practice_csv_2026-03-02.csv`
    - CSV columns: session_id, participant_id, session_status, started_at, completed_at, question_id, value, reaction_time_us, presented_at, answered_at
    - Imports into R/SPSS for statistical analysis

### UX Gaps Identified

| Gap | Severity | Location | Description |
|---|---|---|---|
| Missing `/forgot-password` route | Medium | Login page line 186 | "Forgot password?" link leads to 404 |
| Missing `/settings` route | Medium | AppShell user menu line 171-174 | "Your Profile" and "Settings" links lead to 404 |
| Missing admin sub-routes | High | Admin page lines 103-139 | `/admin/users`, `/admin/questionnaires`, `/admin/analytics`, `/admin/settings` all lead to 404 |
| Hardcoded admin stats | Low | Admin page lines 14-19 | Stats are hardcoded (156 users, 12 questionnaires) instead of loaded from API |
| Login "Create account" button | Medium | Login page line 258-268 | Calls `handleSignUp` (creates account inline without name/terms) instead of navigating to `/signup` |
| "View All Activity" dead end | Low | Dashboard line 389 | Button has no onclick handler or href |

---

## 2.3 Max Berger -- Research Assistant

### Profile

- **Age**: 28
- **Position**: PhD Student, 3rd year, Weber Lab
- **Technical Comfort**: High. Codes in Python and R, comfortable with complex UIs, power user of keyboard shortcuts.
- **Background**: Designs and runs behavioral experiments for Sarah's lab. Manages day-to-day data collection. Has experience with PsychoPy, jsPsych, and Qualtrics.
- **Goals**:
  - Build questionnaires with branching logic and variable piping
  - Test questionnaires thoroughly before deployment
  - Monitor response rates and catch data quality issues early
  - Iterate quickly on questionnaire design based on pilot feedback
- **Pain Points**:
  - Previous tools have clunky branching logic editors
  - No real-time preview while editing
  - Difficult to test complex flow control without publishing
  - Reaction time items require separate tools (jsPsych) that don't integrate with surveys

### Complete UX Flow

#### Phase 1: Joining the Organization

1. **Invitation Email**
   - Receives email with invitation link: `https://qdesigner.app/invite/{token}`
   - Clicks the link

2. **Invitation Page** (`/invite/[token]/+page.svelte` at `/invite/{token}`)
   - Sees: "You're Invited!" with organization name "Weber Lab - Behavioral Psychology"
   - Shows: inviter name (Prof. Dr. Sarah Weber), role badge (Member), optional personal message
   - Since Max has no account: sees "Please sign in or create an account" alert
   - Two buttons: "Sign In" (goes to `/login?redirect=/invite/{token}`) and "Create Account" (goes to `/signup?email=max.berger@uni-heidelberg.de`)

3. **Sign Up** (`/signup` with pre-filled email)
   - Email pre-populated from invitation link
   - Fills in name, password, agrees to terms
   - Completes email verification
   - Redirected back to invitation page

4. **Accept Invitation** (`/invite/{token}` -- now authenticated)
   - Sees Accept & Join / Decline buttons
   - Clicks "Accept & Join"
   - Redirected to `/dashboard`
   - Now a member of "Weber Lab" organization

#### Phase 2: Questionnaire Design

5. **Dashboard** (`/dashboard`)
   - Sees organization's questionnaires (those shared with him)
   - Clicks on a questionnaire or navigates to Projects

6. **Projects** (`/projects`)
   - Sees projects he has access to (e.g., "Implicit Association Study 2026")
   - Clicks project card to open

7. **Project Detail** (`/projects/{projectId}`)
   - Sees existing questionnaires with status badges (draft/published)
   - Creates new questionnaire or edits existing one
   - Clicks edit (pencil icon) on a questionnaire

8. **Designer** (`/projects/{projectId}/designer/{questionnaireId}`)
   - Full designer interface (same as Sarah's view, restricted by editor permissions)
   - Workflow:
     a. **Question Palette** (Left Sidebar): drags question types onto canvas
     b. **Canvas**: arranges and edits questions in WYSIWYG or structural view
     c. **Properties Panel** (Right Sidebar): configures selected question settings
     d. **Block Manager**: organizes questions into logical blocks/pages
     e. **Flow Control Manager**: sets up skip logic and branching
     f. **Variable Manager**: defines computed variables, formulas, piping
     g. **Script Editor** (overlay): writes advanced scripts for complex logic
   - Uses keyboard shortcuts extensively:
     - Ctrl+K: Command palette for quick actions
     - Ctrl+S: Save
     - Ctrl+P: Preview
     - Ctrl+D: Duplicate question
     - Alt+Up/Down: Reorder questions

9. **Preview and Test**
   - Ctrl+P opens preview modal
   - Runs through entire questionnaire flow
   - Tests branching logic, variable piping, skip conditions
   - Escape to return to editor

10. **Share for Pilot Testing**
    - Clicks "Share" button in header
    - Distribution panel opens
    - If not published: clicks "Publish Now"
    - Copies fillout URL
    - Sends to pilot participants or opens in new tab for self-testing

#### Phase 3: Monitoring

11. **Analytics** (`/projects/{projectId}/analytics`)
    - Selects questionnaire from dropdown
    - Monitors session counts, completion rates, abandoned sessions
    - Reviews individual session rows
    - Exports data for preliminary analysis

### UX Gaps Identified

| Gap | Severity | Location | Description |
|---|---|---|---|
| No role-based UI filtering | Medium | Designer/Admin | Editor role sees admin links in navigation but may lack API permissions |
| No invitation redirect after signup | Medium | Signup flow | After signup + verification, user goes to `/dashboard` not back to `/invite/{token}` to accept |
| Missing project member management | Medium | Project detail | No UI to see/manage who has access to a specific project |

---

## 2.4 Lisa Hoffmann -- Study Participant

### Profile

- **Age**: 21
- **Position**: Undergraduate Psychology student
- **Technical Comfort**: High with consumer apps, low with research tools. Uses smartphone primarily.
- **Background**: Participates in studies for course credit and extra income. Has completed many online surveys in Qualtrics and Google Forms. First time with a reaction-time study.
- **Goals**:
  - Complete the questionnaire correctly and efficiently
  - Understand what is being asked
  - Know her progress through the study
  - Receive confirmation of completion (for credit)
- **Pain Points**:
  - Surveys that don't work on mobile
  - Unclear instructions for timed tasks
  - No indication of how long the study will take
  - Studies that crash mid-way with no recovery

### Complete UX Flow

#### Phase 1: Access

1. **Receiving the Link**
   - Gets a URL from the researcher: `https://qdesigner.app/{SHARECD}` (8-character code derived from questionnaire ID)
   - Could also scan a QR code (generated in Distribution panel)
   - Or encounter an embedded iframe on a course website

2. **Fillout Landing** (`/(fillout)/[code]/+page.svelte` at `/{code}`)
   - Page loads with server-side data fetch (`+page.server.ts` resolves share code to questionnaire)
   - System checks for existing session (resume support)

3. **Welcome Screen** (`WelcomeScreen.svelte`)
   - Shows questionnaire title, project name
   - Description and estimated duration
   - "Start" button
   - If `requireConsent` is enabled in settings, clicking Start goes to consent screen
   - If consent not required, creates session and starts runtime directly

#### Phase 2: Consent and Runtime

4. **Consent Screen** (`ConsentScreen.svelte`, if enabled)
   - Displays consent text (HTML content)
   - Optional checkboxes (e.g., "I agree to participate voluntarily")
   - Optional signature requirement
   - "Accept" creates session and proceeds to runtime
   - "Decline" navigates to home page (`/`)

5. **Session Creation**
   - `QuestionnaireAccessService.createOrResumeSession()` called
   - Creates or resumes session via API
   - Session ID stored for progress tracking

6. **Runtime** (WebGL canvas + HTML overlay)
   - Loading sequence: "Initializing WebGL..." > "Loading questionnaire..." > "Loading media resources... X%" > "Starting questionnaire..."
   - Full-screen canvas with WebGL 2.0 rendering at up to 120+ FPS
   - HTML overlay for form inputs (text fields, radio buttons, checkboxes)
   - Keyboard events captured for reaction time measurement (`performance.now()`)
   - Progress saved periodically (offline sync enabled)
   - Handles: standard questions, timed items, media stimuli

7. **Completion Screen** (`CompletionScreen.svelte`)
   - Shows custom completion message (configurable by researcher)
   - Optional statistics display
   - "Close" button navigates to `/`
   - Participant can screenshot or note completion for credit

#### Phase 3: Error Recovery

8. **Error States**
   - If questionnaire fails to load: `EmptyState` with "Unable to load questionnaire" and "Go back" button
   - If media fails to preload: detailed error message listing failed files
   - If WebGL not supported: error state (graceful degradation not yet implemented)
   - If session interrupted: can resume by visiting same URL (existing session detection)

### UX Gaps Identified

| Gap | Severity | Location | Description |
|---|---|---|---|
| No progress indicator during fillout | High | Fillout runtime | Participant has no way to see how far through the questionnaire they are |
| No "back" navigation during fillout | Medium | Fillout runtime | Cannot go back to previous questions (may be intentional for timed studies) |
| Decline consent goes to `/` | Low | ConsentScreen | Navigates to landing page, which may be confusing for participants; should show a "Thank you, you may close this tab" message |
| No mobile-responsive runtime | Medium | Fillout canvas | WebGL canvas uses `window.innerWidth/Height` but no touch gesture handling documented |
| No completion receipt | Medium | CompletionScreen | No downloadable receipt or completion code for course credit systems |
| No language selection | Low | Fillout flow | No way for participant to choose language |

---

## 2.5 Dr. Thomas Mueller -- Organization Admin

### Profile

- **Age**: 55
- **Position**: Head of Psychology Department, oversees 4 research labs
- **Technical Comfort**: Low-moderate. Uses email and standard office tools. Delegates technical work.
- **Background**: Responsible for department-level research infrastructure, data governance, and ethics compliance. Needs to ensure research projects meet institutional requirements.
- **Goals**:
  - Provide a centralized platform for all department research groups
  - Control access and permissions for different labs
  - Monitor research activity across projects
  - Ensure compliance with data protection regulations (GDPR)
  - Set up domain-based auto-join for university staff
- **Pain Points**:
  - Each lab uses different tools, making oversight impossible
  - No centralized view of all research activities
  - Managing individual accounts is time-consuming
  - Data governance concerns when researchers leave

### Complete UX Flow

#### Phase 1: Organization Setup

1. **Sign Up and Onboarding** (same as Sarah's flow)
   - Creates account at `/signup`
   - Creates organization: "Department of Psychology - University of Heidelberg"
   - Arrives at dashboard

2. **Domain Configuration** (`/admin/domains`)
   - Adds domain `psychologie.uni-heidelberg.de`
   - Configures DNS verification
   - After verification: enables auto-join, sets default role to "Viewer"
   - Adds welcome message: "Welcome to the Department Psychology platform. Contact IT for support."
   - Result: any university staff member with matching email can join automatically

3. **Team Invitations** (`/admin/invitations`)
   - Invites lab heads as Admins:
     - `sarah.weber@uni-heidelberg.de` -- Admin role
     - `frank.becker@uni-heidelberg.de` -- Admin role
   - Each admin can then manage their own lab members

#### Phase 2: Oversight

4. **Dashboard** (`/dashboard`)
   - Views aggregated stats across all questionnaires
   - Sees recent activity from all organization members
   - Monitors overall response rates

5. **Projects Overview** (`/projects`)
   - Sees all projects across the department
   - Can click into any project to view questionnaires
   - Cannot edit (viewer-level access to content, admin-level for users)

6. **Admin Dashboard** (`/admin`)
   - Views organization-wide statistics
   - Quick actions for user management, invitations, domains
   - Reviews recent activity feed

#### Phase 3: Access Management

7. **User Management** (`/admin/users` -- NOT YET IMPLEMENTED)
   - Would list all organization members
   - Change roles, deactivate accounts
   - View last login dates

8. **Invitation Monitoring** (`/admin/invitations`)
   - Reviews pending invitations
   - Revokes expired or unnecessary invitations
   - Tracks acceptance rates

### UX Gaps Identified

| Gap | Severity | Location | Description |
|---|---|---|---|
| Missing `/admin/users` page | High | Admin quick actions | User management page does not exist; link returns 404 |
| Missing `/admin/settings` page | High | Admin quick actions | System settings page does not exist; link returns 404 |
| Missing `/admin/questionnaires` page | Medium | Admin quick actions | Organization-wide questionnaire list does not exist |
| Missing `/admin/analytics` page | Medium | Admin quick actions | Organization-wide analytics does not exist |
| No role-based visibility | High | Navigation + API | Admin navigation shows same items regardless of role; no RBAC filtering on UI |
| No audit log | Medium | Admin area | No way to see who did what (edits, deletions, access changes) |
| No data export governance | Medium | Analytics | No controls for who can export data or download responses |
| No member list view | High | Organization | No way to view current organization members or their roles outside of admin |

---

## 2.6 Anna Schmidt -- Student Researcher

### Profile

- **Age**: 24
- **Position**: Master's student in Psychology, writing thesis on social media and well-being
- **Technical Comfort**: Moderate. Uses Google Forms and basic statistics tools. No programming experience.
- **Background**: Needs to collect survey data for her Master's thesis. Has 150 target participants from university social media groups. Budget: zero. Time: 3 months.
- **Goals**:
  - Create a professional-looking survey quickly
  - Include validated psychological scales (e.g., PHQ-9, WHO-5)
  - Collect responses without cost
  - Export data for SPSS analysis
  - Complete thesis on time
- **Pain Points**:
  - Free survey tools have response limits or branding
  - No templates for standard psychological instruments
  - Complex tools are overwhelming for simple surveys
  - Needs guidance on best practices (randomization, attention checks)

### Complete UX Flow

#### Phase 1: Getting Started

1. **Discovery**
   - Finds QDesigner through university recommendation or web search
   - Visits landing page at `/`
   - Reviews features, performance metrics, pricing
   - Clicks "Get Started"

2. **Sign Up** (`/signup`)
   - Creates account with university email
   - Verifies email with 6-digit code
   - Signs in

3. **Organization Setup** (`/onboarding/organization`)
   - First-time user, no organizations
   - Creates: "Anna Schmidt - Thesis Research"
   - Sees onboarding steps guide
   - Redirected to dashboard

4. **Create Project** (`/projects`)
   - Empty projects page with "New Project" CTA
   - Creates: name "Social Media & Well-Being Study", code "SMWB01"
   - Navigates to project detail

5. **Create Questionnaire** (`/projects/{id}`)
   - Clicks "New Questionnaire"
   - Name: "Social Media Usage and Mental Health"
   - Clicks "Create & Edit"

#### Phase 2: Building the Survey

6. **Designer** (`/projects/{id}/designer/{qId}`)
   - Uses Question Palette to add items:
     - Text inputs for demographics
     - Likert scales for validated instruments
     - Multiple choice for usage patterns
     - Matrix questions for scale batteries
   - Uses Block Manager to organize into sections:
     - Block 1: Demographics
     - Block 2: Social Media Usage (SMU scale)
     - Block 3: Well-being (WHO-5)
     - Block 4: Depression screening (PHQ-9)
     - Block 5: Open-ended feedback
   - Uses Variable Manager for:
     - Computed scores: `SUM(Q3_1, Q3_2, Q3_3, Q3_4, Q3_5)` for WHO-5 total
     - Conditional logic: `IF(PHQ9_TOTAL > 10, "high", "low")` for severity
   - Properties panel to configure each question:
     - Required/optional
     - Validation rules
     - Help text

7. **Preview and Test**
   - Ctrl+P to preview
   - Walks through entire survey
   - Checks variable computations show correct values
   - Tests skip logic

8. **Data Quality Setup**
   - Clicks "Quality" button in header
   - Data Quality panel opens
   - Configures attention check items
   - Sets minimum completion time thresholds

#### Phase 3: Distribution

9. **Publish and Share**
   - Clicks "Publish" in header (validates: no errors, has questions)
   - Opens Share panel
   - Copies fillout URL
   - Generates QR code for printed flyers
   - Copies embed code for university portal
   - Shares link in student WhatsApp groups and course forums

#### Phase 4: Data Collection and Export

10. **Monitor Responses** (`/dashboard`)
    - Checks daily: response count, completion rate, average time
    - Questionnaire card shows trends ("+15% this week")

11. **Analytics** (`/projects/{id}/analytics`)
    - Selects questionnaire
    - Views: total sessions, completion rate, abandoned rate
    - Reviews session details

12. **Export** (from Analytics page)
    - Clicks CSV export
    - Downloads file with all response data
    - Imports into SPSS for thesis analysis
    - Columns include reaction_time_us for any timed items

### UX Gaps Identified

| Gap | Severity | Location | Description |
|---|---|---|---|
| No questionnaire templates | High | Designer | No way to start from a template (validated scales, common patterns) |
| No guided onboarding in designer | Medium | Designer | First-time users see empty canvas with no tutorial or hints |
| No progress saving feedback | Low | Designer | Auto-save runs but no toast/notification confirms save success |
| No questionnaire duplication | Medium | Project detail | Cannot duplicate an existing questionnaire as a starting point |
| No response quota/limit setting | Low | Distribution | Cannot set a maximum number of responses |
| Solo user sees "Invite team" step | Low | Onboarding | Onboarding "What happens next" steps mention inviting team, unnecessary for solo users |

---

## 2.7 Consolidated UX Gap Analysis

### Critical Gaps (Blocking or Severely Degraded Experience)

1. **Missing admin pages**: `/admin/users`, `/admin/questionnaires`, `/admin/analytics`, `/admin/settings` are all linked but do not exist. This affects organization admins (Thomas) most directly.

2. **Missing `/forgot-password` route**: Linked from login page (`/(auth)/login/+page.svelte` line 186) but returns 404. Users who forget their password have no recovery path.

3. **Missing `/settings` route**: Linked from the AppShell user dropdown menu (`AppShell.svelte` lines 171-174) but does not exist. Users cannot manage their profile.

4. **Login page "Create account" behavior**: The "Create new account" button on the login page calls `handleSignUp` which attempts to create an account using only email and password (no name, no terms agreement, no verification flow). It should navigate to `/signup` instead.

### Moderate Gaps (Degraded but Workable)

5. **No role-based navigation filtering**: All users see the same navigation items (Dashboard, Projects, Admin, Test) regardless of their role. Editors and viewers should not see "Admin". Participants should not see the app navigation at all.

6. **"View All Activity" button non-functional**: Dashboard recent activity has a "View All Activity" link button with no href or onclick handler.

7. **Invitation redirect after signup**: When a user signs up after clicking an invitation link, they are redirected to `/dashboard` instead of back to `/invite/{token}` to complete acceptance.

8. **No member list in organization**: There is no page to view current organization members, their roles, or remove them. Only invitations are manageable.

9. **`/fillout` nav item is misleading**: The "Test" link in navigation goes to `/(app)/fillout/+page.svelte` which is a test page, not the participant fillout experience. This could confuse users.

10. **No questionnaire templates**: New users cannot start from pre-built templates for common instruments (Likert scales, PHQ-9, WHO-5, etc.).

### Minor Gaps (Polish)

11. **Hardcoded admin stats**: Admin dashboard stats are hardcoded rather than loaded from the API.

12. **No progress indicator in fillout**: Participants have no progress bar during questionnaire completion.

13. **No completion receipt**: Participants receive no downloadable proof of completion.

14. **Consent decline UX**: Declining consent navigates to `/` (the marketing page), which is disorienting for participants.

---

## 2.8 Route Map Summary

The following table maps all application routes to the personas who use them.

| Route | Purpose | Sarah | Max | Lisa | Thomas | Anna |
|---|---|---|---|---|---|---|
| `/` | Landing/marketing page | Entry | -- | -- | Entry | Entry |
| `/signup` | Account creation | Yes | Yes | -- | Yes | Yes |
| `/login` | Authentication | Yes | Yes | -- | Yes | Yes |
| `/onboarding/organization` | First org setup | Yes | -- | -- | Yes | Yes |
| `/invite/{token}` | Accept invitation | -- | Yes | -- | -- | -- |
| `/dashboard` | Overview and stats | Yes | Yes | -- | Yes | Yes |
| `/projects` | Project listing | Yes | Yes | -- | Yes | Yes |
| `/projects/{id}` | Project detail | Yes | Yes | -- | Yes | Yes |
| `/projects/{id}/designer/{qId}` | Questionnaire builder | Yes | Yes | -- | -- | Yes |
| `/projects/{id}/analytics` | Response analytics | Yes | Yes | -- | Yes | Yes |
| `/admin` | Organization admin | Yes | -- | -- | Yes | -- |
| `/admin/invitations` | Manage invitations | Yes | -- | -- | Yes | -- |
| `/admin/domains` | Domain auto-join | Yes | -- | -- | Yes | -- |
| `/{code}` | Participant fillout | -- | -- | Yes | -- | -- |

### Routes That Do Not Exist (404)

| Route | Linked From | Expected Content |
|---|---|---|
| `/forgot-password` | Login page | Password reset flow |
| `/settings` | AppShell user menu | User profile and preferences |
| `/admin/users` | Admin quick actions | Organization member management |
| `/admin/questionnaires` | Admin quick actions | Organization-wide questionnaire list |
| `/admin/analytics` | Admin quick actions | Organization-wide analytics |
| `/admin/settings` | Admin quick actions | System/organization settings |
| `/terms` | Login, Signup | Terms of Service page |
| `/privacy` | Login, Signup | Privacy Policy page |
