// Frost service worker: faster second visits and play without a connection after the first full visit.
//  - pages (navigations): network first, so a new deploy is always picked up; the last copy is the offline fallback
//  - hashed JS/CSS in /assets/: cache first (the file name changes with its content, so a cached copy can never be stale)
//  - models and images (glb, webp, png, jpg, svg): stale-while-revalidate (instant from cache, refreshed in the background)
//  - everything else, other origins and non-GET requests: untouched
// Only responses that came back OK are cached. Old cache versions are deleted on activation.
const VERSION = 'frost-sw-v1'
const PAGES = `${VERSION}-pages`
const HASHED = `${VERSION}-hashed`
const MEDIA = `${VERSION}-media`
const KEEP = [PAGES, HASHED, MEDIA]

/** Which strategy a request gets: 'pages' | 'hashed' | 'media' | null (leave it alone). */
function classify(url, mode, method, origin) {
  if (method !== 'GET' || url.origin !== origin) return null
  if (mode === 'navigate') return 'pages'
  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(js|css)$/.test(url.pathname)) return 'hashed'
  if (/\.(glb|webp|png|jpe?g|svg)$/.test(url.pathname)) return 'media'
  return null
}

async function put(cacheName, request, response) {
  if (!response || !response.ok || response.type === 'opaque') return
  const cache = await caches.open(cacheName)
  await cache.put(request, response.clone())
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    await put(PAGES, request, response)
    return response
  } catch (err) {
    const cached = (await caches.match(request)) ?? (await caches.match(new URL('./', self.location).href))
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  await put(cacheName, request, response)
  return response
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request)
  const refresh = fetch(request).then(async (response) => { await put(cacheName, request, response); return response })
  if (cached) { refresh.catch(() => {}); return cached } // offline or slow: the cached copy answers now, the refresh is best effort
  return refresh
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('frost-sw-') && !KEEP.includes(key)) await caches.delete(key)
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', (event) => {
  const { request } = event
  const kind = classify(new URL(request.url), request.mode, request.method, self.location.origin)
  if (kind === 'pages') event.respondWith(networkFirst(request))
  else if (kind === 'hashed') event.respondWith(cacheFirst(request, HASHED))
  else if (kind === 'media') event.respondWith(staleWhileRevalidate(request, MEDIA))
})

if (typeof globalThis.__frostSwTest === 'function') globalThis.__frostSwTest({ classify, VERSION })
