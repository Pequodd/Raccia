// Олег service worker: shows push notifications and opens the right chat on tap.
// No offline cache on purpose — a messenger without a connection has nothing fresh to show.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Олег', {
      body: data.body || '',
      tag: data.tag, // one notification per chat: a new message replaces the previous one
      renotify: Boolean(data.tag),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === url.origin);
      if (open) {
        // The app is already running: ask it to switch to the chat instead of reloading.
        open.postMessage({ type: 'open', url: url.pathname + url.search });
        return open.focus();
      }
      return self.clients.openWindow(url.href);
    })()
  );
});
