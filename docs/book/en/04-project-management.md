# Chapter 4: Project Management

Projects are the organizational unit within QDesigner Modern that groups related questionnaires. Every questionnaire belongs to a project, and every project belongs to an organization. This chapter covers project creation, configuration, member management, and the questionnaire lifecycle.

## Projects Within Organizations

The hierarchy in QDesigner Modern is:

```
Organization
  └── Project
        └── Questionnaire
              └── Responses
```

Projects serve several purposes:

- **Logical grouping**: A research study typically involves multiple questionnaires (screening, pre-test, intervention, post-test, follow-up). A project groups these related instruments together.
- **Access scoping**: Project-level roles allow you to grant different team members access to different studies within the same organization.
- **Metadata container**: Each project carries its own code, description, IRB number, date range, and participant limits -- metadata that applies to the study as a whole rather than to individual questionnaires.

A single organization can contain many projects. Each project can contain many questionnaires.

## Creating a Project

### From the Projects Page

1. Navigate to the Projects page from the dashboard (click "New Questionnaire" on the dashboard, or use the main navigation).
2. The Projects page displays all projects you have access to across your organizations, shown as cards in a responsive grid.
3. Click the "New Project" button in the top right corner.

### The Create Project Dialog

A modal dialog opens with three fields:

1. **Project Name** (required): The display name for the project. Example: "Longitudinal Attention Study 2026". This appears in project lists and breadcrumb navigation.

2. **Project Code** (required): A short alphanumeric identifier for the project. Example: "LAS2026". The code is automatically converted to uppercase as you type. It is used as a compact reference in exports, URLs, and data files.

3. **Description** (optional): A free-text description of the project. Example: "Three-wave longitudinal study examining sustained attention patterns in undergraduate populations."

Click "Create Project" to submit. The system creates the project within your active organization and redirects you to the project detail page.

> **Note:** The Project Code must be unique within the organization. It serves as a human-readable identifier that is easier to reference than a UUID.

### Project Properties

When a project is created via the API, additional properties can be set:

| Property | Type | Description |
|----------|------|-------------|
| **name** | String (1-255 chars) | Display name |
| **code** | String (1-50 chars) | Short identifier, unique within the organization |
| **description** | String (optional) | Detailed description |
| **is_public** | Boolean | Whether the project is publicly accessible (default: false) |
| **status** | String | Project status: "active", "completed", "archived", "deleted" |
| **max_participants** | Integer (optional) | Maximum number of participants for the study |
| **irb_number** | String (optional) | Institutional Review Board approval number |
| **start_date** | Date (optional) | Study start date |
| **end_date** | Date (optional) | Study end date |
| **settings** | JSON (optional) | Flexible settings object |

These properties can be updated later by users with Editor or higher permissions on the project, or by organization Admins.

## The Project Detail Page

After creating or selecting a project, you see the project detail page. This page consists of:

### Breadcrumb Navigation

At the top, a breadcrumb trail shows: **Projects > [Project Name]**. Clicking "Projects" returns you to the projects list.

### Project Header

The header displays:
- The project name as a large heading
- The project code below the name
- The project description (if set)
- Two action buttons:
  - **Analytics**: Links to the project analytics page
  - **New Questionnaire**: Opens the questionnaire creation dialog

### Questionnaire List

The main content area lists all questionnaires within the project. Each questionnaire entry shows:

- A document icon and the questionnaire name
- The questionnaire description (if set)
- A status badge indicating the current state:
  - **Draft** (yellow): The questionnaire is being designed and is not yet available to participants
  - **Published** (green): The questionnaire is live and accepting responses
  - **Archived** (gray): The questionnaire has been retired and is no longer accepting responses
- Response count: The number of responses received
- Last updated date
- Action buttons:
  - **Play** (only for published questionnaires): Opens the questionnaire for testing/preview
  - **Edit**: Opens the questionnaire in the designer
  - **More options**: Additional actions (archive, delete, duplicate)

If the project has no questionnaires yet, an empty state is displayed: "No questionnaires. Get started by creating a new questionnaire." with a prominent creation button.

## Creating a Questionnaire Within a Project

1. On the project detail page, click "New Questionnaire."
2. In the modal dialog, enter:
   - **Questionnaire Name** (required): The display name. Example: "Pre-Test Anxiety Assessment"
   - **Description** (optional): A brief description. Example: "Baseline anxiety measurement using GAD-7 adapted items"
3. Click "Create & Edit."

The system creates a new questionnaire with "draft" status and opens the questionnaire designer. The questionnaire is created with an empty content structure, ready for you to add pages, blocks, and questions.

The questionnaire is stored in the `questionnaire_definitions` table with:
- A reference to the parent project
- The creator's user ID
- An initial version number of 1
- Default settings
- Empty JSONB content

## Project Members and Roles

Projects have their own member list and role system, separate from (but related to) the organization-level roles.

### Project-Level Roles

QDesigner Modern defines four project-level roles:

| Role | Description |
|------|-------------|
| **Owner** | Full control over the project. Can delete the project and manage all members. |
| **Admin** | Can manage project settings and members. Can create, edit, and publish questionnaires. |
| **Editor** | Can create and edit questionnaires. Cannot manage project settings or members. |
| **Viewer** | Read-only access. Can view questionnaires and responses but cannot modify anything. |

The user who creates a project is automatically assigned the **Owner** role.

### How Organization and Project Roles Interact

Organization-level roles serve as a fallback for project-level permissions:

- **Organization Owners and Admins** have implicit access to all projects within the organization, regardless of project-level membership. An organization Admin can manage any project without being explicitly added as a project member.
- **Organization Members** can create projects but only access projects where they have been explicitly added as a project member.
- **Organization Viewers** can only access projects where they have been explicitly assigned.

This means:
1. An organization Admin does not need to be added to each project individually.
2. An organization Member who creates a project becomes its Owner but needs explicit assignment to access other members' projects.

### Adding Project Members

Users with project Admin or Owner role (or organization Admin/Owner role) can add members:

1. Navigate to the project's member management section.
2. Enter the email address of the user to add (they must already be a member of the organization).
3. Select a role: Owner, Admin, Editor, or Viewer.
4. Submit the form.

The user is immediately added to the project with the specified role.

### Changing Project Member Roles

Project Admins and Owners can update a member's role:

1. Navigate to the member list.
2. Select the member whose role you want to change.
3. Choose the new role from the available options.
4. Confirm the change.

### Removing Project Members

Project Admins and Owners can remove members:

1. Select the member to remove from the member list.
2. Confirm the removal.

**Safeguard**: The system prevents removing the last Owner of a project. If there is only one Owner, that Owner cannot be removed until another member is promoted to Owner first.

> **Tip:** When a team member leaves a study but remains in the organization, remove them from the project rather than from the organization. This preserves their access to other projects they may still be involved in.

## Project-Level Permission Matrix

| Action | Owner | Admin | Editor | Viewer |
|--------|-------|-------|--------|--------|
| View project details | Yes | Yes | Yes | Yes |
| View questionnaires | Yes | Yes | Yes | Yes |
| View responses | Yes | Yes | Yes | Yes |
| Update project settings | Yes | Yes | Yes* | No |
| Delete project | Yes | No** | No | No |
| Add project members | Yes | Yes | No | No |
| Remove project members | Yes | Yes | No | No |
| Change member roles | Yes | Yes | No | No |
| Create questionnaires | Yes | Yes | Yes | No |
| Edit questionnaires | Yes | Yes | Yes | No |
| Publish questionnaires | Yes | Yes | Yes | No |
| Delete questionnaires | Yes | Yes | No | No |

*Editors can update project settings if they also have the Editor role at the project level.

**Organization Admins can delete projects even without the project Owner role.

## Questionnaire Lifecycle

Questionnaires in QDesigner Modern follow a defined lifecycle with three primary states:

### Draft

- **Initial state**: Every new questionnaire starts as a draft.
- **Editable**: The questionnaire content, settings, and structure can be freely modified.
- **Not accessible to participants**: Draft questionnaires cannot be filled out by participants.
- **Versioned**: Each save increments the version number.

### Published

- **Transition from draft**: A user with Editor or higher permissions can publish a draft questionnaire.
- **Accessible to participants**: The questionnaire becomes available for completion through its distribution URL.
- **Content locked**: Published questionnaires should not have their structure modified to ensure data consistency across respondents. Minor text corrections may be applied.
- **Timestamped**: The `published_at` timestamp records when the questionnaire went live.

### Archived

- **Transition from published**: When data collection is complete, the questionnaire can be archived.
- **No longer accepting responses**: Archived questionnaires are closed to new participants.
- **Data preserved**: All collected responses remain accessible for analysis.
- **Reversible**: An archived questionnaire can be returned to draft status for revision if needed.

The status is displayed as a colored badge throughout the interface:
- Draft: yellow badge
- Published: green badge
- Archived: gray badge

### Status Transitions

```
Draft ──→ Published ──→ Archived
  ↑                        │
  └────────────────────────┘
```

- Draft to Published: requires Editor or higher permissions
- Published to Archived: requires Editor or higher permissions
- Archived to Draft: requires Editor or higher permissions (creates a new version)

## Project Analytics

Each project has an analytics page accessible via the "Analytics" button on the project detail page. The analytics page provides an overview of data collection progress across all questionnaires in the project.

Key metrics include:
- Total responses collected across all questionnaires
- Completion rates per questionnaire
- Response trends over time
- Average completion time
- Participant demographics (if collected)

The analytics page is accessible to all project members (including Viewers), as it presents aggregate data without exposing individual responses.

> **Note:** The analytics feature provides summary statistics. For detailed data analysis, export your response data and use dedicated statistical software.

## Best Practices for Project Management

1. **One project per study**: Create a separate project for each research study. This keeps questionnaires, members, and metadata organized and prevents cross-contamination between studies.

2. **Use meaningful project codes**: The code appears in exports and URLs. Choose codes that your team will recognize months later. "LAS2026" is better than "P001".

3. **Set IRB numbers and date ranges**: These metadata fields create a clear record of the study's approval and timeline, which is valuable for compliance and reporting.

4. **Assign the minimum necessary role**: Give collaborators the lowest role that allows them to do their work. Co-investigators who need to modify questionnaires should be Editors. Statistical consultants who only need to view data should be Viewers.

5. **Archive rather than delete**: When a study is complete, archive its questionnaires rather than deleting them. This preserves the data and instrument for future reference while signaling that the study is no longer active.

6. **Use the description field**: A brief description of the project's purpose and methodology helps team members (especially those joining later) understand the context without needing to read the questionnaires themselves.

7. **Review project membership when team composition changes**: When graduate students defend or postdocs move on, update project membership to reflect the current team. This maintains data security without disrupting the organization-level access of other studies.
