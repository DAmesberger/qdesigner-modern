/**
 * E2E Test Configuration
 */

export const TEST_CONFIG = {
  // Test user prefixes to ensure unique emails
  emailPrefixes: {
    selfService: 'self-service',
    invitation: 'invitation',
    domainAutoJoin: 'auto-join',
    admin: 'admin'
  },
  
  // Test organizations
  organizations: {
    default: {
      name: 'Test Research Lab',
      slug: 'test-research-lab'
    },
    university: {
      name: 'Test University',
      slug: 'test-university',
      domain: 'test-university.edu'
    },
    corporate: {
      name: 'Test Corporation',
      slug: 'test-corp',
      domain: 'testcorp.com'
    }
  },
  
  // Test domains for auto-join
  autoJoinDomains: [
    'approved-domain.com',
    'test-university.edu',
    'research-institute.org'
  ],
  
  // Default test password
  defaultPassword: 'TestPassword123!',
  
  // Timeouts
  timeouts: {
    navigation: 10000,
    verification: 5000,
    animation: 500
  },
  
  // Test invitation tokens
  invitationTokens: {
    valid: 'valid-invitation-token',
    expired: 'expired-invitation-token',
    revoked: 'revoked-invitation-token',
    accepted: 'accepted-invitation-token'
  },
  
  // Error messages to check
  errorMessages: {
    invalidCredentials: 'Invalid login credentials',
    emailTaken: 'User already registered',
    invalidVerificationCode: 'Invalid verification code',
    expiredInvitation: 'This invitation has expired',
    organizationRequired: 'Please enter an organization name'
  },
  
  // Success messages
  successMessages: {
    accountCreated: 'Account created successfully',
    emailVerified: 'Email verified successfully',
    invitationSent: 'Invitation sent successfully',
    domainVerified: 'Domain verified successfully',
    organizationCreated: 'Organization created successfully'
  }
};

/**
 * Get a test organization by key
 */
export function getTestOrganization(key: keyof typeof TEST_CONFIG.organizations) {
  return TEST_CONFIG.organizations[key];
}

/**
 * Generate test data for a new user
 */
export function generateUserData(prefix?: string) {
  const timestamp = Date.now();
  const emailPrefix = prefix || TEST_CONFIG.emailPrefixes.selfService;
  
  return {
    email: `${emailPrefix}+${timestamp}@test.local`,
    password: TEST_CONFIG.defaultPassword,
    fullName: `Test User ${timestamp}`,
    id: `test-user-${timestamp}`
  };
}

/**
 * Generate test data for an organization
 */
export function generateOrganizationData() {
  const timestamp = Date.now();
  
  return {
    name: `Test Org ${timestamp}`,
    slug: `test-org-${timestamp}`,
    id: `test-org-${timestamp}`
  };
}

/**
 * Get expected onboarding flow based on email
 */
export function getExpectedOnboardingFlow(email: string): {
  requiresVerification: boolean;
  autoJoinOrganization: boolean;
  organizationName?: string;
  showInvitations: boolean;
} {
  // Check if it's a test mode email
  const isTestMode = email.includes('+test') || email.endsWith('@test.local');
  
  // Check for domain auto-join
  let autoJoinOrganization = false;
  let organizationName: string | undefined;
  
  for (const domain of TEST_CONFIG.autoJoinDomains) {
    if (email.endsWith(`@${domain}`)) {
      autoJoinOrganization = true;
      organizationName = TEST_CONFIG.organizations.university.name;
      break;
    }
  }
  
  return {
    requiresVerification: true, // Always true in our system
    autoJoinOrganization,
    organizationName,
    showInvitations: !autoJoinOrganization // Show invitations if not auto-joining
  };
}

/**
 * Viewport configurations for responsive testing
 */
export const VIEWPORTS = {
  mobile: { width: 375, height: 667 }, // iPhone SE
  tablet: { width: 768, height: 1024 }, // iPad
  desktop: { width: 1280, height: 720 }, // Standard desktop
  wide: { width: 1920, height: 1080 } // Full HD
};

/**
 * Browser configurations for compatibility testing
 */
export const BROWSERS = [
  {
    name: 'Chrome',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  {
    name: 'Safari',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  },
  {
    name: 'Firefox',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
  },
  {
    name: 'Edge',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
  }
];