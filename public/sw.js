// Feature (OS notifications work when packaged as an APK): this service
// worker exists for exactly one reason -- Android (both installed-PWA
// Chrome and a Trusted-Web-Activity-wrapped APK, which is still Chrome's
// engine underneath) refuses to construct `new Notification()` directly
// from page JS. It requires going through a registered
// ServiceWorkerRegistration instead (`registration.showNotification()`).
// Just having *any* active service worker registered is what unlocks that
// API -- see src/lib/notifications.ts, which is what actually calls
// showNotification().
//
// Deliberately NOT an offline-caching service worker: no `fetch` handler,
// no cache-first strategy, nothing that could serve stale content or fight
// with the app's existing IndexedDB-based local library. If real offline
// app-shell caching is wanted later, add a fetch handler here -- this file
// is intentionally minimal until then.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Clicking the OS notification focuses an already-open Melophile tab/app
// window if one exists, otherwise opens a new one -- standard "bring the
// app to front" behavior so the notification isn't a dead end.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    }),
  );
});
