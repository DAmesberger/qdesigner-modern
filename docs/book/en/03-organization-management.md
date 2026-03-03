# Chapter 3: Organization Management

Organizations are the top-level container in QDesigner Modern. Every project, questionnaire, and data record belongs to an organization. This chapter explains how organizations work, how to manage members and roles, and how the invitation system operates.

## Multi-Tenant Architecture

QDesigner Modern uses a multi-tenant architecture where each organization is a fully isolated workspace:

- **Data isolation**: An organization's projects, questionnaires, responses, and media are not visible to members of other organizations. Database queries are scoped to the user's active organization memberships.
- **Independent membership**: A single user account can belong to multiple organizations. For example, a researcher might be a member of their university's psychology department organization and a separate cross-institutional collaboration organization.
- **Separate role assignments**: Your role in one organization has no effect on your role in another. You might be an Owner in your lab's organization and a Viewer in a collaborator's organization.

Organizations are identified internally by a UUID and externally by a human-readable slug derived from the organization name. For example, an organization named "Cognitive Science Lab" receives the slug `cognitive-science-lab`.

## Creating an Organization

Organizations can be created in two contexts:

### During Onboarding

If you sign up for QDesigner Modern and do not belong to any organization (and have no pending invitations), you are automatically directed to the organization onboarding page. Enter your organization name and click "Create Organization." You become the Owner of the new organization.

### From the Dashboard

Authenticated users who already belong to at least one organization can create additional organizations through the application settings.

When creating an organization, you provide:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | The display name (1--255 characters). Example: "Behavioral Research Unit" |
| **Slug** | No | URL-friendly identifier. Auto-generated from the name if not provided. Must be unique across the platform. |
| **Domain** | No | An email domain for auto-join (e.g., `uni-muenchen.de`). Users signing up with this domain can automatically join the organization. |
| **Logo URL** | No | URL to an organization logo for branding. |

The user who creates the organization is automatically added as a member with the **Owner** role.

> **Tip:** Choose your organization name carefully. While it can be changed later by Owners and Admins, the slug (used in URLs) is generated at creation time.

## Organization Settings

Owners and Admins can update the following organization properties:

- **Name**: The display name shown throughout the platform.
- **Domain**: The email domain for automatic member enrollment. When set, any user who signs up with an email address from this domain sees a prompt indicating they will automatically join the organization.
- **Logo URL**: A link to the organization's logo image.
- **Settings**: A flexible JSON settings object for platform-level configuration.

To update settings, send a PATCH request to the organization endpoint. The backend validates that the requesting user has at least the Admin role before applying changes.

> **Note:** Only Owners can delete an organization. Deletion is a soft delete -- the organization record is marked with a `deleted_at` timestamp but data is retained in the database for recovery purposes.

## Member Management

### Viewing Members

All organization members can view the member list. Navigate to your organization's member management section to see a table listing:

| Column | Description |
|--------|-------------|
| **Name** | The member's full name (if set) |
| **Email** | The member's email address |
| **Role** | Owner, Admin, Member, or Viewer |
| **Status** | Active or Inactive |
| **Joined** | The date the member joined the organization |

Members are sorted by join date, with the earliest members (typically the founders) listed first.

### Adding Members

Admins and Owners can add new members to the organization. There are two methods:

#### Direct Addition

If the person you want to add already has a QDesigner Modern account, you can add them directly:

1. Navigate to the member management section.
2. Enter the person's email address.
3. Select a role (Admin, Member, or Viewer -- you cannot directly assign the Owner role through this interface).
4. Submit the form.

The system looks up the user by email. If found, they are immediately added to the organization with the specified role. If the email is not registered on the platform, an error is returned.

#### Invitation (Recommended)

For users who may not yet have an account, use the invitation system (described in detail below). This sends an email invitation that the recipient can accept after signing up.

### Changing a Member's Role

Admins and Owners can change a member's role by updating their membership record. The available organization-level roles are:

- **Owner**
- **Admin**
- **Member**
- **Viewer**

Role changes take effect immediately. The backend enforces that role modifications require at least Admin privileges.

### Removing Members

Admins and Owners can remove members from the organization. When removing a member:

1. Navigate to the member management section.
2. Select the member to remove.
3. Confirm the removal.

The member's association with the organization is deleted. They lose access to all projects and questionnaires within the organization.

**Important safeguard**: The system prevents removing the last Owner of an organization. If there is only one Owner, that Owner cannot be removed until another member is promoted to Owner. This prevents orphaned organizations.

> **Note:** Removing a member does not delete their user account. They can still access other organizations they belong to, and they can be re-added to the organization later.

## Role Hierarchy

QDesigner Modern enforces a four-tier role hierarchy at the organization level. Higher roles inherit all permissions of lower roles.

### Owner

The Owner role is the highest privilege level. Owners can:

- Perform all actions available to Admins, Members, and Viewers
- Delete the organization (soft delete)
- Transfer ownership (by promoting another member to Owner)
- Manage billing and subscription settings (when applicable)

Every organization must have at least one Owner. The user who creates the organization is automatically assigned this role.

### Admin

Admins manage the day-to-day operations of the organization:

- Update organization settings (name, domain, logo)
- Add and remove members
- Change member roles (up to Admin level)
- Create and manage invitations (send, view, revoke)
- Create projects within the organization
- Full access to all projects and questionnaires

### Member

Members are active participants who can contribute to research:

- View organization details and member list
- Create projects within the organization
- Access projects they are assigned to
- Create and edit questionnaires in their assigned projects

### Viewer

Viewers have read-only access:

- View organization details and member list
- View projects and questionnaires they are assigned to
- Cannot create, edit, or delete any resources

## Permission Matrix

The following table summarizes what each organization role can do:

| Action | Owner | Admin | Member | Viewer |
|--------|-------|-------|--------|--------|
| View organization details | Yes | Yes | Yes | Yes |
| View member list | Yes | Yes | Yes | Yes |
| Update organization settings | Yes | Yes | No | No |
| Delete organization | Yes | No | No | No |
| Add members | Yes | Yes | No | No |
| Remove members | Yes | Yes | No | No |
| Change member roles | Yes | Yes | No | No |
| Send invitations | Yes | Yes | No | No |
| Revoke invitations | Yes | Yes | No | No |
| View invitations | Yes | Yes | No | No |
| Create projects | Yes | Yes | Yes | No |
| Access all projects | Yes | Yes | No | No |
| Access assigned projects | Yes | Yes | Yes | Yes |

> **Note:** These permissions are enforced server-side in the Rust backend. The frontend UI hides controls that the user lacks permission for, but the backend independently validates every request. This means that even if a UI element were to be displayed erroneously, the server would reject unauthorized operations.

## The Invitation System

The invitation workflow allows Admins and Owners to invite people to join the organization, even if the invitee does not yet have a QDesigner Modern account.

### Sending an Invitation

1. Navigate to your organization's invitation management section.
2. Enter the invitee's email address.
3. Select the role they should receive upon joining (Admin, Member, or Viewer).
4. Submit the invitation.

The system creates an invitation record with the following properties:

| Property | Value |
|----------|-------|
| **Email** | The invitee's email address |
| **Role** | The assigned role |
| **Invited by** | The UUID of the user who sent the invitation |
| **Created at** | Timestamp of invitation creation |
| **Expires at** | 7 days after creation |
| **Status** | Pending |

An email notification is sent to the invitee (in production environments) informing them of the invitation.

### Viewing Pending Invitations

Admins and Owners can view all pending invitations for their organization. The invitation list shows:

- Invitee email address
- Assigned role
- Who sent the invitation
- Creation date
- Expiration date

Only invitations that are pending (not yet accepted, declined, or revoked) and not expired are shown.

### Accepting an Invitation

Invitees receive their pending invitations in two contexts:

1. **During signup**: If the invitee signs up with the email address the invitation was sent to, the signup page displays a banner noting the pending invitation count.

2. **During onboarding**: If the invitee signs up and has no existing organization, the onboarding page shows invitation cards that can be accepted directly.

3. **Via the pending invitations API**: Authenticated users can query their pending invitations through the `/api/invitations/pending` endpoint, which returns all invitations addressed to their email.

To accept an invitation:

1. The invitee clicks "Accept & Join" on the invitation card (or calls the accept endpoint).
2. The invitation status changes to "accepted" with an `accepted_at` timestamp.
3. The invitee is added to the organization as a member with the role specified in the invitation.
4. If the invitee was previously a member (and was removed), their membership is reactivated with the new role.

### Declining an Invitation

If the invitee does not wish to join the organization:

1. The invitee calls the decline endpoint for the specific invitation.
2. The invitation status changes to "declined" with a `declined_at` timestamp.
3. No organization membership is created.

The inviting organization's Admins can see that the invitation was declined.

### Revoking an Invitation

Admins and Owners can revoke a pending invitation before it is accepted or declined:

1. Navigate to the invitation list.
2. Select the invitation to revoke.
3. Confirm the revocation.

The invitation status changes to "revoked." The invitee can no longer accept it.

> **Note:** Revocation only works on pending invitations. If an invitation has already been accepted or declined, it cannot be revoked.

### Invitation Expiration

Invitations expire 7 days after creation. Expired invitations cannot be accepted. If the invitee needs access after expiration, a new invitation must be sent.

The system automatically filters out expired invitations when listing pending invitations, so neither the organization nor the invitee will see stale entries.

## Domain-Based Auto-Join

Organizations can configure a domain for automatic member enrollment:

1. An Owner or Admin sets the organization's domain (e.g., `uni-muenchen.de`).
2. When a new user signs up with an email address from that domain (e.g., `researcher@uni-muenchen.de`), the signup form displays a banner: "You'll automatically join [Organization Name]. Your organization has pre-approved all @uni-muenchen.de addresses."
3. After completing registration and email verification, the user is automatically added to the organization.

This feature simplifies onboarding for large institutions where manually inviting every researcher would be impractical.

> **Tip:** Domain auto-join is particularly useful for university departments and research institutes where all members share an institutional email domain. It reduces the administrative burden of individually inviting each team member.

## Administration Pages

Owners and Admins have access to dedicated administration pages for managing the organization.

### Admin Settings Page

The admin settings page provides a centralized interface for configuring organization-wide properties. Accessible from the organization navigation menu, it allows Owners and Admins to:

- Update the organization name, domain, and logo
- Configure platform-level settings (stored as a flexible JSON object)
- View the organization slug and creation date
- Delete the organization (Owner only, soft delete)

Changes are validated server-side: the backend confirms that the requesting user holds at least the Admin role before applying any modifications.

### User Management Page

The user management page provides a complete view of all organization members and their roles. From this page, Admins and Owners can:

- View all members in a sortable, filterable table (name, email, role, status, join date)
- Add new members by email address with a role selection
- Change existing members' roles (up to Admin level for Admins, any level for Owners)
- Remove members from the organization (with the safeguard that the last Owner cannot be removed)
- View and manage pending invitations
- Send new invitations with role assignments

The page enforces the same permission rules described in the Role Hierarchy and Permission Matrix sections above: only Admins and Owners can modify membership, and all actions are validated server-side.

## Best Practices for Organization Management

1. **Start with a clear naming convention**: Use a name that uniquely identifies your research group within the platform. Avoid generic names like "Research Lab" that may conflict with other groups.

2. **Assign roles deliberately**: Not everyone needs to be an Admin. Grant the minimum role required for each person's responsibilities. Researchers who only need to build questionnaires should be Members. External reviewers should be Viewers.

3. **Use invitations rather than direct addition**: Invitations create an auditable trail and give the invitee the choice to accept or decline. Direct addition is immediate but lacks this consent step.

4. **Review membership periodically**: When team members leave the lab or graduate, remove their access to maintain data security.

5. **Configure domain auto-join for institutions**: If your entire department uses the platform, domain auto-join eliminates the need to manually invite each person.

6. **Maintain at least two Owners**: Having a single Owner creates a single point of failure. If that person leaves or loses access, no one can perform Owner-level operations. Promote a trusted colleague to co-Owner as a safeguard.
