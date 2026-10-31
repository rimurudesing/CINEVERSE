/* ═══ cineverse/sw.js — Service Worker con Cache Inteligente y Modo Offline ═══ */

const CACHE_NAME = 'cineverse-v2.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/peliculas.html',
  '/series.html',
  '/anime.html',
  '/estrenos.html',
  '/watch.html',
  '/info.html',
  '/buscar.html',
  '/perfil.html',
  '/login.html',
  '/descargar.html',
  '/css/reset.css',
  '/css/variables.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/navbar.css',
  '/css/hero.css',
  '/css/carousel.css',
  '/css/skeleton.css',
  '/css/animations.css',
  '/css/theater.css',
  '/css/responsive.css',
  '/js/config.js',
  '/js/utils.js',
  '/js/api.js',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/watchlist.js',
  '/js/history.js',
  '/js/ratings.js',
  '/js/gamepad.js',
  '/js/tv.js',
  '/assets/icon.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Advertencia al precachear algunos assets:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorar llamadas a Supabase Auth o reproductores externos
  if (url.hostname.includes('supabase.co') || 
      url.hostname.includes('vimeus.com') || 
      url.hostname.includes('vidlink.pro') || 
      url.hostname.includes('google.com') ||
      event.request.method !== 'GET') {
    return;
  }

  // Estrategia para imágenes de TMDB: Stale-While-Revalidate con límite
  if (url.hostname.includes('image.tmdb.org')) {
    event.respondWith(
      caches.open('cineverse-tmdb-images').then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            cache.put(event.request, networkRes.clone());
          }
          return networkRes;
        }).catch(() => null);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Estrategia para API de TMDB / Cloudflare Proxy: Network first con fallback a cache
  if (url.pathname.includes('/api/tmdb')) {
    event.respondWith(
      fetch(event.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open('cineverse-api-cache').then((cache) => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Para assets locales: Stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const toCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        }
        return networkResponse;
      }).catch(() => {
        // Si no hay red y piden un HTML, fallback a index.html
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Soporte de notificaciones Push
self.addEventListener('push', (event) => {
  let data = { title: 'CineVerse', body: '¡Nuevo contenido disponible en CineVerse!' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/assets/icon.png',
    badge: '/assets/icon.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
