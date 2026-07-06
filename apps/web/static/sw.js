// QDesigner Modern Service Worker
// Version: 2.0.0

const CACHE_NAME = 'qdesigner-v4';
const RUNTIME_CACHE = 'qdesigner-runtime';
const BUNDLE_CACHE = 'qdesigner-bundles';
// Bumped v1 -> v2: media now keys on the stable same-origin proxy path
// `/api/media/{id}/content` (contract D1) instead of expiring presigned MinIO URLs.
// The old v1 cache (keyed on presigned URLs that have since expired) is dropped on
// activate by the cache-allowlist cleanup below.
const FILLOUT_MEDIA_CACHE = 'fillout-media-v2';
const PROGRESS_CHANNEL = new BroadcastChannel('sw-progress');

const DB_NAME = 'qdesigner-offline';
const DB_STORE = 'pending-requests';
const DB_VERSION = 1;
const MAX_RETRY_COUNT = 3;

// Files to cache immediately on install
const STATIC_CACHE_URLS = [
  '/',
  '/offline.html',
];

// Methods that should be queued when offline
const QUEUABLE_METHODS = ['POST', 'PUT', 'PATCH'];

// Dynamic cache configuration
const CACHE_STRATEGIES = {
  // Cache first for static assets
  cacheFirst: [
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
    /\.(?:woff|woff2|ttf|otf|eot)$/,
    /\.(?:css|js)$/,
  ],
  // Network first for API calls
  networkFirst: [
    /\/api\//,
  ],
  // Stale while revalidate for everything else
  staleWhileRevalidate: [
    /./
  ]
};

// ---------- IndexedDB helpers ----------

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllPendingRequests() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function deletePendingRequest(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function updatePendingRequest(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function queueRequest(url, method, body, headers) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const entry = {
      url,
      method,
      body,
      headers: Object.fromEntries(
        [...new Headers(headers)].filter(([key]) => !key.startsWith('sec-'))
      ),
      timestamp: Date.now(),
      retryCount: 0,
    };
    const request = store.add(entry);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

// ---------- Install event ----------

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    (async () => {
      // Cache static shell resources
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW] Caching app shell');

      const allUrls = [...STATIC_CACHE_URLS];
      const total = allUrls.length;
      let loaded = 0;

      PROGRESS_CHANNEL.postMessage({
        type: 'cache-progress',
        loaded,
        total,
        stage: 'caching'
      });

      for (const url of allUrls) {
        try {
          await cache.add(url);
          loaded++;
          PROGRESS_CHANNEL.postMessage({
            type: 'cache-progress',
            loaded,
            total,
            stage: 'caching',
            resource: url
          });
        } catch (error) {
          console.error(`[SW] Failed to cache ${url}:`, error);
        }
      }

      // Cache build bundles from manifest
      try {
        const manifestResponse = await fetch('/build-manifest.json');
        if (manifestResponse.ok) {
          const manifest = await manifestResponse.json();
          const bundleFiles = manifest.files || [];

          if (bundleFiles.length > 0) {
            const bundleCache = await caches.open(BUNDLE_CACHE);
            const bundleTotal = bundleFiles.length;
            let bundleLoaded = 0;

            PROGRESS_CHANNEL.postMessage({
              type: 'cache-progress',
              loaded: 0,
              total: bundleTotal,
              stage: 'bundles'
            });

            for (const file of bundleFiles) {
              try {
                await bundleCache.add(file);
                bundleLoaded++;
                PROGRESS_CHANNEL.postMessage({
                  type: 'cache-progress',
                  loaded: bundleLoaded,
                  total: bundleTotal,
                  stage: 'bundles',
                  resource: file
                });
              } catch (error) {
                console.error(`[SW] Failed to cache bundle ${file}:`, error);
              }
            }

            console.log(`[SW] Cached ${bundleLoaded}/${bundleTotal} bundle files`);
          }
        }
      } catch (error) {
        console.warn('[SW] No build manifest found, skipping bundle caching:', error.message);
      }

      console.log('[SW] Service worker installed');
      return self.skipWaiting();
    })().catch((error) => {
      console.error('[SW] Cache installation failed:', error);
      PROGRESS_CHANNEL.postMessage({
        type: 'cache-error',
        error: error.message
      });
    })
  );
});

// ---------- Activate event ----------

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) =>
              name !== CACHE_NAME &&
              name !== RUNTIME_CACHE &&
              name !== BUNDLE_CACHE &&
              name !== FILLOUT_MEDIA_CACHE
            )
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// ---------- Fetch event ----------

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP(S) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // For mutating API requests, intercept failures and queue for offline sync
  if (
    QUEUABLE_METHODS.includes(request.method) &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(fetchWithOfflineQueue(request));
    return;
  }

  // Non-GET requests that are not API calls pass through
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== self.location.origin && !isTrustedOrigin(url.origin)) {
    return;
  }

  // Document navigations into the offline-capable fillout runtime (`/q/*`):
  // network-first, but fall back to the CACHED fillout shell so the SvelteKit client
  // router boots and `+page.ts` takes its IndexedDB offline branch. Crucially this must
  // NOT resolve to offline.html — that static page would replace the SPA and the
  // participant could never resume a pinned/offline session (E-OFF-3).
  if (request.mode === 'navigate' && url.pathname.startsWith('/q/')) {
    event.respondWith(filloutNavigationStrategy(request));
    return;
  }

  // Fillout media proxy (`/api/media/{id}/content`): stable, immutable, same-origin.
  // Cache-first against the durable media cache so offline fillout can replay it.
  // Must be checked before the networkFirst `/api/` rule, which would otherwise
  // capture this path.
  if (isFilloutMedia(url)) {
    event.respondWith(filloutMediaStrategy(request));
    return;
  }

  // Check fillout media cache first for media requests
  if (matchesPattern(request.url, CACHE_STRATEGIES.cacheFirst)) {
    event.respondWith(cacheFirstWithFilloutMedia(request));
  } else if (matchesPattern(request.url, CACHE_STRATEGIES.networkFirst)) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// ---------- Offline queue for mutating requests ----------

async function fetchWithOfflineQueue(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch (_error) {
    // Network failed — queue the request for later sync
    console.log('[SW] Network failed for', request.method, request.url, '— queuing for offline sync');

    let body = null;
    try {
      body = await request.text();
    } catch {
      // Body may already be consumed
    }

    const headers = {};
    for (const [key, value] of request.headers) {
      if (!key.startsWith('sec-')) {
        headers[key] = value;
      }
    }

    await queueRequest(request.url, request.method, body, headers);

    // Register for background sync
    try {
      await self.registration.sync.register('sync-questionnaire-changes');
    } catch {
      // Background sync not supported
    }

    PROGRESS_CHANNEL.postMessage({
      type: 'offline-queued',
      url: request.url,
      method: request.method
    });

    // Return a synthetic accepted response so the app knows the request was queued
    return new Response(JSON.stringify({ queued: true, message: 'Request queued for offline sync' }), {
      status: 202,
      statusText: 'Accepted',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ---------- Cache strategies ----------

// Matches the same-origin media streaming proxy: `GET /api/media/{id}/content`.
// The full request URL is a stable, immutable cache key (contract D1).
const FILLOUT_MEDIA_PATH = /^\/api\/media\/[^/]+\/content$/;

function isFilloutMedia(url) {
  return url.origin === self.location.origin && FILLOUT_MEDIA_PATH.test(url.pathname);
}

async function filloutMediaStrategy(request) {
  const cache = await caches.open(FILLOUT_MEDIA_CACHE);

  // Cache-first by URL (immutable content). A cached full 200 also satisfies a
  // range request — the media element degrades to a non-ranged load. ignoreVary
  // so an Accept-Ranges/Vary response header can't cause a spurious miss.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    return cached;
  }

  const isRange = request.headers.has('range');

  // Video elements issue their FIRST request WITH a Range header (bytes=0-), so
  // the response is a 206 that Cache.put() rejects — the object would never cache
  // and offline video replay would be impossible. Kick off a background full
  // (non-range) GET to populate the durable cache while the 206 streams through.
  if (isRange) {
    backgroundCacheFullMedia(cache, request.url);
  }

  try {
    const response = await fetch(request);

    // Only store complete 200 responses under the stable URL key (206 is skipped;
    // the background full GET above handles the range case).
    if (response && response.status === 200 && !isRange) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.error('[SW] Fillout media fetch failed:', error);
    // Return a clean transport error, NOT offline.html — an <img>/<video>/audio
    // consumer must see a failed load, not an HTML document it would try to decode
    // (ResourceManager.loadAudio would call decodeAudioData on HTML bytes).
    return new Response('', {
      status: 504,
      statusText: 'Media Unavailable',
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }
}

// Best-effort background fetch of a full (non-range) media object so the durable
// cache is populated for offline replay. Fire-and-forget; failure is non-fatal.
function backgroundCacheFullMedia(cache, url) {
  fetch(url)
    .then((full) => {
      if (full && full.status === 200) {
        return cache.put(url, full.clone());
      }
    })
    .catch(() => {
      // Offline or fetch failed — nothing to cache.
    });
}

async function cacheFirstWithFilloutMedia(request) {
  // Also check fillout media cache
  try {
    const filloutCache = await caches.open(FILLOUT_MEDIA_CACHE);
    const filloutCached = await filloutCache.match(request);
    if (filloutCached) {
      return filloutCached;
    }
  } catch {
    // Fillout cache not available
  }

  return cacheFirst(request);
}

async function cacheFirst(request) {
  // Check bundle cache first for static assets
  const bundleCache = await caches.open(BUNDLE_CACHE);
  const bundleCached = await bundleCache.match(request);
  if (bundleCached) {
    return bundleCached;
  }

  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Cache first fetch failed:', error);
    return offlineResponse();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    console.error('[SW] Network first fetch failed:', error);
    return offlineResponse();
  }
}

// Network-first navigation for `/q/*` documents with a cached-shell fallback.
// Online: fetch + cache the fillout document under its exact URL so a later offline
// reload/resume has a real shell. Offline: serve the cached document for this code
// (ignoreSearch so a `?sid=`/resume query still hits), then the cached app root shell
// (the SvelteKit client will route to the right /q/CODE), and only then a bare offline
// response — never offline.html, which would break client routing + IndexedDB resume.
async function filloutNavigationStrategy(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Offline navigation to fillout — serving cached shell:', request.url);
    const cachedDoc = await cache.match(request, { ignoreSearch: true });
    if (cachedDoc) {
      return cachedDoc;
    }
    const rootShell = await caches.match('/');
    if (rootShell) {
      return rootShell;
    }
    return offlineResponse();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch((error) => {
    console.error('[SW] Stale while revalidate fetch failed:', error);
  });

  return cached || fetchPromise || offlineResponse();
}

// ---------- Helpers ----------

function matchesPattern(url, patterns) {
  return patterns.some(pattern => pattern.test(url));
}

function isTrustedOrigin(origin) {
  const trustedOrigins = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ];

  return trustedOrigins.some(trusted => {
    if (trusted instanceof RegExp) {
      return trusted.test(origin);
    }
    return trusted === origin;
  });
}

async function offlineResponse() {
  const cachedOffline = await caches.match('/offline.html');
  if (cachedOffline) {
    return cachedOffline;
  }

  return new Response('Offline - Please check your internet connection', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: new Headers({
      'Content-Type': 'text/plain',
    }),
  });
}

// ---------- Message handling ----------

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ---------- Background sync ----------

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-questionnaire-changes') {
    event.waitUntil(syncOfflineChanges());
  }
});

async function syncOfflineChanges() {
  console.log('[SW] Syncing offline changes...');

  let entries;
  try {
    entries = await getAllPendingRequests();
  } catch (error) {
    console.error('[SW] Failed to read pending requests:', error);
    return;
  }

  if (!entries || entries.length === 0) {
    console.log('[SW] No pending requests to sync');
    return;
  }

  PROGRESS_CHANNEL.postMessage({
    type: 'sync-start',
    count: entries.length
  });

  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        body: entry.body,
        headers: entry.headers,
      });

      if (response.ok || (response.status >= 200 && response.status < 500)) {
        await deletePendingRequest(entry.id);
        synced++;
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      console.error(`[SW] Failed to sync request ${entry.id}:`, error);

      entry.retryCount = (entry.retryCount || 0) + 1;

      if (entry.retryCount >= MAX_RETRY_COUNT) {
        console.error(`[SW] Giving up on request ${entry.id} after ${MAX_RETRY_COUNT} retries`);
        await deletePendingRequest(entry.id);
        failed++;
      } else {
        await updatePendingRequest(entry);
      }
    }
  }

  PROGRESS_CHANNEL.postMessage({
    type: 'sync-complete',
    synced,
    failed,
    remaining: entries.length - synced - failed
  });

  console.log(`[SW] Sync complete: ${synced} synced, ${failed} failed`);
}
