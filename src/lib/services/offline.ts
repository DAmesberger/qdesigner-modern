import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

interface OfflineState {
  isOnline: boolean;
  isServiceWorkerReady: boolean;
  hasUpdate: boolean;
  syncPending: boolean;
}

function createOfflineStore() {
  const { subscribe, update } = writable<OfflineState>({
    isOnline: browser ? navigator.onLine : true,
    isServiceWorkerReady: false,
    hasUpdate: false,
    syncPending: false
  });

  let registration: ServiceWorkerRegistration | null = null;

  // Initialize service worker
  async function init() {
    if (!browser || !('serviceWorker' in navigator)) {
      console.log('[Offline] Service Worker not supported');
      return;
    }

    try {
      // Register service worker
      registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('[Offline] Service Worker registered');

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              update(state => ({ ...state, hasUpdate: true }));
            }
          });
        }
      });

      // Handle controller change
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

      // Set ready state
      if (registration.active) {
        update(state => ({ ...state, isServiceWorkerReady: true }));
      }

      // Check for updates periodically
      setInterval(() => {
        registration?.update();
      }, 60 * 60 * 1000); // Every hour

    } catch (error) {
      console.error('[Offline] Service Worker registration failed:', error);
    }

    // Monitor online/offline status
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial online state
    update(state => ({ ...state, isOnline: navigator.onLine }));
  }

  function handleOnline() {
    console.log('[Offline] Back online');
    update(state => ({ ...state, isOnline: true }));
    
    // Trigger sync
    if (registration && 'sync' in registration) {
      registration.sync.register('sync-questionnaire-changes')
        .then(() => {
          console.log('[Offline] Sync registered');
          update(state => ({ ...state, syncPending: true }));
        })
        .catch(error => {
          console.error('[Offline] Sync registration failed:', error);
        });
    }
  }

  function handleOffline() {
    console.log('[Offline] Gone offline');
    update(state => ({ ...state, isOnline: false }));
  }

  async function skipWaiting() {
    if (registration?.waiting) {
      // Tell the waiting service worker to activate
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  async function checkForUpdate() {
    try {
      await registration?.update();
    } catch (error) {
      console.error('[Offline] Update check failed:', error);
    }
  }

  // Cleanup function
  function destroy() {
    if (browser) {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  }

  return {
    subscribe,
    init,
    skipWaiting,
    checkForUpdate,
    destroy
  };
}

// Create the store
export const offline = createOfflineStore();

// Derived stores for convenience
export const isOnline = derived(offline, $offline => $offline.isOnline);
export const isOffline = derived(offline, $offline => !$offline.isOnline);
export const hasUpdate = derived(offline, $offline => $offline.hasUpdate);
export const isServiceWorkerReady = derived(offline, $offline => $offline.isServiceWorkerReady);

// Helper to request persistent storage
export async function requestPersistentStorage(): Promise<boolean> {
  if (!browser || !navigator.storage?.persist) {
    return false;
  }

  try {
    const isPersisted = await navigator.storage.persist();
    console.log(`[Offline] Persistent storage ${isPersisted ? 'granted' : 'denied'}`);
    return isPersisted;
  } catch (error) {
    console.error('[Offline] Persistent storage request failed:', error);
    return false;
  }
}

// Helper to estimate storage usage
export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!browser || !navigator.storage?.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  } catch (error) {
    console.error('[Offline] Storage estimate failed:', error);
    return null;
  }
}