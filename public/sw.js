// Raktha Shodak Service Worker
const CACHE_NAME = 'raktha-shodak-v2';
const RUNTIME_CACHE = 'raktha-shodak-runtime';

// App shell files to precache
const PRECACHE_URLS = [
  './',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'placeholder.svg',
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API/navigation, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests (except CDN assets)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin && !url.hostname.includes('unpkg.com') && !url.hostname.includes('cdn')) return;

  // API calls: network-first
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.hostname.includes('supabase')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful GET API responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigation requests: network-first, fallback to cached index
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('./') || caches.match(request))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && (url.pathname.match(/\.(js|css|png|jpg|svg|woff2?)$/) || url.hostname !== self.location.hostname)) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match('./') || Response.error());
    })
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'Raktha Shodak', body: 'New blood request nearby!' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'blood-request',
    renotify: true,
    requireInteraction: true,
    data: data.data || {},
    actions: [
      { action: 'accept', title: '✓ Accept' },
      { action: 'decline', title: '✗ Decline' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const requestData = event.notification.data;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_ACTION',
            action: action || 'open',
            data: requestData,
          });
          return;
        }
      }
      const relativePath = action === 'accept' && requestData?.requestId
        ? `alerts?accept=${requestData.requestId}`
        : "alerts";
      const targetUrl = new URL(relativePath, self.registration.scope).toString();
      return clients.openWindow(targetUrl);
    })
  );
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, data } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: tag || 'blood-request',
      renotify: true,
      requireInteraction: true,
      data: data || {},
      actions: [
        { action: 'accept', title: '✓ Accept' },
        { action: 'decline', title: '✗ Decline' },
      ],
    });
  }
});
