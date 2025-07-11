import { supabase } from '$lib/services/supabase';

export interface EmailVerificationOptions {
  email: string;
  userId?: string;
  isTestMode?: boolean;
}

export interface VerificationResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Check if email should use test mode
 */
export function isTestModeEmail(email: string): boolean {
  return (
    email.includes('+test') || 
    email.endsWith('@test.local') ||
    import.meta.env.VITE_FORCE_TEST_MODE === 'true'
  );
}

/**
 * Generate a 6-digit verification code
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send email verification code
 */
export async function sendVerificationCode({ 
  email, 
  userId,
  isTestMode 
}: EmailVerificationOptions): Promise<VerificationResult> {
  try {
    // Check if test mode
    const testMode = isTestMode || isTestModeEmail(email);
    const code = generateVerificationCode();
    
    console.log('[Email Verification] Attempting to send code for:', email, 'userId:', userId, 'testMode:', testMode);
    
    // Store verification code in database
    const { error: dbError } = await supabase
      .from('email_verifications')
      .insert({
        email,
        user_id: userId || null, // Allow null for signup flow
        token: code,
        is_test_mode: testMode,
        request_ip: null // Would be set by server
      });

    if (dbError) {
      throw dbError;
    }

    if (testMode) {
      // In test mode, log the code and auto-verify after 1 second
      console.log(`[TEST MODE] VERIFICATION CODE for ${email}: ${code}`);
      
      // Auto-verify after a longer delay (30 seconds) to allow manual testing
      setTimeout(async () => {
        await verifyCode({ email, code });
      }, 30000);

      return {
        success: true,
        message: 'Test mode: Code logged to console'
      };
    } else {
      // In production, send actual email
      // This would integrate with your email service (SendGrid, AWS SES, etc.)
      await sendEmail({
        to: email,
        subject: 'Verify your QDesigner account',
        html: `
          <h2>Welcome to QDesigner!</h2>
          <p>Your verification code is:</p>
          <h1 style="font-size: 32px; letter-spacing: 8px; text-align: center; color: #4F46E5;">
            ${code}
          </h1>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `
      });

      return {
        success: true,
        message: 'Verification code sent to your email'
      };
    }
  } catch (error) {
    console.error('Error sending verification code:', error);
    return {
      success: false,
      error: 'Failed to send verification code'
    };
  }
}

/**
 * Verify email with code
 */
export async function verifyCode({ 
  email, 
  code 
}: { 
  email: string; 
  code: string; 
}): Promise<VerificationResult> {
  try {
    // Get the most recent verification for this email
    const { data: verifications, error: fetchError } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('email', email)
      .eq('token', code)
      .gt('expires_at', new Date().toISOString())
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      throw fetchError;
    }

    if (!verifications || verifications.length === 0) {
      // Increment attempts for the most recent verification
      await supabase
        .from('email_verifications')
        .update({ attempts: supabase.rpc('increment_attempts') })
        .eq('email', email)
        .is('verified_at', null);

      return {
        success: false,
        error: 'Invalid or expired verification code'
      };
    }

    const verification = verifications[0];

    // Check attempts
    if (verification.attempts >= 3) {
      return {
        success: false,
        error: 'Too many attempts. Please request a new code.'
      };
    }

    // Mark as verified
    const { error: updateError } = await supabase
      .from('email_verifications')
      .update({ 
        verified_at: new Date().toISOString(),
        verified_ip: null // Would be set by server
      })
      .eq('id', verification.id);

    if (updateError) {
      throw updateError;
    }

    // If user exists, update their email_confirmed_at
    if (verification.user_id) {
      await supabase.auth.admin.updateUserById(verification.user_id, {
        email_confirmed_at: new Date().toISOString()
      });
    }

    // Log event
    await logOnboardingEvent({
      userId: verification.user_id,
      eventType: 'email_verified',
      metadata: { email }
    });

    return {
      success: true,
      message: 'Email verified successfully'
    };
  } catch (error) {
    console.error('Error verifying code:', error);
    return {
      success: false,
      error: 'Failed to verify code'
    };
  }
}

/**
 * Resend verification code
 */
export async function resendVerificationCode(email: string): Promise<VerificationResult> {
  try {
    // Check for recent verifications to prevent spam
    const { data: recentVerifications } = await supabase
      .from('email_verifications')
      .select('created_at')
      .eq('email', email)
      .gt('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute
      .limit(1);

    if (recentVerifications && recentVerifications.length > 0) {
      return {
        success: false,
        error: 'Please wait 60 seconds before requesting a new code'
      };
    }

    // Send new code
    return await sendVerificationCode({ email });
  } catch (error) {
    console.error('Error resending verification code:', error);
    return {
      success: false,
      error: 'Failed to resend verification code'
    };
  }
}

/**
 * Send email (placeholder - integrate with your email service)
 */
async function sendEmail({ to, subject, html }: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  // TODO: Integrate with email service
  // For now, just log in development
  if (import.meta.env.DEV) {
    console.log('📧 Email would be sent:', { to, subject });
  }
}

/**
 * Log onboarding event
 */
async function logOnboardingEvent({
  userId,
  eventType,
  organizationId,
  invitationId,
  metadata
}: {
  userId?: string;
  eventType: string;
  organizationId?: string;
  invitationId?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await supabase
      .from('onboarding_events')
      .insert({
        user_id: userId,
        event_type: eventType,
        organization_id: organizationId,
        invitation_id: invitationId,
        metadata,
        ip_address: null, // Would be set by server
        user_agent: navigator.userAgent
      });
  } catch (error) {
    console.error('Error logging onboarding event:', error);
  }
}