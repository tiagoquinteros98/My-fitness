// Service worker: makes the app installable and lets it open instantly and offline.
// The app page is served from cache right away and refreshed in the background, so opening the
// installed app never waits on the network (a new version shows up on the next open).
// Hashed build assets: cache first. The API is never cached (the app keeps its own data copy).
const CACHE = 'gymbro-v3'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = url.pathname === '/' ? await caches.match('/') : undefined
        const network = fetch(req).then(async (res) => {
          // Only cache the real app page, never the login redirect.
          if (res.ok && !res.redirected && url.pathname === '/') {
            const fresh = await res.clone().text()
            await (await caches.open(CACHE)).put('/', res.clone())
            // A new version was published: tell the open app so it can reload when convenient.
            if (cached && fresh !== (await cached.clone().text())) {
              for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage('app-updated')
            }
          }
          return res
        })
        if (cached) {
          event.waitUntil(network.catch(() => {}))
          return cached
        }
        try {
          return await network
        } catch {
          return (await caches.match('/')) || Response.error()
        }
      })(),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
