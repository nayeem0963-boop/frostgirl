// Frost service worker: faster second visits and play without a connection after the first full visit.
//  - pages (navigations): network first, so a new deploy is always picked up; the last copy is the offline fallback
//  - hashed files in /assets/ (JS, CSS, models, images: Vite puts a content hash in every name): cache first (the name changes with the
//    content, so a cached copy can never be stale). When a new version of a file arrives, the old version of it is deleted from the cache.
//  - other models and images with no hash in the name (e.g. /frost.svg): stale-while-revalidate (instant from cache, refreshed in the background)
//  - everything else, other origins and non-GET requests: untouched
// Only responses that came back OK are cached. Old cache versions are deleted on activation.
const VERSION = 'frost-sw-v2' // v2: models and images are content-hashed and cache first (v1 cached them stale-while-revalidate)
const PAGES = `${VERSION}-pages`
const HASHED = `${VERSION}-hashed`
const MEDIA = `${VERSION}-media`
const KEEP = [PAGES, HASHED, MEDIA]

/** Which strategy a request gets: 'pages' | 'hashed' | 'media' | null (leave it alone). */
function classify(url, mode, method, origin) {
  if (method !== 'GET' || url.origin !== origin) return null
  if (mode === 'navigate') return 'pages'
  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(js|css|glb|webp|avif|png|jpe?g|svg)$/.test(url.pathname)) return 'hashed'
  if (/\.(glb|webp|png|jpe?g|svg)$/.test(url.pathname)) return 'media'
  return null
}

/** '/assets/aisha-DdMHRkh5.glb' -> '/assets/aisha.glb': the same file in another version has the same stem. */
function stemOf(url) {
  const m = new URL(url).pathname.match(/^(.*\/[^/]+)-[A-Za-z0-9_-]{8}(\.[a-z0-9]+)$/)
  return m ? m[1] + m[2] : null
}

async function put(cacheName, request, response) {
  if (!response || !response.ok || response.type === 'opaque') return
  const cache = await caches.open(cacheName)
  await cache.put(request, response.clone())
  if (cacheName === HASHED) { // a new version of a hashed file replaces the old one instead of piling up beside it
    const stem = stemOf(request.url)
    if (stem && cache.keys) for (const other of await cache.keys()) if (other.url !== request.url && stemOf(other.url) === stem) await cache.delete(other)
  }
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
