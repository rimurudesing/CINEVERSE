/* ═══ cineverse/sw.js — Kill-Switch de Service Worker y Limpiador de Caché ═══ */

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => {
      return self.registration.unregister();
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Bypass total y transparente hacia la red: NUNCA genera ERR_FAILED
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('', { status: 408, statusText: 'Network Error' });
    })
  );
});
