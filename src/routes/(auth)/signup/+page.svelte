<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import { supabase } from '$lib/services/supabase';
  import { 
    sendVerificationCode, 
    verifyCode, 
    resendVerificationCode,
    isTestModeEmail 
  } from '$lib/services/email-verification';
  import { checkDomainAutoJoin } from '$lib/services/domain-verification';
  import { getPendingInvitations } from '$lib/services/invitations';
  
  // Form state
  let email = '';
  let password = '';
  let fullName = '';
  let agreeToTerms = false;
  
  // Verification state
  let verificationCode = '';
  let showVerification = false;
  let verificationSent = false;
  
  // UI state
  let loading = false;
  let error: string | null = null;
  let resendTimer = 0;
  
  // Domain auto-join detection
  let domainAutoJoin: any = null;
  let pendingInvitations: any[] = [];
  
  // Check for domain auto-join when email changes
  $: if (email && email.includes('@')) {
    checkDomainEligibility();
  }
  
  async function checkDomainEligibility() {
    const result = await checkDomainAutoJoin(email);
    if (result.canAutoJoin) {
      domainAutoJoin = result;
    } else {
      domainAutoJoin = null;
    }
    
    // Also check for pending invitations
    const invites = await getPendingInvitations(email);
    pendingInvitations = invites;
  }
  
  async function handleSignUp() {
    if (!agreeToTerms) {
      error = 'Please agree to the Terms of Service';
      return;
    }
    
    loading = true;
    error = null;
    
    try {
      // Create account
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });
      
      if (signUpError) {
        throw signUpError;
      }
      
      if (data.user) {
        // Send verification code without userId for now
        const verificationResult = await sendVerificationCode({
          email,
          userId: undefined // Will be null in database
        });
        
        if (verificationResult.success) {
          showVerification = true;
          verificationSent = true;
          startResendTimer();
          
          // Show test mode message
          if (isTestModeEmail(email)) {
            error = null;
            // In test mode, the code is logged to console
          }
        } else {
          throw new Error(verificationResult.error || 'Failed to send verification code');
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create account';
    } finally {
      loading = false;
    }
  }
  
  async function handleVerifyCode() {
    if (!verificationCode || verificationCode.length !== 6) {
      error = 'Please enter a valid 6-digit code';
      return;
    }
    
    loading = true;
    error = null;
    
    try {
      const result = await verifyCode({ email, code: verificationCode });
      
      if (result.success) {
        // Sign in the user
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (signInError) {
          throw signInError;
        }
        
        // Redirect to dashboard or organization setup
        await goto('/dashboard');
      } else {
        error = result.error || 'Invalid verification code';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Verification failed';
    } finally {
      loading = false;
    }
  }
  
  async function handleResendCode() {
    if (resendTimer > 0) return;
    
    loading = true;
    error = null;
    
    try {
      const result = await resendVerificationCode(email);
      
      if (result.success) {
        startResendTimer();
        error = null;
      } else {
        error = result.error || 'Failed to resend code';
      }
    } catch (err) {
      error = 'Failed to resend verification code';
    } finally {
      loading = false;
    }
  }
  
  function startResendTimer() {
    resendTimer = 60;
    const interval = setInterval(() => {
      resendTimer -= 1;
      if (resendTimer <= 0) {
        clearInterval(interval);
      }
    }, 1000);
  }
  
  // Password strength indicator
  $: passwordStrength = calculatePasswordStrength(password);
  
  function calculatePasswordStrength(pwd: string): { score: number; label: string; color: string } {
    if (!pwd) return { score: 0, label: '', color: '' };
    
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors = ['', 'text-red-500', 'text-orange-500', 'text-yellow-500', 'text-green-500', 'text-green-600'];
    
    return {
      score: Math.min(score, 5),
      label: labels[Math.min(score, 5)] || '',
      color: colors[Math.min(score, 5)] || ''
    };
  }
</script>

<div class="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-background">
  <div class="sm:mx-auto sm:w-full sm:max-w-md">
    <div class="text-center">
      <h2 class="mt-6 text-3xl font-bold tracking-tight text-foreground">
        {showVerification ? 'Verify Your Email' : 'Create Your Account'}
      </h2>
      <p class="mt-2 text-lg text-muted-foreground">
        {showVerification 
          ? `We've sent a verification code to ${email}`
          : 'Join QDesigner to start building questionnaires'
        }
      </p>
    </div>
  </div>

  <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
    <div class="bg-card px-4 py-8 shadow sm:rounded-lg sm:px-10">
      {#if !showVerification}
        <!-- Sign Up Form -->
        <form class="space-y-6" on:submit|preventDefault={handleSignUp}>
          {#if domainAutoJoin}
            <Alert variant="info">
              <p class="font-semibold">You'll automatically join {domainAutoJoin.organizationName}</p>
              <p class="text-sm mt-1">Your organization has pre-approved all @{email.split('@')[1]} addresses</p>
            </Alert>
          {/if}
          
          {#if pendingInvitations.length > 0}
            <Alert variant="info">
              <p class="font-semibold">You have {pendingInvitations.length} pending invitation{pendingInvitations.length > 1 ? 's' : ''}</p>
              <p class="text-sm mt-1">You'll be able to accept them after signing up</p>
            </Alert>
          {/if}
          
          <FormGroup label="Full Name" id="full-name">
            <Input
              id="full-name"
              type="text"
              required
              bind:value={fullName}
              placeholder="John Doe"
            />
          </FormGroup>
          
          <FormGroup label="Email Address" id="email">
            <Input
              id="email"
              type="email"
              required
              bind:value={email}
              placeholder="you@example.com"
            />
          </FormGroup>
          
          <FormGroup label="Password" id="password">
            <Input
              id="password"
              type="password"
              required
              bind:value={password}
              placeholder="Create a strong password"
              minlength="8"
            />
            {#if password}
              <div class="mt-2">
                <div class="flex gap-1 mb-1">
                  {#each Array(5) as _, i}
                    <div 
                      class="h-1 flex-1 rounded-full transition-colors"
                      class:bg-gray-200={i >= passwordStrength.score}
                      class:bg-red-500={i < passwordStrength.score && passwordStrength.score <= 2}
                      class:bg-yellow-500={i < passwordStrength.score && passwordStrength.score === 3}
                      class:bg-green-500={i < passwordStrength.score && passwordStrength.score >= 4}
                    />
                  {/each}
                </div>
                <p class="text-sm {passwordStrength.color}">
                  {passwordStrength.label}
                </p>
              </div>
            {/if}
          </FormGroup>
          
          <div class="flex items-start">
            <input
              id="agree-terms"
              type="checkbox"
              bind:checked={agreeToTerms}
              class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label for="agree-terms" class="ml-2 block text-sm text-muted-foreground">
              I agree to the
              <a href="/terms" target="_blank" class="font-medium text-primary hover:text-primary/80">
                Terms of Service
              </a>
              and
              <a href="/privacy" target="_blank" class="font-medium text-primary hover:text-primary/80">
                Privacy Policy
              </a>
            </label>
          </div>
          
          {#if error}
            <Alert variant="error">
              {error}
            </Alert>
          {/if}
          
          <Button
            type="submit"
            variant="primary"
            size="lg"
            class="w-full"
            {loading}
          >
            Create Account
          </Button>
          
          <div class="text-center">
            <span class="text-sm text-muted-foreground">
              Already have an account?
              <a href="/login" class="font-medium text-primary hover:text-primary/80 ml-1">
                Sign in
              </a>
            </span>
          </div>
        </form>
      {:else}
        <!-- Verification Form -->
        <form class="space-y-6" on:submit|preventDefault={handleVerifyCode}>
          {#if isTestModeEmail(email)}
            <Alert variant="info">
              <p class="font-semibold">Test Mode Active</p>
              <p class="text-sm">Check your browser console for the verification code</p>
            </Alert>
          {/if}
          
          <FormGroup label="Verification Code" id="verification-code">
            <Input
              id="verification-code"
              type="text"
              required
              bind:value={verificationCode}
              placeholder="000000"
              maxlength="6"
              pattern="[0-9]{6}"
              autocomplete="one-time-code"
              class="text-center text-2xl tracking-widest"
            />
            <p class="text-sm text-muted-foreground mt-2">
              Enter the 6-digit code sent to your email
            </p>
          </FormGroup>
          
          {#if error}
            <Alert variant="error">
              {error}
            </Alert>
          {/if}
          
          <Button
            type="submit"
            variant="primary"
            size="lg"
            class="w-full"
            {loading}
          >
            Verify Email
          </Button>
          
          <div class="text-center">
            <button
              type="button"
              class="text-sm text-primary hover:text-primary/80 disabled:opacity-50"
              on:click={handleResendCode}
              disabled={resendTimer > 0 || loading}
            >
              {resendTimer > 0 
                ? `Resend code in ${resendTimer}s` 
                : 'Resend verification code'
              }
            </button>
          </div>
          
          <div class="text-center pt-4 border-t">
            <button
              type="button"
              class="text-sm text-muted-foreground hover:text-foreground"
              on:click={() => {
                showVerification = false;
                verificationCode = '';
                error = null;
              }}
            >
              ← Back to sign up
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
</div>