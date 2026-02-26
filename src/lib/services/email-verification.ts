import { api } from '$lib/services/api';

export interface EmailVerificationOptions {
  email: string;
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
 * Generate a 6-digit verification code (utility, actual generation is server-side)
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send email verification code
 */
export async function sendVerificationCode({
  email
}: EmailVerificationOptions): Promise<VerificationResult> {
  try {
    const result = await api.emailVerification.send(email);
    return {
      success: result.success,
      message: result.message,
      error: result.error
    };
  } catch (error) {
    console.error('Error sending verification code:', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send verification code'
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
    const result = await api.emailVerification.verify(email, code);
    return {
      success: result.success,
      message: result.message,
      error: result.error
    };
  } catch (error) {
    console.error('Error verifying code:', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify code'
    };
  }
}

/**
 * Resend verification code
 */
export async function resendVerificationCode(email: string): Promise<VerificationResult> {
  try {
    const result = await api.emailVerification.resend(email);
    return {
      success: result.success,
      message: result.message,
      error: result.error
    };
  } catch (error) {
    console.error('Error resending verification code:', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resend verification code'
    };
  }
}
