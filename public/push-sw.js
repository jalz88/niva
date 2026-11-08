// Web Push handlers, pulled into the generated Workbox service worker via
// `workbox.importScripts` in vite.config.ts (so the PWA's shell caching and
// auto-update behaviour stay exactly as they were).
//
// The payload is JSON built by the send-push Edge Function:
//   { title, body, url, tag }
// Nothing financial is ever put in a payload beyond counts — it's shown on a
// lock screen.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'NIVA', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'NIVA'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: data.tag || 'niva',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && 'focus' in w) {
          if ('navigate' in w) w.navigate(target)
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
