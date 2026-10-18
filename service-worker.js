/* ============================================================
   DS-F Service Worker
   - HTML: network-first → your edits are always fresh
   - CDN/static: cache-first → fast + offline
   - Versioned caches; old caches are auto-deleted
   - Never touches localStorage / IndexedDB (your data is safe)
   ============================================================ */

const SW_VERSION = 'dsf-v1.0.0'; // bump this when you change THIS file

const PRECACHE = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

const HTML_CACHE  = SW_VERSION + '-html';
const ASSET_CACHE = SW_VERSION + '-assets';

/* ---------- INSTALL: precache the shell ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

/* ---------- ACTIVATE: drop old caches, take control ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== HTML_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isJsZipCDN   = url.hostname === 'cdnjs.cloudflare.com' &&
                       url.pathname.includes('/jszip/');

  // Ignore anything we don't own (analytics, etc.)
  if (!isSameOrigin && !isJsZipCDN) return;

  // HTML / navigation → network-first (live updates!)
  const isHTML = request.mode === 'navigate' ||
                 (request.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    event.respondWith(networkFirst(request, HTML_CACHE));
    return;
  }

  // Everything else → cache-first
  event.respondWith(cacheFirst(request, ASSET_CACHE));
});

/* ---------- Strategies ---------- */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback =
      (await cache.match('./index.html')) || (await cache.match('./'));
    if (fallback) return fallback;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

/* ---------- Manual update trigger from the page ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});