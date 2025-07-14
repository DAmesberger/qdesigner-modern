// QDesigner Modern Service Worker
// Version: 1.0.0

const CACHE_NAME = 'qdesigner-v1';
const RUNTIME_CACHE = 'qdesigner-runtime';
const PROGRESS_CHANNEL = new BroadcastChannel('sw-progress');

// Files to cache immediately on install
const STATIC_CACHE_URLS = [
  '/',
  '/manifest.json',
  '/offline.html',
  // Add app shell resources that should be cached
];

// Critical resources for offline apps
const OFFLINE_APP_URLS = [
  '/designer',
  '/fillout',
  // Add critical JS/CSS bundles here after build
];

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
    /^https:\/\/.*\.supabase\.co\/rest\//,
    /^https:\/\/.*\.supabase\.co\/auth\//,
  ],
  // Stale while revalidate for everything else
  staleWhileRevalidate: [
    /./
  ]
};

// Install event - cache static assets with progress
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Caching app shell');
        
        const allUrls = [...STATIC_CACHE_URLS, ...OFFLINE_APP_URLS];
        const total = allUrls.length;
        let loaded = 0;
        
        // Send initial progress
        PROGRESS_CHANNEL.postMessage({
          type: 'cache-progress',
          loaded,
          total,
          stage: 'caching'
        });
        
        // Cache each URL and report progress
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
        
        return Promise.resolve();
      })
      .then(() => {
        console.log('[SW] Service worker installed');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Cache installation failed:', error);
        PROGRESS_CHANNEL.postMessage({
          type: 'cache-error',
          error: error.message
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE)
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP(S) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== self.location.origin && !isTrustedOrigin(url.origin)) {
    return;
  }

  // Apply appropriate caching strategy
  if (matchesPattern(request.url, CACHE_STRATEGIES.cacheFirst)) {
    event.respondWith(cacheFirst(request));
  } else if (matchesPattern(request.url, CACHE_STRATEGIES.networkFirst)) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Cache strategies implementation
async function cacheFirst(request) {
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

// Helper functions
function matchesPattern(url, patterns) {
  return patterns.some(pattern => pattern.test(url));
}

function isTrustedOrigin(origin) {
  const trustedOrigins = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    /^https:\/\/.*\.supabase\.co$/,
  ];
  
  return trustedOrigins.some(trusted => {
    if (trusted instanceof RegExp) {
      return trusted.test(origin);
    }
    return trusted === origin;
  });
}

function offlineResponse() {
  return caches.match('/offline.html') || new Response(
    'Offline - Please check your internet connection',
    { 
      status: 503, 
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    }
  );
}

// Message handling for sync and other features
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync for offline changes
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-questionnaire-changes') {
    event.waitUntil(syncOfflineChanges());
  }
});

async function syncOfflineChanges() {
  // This will be implemented with IndexedDB integration
  console.log('[SW] Syncing offline changes...');
}