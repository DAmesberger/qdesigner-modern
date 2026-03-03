# Chapter 14: Collaboration

Real-time collaboration, version control, and team workflows in QDesigner Modern.

---

## 14.1 Overview

QDesigner Modern provides a comprehensive collaboration system that allows multiple researchers to work on the same questionnaire simultaneously. The system consists of four interconnected subsystems:

1. **Version Control** -- branching, versioning, and merging of questionnaire definitions.
2. **Operational Transformation (OT)** -- conflict-free concurrent editing in real time.
3. **Presence and Awareness** -- live cursors, selections, and activity indicators.
4. **Comments** -- threaded discussions anchored to specific elements.

All collaboration features communicate via WebSocket connections to the server endpoint `GET /api/ws`, upgraded from HTTP to the WebSocket protocol.

---

## 14.2 Version Control

The version control system (`VersionControl.ts`) manages the history of questionnaire changes in a manner inspired by Git. Each questionnaire can have multiple branches, each containing a linear sequence of versions.

### Creating Versions

A version is a snapshot of the entire questionnaire state at a point in time. Every version records:

- **id**: A unique identifier (e.g., `v3_1709312400000`).
- **questionnaireId**: The questionnaire this version belongs to.
- **version**: The sequential version number on its branch.
- **content**: The complete serialized questionnaire content.
- **operations**: The list of operations that produced this version from the previous one.
- **createdBy**: The user who created the version.
- **message**: An optional human-readable description.
- **parentVersion**: The ID of the preceding version.
- **branchName**: Which branch this version belongs to.

Versions are created automatically when changes are saved, or manually when a researcher wants to create a named checkpoint.

### Retrieving Version History

The `getVersionHistory()` method returns:

```typescript
{
  versions: Version[];    // All versions, newest first
  branches: Branch[];     // All active branches
  currentBranch: string;  // The currently active branch name
}
```

The **VersionHistory** component in the designer sidebar renders this data as a timeline, showing each version's author, timestamp, message, and a summary of changes.

### Restoring a Previous Version

To restore a questionnaire to a previous state, call `restoreToVersion(versionId)`. This deserializes the stored content and returns a full `Questionnaire` object that can replace the current working state. The restore operation does not delete any versions -- it creates a new version with the restored content, preserving the complete history.

### Deleting Versions

Versions can be deleted with `deleteVersion(versionId)`, but only if:

1. No other version references it as a parent.
2. It is not the head of any active branch.

This prevents orphaning the version graph. For cleanup, `cleanupVersions(questionnaireId, keepCount)` removes the oldest versions beyond the specified retention count (default: 50).

---

## 14.3 Branching

Branches allow parallel lines of development within a single questionnaire. The default branch is `main`.

### Creating a Branch

```typescript
versionControl.createBranch(
  questionnaireId,   // Which questionnaire
  'experiment-v2',   // Branch name
  baseVersionId,     // Starting point
  userId,            // Creator
  'Testing alternative question order'  // Optional description
);
```

A branch records:

- **baseVersion**: The version where the branch diverged.
- **headVersion**: The latest version on the branch (initially the same as baseVersion).
- **isDefault**: Whether this is the default branch.
- **isActive**: Whether the branch is still in use.

### Switching Branches

Switching branches loads the head version of the target branch into the editor. The VersionHistory component shows a branch selector dropdown.

### Deleting Branches

Deleting a branch marks it as `isActive = false` rather than removing it from storage. This preserves history and allows recovery. The default branch cannot be deleted.

---

## 14.4 Diff Viewing

The `generateDiff(fromVersionId, toVersionId)` method computes the differences between any two versions:

```typescript
interface VersionDiff {
  fromVersion: string;
  toVersion: string;
  operations: Operation[];
  summary: {
    questionsAdded: number;
    questionsModified: number;
    questionsDeleted: number;
    pagesAdded: number;
    pagesModified: number;
    pagesDeleted: number;
    variablesAdded: number;
    variablesModified: number;
    variablesDeleted: number;
  };
  conflicts?: Conflict[];
}
```

The summary provides a quick numerical overview, while the `operations` array contains the detailed list of insert, delete, update, move, and reorder operations.

For branch-specific diffs, `generateBranchDiff(questionnaireId, branchName)` computes the diff between a branch's base version and its current head.

---

## 14.5 Operational Transformation

When multiple users edit the same questionnaire concurrently, their operations may conflict. The Operational Transformation engine (`OperationalTransform.ts`) resolves these conflicts automatically.

### Operation Types

The OT system handles five operation types:

| Type | Description | Key Fields |
|---|---|---|
| `insert` | Add an element | `position`, `content`, `target` (question/page/variable/option/block) |
| `delete` | Remove an element | `position`, `length`, `target` |
| `update` | Change a property | `property`, `oldValue`, `newValue` |
| `move` | Relocate an element | `fromPath`, `toPath`, `fromPosition`, `toPosition` |
| `reorder` | Rearrange elements | `indices`, `newIndices` |

Every operation includes a `path` (an array of strings identifying the nested location in the questionnaire tree), a `userId`, and a `timestamp`.

### Transform Algorithm

When user A and user B both submit operations based on the same document version, the server transforms one against the other so both can be applied sequentially:

1. **Path independence**: If two operations target different paths in the questionnaire tree, no transformation is needed.
2. **Insert-Insert**: When both operations insert at the same position, timestamp ordering determines which comes first. The later insert's position is incremented by 1.
3. **Insert-Delete**: If an insert falls within a deleted range, it is moved to the start of the deleted range. If it falls after the deleted range, its position is decremented.
4. **Delete-Delete**: Overlapping deletes are merged. The earlier operation takes precedence.
5. **Update-Update**: When two users update the same property at the same path, the later timestamp wins and the earlier operation's old value is adjusted.
6. **Update-Delete**: If a user updates a property on an element that another user deleted, the update becomes invalid.

### Conflict Detection

The system identifies three types of conflicts:

- **concurrent_edit**: Two users modified the same property simultaneously. Resolution is automatic (latest timestamp wins).
- **deleted_reference**: A user tried to modify an element that was deleted by another user. Resolution is automatic (delete takes precedence).
- **invalid_path**: After transformation, an operation's path no longer points to a valid location. This requires manual resolution.

### Inverse Operations

Every operation can be inverted for undo support:

- Insert becomes delete (and vice versa).
- Update swaps `oldValue` and `newValue`.
- Move swaps `fromPath`/`toPath` and `fromPosition`/`toPosition`.
- Reorder generates a reverse index mapping.

---

## 14.6 WebSocket Communication

All real-time collaboration messages flow through the WebSocket connection at `/api/ws`.

### Message Types

| Type | Direction | Purpose |
|---|---|---|
| `join_session` | Client -> Server | Join a collaboration session with user info |
| `leave_session` | Client -> Server | Leave the session |
| `operation` | Bidirectional | Send/receive OT operations |
| `cursor_update` | Client -> Server -> Others | Broadcast cursor position |
| `selection_update` | Client -> Server -> Others | Broadcast selected elements |
| `comment` | Bidirectional | Create, update, delete, or resolve comments |
| `presence_update` | Bidirectional | Update activity status |
| `ack` | Server -> Client | Acknowledge receipt of a message |
| `error` | Server -> Client | Report an error |
| `heartbeat` | Client -> Server | Keep-alive ping |
| `heartbeat_response` | Server -> Client | Keep-alive pong |

### Connection Lifecycle

The `CollaborationClient` manages the WebSocket connection with:

- **Automatic reconnection**: Configurable retry attempts and exponential backoff.
- **Heartbeat interval**: Regular pings to detect connection loss (default: 30 seconds).
- **Operation buffering**: Operations are queued during disconnections and replayed on reconnection.
- **Connection status tracking**: The UI displays one of `connecting`, `connected`, `disconnected`, `reconnecting`, or `error`.

---

## 14.7 Change Tracking and Audit Log

Every operation is recorded as a `ChangeRecord` with:

- **operation**: The full operation details.
- **user**: Who made the change.
- **version**: The version number at the time of change.
- **description**: A human-readable summary.
- **category**: Classification as `content`, `structure`, `settings`, or `metadata`.
- **impact**: Severity level -- `minor` (e.g., text edit), `major` (e.g., adding a page), or `breaking` (e.g., deleting required questions).

The **ActivityTimeline** component renders these records in the sidebar, grouped by date. The timeline shows operations, comments, version creations, merges, and user joins/leaves. It supports filtering by category and user, and lazy-loads older entries.

---

## 14.8 Merge Requests and Conflict Resolution

### Creating a Merge Request

When work on a branch is complete, a researcher creates a merge request:

```typescript
versionControl.createMergeRequest(
  questionnaireId,
  'experiment-v2',           // Source branch
  'main',                    // Target branch
  'Add alternative ordering', // Title
  userId,
  'Tested new question sequence with pilot participants'
);
```

The merge request includes:

- **diff**: The full VersionDiff between the branches.
- **conflicts**: Any conflicts detected between the divergent operation histories.
- **status**: One of `open`, `merged`, `closed`, or `draft`.
- **reviewers**: Optional list of user IDs who should review the changes.

### Executing a Merge

The `mergeBranch()` method performs the actual merge:

1. Detect conflicts between the source and target branches' operation histories.
2. If conflicts exist, invoke the `resolveConflicts` callback to obtain resolution operations.
3. Apply the source branch's operations (plus any resolution operations) to the target branch's head content.
4. Create a new version on the target branch with a merge message.

### Conflict Resolution Strategies

The `CollaborationConfig` supports three strategies:

- **automatic**: All conflicts are resolved by timestamp precedence. This is the default and works well for most editing scenarios.
- **manual**: All conflicts require explicit user resolution. The UI presents a side-by-side comparison.
- **hybrid**: Automatic resolution for `concurrent_edit` and `deleted_reference` conflicts; manual resolution for `invalid_path` conflicts.

---

## 14.9 Comment System

### Thread Structure

Comments are organized into threads. Each thread is anchored to a specific position in the questionnaire:

```typescript
interface CommentPosition {
  type: 'question' | 'page' | 'variable' | 'general';
  targetId: string;         // ID of the anchored element
  property?: string;        // Specific property (e.g., 'prompt')
  coordinates?: { x, y };   // Visual position for pin placement
  textRange?: { start, end }; // For highlighting text
}
```

### Comment Features

Each comment supports:

- **Mentions**: Tag other users with `@username`. The `mentions` array stores referenced user IDs.
- **Reactions**: Emoji reactions with a count of which users reacted.
- **Attachments**: File attachments with filename, MIME type, size, and URL.
- **Resolution**: Threads can be marked as resolved by any participant. The `resolvedBy` and `resolvedAt` fields record who resolved it and when.

### Real-time Synchronization

Comments are synchronized via WebSocket messages of type `comment` with action `create`, `update`, `delete`, or `resolve`. All participants in the collaboration session see comment changes immediately.

The **CommentThread** component renders a conversation view with author avatars, timestamps, and the ability to reply, react, or resolve.

---

## 14.10 Presence System

The presence system provides awareness of other users' activities in the editor.

### Presence Information

Each active user broadcasts:

- **cursor**: Which element they are hovering over, with coordinates.
- **selection**: Which elements are currently selected (supports multi-select).
- **activeElement**: What they are editing (question, page, variable, or the property panel).
- **viewport**: Their scroll position and zoom level.
- **status**: `active`, `idle` (no interaction for a configurable period), or `away`.

### Visual Indicators

The **PresenceIndicator** component shows:

- Avatar stack in the header showing all online collaborators.
- Colored cursor indicators on the canvas showing where each user is pointing.
- Selection highlights in each user's assigned color.
- Status badges (green for active, yellow for idle, gray for away).

### User Colors

Each collaboration user is assigned a unique color on session join. These colors are used consistently for cursors, selections, and comment indicators to provide clear visual attribution.

---

## 14.11 Best Practices for Team Collaboration

### Branch Strategy

For research teams, we recommend:

1. Use `main` as the stable, published branch.
2. Create feature branches for experimental modifications (e.g., `alt-ordering`, `revised-scales`).
3. Test feature branches with pilot participants before merging.
4. Use descriptive branch names and version messages.

### Communication

- Use comments for asynchronous discussions about specific questions or design decisions.
- Mention relevant team members with `@` to ensure they see the comment.
- Resolve comment threads once the discussion is concluded.

### Version Discipline

- Create named versions at meaningful milestones (e.g., "After IRB review", "Pre-pilot", "Final for data collection").
- Keep the version history clean by using `cleanupVersions()` to remove excessive automatic saves.
- Export version control data periodically as backup.

### Conflict Avoidance

- Coordinate editing sessions to minimize overlap on the same elements.
- Use the presence indicators to see what others are editing before making changes in the same area.
- Prefer the `hybrid` conflict resolution strategy for active collaboration sessions.

---

## Summary

QDesigner Modern's collaboration system enables research teams to work together on questionnaire design with full version control, real-time concurrent editing via Operational Transformation, threaded comments anchored to specific elements, and live presence indicators. The branching and merging workflow supports both exploratory design variations and disciplined release management, while the audit log provides complete traceability of every change.
