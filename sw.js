// ============================================================
// SECOND CHANCE PWA — Service Worker
// Version: second-chance-v2026.2
// Upgrade: versioned cache, GET-only, safe fetch, offline fallback
// ============================================================

const CACHE_NAME = 'second-chance-v2026.3';

// Core assets — MUST work offline.
// Keep this list to files that actually exist. It previously still named
// dashboard.html, rights.html, phase1.html and the four per-county pages after
// those views had been merged into index.html as tabs. cache.addAll() rejects the
// whole batch on a single 404, so the worker never installed and offline support
// was silently dead. Every path here is verified against the served site.
const CORE_ASSETS = [
  './',
  './index.html',
  './county1.html',
  './emergency.html',
  './offline.html',
  './manifest.json',
  './icon-512.svg',
  './data/resources.json',
  './data/checklist.json'
];

// ── INSTALL ──────────────────────────────────────────────────
// Cache all core assets on install
self.addEventListener('install', event => {
  console.log('[SW] Installing:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching core assets');
      // Add assets individually rather than with addAll(): addAll() rejects its
      // entire promise when any single URL 404s, which turns one renamed page into
      // a total loss of offline mode. This keeps the rest of the cache intact.
      return Promise.all(
        CORE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Skipped asset:', url, err))
        )
      );
    }).catch(err => {
      console.error('[SW] Cache install failed:', err);
    })
  );
  // Force this SW to activate immediately, don't wait for old one to die
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────
// Delete any old cache versions when new SW takes over
self.addEventListener('activate', event => {
  console.log('[SW] Activating:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ── FETCH ────────────────────────────────────────────────────
// Cache-first for core assets, network-first for everything else
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Only handle GET requests — never intercept POST/PUT/DELETE
  if (request.method !== 'GET') return;

  // 2. Skip cross-origin requests (Google Fonts, external APIs, etc.)
  //    Let the browser handle those normally
  if (url.origin !== self.location.origin) return;

  // 3. Skip chrome-extension and non-http requests
  if (!request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then(cached => {

      // ── CACHE HIT: return immediately (offline-first)
      if (cached) {
        console.log('[SW] Served from cache:', request.url);
        return cached;
      }

      // ── CACHE MISS: try network, then cache the result
      return fetch(request).then(response => {

        // Only cache valid, successful, same-origin responses
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic' // 'basic' = same-origin only
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clone);
            console.log('[SW] Cached new resource:', request.url);
          });
        }

        return response;

      }).catch(() => {
        // ── NETWORK FAILED: serve offline fallback page
        console.warn('[SW] Network failed, serving offline page');
        return caches.match('./offline.html');
      });

    })
  );
});

// ── MESSAGE HANDLER ──────────────────────────────────────────
// Allows app to trigger SW updates programmatically
// Usage from app: navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting triggered by app');
    self.skipWaiting();
  }
});