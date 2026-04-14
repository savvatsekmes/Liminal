// Liminal PWA service worker — enables install prompt on companion devices.
// Intentionally minimal: no offline caching (the app needs the server).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // required for installability
