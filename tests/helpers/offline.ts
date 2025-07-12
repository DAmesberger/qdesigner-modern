import { Page } from '@playwright/test';

export async function simulateOffline(page: Page) {
  await page.context().setOffline(true);
  
  // Also dispatch offline event in the page
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
  });
  
  // Wait for offline indicator to appear
  await page.waitForSelector('[data-testid="offline-indicator"]', { timeout: 5000 });
}

export async function simulateOnline(page: Page) {
  await page.context().setOffline(false);
  
  // Dispatch online event in the page
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });
  
  // Wait for offline indicator to disappear
  await page.waitForSelector('[data-testid="offline-indicator"]', { 
    state: 'hidden',
    timeout: 5000 
  });
}

export async function waitForSync(page: Page, timeout = 10000) {
  // Wait for sync queue to be empty
  await page.waitForFunction(
    () => {
      const syncStatus = (window as any).__syncQueue;
      return !syncStatus || syncStatus.length === 0;
    },
    { timeout }
  );
  
  // Also check for sync complete indicator if present
  const syncComplete = page.locator('[data-testid="sync-complete"]');
  if (await syncComplete.count() > 0) {
    await syncComplete.waitFor({ state: 'visible', timeout: 5000 });
  }
}

export async function clearOfflineData(page: Page) {
  await page.evaluate(() => {
    // Clear IndexedDB
    if ('indexedDB' in window) {
      indexedDB.deleteDatabase('qdesigner-offline');
    }
    
    // Clear localStorage
    localStorage.removeItem('qdesigner_offline_draft');
    localStorage.removeItem('qdesigner_sync_queue');
    localStorage.removeItem('qdesigner_last_sync');
  });
}

export async function getOfflineQueueSize(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const queue = localStorage.getItem('qdesigner_sync_queue');
    if (!queue) return 0;
    try {
      return JSON.parse(queue).length;
    } catch {
      return 0;
    }
  });
}

export async function verifyOfflineIndicator(page: Page) {
  const indicator = page.locator('[data-testid="offline-indicator"]');
  await expect(indicator).toBeVisible();
  await expect(indicator).toContainText(/offline|no connection/i);
}

export async function verifySyncInProgress(page: Page) {
  const syncIndicator = page.locator('[data-testid="sync-indicator"]');
  await expect(syncIndicator).toBeVisible();
  await expect(syncIndicator).toContainText(/syncing|synchronizing/i);
}

// Helper to intercept and delay API calls to simulate slow network
export async function simulateSlowNetwork(page: Page, delay = 2000) {
  await page.route('**/api/**', async (route) => {
    await new Promise(resolve => setTimeout(resolve, delay));
    await route.continue();
  });
}

// Helper to block specific API endpoints to test offline fallbacks
export async function blockAPIEndpoint(page: Page, endpoint: string) {
  await page.route(`**/${endpoint}`, route => {
    route.abort('connectionfailed');
  });
}

// Helper to monitor sync operations
export async function monitorSyncOperations(page: Page) {
  const syncOps: any[] = [];
  
  await page.exposeFunction('recordSyncOp', (op: any) => {
    syncOps.push(op);
  });
  
  await page.evaluate(() => {
    // Intercept sync operations
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [url, options] = args;
      if (typeof url === 'string' && url.includes('/api/')) {
        (window as any).recordSyncOp({
          url,
          method: options?.method || 'GET',
          timestamp: Date.now()
        });
      }
      return originalFetch(...args);
    };
  });
  
  return {
    getSyncOps: () => syncOps,
    clearSyncOps: () => syncOps.length = 0
  };
}