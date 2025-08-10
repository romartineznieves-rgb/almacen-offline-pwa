// Simple service worker for offline caching
const CACHE_NAME = 'almacen-offline-v2';
const baseUrl = new URL(self.registration.scope);
const root = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : baseUrl.pathname + '/';
const PRECACHE = [
  '',
  'index.html',
  'manifest.webmanifest',
  'assets/styles.css',
  'assets/app.js',
  'offline.html',
  // CDN libs for MVP (best-effort; will be cached on install)
  'https://cdn.jsdelivr.net/npm/dexie@3.2.7/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
  'https://cdn.jsdelivr.net/npm/minisearch@6.3.0/dist/umd/index.min.js'
].map((p) => (p.startsWith('http') ? p : new URL(p, baseUrl).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : undefined)))
    )
  );
  self.clients.claim();
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    return (
      cached ||
      (request.mode === 'navigate' && (await cache.match(new URL('offline.html', baseUrl).pathname))) ||
      Response.error()
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // HTML: network-first; assets: cache-first
  const isHTML = request.headers.get('accept')?.includes('text/html');
  if (isHTML) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, res.clone());
        return res;
      } catch (e) {
        return cached || Response.error();
      }
    })());
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
