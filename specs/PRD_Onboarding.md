# Product Requirements Document: QDesigner Onboarding System

## 1. Executive Summary

### 1.1 Overview
The QDesigner onboarding system is a critical component that determines user activation, retention, and organizational adoption. This PRD defines a comprehensive, flexible onboarding system that accommodates various user entry points while maintaining security and providing an excellent first-time user experience.

### 1.2 Goals
- **Reduce time-to-value**: Users should create their first questionnaire within 10 minutes
- **Flexible entry paths**: Support self-service, invitations, SSO, and domain-based joining
- **Enterprise-ready**: Scale from individual researchers to entire institutions
- **Testable**: Full E2E test coverage without requiring real email verification
- **Secure**: Verify user identity while minimizing friction

### 1.3 Success Metrics
- 80% of new users complete onboarding
- <3 minutes average time to complete onboarding
- <5% support tickets related to onboarding
- 90% of invited users accept invitations
- 95% successful domain auto-join rate

## 2. User Personas & Scenarios

### 2.1 Individual Researcher (Self-Service)
**Dr. Sarah Chen** - Psychology Professor
- Signs up independently to try QDesigner
- Creates her own organization
- Wants to quickly test the platform
- May upgrade and invite team later

### 2.2 Team Member (Invited)
**Alex Rivera** - Research Assistant
- Receives invitation email from supervisor
- Joins existing organization
- Needs clear instructions
- Should see relevant projects immediately

### 2.3 Enterprise User (SSO/Domain)
**Dr. Michael Thompson** - Clinical Researcher at Mayo Clinic
- Signs in with institutional credentials
- Automatically joins Mayo organization
- Expects seamless integration
- Needs access to department resources

### 2.4 Multi-Organization User
**Dr. Lisa Wang** - Consulting Researcher
- Works with multiple institutions
- Needs to switch between organizations
- Manages different roles per organization
- Requires clear organization context

## 3. Onboarding Flows

### 3.1 Entry Points

#### 3.1.1 Direct Sign-Up (Self-Service)
```
Landing Page → Sign Up → Email Verification → Create/Join Org → Setup Profile → Dashboard
```

#### 3.1.2 Invitation Link
```
Email Invite → Accept Invite Page → Sign Up/In → Join Organization → Dashboard
```

#### 3.1.3 SSO Login
```
Landing Page → SSO Login → IdP Auth → Auto-Join Org → Dashboard
```

#### 3.1.4 Domain Auto-Join
```
Sign Up (with org email) → Email Verification → Auto-Join Org → Dashboard
```

### 3.2 Detailed Flow Specifications

#### 3.2.1 Sign-Up Page
**Fields:**
- Email address
- Password (with strength indicator)
- Full name
- [ ] Agree to Terms of Service
- [ ] Subscribe to newsletter (optional)

**Validations:**
- Email format and uniqueness
- Password: min 8 chars, 1 upper, 1 lower, 1 number
- Check for existing invitations
- Check for domain auto-join eligibility

**Smart Features:**
- Detect organization email domains
- Show "You'll automatically join [Organization]" message
- Social login options (Google, Microsoft, GitHub)
- Password-less magic link option

#### 3.2.2 Email Verification
**Production Mode:**
- Send verification email with 6-digit code
- Code expires in 10 minutes
- Allow resend after 60 seconds
- Show email sent confirmation

**Test Mode (for E2E tests):**
- When email contains `+test` (e.g., `user+test@example.com`)
- Auto-verify without sending email
- Log verification code to console in dev mode
- Add `X-Test-Mode: true` header in responses

#### 3.2.3 Organization Selection

**Scenario A: No Organizations**
```
Welcome to QDesigner!
Let's set up your workspace

[Create New Organization]
  or
[Join Existing Organization]
```

**Scenario B: Has Invitations**
```
You've been invited to join:

✉️ Stanford Psychology Lab
   Role: Researcher
   Invited by: Dr. Johnson
   [Accept] [Decline]

✉️ MIT Cognitive Science
   Role: Collaborator
   Invited by: Dr. Smith
   [Accept] [Decline]

[Create New Organization Instead]
```

**Scenario C: Domain Auto-Join**
```
Welcome to Stanford University!

You'll automatically join the Stanford organization.
Your administrator has pre-approved all @stanford.edu emails.

[Continue to Dashboard]
[Create Personal Organization Instead]
```

#### 3.2.4 Create Organization Flow
**Step 1: Basic Info**
- Organization Name
- Organization Type (University, Hospital, Company, Personal)
- Your Role/Title
- Team Size (Just me, 2-10, 11-50, 50+)

**Step 2: Customization**
- Organization URL slug
- Logo upload (optional)
- Primary research area
- Time zone

**Step 3: Invite Team (Optional)**
- Email addresses (bulk add)
- Role selection per user
- Custom message
- [ ] Send invites now / Later

#### 3.2.5 Profile Setup
**Required Fields:**
- Display name
- Time zone (auto-detected)
- Preferred language

**Optional Fields:**
- Profile photo
- Bio/Research interests
- ORCID iD
- Notification preferences

### 3.3 Invitation System

#### 3.3.1 Invitation Creation
**By Authorized Users:**
- Organization owners/admins can invite
- Project managers can invite to projects
- Bulk invite via CSV
- API endpoint for programmatic invites

**Invitation Contains:**
- Unique token (UUID)
- Organization details
- Inviter information
- Role assignment
- Expiration (7 days default)
- Custom message

#### 3.3.2 Invitation Acceptance Flow
```
1. Click invitation link
2. If not logged in → Sign up/Sign in
3. Show invitation details
4. Accept/Decline
5. If accepted → Add to organization
6. Redirect to relevant context
```

#### 3.3.3 Invitation States
- `pending`: Sent but not viewed
- `viewed`: Link clicked but not accepted
- `accepted`: User joined organization
- `declined`: User rejected invitation
- `expired`: Past expiration date
- `revoked`: Cancelled by inviter

### 3.4 Domain-Based Auto-Join

#### 3.4.1 Domain Verification Process
1. Admin adds domain in settings
2. System generates verification token
3. Admin proves ownership via:
   - DNS TXT record: `qdesigner-verify=TOKEN`
   - Email to `admin@domain.com`
   - Upload HTML file to `domain.com/.well-known/qdesigner-verify.html`
4. System verifies and activates domain

#### 3.4.2 Configuration Options
- Enable/disable auto-join
- Default role for auto-joined users
- Include subdomains (*.domain.com)
- Whitelist/blacklist specific emails
- Welcome message template
- Automatic project assignments

#### 3.4.3 Security Measures
- Email verification still required
- Domain re-verification every 90 days
- Audit log of all auto-joins
- Admin notifications for new users
- Ability to retroactively remove users

## 4. Technical Implementation

### 4.1 Database Schema

```sql
-- Invitation tracking
CREATE TABLE organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  invited_by UUID NOT NULL REFERENCES users(id),
  
  -- Token and security
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  
  -- Tracking
  status VARCHAR(50) DEFAULT 'pending',
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  
  -- Custom fields
  custom_message TEXT,
  project_assignments UUID[],
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate active invitations
  UNIQUE(organization_id, email) WHERE status = 'pending'
);

-- Domain verification for auto-join
CREATE TABLE organization_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  domain VARCHAR(255) NOT NULL,
  
  -- Verification
  verification_token UUID DEFAULT gen_random_uuid(),
  verification_method VARCHAR(50), -- 'dns', 'email', 'file'
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  last_verified_at TIMESTAMPTZ,
  
  -- Configuration
  auto_join_enabled BOOLEAN DEFAULT true,
  include_subdomains BOOLEAN DEFAULT false,
  default_role VARCHAR(50) DEFAULT 'member',
  
  -- Rules
  email_whitelist TEXT[],
  email_blacklist TEXT[],
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(domain)
);

-- Email verification tokens
CREATE TABLE email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  email VARCHAR(255) NOT NULL,
  token VARCHAR(6) NOT NULL, -- 6-digit code
  
  -- Security
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  verified_at TIMESTAMPTZ,
  
  -- Test mode
  is_test_mode BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trail for onboarding
CREATE TABLE onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL, -- 'signup', 'email_verified', 'org_joined', etc.
  
  -- Context
  organization_id UUID REFERENCES organizations(id),
  invitation_id UUID REFERENCES organization_invitations(id),
  
  -- Details
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 API Endpoints

```typescript
// Authentication & Signup
POST   /api/auth/signup
POST   /api/auth/verify-email
POST   /api/auth/resend-verification
POST   /api/auth/magic-link

// Invitations
GET    /api/invitations/:token
POST   /api/invitations/:token/accept
POST   /api/invitations/:token/decline
POST   /api/organizations/:id/invitations
DELETE /api/organizations/:id/invitations/:id

// Domain Management
POST   /api/organizations/:id/domains
POST   /api/organizations/:id/domains/:id/verify
DELETE /api/organizations/:id/domains/:id

// Onboarding State
GET    /api/onboarding/status
POST   /api/onboarding/complete
GET    /api/onboarding/suggestions
```

### 4.3 Security Considerations

#### 4.3.1 Rate Limiting
- Signup: 5 attempts per IP per hour
- Email verification: 3 attempts per code
- Invitation acceptance: 10 attempts per token
- API calls: 100 per minute per user

#### 4.3.2 Token Security
- Invitation tokens: UUID v4, single use
- Email verification: 6-digit numeric, 10 min expiry
- Magic links: Signed JWT, 15 min expiry
- All tokens: Constant-time comparison

#### 4.3.3 Privacy
- Don't reveal if email exists during signup
- Generic error messages
- Invitation details require valid token
- GDPR-compliant data handling

## 5. UI/UX Specifications

### 5.1 Design Principles
- **Progressive Disclosure**: Don't overwhelm new users
- **Smart Defaults**: Pre-fill when possible
- **Clear Feedback**: Always show what's happening
- **Accessible**: WCAG 2.1 AA compliant
- **Mobile-First**: Fully responsive design

### 5.2 Component Specifications

#### 5.2.1 Onboarding Progress Indicator
```
[●] Account Created  [●] Email Verified  [○] Organization Setup  [○] Ready to Go!
```

#### 5.2.2 Organization Card Component
```
┌─────────────────────────────────────┐
│ 🏛️ Stanford University              │
│ Research Organization               │
│ 👥 2,341 members · 🔬 432 projects │
│                                     │
│ Your role: Researcher               │
│ Invited by: Dr. Patricia Johnson    │
│                                     │
│ [Join Organization] [Learn More]    │
└─────────────────────────────────────┘
```

#### 5.2.3 Empty States
- No organizations: Friendly illustration + CTA
- No invitations: Clear next steps
- Verification pending: What to check for

### 5.3 Copy Guidelines

#### 5.3.1 Tone
- Friendly but professional
- Clear and concise
- Action-oriented
- Encouraging

#### 5.3.2 Key Messages
- Welcome: "Welcome to QDesigner! Let's get you set up in less than 2 minutes."
- Verification: "Check your email for a 6-digit code"
- Organization: "Create your workspace or join your team"
- Complete: "You're all set! Let's create your first questionnaire"

## 6. Testing Strategy

### 6.1 Test Mode Implementation

```typescript
// Email detection for test mode
function isTestMode(email: string): boolean {
  return email.includes('+test') || 
         email.endsWith('@test.local') ||
         process.env.FORCE_TEST_MODE === 'true';
}

// Test mode behaviors
if (isTestMode(email)) {
  // Skip email sending
  // Auto-verify after 1 second
  // Log verification codes
  // Allow instant invitation acceptance
  // Bypass rate limits
}
```

### 6.2 E2E Test Scenarios

#### 6.2.1 Happy Paths
1. **New user self-signup** → Create organization
2. **Invited user** → Accept and join
3. **Domain auto-join** → Automatic assignment
4. **Existing user** → Accept invitation to second org
5. **SSO login** → Auto-provision and join

#### 6.2.2 Edge Cases
1. Expired invitation handling
2. Duplicate email signup attempt
3. Invalid verification code
4. Organization at member limit
5. Revoked invitation access attempt

#### 6.2.3 Playwright Test Structure
```typescript
test.describe('Onboarding Flows', () => {
  test('self-service signup and org creation', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('[name=email]', 'researcher+test@example.com');
    await page.fill('[name=password]', 'SecurePass123');
    await page.click('button:has-text("Sign Up")');
    
    // Test mode: auto-verified
    await expect(page).toHaveURL('/onboarding/organization');
    
    await page.fill('[name=orgName]', 'Test Research Lab');
    await page.click('button:has-text("Create Organization")');
    
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Welcome to Test Research Lab');
  });
});
```

### 6.3 Analytics & Monitoring

#### 6.3.1 Funnel Tracking
- Page views at each step
- Drop-off points
- Time spent per step
- Error encounters
- Completion rates

#### 6.3.2 Key Events
- `onboarding_started`
- `email_verified`
- `organization_selected`
- `invitation_accepted`
- `onboarding_completed`

#### 6.3.3 Error Monitoring
- Failed verifications
- API errors
- Invitation failures
- Domain verification issues

## 7. Implementation Phases

### Phase 1: Core Flow (Week 1-2)
- Basic signup/login
- Email verification with test mode
- Simple organization creation
- Minimal profile setup

### Phase 2: Invitations (Week 3-4)
- Invitation creation and management
- Email templates
- Acceptance flow
- Role assignment

### Phase 3: Advanced Features (Week 5-6)
- Domain verification system
- Auto-join functionality
- Bulk invitations
- API endpoints

### Phase 4: Polish & Testing (Week 7-8)
- Comprehensive E2E tests
- Performance optimization
- Analytics integration
- Documentation

## 8. Success Criteria

### 8.1 Acceptance Criteria
- [ ] All user personas can successfully onboard
- [ ] E2E tests pass for all flows
- [ ] Test mode works without real emails
- [ ] Invitation system handles all states
- [ ] Domain auto-join works reliably
- [ ] Analytics capture all key events

### 8.2 Performance Targets
- Page load: <1 second
- API responses: <200ms
- Email delivery: <30 seconds
- End-to-end onboarding: <3 minutes

### 8.3 Launch Readiness
- [ ] Security review completed
- [ ] Load testing passed (1000 concurrent users)
- [ ] Documentation complete
- [ ] Support team trained
- [ ] Monitoring dashboards configured
- [ ] Feature flags configured

## 9. Future Enhancements

### 9.1 Version 2.0
- OAuth providers (ORCID, LinkedIn)
- Team templates for common setups
- Onboarding tours and tutorials
- Slack/Teams integration
- Automated organization discovery

### 9.2 Enterprise Features
- SAML/OIDC SSO support
- SCIM provisioning
- Advanced role management
- Custom onboarding flows
- White-label options

This comprehensive onboarding system will provide QDesigner with a professional, flexible, and testable foundation for user acquisition and activation.