// Simple service worker for offline caching
const CACHE_NAME = 'almacen-offline-v3';
const baseUrl = new URL(self.registration.scope);
const root = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : baseUrl.pathname + '/';
const PRECACHE = [
  '',
  'index.html',
  'manifest.webmanifest',
  'assets/styles.css',
  'assets/app.js',
  'offline.html'
].map((p) => new URL(p, baseUrl).href);

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
