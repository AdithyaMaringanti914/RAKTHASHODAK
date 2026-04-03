importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Must match src/lib/firebase.ts identically
firebase.initializeApp({
  apiKey: "AIzaSy_YOUR_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background payload of size:', payload);

  const notificationTitle = payload.notification.title || "Emergency Blood Request";
  const notificationOptions = {
    body: payload.notification.body || "A donor is needed urgently near you.",
    icon: '/vite.svg', // Update with actual Raktha Shodak logo
    badge: '/vite.svg',
    requireInteraction: true,
    data: {
      // The deep link URL the payload expects you to navigate to ("Accept link")
      click_action: payload.data.click_action || '/alerts' 
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Deep link redirect when notification tap happens in background
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const targetUrl = event.notification.data.click_action || '/alerts';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and redirect
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          return client.navigate(targetUrl);
        }
      }
      // If no window is open, launch a new window targeting the Accept link
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
