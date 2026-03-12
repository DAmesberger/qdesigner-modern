import { FullConfig } from '@playwright/test';
import { DEV_URLS } from '../helpers/dev-urls';

const BACKEND_URL = DEV_URLS.backend;

async function globalSetup(_config: FullConfig) {
  console.log('Running global setup...');

  // 1. Wait for backend to be ready
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/ready`);
      if (res.ok) {
        console.log('Backend is ready');
        break;
      }
    } catch {
      // Backend not ready yet
    }
    if (i === maxRetries - 1) {
      throw new Error('Backend failed to become ready within timeout');
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // 2. Verify test users exist by trying to log in
  const testUsers = [
    { email: 'admin@test.local', password: 'TestPassword123!' },
    { email: 'editor@test.local', password: 'TestPassword123!' },
    { email: 'viewer@test.local', password: 'TestPassword123!' },
  ];

  for (const user of testUsers) {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });

    if (!res.ok) {
      console.warn(`Warning: Test user ${user.email} login failed (${res.status}). Ensure test seeds are loaded.`);
    } else {
      console.log(`Verified test user: ${user.email}`);
    }
  }

  console.log('Global setup complete');
}

export default globalSetup;
