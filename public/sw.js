// BruceWWorld service worker: navigation requests use network-first so a
// refresh always picks up the latest index.html, even when a browser ignores
// cache-control headers (falls back to cache only when offline).
// Everything else passes through untouched; sibling projects under /games/
// own their own service workers and are excluded by scope resolution anyway.
const CACHE = 'bww-html-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/games/')) return;
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(event.request);
        const cache = await caches.open(CACHE);
        cache.put(event.request, res.clone());
        return res;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw new Error('offline and no cached navigation');
      }
    })(),
  );
});
