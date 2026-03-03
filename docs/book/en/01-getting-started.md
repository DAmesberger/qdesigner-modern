# Chapter 1: Getting Started

This chapter walks you through creating your QDesigner Modern account, verifying your email, and navigating the platform for the first time. By the end, you will have created your first questionnaire.

## System Requirements

QDesigner Modern runs entirely in the browser. There is no desktop application to install and no plugins to configure. You need:

- **A modern web browser**: Chrome 90+, Firefox 90+, Safari 15+, or Edge 90+. The platform uses WebGL 2.0, which is supported by all current browser versions.
- **A stable internet connection**: Questionnaire design and administration require server communication. Participant-facing questionnaires support limited offline resilience through service workers, but initial load requires connectivity.
- **A display resolution of 1280x720 or higher**: The questionnaire designer is optimized for desktop-class screens. Questionnaire completion (participant-facing) works on mobile devices.

For reaction time experiments using the WebGL renderer, a display with a refresh rate of 120 Hz or higher is recommended to take full advantage of the high-frame-rate rendering pipeline. Standard 60 Hz displays work but limit achievable temporal precision.

> **Note:** No special hardware is required for standard questionnaire creation and distribution. WebGL and high-refresh-rate displays are only relevant if you plan to use timed stimulus presentation paradigms.

## Creating an Account

### Step 1: Navigate to the Signup Page

Open your browser and navigate to the QDesigner Modern instance provided by your institution or hosting provider. You will see the login page with the QDesigner logo, an email field, a password field, and a "Sign in" button.

Below the sign-in form, you will find a divider labeled "Or" followed by a "Create new account" button. Click this button to begin the registration process.

Alternatively, you may navigate directly to the `/signup` route.

### Step 2: Fill in Your Details

The signup form presents three required fields:

1. **Full Name** -- Enter your name as you want it displayed to collaborators. This appears in organization member lists and activity feeds. Example: "Dr. Maria Schmidt".

2. **Email Address** -- Enter a valid email address. This will be used for login, email verification, and team invitations. If your institution has configured domain-based auto-join, you will see an informational banner indicating which organization you will automatically join.

3. **Password** -- Create a password of at least 8 characters. As you type, a strength indicator appears below the field with five colored segments:
   - 1 segment (red): Weak
   - 2 segments (red): Fair
   - 3 segments (yellow): Good
   - 4 segments (green): Strong
   - 5 segments (green): Very Strong

   The strength score considers password length, use of lowercase letters, uppercase letters, digits, and special characters.

Below the password field, you must check the box to agree to the Terms of Service and Privacy Policy before submitting.

> **Tip:** If you have pending invitations from colleagues who have already added your email to their organization, a banner will appear noting the number of pending invitations. These can be accepted after completing registration.

### Step 3: Submit the Registration

Click the "Create Account" button. The system will:

1. Validate your input (email format, password length, terms agreement).
2. Create your account via the backend API.
3. Send a 6-digit verification code to your email address.
4. Transition the form to the verification view.

If the email address is already registered, you will see an error message. In that case, return to the login page and use the "Forgot password?" link if needed.

## Email Verification

After submitting the signup form, the page changes to display a verification code entry screen. The heading reads "Verify Your Email" and a subtitle confirms the email address the code was sent to.

### Step 4: Enter the Verification Code

1. Check your email inbox for a message from QDesigner Modern containing a 6-digit numeric code.
2. Enter the code in the large input field on the verification screen. The field accepts exactly 6 digits and uses a numeric keyboard on mobile devices.
3. Click "Verify Email" to submit the code.

If the code is correct, the system will sign you in automatically and redirect you to the dashboard or the organization onboarding flow.

### Resending the Code

If you do not receive the email within a few minutes:

- Check your spam or junk folder.
- Click the "Resend verification code" link below the verification form. After resending, a 60-second cooldown timer appears to prevent excessive resend requests.

> **Note:** Verification codes expire after a set period. If your code has expired, use the resend function to obtain a new one.

### Returning to Signup

If you need to change your email address, click the "Back to sign up" link at the bottom of the verification form. This returns you to the registration form with your previously entered data.

## Password Reset

If you forget your password, QDesigner Modern provides a secure reset flow.

### Step 1: Request a Reset

On the login page, click the "Forgot password?" link below the password field. This opens the password reset request form.

### Step 2: Enter Your Email

Enter the email address associated with your account and click "Send Reset Link." If the email address is registered, the system sends a password reset link to that address. For security, the same confirmation message is shown regardless of whether the email exists in the system.

### Step 3: Check Your Email

Open the password reset email and click the reset link. This link contains a secure, time-limited token and directs you to the password reset form.

### Step 4: Set a New Password

On the reset form, enter your new password (minimum 8 characters). The password strength indicator provides real-time feedback as you type. Click "Reset Password" to complete the process.

### Security Measures

When a password is reset, all existing sessions for the account are revoked immediately. This ensures that if the reset was triggered because of a suspected compromise, any unauthorized sessions are terminated. After the reset completes, you are redirected to the login page to sign in with your new password.

> **Note:** Password reset links expire after a set period. If your link has expired, return to the login page and request a new one.

## First Login

### The Login Page

The login page presents two fields:

1. **Email address** -- Enter the email you registered with.
2. **Password** -- Enter your password.

Click "Sign in" to authenticate. The system validates your credentials against the Rust backend, which uses Argon2id password hashing for secure credential verification.

Upon successful authentication, the backend returns a JWT (JSON Web Token) that the frontend stores for subsequent API requests. The token includes an access token (short-lived) and a refresh token (longer-lived) to maintain your session without repeated logins.

### Post-Login Routing

After signing in, the system checks whether you belong to any organizations:

- **If you have no organizations**: You are redirected to the organization onboarding page at `/onboarding/organization`. This is expected for first-time users. See the section below.
- **If you have one or more organizations**: You are redirected to the dashboard at `/dashboard`.

## Organization Onboarding

First-time users who have no organization membership see the onboarding page. The heading reads "Welcome to QDesigner!" with the subtitle "Let's set up your organization to get started."

### Creating Your First Organization

1. Enter your organization name in the text field. This is typically the name of your university, research lab, or department. Example: "Cognitive Psychology Lab, University of Munich".

2. Click "Create Organization." The system generates a URL-friendly slug from the name (e.g., "cognitive-psychology-lab-university-of-munich") and adds you as the organization owner.

3. You are redirected to the dashboard.

Below the form, an informational section titled "What happens next?" outlines three steps:

1. **Create your first project** -- Projects help you organize your questionnaires and research.
2. **Invite team members** -- Collaborate with your team by inviting them to your organization.
3. **Build your first questionnaire** -- Use the visual designer to create research instruments.

### Accepting an Invitation Instead

If colleagues have already invited you before you signed up, the onboarding page may show pending invitations instead of (or alongside) the organization creation form. Each invitation card shows:

- The organization name
- Who invited you
- The role you have been assigned (e.g., Editor, Viewer)
- An "Accept & Join" button

Accepting an invitation adds you to that organization and redirects you to the dashboard. You can also choose "Create New Organization Instead" to set up your own workspace.

## The Dashboard

After completing onboarding, you arrive at the dashboard. This is your home screen within QDesigner Modern.

### Welcome Header

At the top, a personalized greeting displays your name (or the username portion of your email if no full name is set) alongside a rotating motivational message such as "Ready to design something amazing?" or "Let's gather some insights today."

### Statistics Cards

Below the header, four statistics cards are displayed in a horizontal row:

| Card | Description | Icon Color |
|------|-------------|------------|
| **Total Questionnaires** | Number of questionnaires across all your projects | Indigo |
| **Total Responses** | Sum of all responses received | Purple |
| **Active** | Number of currently published questionnaires | Emerald |
| **Avg. Completion** | Average completion rate across questionnaires | Amber |

> **Note:** These statistics populate as you create questionnaires and collect responses. For a new account, all values will be zero.

### Your Questionnaires

The main content area lists your questionnaires across all projects. Each questionnaire card shows:

- The questionnaire name and description
- A status badge (Draft, Published, or Archived)
- Three metrics: Responses, Completed, and average completion Time
- The last updated timestamp
- Weekly response trend (if responses have been received)

Clicking a questionnaire card navigates to the questionnaire designer.

If you have no questionnaires yet, an empty state message appears: "No questionnaires yet. Get started by creating a new questionnaire to gather insights." The "New Questionnaire" button in the header navigates to the projects page where you can select or create a project first.

### Recent Activity

The right sidebar shows recent participant activity: who responded, which questionnaire, when, and the response time. This provides a real-time feed of data collection progress.

## Quick Start: Your First Questionnaire in 5 Minutes

Follow these steps to create and preview your first questionnaire:

### 1. Create a Project (1 minute)

From the dashboard, click "New Questionnaire" in the header. This takes you to the Projects page.

1. Click the "New Project" button in the top right.
2. In the modal dialog, enter:
   - **Project Name**: e.g., "Pilot Study 2026"
   - **Project Code**: e.g., "PS2026" (automatically uppercased, used as a short identifier)
   - **Description** (optional): e.g., "Initial pilot for the attention study"
3. Click "Create Project."

You are redirected to the project detail page.

### 2. Create a Questionnaire (1 minute)

On the project detail page:

1. Click "New Questionnaire."
2. In the modal, enter:
   - **Questionnaire Name**: e.g., "Attention and Memory Screening"
   - **Description** (optional): e.g., "Brief screening instrument for participant eligibility"
3. Click "Create & Edit."

The questionnaire designer opens.

### 3. Add Questions (2 minutes)

In the designer, you will see:
- A left sidebar with the **Question Palette** containing available question types
- A central canvas showing the questionnaire structure
- A right sidebar with **Properties** for the selected element

To add your first question:

1. Drag a "Single Choice" question from the palette onto the canvas.
2. Click on the question to select it.
3. In the properties panel on the right, edit the question text: "How would you rate your attention right now?"
4. Add response options: "Very Poor", "Poor", "Average", "Good", "Excellent."

Repeat to add more questions. Try a "Text Input" question for open-ended responses or a "Likert Scale" for agreement ratings.

### 4. Preview and Save (1 minute)

The questionnaire auto-saves as you work. To preview what participants will see:

1. Use the WYSIWYG canvas view to see a real-time rendering of your questionnaire.
2. Check that questions display correctly, options are in the right order, and any conditional logic works as expected.

Your first questionnaire is ready. Subsequent chapters cover question types, variables, and advanced features in detail.

> **Tip:** You do not need to configure everything before testing. Start simple, preview often, and add complexity incrementally. The versioning system ensures you can always return to a previous state.
