/**
 * Test Mode Utilities
 * 
 * Provides functions to enable/disable test mode for development.
 * When test mode is enabled, the app will automatically log in with
 * the credentials configured via VITE_TEST_MODE_EMAIL and VITE_TEST_MODE_PASSWORD.
 */

export const TEST_MODE_KEY = 'qdesigner-test-mode';

/**
 * Enable test mode - auto-login with configured test user on page reload
 */
export function enableTestMode() {
  if (import.meta.env.DEV) {
    localStorage.setItem(TEST_MODE_KEY, 'true');
    console.log('🧪 Test mode enabled. Reload the page to auto-login with configured credentials.');
    return true;
  } else {
    console.warn('Test mode is only available in development');
    return false;
  }
}

/**
 * Disable test mode
 */
export function disableTestMode() {
  localStorage.removeItem(TEST_MODE_KEY);
  console.log('Test mode disabled');
}

/**
 * Check if test mode is enabled
 */
export function isTestModeEnabled(): boolean {
  return localStorage.getItem(TEST_MODE_KEY) === 'true';
}

/**
 * Toggle test mode
 */
export function toggleTestMode() {
  if (isTestModeEnabled()) {
    disableTestMode();
  } else {
    enableTestMode();
  }
}

// Add to window for easy console access in development
if (import.meta.env.DEV && typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- attaching dev utilities to window global
  (window as any).testMode = {
    enable: enableTestMode,
    disable: disableTestMode,
    toggle: toggleTestMode,
    isEnabled: isTestModeEnabled
  };
  
  console.log('💡 Test mode utilities available:');
  console.log('   window.testMode.enable()  - Enable auto-login');
  console.log('   window.testMode.disable() - Disable auto-login');
  console.log('   window.testMode.toggle()  - Toggle auto-login');
  console.log('   window.testMode.isEnabled() - Check status');
}
