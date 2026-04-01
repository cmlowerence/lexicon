const CACHE_NAME = 'lexicon-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js'
];

// Step 1: Install the service worker and cache the files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Step 2: Intercept network requests and serve from cache if available
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return the cached file if found, otherwise fetch from the internet
        return response || fetch(event.request);
      })
  );
});
