const CACHE_NAME = 'grort-shell-v1';

const SHELL_URLS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Network-first for API calls
  if (request.url.includes('/auth/') ||
      request.url.includes('/receipts') ||
      request.url.includes('/households') ||
      request.url.includes('/upload') ||
      request.url.includes('/products') ||
      request.url.includes('/stores') ||
      request.url.includes('/analytics') ||
      request.url.includes('/health')) {
    return;
  }

  // For navigation and app shell: network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  );
});
