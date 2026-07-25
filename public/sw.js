// Minimal service worker for the Workout Log rest-timer notifications.
// Deliberately has NO fetch handler, so it does not cache or interfere with
// the rest of the app — it exists only so Android Chrome can show
// notifications (which require ServiceWorkerRegistration.showNotification).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Tapping the rest-complete notification focuses the app (or opens it).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if ("focus" in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow("./");
  })());
});
