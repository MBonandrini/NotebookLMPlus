const CACHE = 'notebooklmplus-v0.4.1';
const SHELL = [
  './', './index.html', './css/styles.css', './manifest.webmanifest',
  './js/app.js', './js/config.js', './js/db.js', './js/utils.js', './js/progress.js',
  './js/ai.js', './js/ollama.js', './js/parsers.js', './js/chunking.js', './js/retrieval.js', './js/indexer.js',
  './js/sources.js', './js/markdown.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Cache only this GitHub Pages application's own static assets. Never intercept
  // Ollama, hosted AI, CDN, or any other cross-origin/API request.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response && (response.ok || response.type === 'opaque')) {
          caches.open(CACHE).then(cache => cache.put(event.request, response.clone())).catch(() => {});
        }
        return response;
      });
      return cached || network;
    }).catch(() => caches.match('./index.html'))
  );
});
