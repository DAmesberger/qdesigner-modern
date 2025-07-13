import { supabase } from '$lib/services/supabase';

export interface DomainConfig {
  id: string;
  organizationId: string;
  domain: string;
  verificationToken: string;
  verificationMethod?: 'dns' | 'email' | 'file';
  verifiedAt?: string;
  autoJoinEnabled: boolean;
  includeSubdomains: boolean;
  defaultRole: 'member' | 'viewer';
  emailWhitelist: string[];
  emailBlacklist: string[];
  welcomeMessage?: string;
}

export interface VerifyDomainResult {
  success: boolean;
  method?: 'dns' | 'email' | 'file';
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
 * Add a domain for organization
 */
export async function addDomain({
  organizationId,
  domain,
  userId
}: {
  organizationId: string;
  domain: string;
  userId: string;
}): Promise<{ data?: DomainConfig; error?: string }> {
  try {
    // Check permissions
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!membership || membership.role !== 'owner') {
      return { error: 'Only organization owners can add domains' };
    }

    // Validate domain format
    if (!isValidDomain(domain)) {
      return { error: 'Invalid domain format' };
    }

    // Check if domain already exists
    const { data: existingDomain } = await supabase
      .from('organization_domains')
      .select('id, organization_id')
      .eq('domain', domain)
      .single();

    if (existingDomain) {
      return { error: 'This domain is already registered' };
    }

    // Create domain entry
    const { data, error } = await supabase
      .from('organization_domains')
      .insert({
        organization_id: organizationId,
        domain,
        verification_token: generateVerificationToken(),
        auto_join_enabled: false, // Disabled until verified
        include_subdomains: false,
        default_role: 'member',
        email_whitelist: [],
        email_blacklist: []
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return { data };
  } catch (error) {
    console.error('Error adding domain:', error as Error);
    return { error: 'Failed to add domain' };
  }
}

/**
 * Verify domain ownership
 */
export async function verifyDomain(
  domainId: string,
  userId: string
): Promise<VerifyDomainResult> {
  try {
    // Get domain details
    const { data: domain, error: fetchError } = await supabase
      .from('organization_domains')
      .select('*, organizations(name)')
      .eq('id', domainId)
      .single();

    if (fetchError || !domain) {
      return { success: false, error: 'Domain not found' };
    }

    // Check permissions
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', domain.organization_id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!membership || membership.role !== 'owner') {
      return { success: false, error: 'Only organization owners can verify domains' };
    }

    // Try different verification methods
    const dnsVerified = await verifyDNS(domain.domain, domain.verification_token);
    if (dnsVerified) {
      await markDomainVerified(domainId, 'dns', userId);
      return { success: true, method: 'dns' };
    }

    const fileVerified = await verifyFile(domain.domain, domain.verification_token);
    if (fileVerified) {
      await markDomainVerified(domainId, 'file', userId);
      return { success: true, method: 'file' };
    }

    // Email verification would be triggered separately
    return { 
      success: false, 
      error: 'Domain verification failed. Please ensure you have added the verification record.' 
    };
  } catch (error) {
    console.error('Error verifying domain:', error as Error);
    return { success: false, error: 'Failed to verify domain' };
  }
}

/**
 * Check if email can auto-join via domain
 */
export async function checkDomainAutoJoin(email: string): Promise<DomainAutoJoinCheck> {
  try {
    const { data, error } = await supabase
      .rpc('check_domain_auto_join', { email_address: email });

    if (error || !data || data.length === 0) {
      return { canAutoJoin: false };
    }

    const result = data[0];
    return {
      canAutoJoin: true,
      organizationId: result.organization_id,
      organizationName: result.organization_name,
      defaultRole: result.default_role,
      welcomeMessage: result.welcome_message
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
  domainId,
  config,
  userId
}: {
  domainId: string;
  config: Partial<{
    autoJoinEnabled: boolean;
    includeSubdomains: boolean;
    defaultRole: 'member' | 'viewer';
    emailWhitelist: string[];
    emailBlacklist: string[];
    welcomeMessage: string;
  }>;
  userId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Get domain and check permissions
    const { data: domain } = await supabase
      .from('organization_domains')
      .select('organization_id, verified_at')
      .eq('id', domainId)
      .single();

    if (!domain) {
      return { success: false, error: 'Domain not found' };
    }

    if (!domain.verified_at) {
      return { success: false, error: 'Domain must be verified before configuring' };
    }

    // Check permissions
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', domain.organization_id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!membership || membership.role !== 'owner') {
      return { success: false, error: 'Only organization owners can configure domains' };
    }

    // Update configuration
    const updateData: any = {};
    if (config.autoJoinEnabled !== undefined) updateData.auto_join_enabled = config.autoJoinEnabled;
    if (config.includeSubdomains !== undefined) updateData.include_subdomains = config.includeSubdomains;
    if (config.defaultRole !== undefined) updateData.default_role = config.defaultRole;
    if (config.emailWhitelist !== undefined) updateData.email_whitelist = config.emailWhitelist;
    if (config.emailBlacklist !== undefined) updateData.email_blacklist = config.emailBlacklist;
    if (config.welcomeMessage !== undefined) updateData.welcome_message = config.welcomeMessage;

    const { error } = await supabase
      .from('organization_domains')
      .update(updateData)
      .eq('id', domainId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating domain config:', error as Error);
    return { success: false, error: 'Failed to update domain configuration' };
  }
}

/**
 * Remove domain
 */
export async function removeDomain(
  domainId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get domain and check permissions
    const { data: domain } = await supabase
      .from('organization_domains')
      .select('organization_id')
      .eq('id', domainId)
      .single();

    if (!domain) {
      return { success: false, error: 'Domain not found' };
    }

    // Check permissions
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', domain.organization_id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!membership || membership.role !== 'owner') {
      return { success: false, error: 'Only organization owners can remove domains' };
    }

    // Delete domain
    const { error } = await supabase
      .from('organization_domains')
      .delete()
      .eq('id', domainId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing domain:', error as Error);
    return { success: false, error: 'Failed to remove domain' };
  }
}

/**
 * Helper functions
 */

function isValidDomain(domain: string): boolean {
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
  return domainRegex.test(domain);
}

function generateVerificationToken(): string {
  return `qdesigner-verify-${Math.random().toString(36).substring(2, 15)}`;
}

async function verifyDNS(domain: string, token: string): Promise<boolean> {
  try {
    // In production, you would use a DNS lookup service
    // For now, we'll simulate verification
    if (import.meta.env.DEV) {
      console.log(`Would verify DNS TXT record for _qdesigner.${domain} = ${token}`);
      // Simulate successful verification in dev
      return domain.includes('test');
    }
    
    // TODO: Implement actual DNS verification
    // Example: Use Cloudflare DNS API or similar service
    return false;
  } catch (error) {
    console.error('DNS verification error:', error as Error);
    return false;
  }
}

async function verifyFile(domain: string, token: string): Promise<boolean> {
  try {
    // In production, you would fetch the verification file
    const verificationUrl = `https://${domain}/.well-known/qdesigner-verify.txt`;
    
    if (import.meta.env.DEV) {
      console.log(`Would fetch ${verificationUrl} and check for token ${token}`);
      // Simulate successful verification in dev
      return domain.includes('test');
    }

    // TODO: Implement actual file verification
    const response = await fetch(verificationUrl);
    if (!response.ok) return false;
    
    const content = await response.text();
    return content.trim() === token;
  } catch (error) {
    console.error('File verification error:', error as Error);
    return false;
  }
}

async function markDomainVerified(
  domainId: string,
  method: 'dns' | 'email' | 'file',
  userId: string
): Promise<void> {
  await supabase
    .from('organization_domains')
    .update({
      verified_at: new Date().toISOString(),
      verification_method: method,
      verified_by: userId,
      last_verified_at: new Date().toISOString(),
      auto_join_enabled: true // Enable auto-join upon verification
    })
    .eq('id', domainId);

  // Log event
  const { data: domain } = await supabase
    .from('organization_domains')
    .select('organization_id, domain')
    .eq('id', domainId)
    .single();

  if (domain) {
    await supabase
      .from('onboarding_events')
      .insert({
        user_id: userId,
        event_type: 'domain_verified',
        organization_id: domain.organization_id,
        metadata: { domain: domain.domain, method }
      });
  }
}