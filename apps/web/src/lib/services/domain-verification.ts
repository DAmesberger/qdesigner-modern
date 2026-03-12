import { api } from '$lib/services/api';
import type { DomainConfig as ApiDomainConfig } from '$lib/types/api';

export interface DomainConfig {
  id: string;
  organizationId: string;
  domain: string;
  verificationToken: string;
  verificationMethod?: string | null;
  verifiedAt?: string | null;
  autoJoinEnabled: boolean;
  includeSubdomains: boolean;
  defaultRole: string;
  emailWhitelist: string[];
  emailBlacklist: string[];
  welcomeMessage?: string | null;
  createdAt: string;
}

export interface VerifyDomainResult {
  success: boolean;
  method?: string;
  error?: string;
}

export interface DomainAutoJoinCheck {
  canAutoJoin: boolean;
  organizationId?: string;
  organizationName?: string;
  defaultRole?: string;
  welcomeMessage?: string;
}

/**
 * Transform API domain config to local interface
 */
function transformDomainConfig(apiDomain: ApiDomainConfig): DomainConfig {
  return {
    id: apiDomain.id,
    organizationId: apiDomain.organizationId,
    domain: apiDomain.domain,
    verificationToken: apiDomain.verificationToken,
    verificationMethod: apiDomain.verificationMethod,
    verifiedAt: apiDomain.verifiedAt,
    autoJoinEnabled: apiDomain.autoJoinEnabled,
    includeSubdomains: apiDomain.includeSubdomains,
    defaultRole: apiDomain.defaultRole,
    emailWhitelist: apiDomain.emailWhitelist,
    emailBlacklist: apiDomain.emailBlacklist,
    welcomeMessage: apiDomain.welcomeMessage,
    createdAt: apiDomain.createdAt
  };
}

/**
 * Add a domain for organization
 */
export async function addDomain({
  organizationId,
  domain
}: {
  organizationId: string;
  domain: string;
}): Promise<{ data?: DomainConfig; error?: string }> {
  try {
    if (!isValidDomain(domain)) {
      return { error: 'Invalid domain format' };
    }

    const result = await api.organizations.domains.add(organizationId, { domain });
    return { data: transformDomainConfig(result) };
  } catch (error) {
    console.error('Error adding domain:', error as Error);
    return { error: error instanceof Error ? error.message : 'Failed to add domain' };
  }
}

/**
 * Verify domain ownership
 */
export async function verifyDomain(
  orgId: string,
  domainId: string
): Promise<VerifyDomainResult> {
  try {
    const result = await api.organizations.domains.verify(orgId, domainId);
    return {
      success: result.success,
      method: result.method
    };
  } catch (error) {
    console.error('Error verifying domain:', error as Error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to verify domain' };
  }
}

/**
 * Check if email can auto-join via domain
 */
export async function checkDomainAutoJoin(email: string): Promise<DomainAutoJoinCheck> {
  try {
    const result = await api.organizations.domains.checkAutoJoin(email);
    return {
      canAutoJoin: result.canAutoJoin,
      organizationId: result.organizationId,
      organizationName: result.organizationName,
      defaultRole: result.defaultRole,
      welcomeMessage: result.welcomeMessage
    };
  } catch (error) {
    console.error('Error checking domain auto-join:', error as Error);
    return { canAutoJoin: false };
  }
}

/**
 * Update domain configuration
 */
export async function updateDomainConfig({
  orgId,
  domainId,
  config
}: {
  orgId: string;
  domainId: string;
  config: Partial<{
    autoJoinEnabled: boolean;
    includeSubdomains: boolean;
    defaultRole: string;
    emailWhitelist: string[];
    emailBlacklist: string[];
    welcomeMessage: string;
  }>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await api.organizations.domains.update(orgId, domainId, config);
    return { success: true };
  } catch (error) {
    console.error('Error updating domain config:', error as Error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update domain configuration' };
  }
}

/**
 * Remove domain
 */
export async function removeDomain(
  orgId: string,
  domainId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await api.organizations.domains.remove(orgId, domainId);
    return { success: true };
  } catch (error) {
    console.error('Error removing domain:', error as Error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to remove domain' };
  }
}

/**
 * Helper: Validate domain format
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
  return domainRegex.test(domain);
}

/**
 * Helper: Generate a verification token (utility, actual generation is server-side)
 */
export function generateVerificationToken(): string {
  return `qdesigner-verify-${Math.random().toString(36).substring(2, 15)}`;
}
