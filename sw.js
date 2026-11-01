/* ═══ cineverse/sw.js — Desactivador y Limpiador de Service Worker ═══ */

// Desactivar y limpiar cualquier caché anterior inmediatamente
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

// No interceptar peticiones de red: permitir que el navegador y Cloudflare manejen todo directamente
